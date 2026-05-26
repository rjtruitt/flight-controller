import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { Model, ModelConfig } from '../../core/model/Model.js';
import { ModelResponse, StreamChunk } from '../../core/types/Response.js';
import { OpenAIContext } from '../../core/types/Context.js';
import { BedrockOpenAITranslator, PromptCachingStrategy } from './BedrockOpenAITranslator.js';
import { BottleneckRateLimiter, BottleneckLimitConfig } from '../../core/limits/BottleneckRateLimiter.js';
import { CombinedRateLimiter, CombinedLimitConfig } from '../../core/limits/CombinedRateLimiter.js';
import { AWSSSOAuth } from '../../auth/AWSSSOAuth.js';
import { AWSAuthProvider } from '../../auth/AWSAuthProvider.js';
import { IAuthProvider } from '../../auth/IAuthProvider.js';
import { RateLimitError, AuthenticationError } from '../../core/errors/LLMError.js';

/** Configuration for BedrockProvider. Auth is derived from profile/credentials, not passed directly. */
export interface BedrockProviderConfig extends Omit<ModelConfig, 'auth'> {
    modelId: string;
    region: string;
    /** Explicit static credentials -- prefer `profile` for SSO/federated auth. */
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
    /** AWS CLI profile name. Triggers SSO auth flow when set. */
    profile?: string;
    rateLimits?: BottleneckLimitConfig | CombinedLimitConfig;
    /** Share a rate limiter across multiple models on the same Bedrock quota. */
    sharedRateLimiter?: BottleneckRateLimiter | CombinedRateLimiter;
    cachingStrategy?: Partial<PromptCachingStrategy>;
}

/** AWS Bedrock provider with SSO auth, adaptive rate limiting, streaming, and prompt caching. */
export class BedrockProvider extends Model {
    private client: BedrockRuntimeClient;
    private translator: BedrockOpenAITranslator;
    private modelId: string;
    public readonly awsAuth: IAuthProvider;
    public readonly rateLimiter?: BottleneckRateLimiter | CombinedRateLimiter;

    constructor(config: BedrockProviderConfig) {
        const awsAuth: IAuthProvider = config.profile
            ? new AWSSSOAuth({
                profile: config.profile,
                region: config.region
              })
            : new AWSAuthProvider({
                region: config.region
              });

        super({
            identity: config.identity,
            auth: awsAuth,
            capabilities: config.capabilities,
            limits: config.limits,
            pricing: config.pricing,
            stats: config.stats,
            errorHandler: config.errorHandler
        });

        this.awsAuth = awsAuth;

        const clientConfig: any = {
            region: config.region
        };

        if (config.credentials) {
            clientConfig.credentials = config.credentials;
        } else if (awsAuth instanceof AWSSSOAuth) {
            clientConfig.credentials = async () => {
                const creds = await awsAuth.getCredentials();
                return await creds();
            };
        } else if (awsAuth instanceof AWSAuthProvider) {
            clientConfig.credentials = awsAuth.getCredentials();
        }

        this.client = new BedrockRuntimeClient(clientConfig);
        this.modelId = config.modelId;
        this.translator = new BedrockOpenAITranslator(config.cachingStrategy, this.modelId);

        if (config.sharedRateLimiter) {
            this.rateLimiter = config.sharedRateLimiter;
        } else if (config.rateLimits) {
            const rl = config.rateLimits as any;
            if (rl.rpm && typeof rl.rpm === 'object' && 'type' in rl.rpm) {
                this.rateLimiter = new CombinedRateLimiter(config.rateLimits as CombinedLimitConfig);
            } else {
                this.rateLimiter = new BottleneckRateLimiter(config.rateLimits as BottleneckLimitConfig);
            }
        }
    }

