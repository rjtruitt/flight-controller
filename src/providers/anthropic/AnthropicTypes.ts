/** A single message in Anthropic's Messages API wire format. Role must be 'user' or 'assistant'. */
export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string | AnthropicContent[];
}

/** Union of all Anthropic-native content block types. Each block maps to an OpenAIContent type. */
export type AnthropicContent =
    | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
    | { type: 'image'; source: { type: 'base64' | 'url'; media_type: string; data: string } }
    | { type: 'tool_use'; id: string; name: string; input: any }
    | { type: 'tool_result'; tool_use_id: string; content: string | any[] }
    | { type: 'thinking'; thinking: string; signature: string };

/** Request body sent to the Anthropic Messages API. */
export interface AnthropicRequest {
    model: string;
    messages: AnthropicMessage[];
    system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
    max_tokens: number;
    temperature?: number;
    top_p?: number;
    tools?: Array<{
        name: string;
        description?: string;
        input_schema: any;
    }>;
    stream?: boolean;
}

/** Response from the Anthropic Messages API. Includes stop reason and token usage. */
export interface AnthropicResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    content: AnthropicContent[];
    model: string;
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
    stop_sequence?: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
    };
}
