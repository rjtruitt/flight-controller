import { IOpenAITranslator } from '../../core/translator/IOpenAITranslator.js';
import { OpenAIContext } from '../../core/types/Context.js';
import { OpenAIMessage, OpenAIContent } from '../../core/types/Message.js';
import { ModelResponse, TokenUsage } from '../../core/types/Response.js';
import { OpenAIRequest, OpenAIResponse, OpenAINativeMessage, OpenAINativeContent, OpenAIToolCall } from './OpenAITypes.js';
import { contentToOpenAI, contentFromOpenAI } from './OpenAIContentConverter.js';

/**
 * Identity translator -- maps between OpenAI's native format and our OpenAIContext.
 * Handles reasoning_content (o1/o3), tool calls, and DeepSeek cache token fields.
 */
export class OpenAIOpenAITranslator implements IOpenAITranslator<OpenAIRequest, OpenAIResponse> {
    getProviderId(): string {
        return 'openai';
    }

    toOpenAI(openaiRequest: OpenAIRequest): OpenAIContext {
        const messages: OpenAIMessage[] = [];

        for (const msg of openaiRequest.messages) {
            const content: OpenAIContent[] = [];

            if (typeof msg.content === 'string') {
                content.push({ type: 'text', text: msg.content });
            }
            else if (Array.isArray(msg.content)) {
                for (const block of msg.content) {
                    const converted = contentToOpenAI(block);
                    if (converted) content.push(converted);
                }
            }

            if (msg.tool_calls) {
                for (const toolCall of msg.tool_calls) {
                    content.push({
                        type: 'tool_call',
                        id: toolCall.id,
                        name: toolCall.function.name,
                        arguments: JSON.parse(toolCall.function.arguments)
                    });
                }
            }

            if (msg.role === 'tool' && msg.tool_call_id) {
                content.push({
                    type: 'tool_result',
                    toolCallId: msg.tool_call_id,
                    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                });
            }

            messages.push({
                role: (msg.role === 'tool' ? 'user' : msg.role) as 'user' | 'assistant' | 'system',
                content
            });
        }

        return {
            messages,
            tools: openaiRequest.tools?.map(tool => ({
                type: 'function',
                function: {
                    name: tool.function.name,
                    description: tool.function.description,
                    parameters: tool.function.parameters
                }
            })),
            maxTokens: openaiRequest.max_tokens,
            temperature: openaiRequest.temperature,
            topP: openaiRequest.top_p
        };
    }

    fromOpenAI(context: OpenAIContext): OpenAIRequest {
        const openaiMessages: OpenAINativeMessage[] = [];

        for (const msg of context.messages) {
            const regularContent: OpenAINativeContent[] = [];
            const toolCalls: OpenAIToolCall[] = [];
            let toolCallId: string | undefined;
            let reasoningText = '';

            for (const block of msg.content) {
                if (block.type === 'tool_call') {
                    toolCalls.push({
                        id: block.id || '',
                        type: 'function',
                        function: {
                            name: block.name || '',
                            arguments: JSON.stringify(block.arguments)
                        }
                    });
                } else if (block.type === 'tool_result') {
                    toolCallId = block.toolCallId;
                    regularContent.push({
                        type: 'text',
                        text: (block.content as string) || ''
                    });
                } else if (block.type === 'thinking') {
                    reasoningText += block.thinking ?? block.text ?? '';
                } else {
                    const converted = contentFromOpenAI(block);
                    if (converted) regularContent.push(converted);
                }
            }

            if (toolCallId) {
                openaiMessages.push({
                    role: 'tool',
                    tool_call_id: toolCallId,
                    content: regularContent.length > 0
                        ? regularContent[0].type === 'text' ? regularContent[0].text : JSON.stringify(regularContent)
                        : ''
                });
            }
            else {
                const message: OpenAINativeMessage = {
                    role: msg.role as 'system' | 'user' | 'assistant',
                    content: regularContent.length === 1 && regularContent[0].type === 'text'
                        ? regularContent[0].text
                        : regularContent
                };

                if (toolCalls.length > 0) {
                    message.tool_calls = toolCalls;
                }

                if (reasoningText && msg.role === 'assistant') {
                    message.reasoning_content = reasoningText;
                }

                openaiMessages.push(message);
            }
        }

        return {
            model: '',
            messages: openaiMessages,
            max_tokens: context.maxTokens,
            temperature: context.temperature,
            top_p: context.topP,
            tools: context.tools?.map(tool => ({
                type: 'function',
                function: {
                    name: tool.function.name,
                    description: tool.function.description,
                    parameters: tool.function.parameters
                }
            }))
        };
    }

    responseToOpenAI(openaiResponse: OpenAIResponse): ModelResponse {
        const choice = openaiResponse.choices[0];
        const content: OpenAIContent[] = [];

        if (choice.message.content) {
            content.push({ type: 'text', text: choice.message.content });
        }

        if (choice.message.reasoning_content) {
            content.push({ type: 'thinking', text: choice.message.reasoning_content });
        }

        if (choice.message.tool_calls) {
            for (const toolCall of choice.message.tool_calls) {
                content.push({
                    type: 'tool_call',
                    id: toolCall.id,
                    name: toolCall.function.name,
                    arguments: JSON.parse(toolCall.function.arguments)
                });
            }
        }

        const usage: TokenUsage = {
            inputTokens: openaiResponse.usage.prompt_tokens,
            outputTokens: openaiResponse.usage.completion_tokens,
            totalTokens: openaiResponse.usage.total_tokens,
            reasoningTokens: openaiResponse.usage.reasoning_tokens
                ?? openaiResponse.usage.completion_tokens_details?.reasoning_tokens,
            cacheReadTokens: openaiResponse.usage.prompt_tokens_details?.cached_tokens
                ?? openaiResponse.usage.prompt_cache_hit_tokens
                ?? 0,
        };

        return {
            id: openaiResponse.id,
            content,
            usage,
            finishReason: choice.finish_reason,
            metadata: {
                providerId: 'openai',
                modelId: openaiResponse.model,
                custom: {
                    created: openaiResponse.created
                }
            }
        };
    }
}
