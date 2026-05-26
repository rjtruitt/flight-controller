import { OpenAIContext } from '../types/Context.js';
import { OpenAIContent } from '../types/Message.js';
import { ModelResponse } from '../types/Response.js';

export interface IOpenAITranslator<TProviderFormat = any, TProviderResponse = any> {
    toOpenAI(providerFormat: TProviderFormat): OpenAIContext;
    fromOpenAI(rosettaContext: OpenAIContext): TProviderFormat;
    responseToOpenAI(providerResponse: TProviderResponse): ModelResponse;
    getProviderId(): string;
}

/** Handles feature gaps between providers (e.g., injecting tools as text for models without native support). */
export interface IContentAdapter {
    adaptContent(
        content: OpenAIContent[],
        targetCapabilities: Set<string>
    ): OpenAIContent[];

    extractToolCalls?(text: string): Array<{
        id: string;
        name: string;
        arguments: any;
    }>;
}

export class BaseContentAdapter implements IContentAdapter {
    adaptContent(
        content: OpenAIContent[],
        targetCapabilities: Set<string>
    ): OpenAIContent[] {
        const adapted: OpenAIContent[] = [];

        for (const item of content) {
            if (item.type === 'text') {
                adapted.push(item);
                continue;
            }

            if (item.type === 'image') {
                if (targetCapabilities.has('vision')) {
                    adapted.push(item);
                } else {
                    adapted.push({
                        type: 'text',
                        text: `[Image: ${item.source?.data?.substring(0, 50) || 'image data'}...]`
                    });
                }
                continue;
            }

            if (item.type === 'tool_call') {
                if (targetCapabilities.has('native_tools')) {
                    adapted.push(item);
                } else {
                    adapted.push({
                        type: 'text',
                        text: `Tool Call: ${item.name}(${JSON.stringify(item.arguments)})`
                    });
                }
                continue;
            }

            if (item.type === 'tool_result') {
                if (targetCapabilities.has('native_tools')) {
                    adapted.push(item);
                } else {
                    adapted.push({
                        type: 'text',
                        text: `Tool Result: ${JSON.stringify(item.content)}`
                    });
                }
                continue;
            }

            if (item.type === 'cache_marker') {
                if (targetCapabilities.has('prompt_caching')) {
                    adapted.push(item);
                }
                continue;
            }

            if (item.type === 'thinking') {
                if (targetCapabilities.has('reasoning')) {
                    adapted.push(item);
                } else {
                    adapted.push({
                        type: 'text',
                        text: `[Reasoning: ${item.text}]`
                    });
                }
                continue;
            }

            if (item.type === 'audio' || item.type === 'video' || item.type === 'document') {
                if (targetCapabilities.has(item.type)) {
                    adapted.push(item);
                } else {
                    adapted.push({
                        type: 'text',
                        text: `[${item.type}: not supported by target model]`
                    });
                }
                continue;
            }

            adapted.push(item);
        }

        return adapted;
    }

    extractToolCalls(text: string): Array<{ id: string; name: string; arguments: any }> {
        const calls: Array<{ id: string; name: string; arguments: any }> = [];

        const regex = /Tool Call: (\w+)\((.*?)\)/g;
        let match;
        let index = 0;

        while ((match = regex.exec(text)) !== null) {
            const name = match[1];
            const argsJson = match[2];

            try {
                const args = JSON.parse(argsJson);
                calls.push({
                    id: `call_${index++}`,
                    name,
                    arguments: args
                });
            } catch (e) {
            }
        }

        return calls;
    }
}
