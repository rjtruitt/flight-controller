import { OpenAINativeContent } from './OpenAITypes.js';
import { OpenAIContent } from '../../core/types/Message.js';

export function contentToOpenAI(block: OpenAINativeContent): OpenAIContent | null {
    if (block.type === 'text') {
        return { type: 'text', text: block.text };
    }

    if (block.type === 'image_url') {
        return {
            type: 'image',
            source: {
                type: 'url',
                data: block.image_url.url
            }
        };
    }

    return { type: 'text', text: JSON.stringify(block) };
}

export function contentFromOpenAI(content: OpenAIContent): OpenAINativeContent | null {
    if (content.type === 'text') {
        return { type: 'text', text: content.text };
    }

    if (content.type === 'image') {
        if (content.source?.type === 'url') {
            return {
                type: 'image_url',
                image_url: { url: content.source.data || '' }
            };
        }
        if (content.source?.type === 'base64') {
            return {
                type: 'image_url',
                image_url: { url: `data:${content.source.mediaType};base64,${content.source.data}` }
            };
        }
    }

    return null;
}