    protected async sendRequest(context: OpenAIContext): Promise<ModelResponse> {
        const estimatedTokens = this.estimateTokens(context);
        const totalTokens = estimatedTokens.input + estimatedTokens.output;

        const executeRequest = async () => {
            const bedrockRequest = this.translator.fromOpenAI(context);
            bedrockRequest.modelId = this.modelId;

            const command = new ConverseCommand(bedrockRequest as any);
            const response = await this.client.send(command);
            const rosettaResponse = this.translator.responseToOpenAI(response as any);
            if (rosettaResponse.metadata) {
                rosettaResponse.metadata.modelId = this.modelId;
            }

            return rosettaResponse;
        };

        const rosettaResponse = this.rateLimiter
            ? await this.rateLimiter.schedule(totalTokens, executeRequest)
            : await executeRequest();

        try {
            return rosettaResponse;
        } catch (error: any) {
            if (this.awsAuth.handleAuthError?.(error)) {
                if (this.awsAuth.refresh) {
                    await this.awsAuth.refresh();
                }
            }

            const errorName = error.name || 'Unknown';

            if (errorName === 'ThrottlingException' || error.message?.includes('Too many tokens')) {
                if (this.rateLimiter) {
                    await this.rateLimiter.adaptOnThrottle(error.message);
                }

                throw new RateLimitError(
                    'Bedrock rate limit exceeded - request will be retried',
                    { provider: 'bedrock', modelId: this.modelId },
                    undefined,
                    error
                );
            }

            if (errorName === 'ValidationException') {
                if (error.message?.includes('Input is too long')) {
                    throw new Error('Context window exceeded');
                }
                throw new Error(`Validation error: ${error.message}`);
            }

            if (errorName === 'AccessDeniedException') {
                throw new AuthenticationError(
                    'Access denied - check AWS credentials and model permissions',
                    { provider: 'bedrock', modelId: this.modelId },
                    error
                );
            }

            if (errorName === 'ResourceNotFoundException') {
                throw new Error(`Model not found: ${this.modelId}`);
            }

            throw error;
        }
    }

    protected async *sendStreamRequest(context: OpenAIContext): AsyncGenerator<StreamChunk> {
        const bedrockRequest = this.translator.fromOpenAI(context);
        bedrockRequest.modelId = this.modelId;

        const command = new ConverseStreamCommand(bedrockRequest as any);
        const response = await this.client.send(command);
        const stream = (response as any).stream;
        if (!stream) {
            throw new Error('No stream in ConverseStream response');
        }

        let toolCalls: Array<{ id: string; name: string; args: string }> = [];
        let currentToolId = '';
        let currentToolName = '';
        let currentToolArgs = '';
        let thinkingText = '';

        for await (const event of stream) {
            if (event.contentBlockStart) {
                const start = event.contentBlockStart.start;
                if (start?.toolUse) {
                    currentToolId = start.toolUse.toolUseId ?? '';
                    currentToolName = start.toolUse.name ?? '';
                    currentToolArgs = '';
                    yield { content: [{ type: 'tool_start', name: currentToolName } as any], done: false };
                }
            } else if (event.contentBlockDelta) {
                const delta = event.contentBlockDelta.delta;
                if (delta?.text) {
                    yield { content: [{ type: 'text' as const, text: delta.text }], done: false };
                } else if (delta?.toolUse) {
                    currentToolArgs += delta.toolUse.input ?? '';
                    if (currentToolArgs.length % 1024 < (delta.toolUse.input?.length ?? 0)) {
                        yield { content: [{ type: 'tool_progress' as const, name: currentToolName, bytes: currentToolArgs.length } as any], done: false };
                    }
                } else if (delta?.reasoningContent?.text) {
                    thinkingText += delta.reasoningContent.text;
                    yield { content: [{ type: 'thinking' as const, thinking: delta.reasoningContent.text }], done: false };
                }
            } else if (event.contentBlockStop) {
                if (currentToolId) {
                    toolCalls.push({ id: currentToolId, name: currentToolName, args: currentToolArgs });
                    yield { content: [{ type: 'tool_call' as const, id: currentToolId, name: currentToolName, arguments: JSON.parse(currentToolArgs || '{}') }], done: false };
                    currentToolId = '';
                    currentToolName = '';
                    currentToolArgs = '';
                }
            } else if (event.metadata) {
                const usage = event.metadata.usage;
                yield {
                    content: [],
                    done: true,
                    usage: usage ? {
                        inputTokens: usage.inputTokens ?? 0,
                        outputTokens: usage.outputTokens ?? 0,
                        totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
                        cacheReadTokens: usage.cacheReadInputTokens ?? usage.cacheReadInputTokenCount ?? 0,
                        cacheWriteTokens: usage.cacheWriteInputTokens ?? usage.cacheWriteInputTokenCount ?? 0,
                    } : undefined,
                };
                return;
            } else if (event.messageStop) {
                // metadata event with usage follows
            }
        }

        yield { content: [], done: true };
    }

    protected estimateTokens(context: OpenAIContext): { input: number; output: number } {
        const textContent = context.messages
            .flatMap(m => m.content)
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');

        const inputTokens = Math.ceil(textContent.length / 4);
        const outputTokens = context.maxTokens || 4096;

        return { input: inputTokens, output: outputTokens };
    }
}
