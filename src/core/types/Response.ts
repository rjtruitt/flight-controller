import { OpenAIContent } from './Message.js';

/** Why the model stopped generating. Provider-agnostic. */
export type FinishReason =
    | 'stop'           // Natural completion
    | 'length'         // Hit max token limit
    | 'tool_calls'     // Made tool calls, waiting for results
    | 'content_filter' // Content filtered by provider
    | 'error';         // Error occurred

/** Normalized token counts across all providers. */
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    /** Tokens served from provider-side prompt cache. */
    cacheReadTokens?: number;
    /** Tokens written into provider-side prompt cache this request. */
    cacheWriteTokens?: number;
    /** Tokens consumed by chain-of-thought reasoning (o1/o3). */
    reasoningTokens?: number;
}

/** Provider-specific metadata attached to every response. */
export interface ResponseMetadata {
    modelId?: string;
    latencyMs?: number;
    providerId?: string;
    /** Escape hatch for provider-specific data (headers, safety ratings, etc.). */
    custom?: Record<string, unknown>;
}

/** Provider-agnostic model response -- the universal output of every Model.sendMessage call. */
export interface ModelResponse {
    content: OpenAIContent[];
    usage: TokenUsage;
    finishReason: FinishReason;
    metadata?: ResponseMetadata;
    id?: string;
}

/** A single chunk emitted during streaming. `done: true` signals the final chunk with usage stats. */
export interface StreamChunk {
    content: OpenAIContent[];
    done: boolean;
    usage?: TokenUsage;
}
