import { IOpenAITranslator } from '../../core/translator/IOpenAITranslator.js';
import { OpenAIContext } from '../../core/types/Context.js';
import { OpenAIMessage, OpenAIContent } from '../../core/types/Message.js';
import { ModelResponse, TokenUsage } from '../../core/types/Response.js';
import { BedrockRequest, BedrockResponse, BedrockMessage, BedrockContent } from './BedrockTypes.js';
import { contentToOpenAI, contentFromOpenAI } from './BedrockContentConverter.js';

/** Controls where Bedrock cache-point markers are injected in the request. */
export interface PromptCachingStrategy {
    enabled: boolean;
    cacheSystem: boolean;
    cacheTools: boolean;
}

/** Returns true if the model ID supports Bedrock prompt caching (strips regional prefixes). */
export function modelSupportsCaching(modelId: string): boolean {
    const cleanId = modelId.replace(/^(us|eu|ap|global)\./,'');

    const supportedPatterns = [
        'anthropic.claude-opus-4-5',
        'anthropic.claude-opus-4-6',
        'anthropic.claude-opus-4-7',
        'anthropic.claude-sonnet-4-5',
        'anthropic.claude-sonnet-4-6',
        'anthropic.claude-haiku-4-5',
        'anthropic.claude-opus-4-20250514',
        'anthropic.claude-3-7-sonnet',
        'anthropic.claude-3-5-sonnet-20241022' // v2
    ];

    return supportedPatterns.some(pattern => cleanId.includes(pattern));
}

/** Minimum token count required for a cache-point to take effect on this model. */
export function getMinimumCacheableTokens(modelId: string): number {
    const cleanId = modelId.replace(/^(us|eu|ap|global)\./,'');
    if (
        cleanId.includes('opus-4-7') ||
        cleanId.includes('opus-4-6') ||
        cleanId.includes('opus-4-5') ||
        cleanId.includes('sonnet-4-6') ||
        cleanId.includes('sonnet-4-5') ||
        cleanId.includes('haiku-4-5')
    ) {
        return 4096;
    }

    return 1024;
}

/**
 * Translates between OpenAIContext and Bedrock's Converse API format.
 * Handles prompt caching injection based on the configured strategy.
 */
export class BedrockOpenAITranslator implements IOpenAITranslator<BedrockRequest, BedrockResponse> {
    private cachingStrategy: PromptCachingStrategy;

    constructor(cachingStrategy?: Partial<PromptCachingStrategy>, modelId?: string) {

        const shouldEnableCaching = cachingStrategy?.enabled !== undefined
            ? cachingStrategy.enabled
            : (modelId ? modelSupportsCaching(modelId) : false);

        this.cachingStrategy = {
            enabled: shouldEnableCaching,
            cacheSystem: true,
            cacheTools: true,
            ...cachingStrategy
        };
    }
    /** Provider identifier used in metadata tagging. */
    getProviderId(): string {
        return 'bedrock';
    }

    /** Convert a Bedrock Converse request to the universal OpenAI context format. */
    toOpenAI(bedrockRequest: BedrockRequest): OpenAIContext {
        const messages: OpenAIMessage[] = [];

        if (bedrockRequest.system) {
            messages.push({
                role: 'system',
                content: bedrockRequest.system.map(s => ({ type: 'text' as const, text: s.text }))
            });
        }

        for (const msg of bedrockRequest.messages) {
            const content: OpenAIContent[] = [];

            for (const block of msg.content) {
                content.push(contentToOpenAI(block));
            }

            messages.push({
                role: msg.role,
                content
            });
        }

        return {
            messages,
            tools: bedrockRequest.toolConfig?.tools
                .filter((t): t is { toolSpec: any } => 'toolSpec' in t)
                .map(t => ({
                    type: 'function',
                    function: {
                        name: t.toolSpec.name,
                        description: t.toolSpec.description,
                        parameters: t.toolSpec.inputSchema.json
                    }
                })),
            maxTokens: bedrockRequest.inferenceConfig?.maxTokens,
            temperature: bedrockRequest.inferenceConfig?.temperature,
            topP: bedrockRequest.inferenceConfig?.topP
        };
    }

