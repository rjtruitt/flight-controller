import { IOpenAITranslator } from '../../core/translator/IOpenAITranslator.js';
import { OpenAIContext } from '../../core/types/Context.js';
import { OpenAIMessage, OpenAIContent } from '../../core/types/Message.js';
import { ModelResponse, TokenUsage } from '../../core/types/Response.js';
import { AnthropicRequest, AnthropicResponse, AnthropicMessage } from './AnthropicTypes.js';
import { contentToOpenAI, contentFromOpenAI } from './AnthropicContentConverter.js';

/** Translates between OpenAIContext and Anthropic's Messages API format. */
export class AnthropicOpenAITranslator implements IOpenAITranslator<AnthropicRequest, AnthropicResponse> {
    getProviderId(): string {
        return 'anthropic';
    }

    toOpenAI(anthropicRequest: AnthropicRequest): OpenAIContext {
        const messages: OpenAIMessage[] = [];

        if (anthropicRequest.system) {
            if (typeof anthropicRequest.system === 'string') {
                messages.push({
                    role: 'system',
                    content: [{ type: 'text', text: anthropicRequest.system }]
                });
            } else {
                messages.push({
                    role: 'system',
                    content: anthropicRequest.system.map(block => contentToOpenAI(block))
                });
            }
        }

        for (const msg of anthropicRequest.messages) {
            const content: OpenAIContent[] = [];

            if (typeof msg.content === 'string') {
                content.push({ type: 'text', text: msg.content });
            } else {
                content.push(...msg.content.map(block => contentToOpenAI(block)));
            }

            messages.push({
                role: msg.role,
                content
            });
        }

        return {
            messages,
            tools: anthropicRequest.tools?.map(tool => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.input_schema
                }
            })),
            maxTokens: anthropicRequest.max_tokens,
            temperature: anthropicRequest.temperature,
            topP: anthropicRequest.top_p
        };
    }

    fromOpenAI(context: OpenAIContext): AnthropicRequest {
        const anthropicMessages: AnthropicMessage[] = [];
        let systemPrompt: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> | undefined;

        const systemMessages = context.messages.filter(msg => msg.role === 'system');
        if (systemMessages.length > 0) {
            const systemContent = systemMessages.flatMap(msg => msg.content);

            systemPrompt = systemContent
                .filter(c => c.type === 'text')
                .map((c, idx, arr) => {
                    const base = { type: 'text' as const, text: (c as any).text };
                    if (idx === arr.length - 1) {
                        return { ...base, cache_control: { type: 'ephemeral' as const } };
                    }
                    return base;
                });
        }

        const nonSystemMessages = context.messages.filter(msg => msg.role !== 'system');

        for (let i = 0; i < nonSystemMessages.length; i++) {
            const msg = nonSystemMessages[i];
            const content = msg.content.map((block, j, arr) => {
                const converted = contentFromOpenAI(block);
                const isSecondToLast = nonSystemMessages.length > 1 && i === nonSystemMessages.length - 2;
                const isLastBlock = j === arr.length - 1;
                if (isSecondToLast && isLastBlock) {
                    return { ...converted, cache_control: { type: 'ephemeral' as const } };
                }
                return converted;
            });

            anthropicMessages.push({
                role: msg.role as 'user' | 'assistant',
                content
            });
        }

        const tools = context.tools?.map((tool, idx, arr) => {
            const base = {
                name: tool.function.name,
                description: tool.function.description,
                input_schema: tool.function.parameters
            };
            if (idx === arr.length - 1) {
                return { ...base, cache_control: { type: 'ephemeral' as const } };
            }
            return base;
        });

        return {
            model: '',
            messages: anthropicMessages,
            system: systemPrompt,
            max_tokens: context.maxTokens || 4096,
            temperature: context.temperature,
            top_p: context.topP,
            tools
        };
    }

    responseToOpenAI(anthropicResponse: AnthropicResponse): ModelResponse {
        const content = anthropicResponse.content.map(block => contentToOpenAI(block));

        const usage: TokenUsage = {
            inputTokens: anthropicResponse.usage.input_tokens,
            outputTokens: anthropicResponse.usage.output_tokens,
            totalTokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens,
            cacheReadTokens: anthropicResponse.usage.cache_read_input_tokens,
            cacheWriteTokens: anthropicResponse.usage.cache_creation_input_tokens
        };

        const finishReasonMap: Record<string, any> = {
            'end_turn': 'stop',
            'max_tokens': 'length',
            'tool_use': 'tool_calls',
            'stop_sequence': 'stop'
        };

        return {
            id: anthropicResponse.id,
            content,
            usage,
            finishReason: finishReasonMap[anthropicResponse.stop_reason] || 'stop',
            metadata: {
                providerId: 'anthropic',
                modelId: anthropicResponse.model,
                custom: {
                    stopSequence: anthropicResponse.stop_sequence
                }
            }
        };
    }
}
