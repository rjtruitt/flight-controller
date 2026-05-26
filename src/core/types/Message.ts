/** Allowed message roles in the universal format. */
export type MessageRole = 'user' | 'assistant' | 'system';

/** Plain text content block. */
export interface TextContent {
    type: 'text';
    text: string;
}

/** Image content block with inline or URL source. */
export interface ImageContent {
    type: 'image';
    url?: string;
    mimeType?: string;
    source?: {
        type: 'base64' | 'url';
        media_type?: string;
        mediaType?: string;
        data?: string;
    };
}

/** Audio content block with inline or URL source. */
export interface AudioContent {
    type: 'audio';
    url?: string;
    mimeType?: string;
    source?: {
        type: 'base64' | 'url';
        media_type?: string;
        mediaType?: string;
        data?: string;
    };
}

/** Video content block with inline or URL source. */
export interface VideoContent {
    type: 'video';
    url?: string;
    mimeType?: string;
    source?: {
        type: 'base64' | 'url';
        media_type?: string;
        mediaType?: string;
        data?: string;
    };
}

/** Document content block (PDF, DOCX, etc.) with optional extracted text. */
export interface DocumentContent {
    type: 'document';
    url: string;
    mimeType: string;
    text?: string;
    metadata?: {
        title?: string;
        author?: string;
        pageCount?: number;
    };
}

/** Tool invocation requested by the model. */
export interface ToolCallContent {
    type: 'tool_call';
    id: string;
    name: string;
    args?: unknown;
    arguments?: unknown;
}

/** Result of a tool execution, returned to the model. */
export interface ToolResultContent {
    type: 'tool_result';
    id?: string;
    toolCallId?: string;
    result?: unknown;
    content?: unknown;
    error?: string;
}

/** Chain-of-thought reasoning block (Claude extended thinking, o1). */
export interface ThinkingContent {
    type: 'thinking';
    thinking?: string;
    text?: string;
}

/** Hint to provider-side prompt caching infrastructure. */
export interface CacheMarkerContent {
    type: 'cache_marker';
    breakpoint?: 'ephemeral' | 'persistent';
    text?: string;
}

/** Union of all supported content block types in the universal format. */
export type OpenAIContent =
    | TextContent
    | ImageContent
    | AudioContent
    | VideoContent
    | DocumentContent
    | ToolCallContent
    | ToolResultContent
    | ThinkingContent
    | CacheMarkerContent;

/** Per-message metadata for tracking origin, cost, and priority. */
export interface MessageMetadata {
    timestamp?: number;
    modelId?: string;
    tokens?: number;
    importance?: number;
    custom?: Record<string, unknown>;
}

/** Universal message format used across all providers. */
export interface OpenAIMessage {
    role: MessageRole;
    content: OpenAIContent[];
    metadata?: MessageMetadata;
}

/** Opaque provider-native message for pass-through scenarios. */
export type ProviderMessage = unknown;
