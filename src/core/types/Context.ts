import { OpenAIMessage } from './Message.js';

/** OpenAI-style function tool definition. Used as the universal tool format. */
export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>;
    };
}

/** Bookkeeping metadata for context management (compression, origin tracking). */
export interface ContextMetadata {
    totalTokens?: number;
    compressed?: boolean;
    /** Which provider originally created this context, for audit trails. */
    originalProvider?: string;
    createdAt?: number;
    updatedAt?: number;
    custom?: Record<string, unknown>;
}

/**
 * The universal request context. All providers translate to/from this format,
 * making it the single "Rosetta Stone" for multi-provider orchestration.
 */
export interface OpenAIContext {
    messages: OpenAIMessage[];
    tools?: ToolDefinition[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
    thinking?: { enabled: boolean; budgetTokens: number };
    metadata?: ContextMetadata;
}

/** Opaque provider-native context for advanced pass-through scenarios. */
export type ProviderContext = unknown;
