import OpenAI from 'openai';
import { Model, ModelConfig } from '../../core/model/Model.js';
import { ModelResponse, StreamChunk } from '../../core/types/Response.js';
import { OpenAIContext } from '../../core/types/Context.js';
import { OpenAIOpenAITranslator } from './OpenAIOpenAITranslator.js';

/** Configuration for OpenAI-compatible providers. Auth is handled via apiKey. */
export interface OpenAIProviderConfig extends Omit<ModelConfig, 'auth'> {
    /** Override for non-OpenAI endpoints (DeepSeek, Groq, local, etc.). */
    baseURL?: string;
    apiKey: string;
    modelId: string;
}

/** Provider for OpenAI and any API that speaks the OpenAI chat completions protocol. */
export class OpenAIProvider extends Model {
    private client: OpenAI;
    private translator: OpenAIOpenAITranslator;
    private modelId: string;

    constructor(config: OpenAIProviderConfig) {
        super({
            identity: config.identity,
            auth: {
                isAuthenticated: () => true,
                authenticate: async () => {},
                getAuthHeaders: async () => ({ 'Authorization': `Bearer ${config.apiKey}` })
            } as any,
            capabilities: config.capabilities,
            limits: config.limits,
            pricing: config.pricing,
            stats: config.stats,
            errorHandler: config.errorHandler
        });

        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL
        });

        this.translator = new OpenAIOpenAITranslator();
        this.modelId = config.modelId;
    }

    protected async sendRequest(context: OpenAIContext): Promise<ModelResponse> {
        const openaiRequest = this.translator.fromOpenAI(context);
        openaiRequest.model = this.modelId;

        try {
            const response = await this.client.chat.completions.create(openaiRequest as any);
            const headers = (response as any)._request?.headers || {};
            const rosettaResponse = this.translator.responseToOpenAI(response as any);
            if (rosettaResponse.metadata) {
                rosettaResponse.metadata.custom = {
                    ...rosettaResponse.metadata.custom,
                    headers
                };
            }

            return rosettaResponse;
        } catch (error: any) {
            if (error.status === 429) {
                throw new Error('Rate limit exceeded');
            }
            if (error.status === 401) {
                throw new Error('Authentication failed: Invalid API key');
            }

            throw error;
        }
    }

    protected estimateTokens(context: OpenAIContext): { input: number; output: number } {
        const textContent = context.messages
            .flatMap(m => m.content)
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');

        const inputTokens = Math.ceil(textContent.length / 4);
        const outputTokens = context.maxTokens || 1000;

        return { input: inputTokens, output: outputTokens };
    }

    protected async *sendStreamRequest(context: OpenAIContext): AsyncGenerator<StreamChunk> {
        const openaiRequest = this.translator.fromOpenAI(context);
        openaiRequest.model = this.modelId;
        openaiRequest.stream = true;

        let toolCallId = '';
        let toolCallName = '';
        let toolCallArgs = '';

        try {
            const stream = await this.client.chat.completions.create(openaiRequest as any);

            for await (const chunk of stream as any) {
                const delta = chunk.choices?.[0]?.delta;
                const finishReason = chunk.choices?.[0]?.finish_reason;

                if (delta?.content) {
                    yield { content: [{ type: 'text' as const, text: delta.content }], done: false };
                }

                if (delta?.reasoning_content) {
                    yield { content: [{ type: 'thinking' as const, thinking: delta.reasoning_content }], done: false };
                }

                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        if (tc.id) {
                            if (toolCallId) {
                                yield { content: [{ type: 'tool_call' as const, id: toolCallId, name: toolCallName, arguments: JSON.parse(toolCallArgs || '{}') }], done: false };
                            }
                            toolCallId = tc.id;
                            toolCallName = tc.function?.name ?? '';
                            toolCallArgs = tc.function?.arguments ?? '';
                            yield { content: [{ type: 'tool_start' as any, name: toolCallName }], done: false };
                        } else {
                            toolCallArgs += tc.function?.arguments ?? '';
                        }
                    }
                }

                if (finishReason) {
                    if (toolCallId) {
                        yield { content: [{ type: 'tool_call' as const, id: toolCallId, name: toolCallName, arguments: JSON.parse(toolCallArgs || '{}') }], done: false };
                    }
                    const usage = chunk.usage;
                    const tokenUsage = usage ? {
                        inputTokens: usage.prompt_tokens ?? 0,
                        outputTokens: usage.completion_tokens ?? 0,
                        totalTokens: usage.total_tokens ?? 0,
                        cacheReadTokens: usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens ?? 0,
                    } : undefined;
                    yield { content: [], done: true, usage: tokenUsage };
                }
            }
        } catch (error: any) {
            if (error.status === 429) {
                throw new Error('Rate limit exceeded');
            }
            if (error.status === 401) {
                throw new Error('Authentication failed: Invalid API key');
            }
            throw error;
        }
    }
}

/** Factory methods for common OpenAI-compatible providers (DeepSeek, Groq, Ollama, etc.). */
export class OpenAIProviders {
    static createOpenAI(config: Omit<OpenAIProviderConfig, 'baseURL'>): OpenAIProvider {
        return new OpenAIProvider(config);
    }

    static createDeepSeek(config: Omit<OpenAIProviderConfig, 'baseURL'>): OpenAIProvider {
        return new OpenAIProvider({
            ...config,
            baseURL: 'https://api.deepseek.com/v1'
        });
    }

    static createGroq(config: Omit<OpenAIProviderConfig, 'baseURL'>): OpenAIProvider {
        return new OpenAIProvider({
            ...config,
            baseURL: 'https://api.groq.com/openai/v1'
        });
    }

    static createTogether(config: Omit<OpenAIProviderConfig, 'baseURL'>): OpenAIProvider {
        return new OpenAIProvider({
            ...config,
            baseURL: 'https://api.together.xyz/v1'
        });
    }

    static createPerplexity(config: Omit<OpenAIProviderConfig, 'baseURL'>): OpenAIProvider {
        return new OpenAIProvider({
            ...config,
            baseURL: 'https://api.perplexity.ai'
        });
    }

    static createOllama(config: Omit<OpenAIProviderConfig, 'baseURL' | 'apiKey'>): OpenAIProvider {
        return new OpenAIProvider({
            ...config,
            apiKey: 'none', // Ollama doesn't require API key
            baseURL: 'http://localhost:11434/v1'
        });
    }

    static createLMStudio(config: Omit<OpenAIProviderConfig, 'baseURL' | 'apiKey'>): OpenAIProvider {
        return new OpenAIProvider({
            ...config,
            apiKey: 'none', // LM Studio doesn't require API key
            baseURL: 'http://localhost:1234/v1'
        });
    }

    static createCustom(config: OpenAIProviderConfig): OpenAIProvider {
        return new OpenAIProvider(config);
    }
}
