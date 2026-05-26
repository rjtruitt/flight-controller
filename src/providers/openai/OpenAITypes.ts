/** Wire-format message as sent to/received from the OpenAI API. */
export interface OpenAINativeMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | OpenAINativeContent[];
    name?: string;
    tool_calls?: OpenAIToolCall[];
    /** Present on tool-result messages to correlate with the originating call. */
    tool_call_id?: string;
    /** Reasoning/thinking content for models that support it (DeepSeek, o1/o3). Must be echoed back. */
    reasoning_content?: string;
}

export type OpenAINativeContent =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

/** A single tool invocation in a response. `arguments` is a JSON-encoded string. */
export interface OpenAIToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

/** Wire-format request body for OpenAI chat completions. */
export interface OpenAIRequest {
    model: string;
    messages: OpenAINativeMessage[];
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    tools?: Array<{
        type: 'function';
        function: {
            name: string;
            description?: string;
            parameters: any;
        };
    }>;
    stream?: boolean;
    /** Controls chain-of-thought depth for reasoning models (o1/o3). */
    reasoning_effort?: 'low' | 'medium' | 'high';
}

/** Wire-format response from OpenAI chat completions. Includes DeepSeek cache fields. */
export interface OpenAIResponse {
    id: string;
    object: 'chat.completion';
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: 'assistant';
            content: string | null;
            tool_calls?: OpenAIToolCall[];
            reasoning_content?: string; // o1/o3 reasoning
        };
        finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        reasoning_tokens?: number; // o1/o3 models
        prompt_tokens_details?: {
            cached_tokens?: number;
        };
        completion_tokens_details?: {
            reasoning_tokens?: number;
        };
        prompt_cache_hit_tokens?: number; // DeepSeek
        prompt_cache_miss_tokens?: number; // DeepSeek
    };
}
