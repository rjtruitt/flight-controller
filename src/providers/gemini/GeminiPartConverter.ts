import { GeminiPart } from './GeminiTypes.js';
import { OpenAIContent } from '../../core/types/Message.js';

/** Converts a Gemini-native Part to the universal OpenAIContent format. */
export function partToOpenAI(part: GeminiPart): OpenAIContent {
    if ('text' in part) {
        return { type: 'text', text: part.text };
    }

    if ('inlineData' in part) {
        const mimeType = part.inlineData.mimeType;
        if (mimeType.startsWith('image/')) {
            return {
                type: 'image',
                source: {
                    type: 'base64',
                    mediaType: mimeType,
                    data: part.inlineData.data
                }
            };
        }
        if (mimeType.startsWith('video/')) {
            return {
                type: 'video',
                source: {
                    type: 'base64',
                    mediaType: mimeType,
                    data: part.inlineData.data
                }
            };
        }
        if (mimeType.startsWith('audio/')) {
            return {
                type: 'audio',
                source: {
                    type: 'base64',
                    mediaType: mimeType,
                    data: part.inlineData.data
                }
            };
        }
    }

    if ('fileData' in part) {
        const mimeType = part.fileData.mimeType;
        if (mimeType.startsWith('image/')) {
            return {
                type: 'image',
                source: {
                    type: 'url',
                    mediaType: mimeType,
                    data: part.fileData.fileUri
                }
            };
        }
        if (mimeType.startsWith('video/')) {
            return {
                type: 'video',
                source: {
                    type: 'url',
                    mediaType: mimeType,
                    data: part.fileData.fileUri
                }
            };
        }
    }

    if ('functionCall' in part) {
        return {
            type: 'tool_call',
            id: `call_${Date.now()}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args
        };
    }

    if ('functionResponse' in part) {
        return {
            type: 'tool_result',
            toolCallId: part.functionResponse.name,
            content: JSON.stringify(part.functionResponse.response)
        };
    }

    return { type: 'text', text: JSON.stringify(part) };
}

export function partFromOpenAI(content: OpenAIContent): GeminiPart | null {
    if (content.type === 'text') {
        return { text: content.text };
    }

    if (content.type === 'image') {
        if (content.source?.type === 'base64') {
            return {
                inlineData: {
                    mimeType: content.source.mediaType || 'image/png',
                    data: content.source.data || ''
                }
            };
        }
        if (content.source?.type === 'url') {
            return {
                fileData: {
                    mimeType: content.source.mediaType || 'image/png',
                    fileUri: content.source.data || ''
                }
            };
        }
    }

    if (content.type === 'video') {
        if (content.source?.type === 'base64') {
            return {
                inlineData: {
                    mimeType: content.source.mediaType || 'video/mp4',
                    data: content.source.data || ''
                }
            };
        }
        if (content.source?.type === 'url') {
            return {
                fileData: {
                    mimeType: content.source.mediaType || 'video/mp4',
                    fileUri: content.source.data || ''
                }
            };
        }
    }

    if (content.type === 'audio') {
        if (content.source?.type === 'base64') {
            return {
                inlineData: {
                    mimeType: content.source.mediaType || 'audio/mp3',
                    data: content.source.data || ''
                }
            };
        }
    }

    if (content.type === 'tool_call') {
        // functionCall.args must be a Struct (object), not a string
        const args = typeof content.arguments === 'string'
            ? (() => { try { return JSON.parse(content.arguments); } catch { return { value: content.arguments }; } })()
            : content.arguments ?? {};
        return {
            functionCall: {
                name: content.name || '',
                args,
            }
        };
    }

    if (content.type === 'tool_result') {
        const contentStr = (content.content as string) || (content.result as string) || '{}';
        // Tool result content is plain text, not JSON — wrap it in an object
        let parsed: unknown;
        try {
            parsed = JSON.parse(contentStr);
            // Gemini API requires functionResponse.response to be a Struct (object),
            // not a plain string. If parsed is a string, wrap it in { result }.
            if (typeof parsed === 'string') {
                parsed = { result: parsed };
            }
        } catch {
            // Log a preview of what failed so we can diagnose the source
            const preview = contentStr.length > 200 ? contentStr.slice(0, 200) + '...' : contentStr;
            console.error(`[GeminiPartConverter] Tool result JSON.parse failed — content preview (${contentStr.length} chars):`, JSON.stringify(preview));
            parsed = { result: contentStr };
        }
        return {
            functionResponse: {
                name: content.toolCallId || '',
                response: parsed,
            }
        };
    }

    return null;
}