    /** Converts 'tool' role to 'user' since Bedrock only accepts user/assistant. */
    fromOpenAI(openaiContext: OpenAIContext): BedrockRequest {
        const bedrockMessages: BedrockMessage[] = [];
        let systemPrompts: Array<{ text: string }> | undefined;

        const systemMessages = openaiContext.messages.filter(msg => msg.role === 'system');
        if (systemMessages.length > 0) {
            const textBlocks = systemMessages
                .flatMap(msg => msg.content)
                .filter(c => c.type === 'text')
                .map(c => ({ text: c.text }));

            if (textBlocks.length > 0 && this.cachingStrategy.enabled && this.cachingStrategy.cacheSystem) {
                systemPrompts = [...textBlocks, { cachePoint: { type: 'default' } }] as any;
            } else {
                systemPrompts = textBlocks;
            }
        }

        const nonSystemMessages = openaiContext.messages.filter(msg => msg.role !== 'system');

        for (let i = 0; i < nonSystemMessages.length; i++) {
            const msg = nonSystemMessages[i];
            const content: BedrockContent[] = [];

            for (let j = 0; j < msg.content.length; j++) {
                const block = msg.content[j];
                const converted = contentFromOpenAI(block);
                if (converted) {
                    content.push(converted);
                    const isSecondToLast = this.cachingStrategy.enabled &&
                                          nonSystemMessages.length > 1 &&
                                          i === nonSystemMessages.length - 2;
                    const isLastBlock = j === msg.content.length - 1;

                    if (isSecondToLast && isLastBlock) {
                        content.push({ cachePoint: { type: 'default' as const } } as any);
                    }
                }
            }

            if (content.length > 0) {
                const role = (msg.role === 'assistant') ? 'assistant' : 'user';

                bedrockMessages.push({
                    role,
                    content
                });
            }
        }

        const request: BedrockRequest = {
            modelId: '',
            messages: bedrockMessages,
            system: systemPrompts,
            inferenceConfig: {
                maxTokens: openaiContext.maxTokens,
                temperature: openaiContext.temperature,
                topP: openaiContext.topP
            },
            toolConfig: openaiContext.tools
                ? {
                      tools: (() => {
                          const toolEntries: Array<
                              | { toolSpec: { name: string; description?: string; inputSchema: { json: any } } }
                              | { cachePoint: { type: 'default' } }
                          > = openaiContext.tools.map(tool => ({
                              toolSpec: {
                                  name: tool.function.name,
                                  description: tool.function.description,
                                  inputSchema: {
                                      json: tool.function.parameters
                                  }
                              }
                          }));

                          if (this.cachingStrategy.enabled && this.cachingStrategy.cacheTools) {
                              toolEntries.push({ cachePoint: { type: 'default' as const } });
                          }

                          return toolEntries;
                      })()
                  }
                : undefined
        };

        if (openaiContext.thinking?.enabled) {
            request.additionalModelRequestFields = {
                thinking: {
                    type: 'enabled',
                    budget_tokens: openaiContext.thinking.budgetTokens,
                },
            };
            if (request.inferenceConfig) {
                request.inferenceConfig.temperature = 1;
                delete request.inferenceConfig.topP;
            }
        }

        return request;
    }

    /** Convert a Bedrock Converse response to a universal ModelResponse. */
    responseToOpenAI(bedrockResponse: BedrockResponse): ModelResponse {
        const content: OpenAIContent[] = [];

        for (const block of bedrockResponse.output.message.content) {
            content.push(contentToOpenAI(block));
        }

        const usage: TokenUsage = {
            inputTokens: bedrockResponse.usage.inputTokens,
            outputTokens: bedrockResponse.usage.outputTokens,
            totalTokens: bedrockResponse.usage.totalTokens,
            cacheReadTokens: bedrockResponse.usage.cacheReadInputTokens,
            cacheWriteTokens: bedrockResponse.usage.cacheWriteInputTokens
        };

        const finishReasonMap: Record<string, any> = {
            'end_turn': 'stop',
            'max_tokens': 'length',
            'tool_use': 'tool_calls',
            'stop_sequence': 'stop',
            'content_filtered': 'content_filter'
        };

        return {
            id: `bedrock-${Date.now()}`,
            content,
            usage,
            finishReason: finishReasonMap[bedrockResponse.stopReason] || 'stop',
            metadata: {
                providerId: 'bedrock',
                modelId: 'unknown',
                custom: {
                    metrics: bedrockResponse.metrics
                }
            }
        };
    }
}
