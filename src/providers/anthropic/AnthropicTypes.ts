export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string | AnthropicContent[];
}

export type AnthropicContent =
    | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
    | { type: 'image'; source: { type: 'base64' | 'url'; media_type: string; data: string } }
    | { type: 'tool_use'; id: string; name: string; input: any }
    | { type: 'tool_result'; tool_use_id: string; content: string | any[] };

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
