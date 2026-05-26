/** Well-known provider IDs. Any string is valid as a provider ID. */
export const KnownProviders = {

    /** Anthropic (Claude models). */
    ANTHROPIC: 'anthropic',
    /** OpenAI (GPT models). */
    OPENAI: 'openai',
    /** Google Gemini. */
    GEMINI: 'gemini',
    /** AWS Bedrock. */
    BEDROCK: 'bedrock',
    /** Azure OpenAI. */
    AZURE: 'azure',
    /** DeepSeek. */
    DEEPSEEK: 'deepseek',
    /** Replicate. */
    REPLICATE: 'replicate',
    /** HuggingFace Inference Endpoints. */
    HUGGINGFACE: 'huggingface',

    /** Groq. */
    GROQ: 'groq',
    /** Together AI. */
    TOGETHER: 'together',
    /** Perplexity AI. */
    PERPLEXITY: 'perplexity',
    /** Anyscale. */
    ANYSCALE: 'anyscale',

    /** Ollama (local). */
    OLLAMA: 'ollama',
    /** LM Studio (local). */
    LM_STUDIO: 'lm-studio',
    /** vLLM (local). */
    VLLM: 'vllm',
    /** Text Generation WebUI (local). */
    TEXT_GEN_WEBUI: 'text-generation-webui',
    /** LocalAI (local). */
    LOCALAI: 'localai',

    /** Generic OpenAI-compatible provider. */
    OPENAI_COMPATIBLE: 'openai-compatible',
    /** Custom provider. */
    CUSTOM: 'custom'
} as const;

export type KnownProviderId = typeof KnownProviders[keyof typeof KnownProviders];

/** Maps provider IDs to their API protocol. Many providers (Ollama, Groq, etc.) are OpenAI-compatible. */
export const ProviderProtocols: Record<string, string> = {
    [KnownProviders.ANTHROPIC]: 'anthropic',
    [KnownProviders.OPENAI]: 'openai',
    [KnownProviders.GEMINI]: 'gemini',
    [KnownProviders.BEDROCK]: 'bedrock',

    [KnownProviders.DEEPSEEK]: 'openai',
    [KnownProviders.GROQ]: 'openai',
    [KnownProviders.TOGETHER]: 'openai',
    [KnownProviders.PERPLEXITY]: 'openai',
    [KnownProviders.ANYSCALE]: 'openai',
    [KnownProviders.OLLAMA]: 'openai',
    [KnownProviders.LM_STUDIO]: 'openai',
    [KnownProviders.VLLM]: 'openai',
    [KnownProviders.TEXT_GEN_WEBUI]: 'openai',
    [KnownProviders.LOCALAI]: 'openai',
    [KnownProviders.OPENAI_COMPATIBLE]: 'openai',
};

/**
 * Get the API protocol for a provider ID.
 * Returns the mapped protocol (e.g. 'openai') or the provider ID itself if unknown.
 * @param providerId - The provider ID to look up
 * @returns The API protocol string
 */
export function getProviderProtocol(providerId: string): string {
    return ProviderProtocols[providerId] || providerId;
}

/**
 * Check whether a provider uses the OpenAI-compatible API protocol.
 * @param providerId - The provider ID to check
 * @returns True if the provider uses the OpenAI protocol
 */
export function isOpenAICompatible(providerId: string): boolean {
    return getProviderProtocol(providerId) === 'openai';
}
