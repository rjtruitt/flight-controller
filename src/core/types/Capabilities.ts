/** Known model capabilities used across all providers. Maps to provider-specific feature flags. */
export enum ModelCapability {
    /** Text generation (chat/completion). */
    TEXT_GENERATION = 'text_generation',
    /** Legacy text completion (non-chat). */
    TEXT_COMPLETION = 'text_completion',
    /** Chat-style interaction. */
    CHAT = 'chat',
    /** Code generation and editing. */
    CODE_GENERATION = 'code_generation',

    /** Image understanding (vision). */
    IMAGE_INPUT = 'image_input',
    /** Image generation from text. */
    IMAGE_GENERATION = 'image_generation',
    /** Image editing/modification. */
    IMAGE_EDITING = 'image_editing',
    /** Optical character recognition. */
    OCR = 'ocr',

    /** Audio understanding (speech-to-text). */
    AUDIO_INPUT = 'audio_input',
    /** Audio generation (text-to-speech). */
    AUDIO_GENERATION = 'audio_generation',
    /** Speech transcription. */
    TRANSCRIPTION = 'transcription',
    /** Text-to-speech synthesis. */
    TEXT_TO_SPEECH = 'text_to_speech',

    /** Native function/tool calling support. */
    FUNCTION_CALLING = 'function_calling',
    /** Streaming response support. */
    STREAMING = 'streaming',
    /** Text embedding generation. */
    EMBEDDINGS = 'embeddings',

    /** Context window >100k tokens. */
    LONG_CONTEXT = 'long_context',
    /** Provider-side prompt caching support. */
    PROMPT_CACHING = 'prompt_caching',

    /** Multi-modal input (text + image + audio). */
    MULTIMODAL_INPUT = 'multimodal_input',
    /** Multi-modal output (text + image + audio). */
    MULTIMODAL_OUTPUT = 'multimodal_output'
}

/** How a provider handles function/tool calling: natively, via context injection, or not at all. */
export type ToolHandlingMode =
    | 'native'   // Provider has native function calling
    | 'context'  // Tools injected as text in context
    | 'none';    // No tool support

/** Supported content I/O types for a model. */
export type ContentType = 'text' | 'image' | 'audio' | 'video';

/** Feature flags describing what a model supports (context window, streaming, vision, etc.). */
export interface ModelFeatures {
    /** Maximum context window size in tokens. */
    contextWindow: number;
    /** Maximum output token limit. */
    maxOutputTokens: number;
    /** Whether the model supports streaming responses. */
    supportsStreaming: boolean;
    /** Whether the model supports native function calling. */
    supportsFunctions: boolean;
    /** Whether the model supports image input (vision). */
    supportsVision: boolean;
    /** Whether the model supports audio input. */
    supportsAudio: boolean;
}

/** Describes how a model handles tool/function calls. */
export interface ToolHandling {
    /** The tool handling mode (native, context injection, or none). */
    mode: ToolHandlingMode;
    /** Maximum number of tools that can be passed in a single request. */
    maxTools?: number;
    /** Whether the model supports parallel tool calls. */
    supportsParallel?: boolean;
}

/** Complete capability descriptor for a model, combining features, tool handling, and I/O types. */
export interface ModelCapabilities {
    /** Set of all supported capabilities. */
    capabilities: Set<ModelCapability>;
    /** Feature flag details (context window, streaming, vision, etc.). */
    features: ModelFeatures;
    /** Tool/function calling behavior. */
    toolHandling: ToolHandling;
    /** Supported input content types. */
    inputTypes: Set<ContentType>;
    /** Supported output content types. */
    outputTypes: Set<ContentType>;
}
