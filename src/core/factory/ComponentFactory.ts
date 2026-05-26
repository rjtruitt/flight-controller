import { ModelIdentity, ProviderInfo } from '../model/ModelIdentity.js';
import { ModelCapability, ToolHandlingMode, ModelCapabilities, ContentType } from '../types/Capabilities.js';
import { RateLimit } from '../limits/RateLimit.js';
import { SessionLimit } from '../limits/SessionLimit.js';
import { TokenLimit } from '../limits/TokenLimit.js';
import { ModelPricing } from '../pricing/ModelPricing.js';
import { SingleModelConfig } from '../config/ModelConfigTypes.js';
import { ModelLimits } from '../model/Model.js';

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
    anthropic: 'Anthropic',
    bedrock: 'AWS Bedrock',
    openai: 'OpenAI',
    gemini: 'Google Gemini',
    azure: 'Azure OpenAI',
    deepseek: 'DeepSeek',
    replicate: 'Replicate',
    huggingface: 'HuggingFace',
    groq: 'Groq',
    together: 'Together AI',
    perplexity: 'Perplexity',
    ollama: 'Ollama',
    'lm-studio': 'LM Studio',
    vllm: 'vLLM',
    'text-generation-webui': 'Text Generation WebUI',
    localai: 'LocalAI',
    'openai-compatible': 'OpenAI Compatible'
};

/** Resolve a provider ID to its human-readable display name. */
export function getProviderDisplayName(provider: string): string {
    return PROVIDER_DISPLAY_NAMES[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** Build a ModelIdentity from a flat config object. */
export function createIdentity(config: SingleModelConfig): ModelIdentity {
    const provider: ProviderInfo = {
        id: config.provider,
        displayName: getProviderDisplayName(config.provider),
        region: config.auth.region
    };

    return new ModelIdentity({
        id: config.modelId,
        displayName: config.displayName || config.modelId,
        provider,
        family: config.family,
        version: config.version,
        aliases: config.aliases || []
    });
}

/** Derive ModelCapabilities (features, tool handling, I/O types) from config. */
export function createCapabilities(config: SingleModelConfig): ModelCapabilities {
    const caps = config.capabilities || {};
    const limits = config.limits || {};

    const capabilitySet = new Set<ModelCapability>(
        caps.features || [ModelCapability.TEXT_GENERATION]
    );

    const features = {
        contextWindow: limits.contextWindow || 100000,
        maxOutputTokens: limits.maxOutputTokens || 4096,
        supportsStreaming: capabilitySet.has(ModelCapability.STREAMING),
        supportsFunctions: capabilitySet.has(ModelCapability.FUNCTION_CALLING),
        supportsVision: capabilitySet.has(ModelCapability.IMAGE_INPUT),
        supportsAudio: capabilitySet.has(ModelCapability.AUDIO_INPUT)
    };

    const toolHandlingMode = caps.toolHandling || 'native';
    const toolHandling = {
        mode: toolHandlingMode as ToolHandlingMode,
        maxTools: undefined,
        supportsParallel: toolHandlingMode === 'native'
    };

    return {
        capabilities: capabilitySet,
        features,
        toolHandling,
        inputTypes: getSupportedInputTypes(capabilitySet),
        outputTypes: getSupportedOutputTypes(capabilitySet)
    };
}

function getSupportedInputTypes(caps: Set<ModelCapability>): Set<ContentType> {
    const types = new Set<ContentType>(['text']);
    if (caps.has(ModelCapability.IMAGE_INPUT)) types.add('image');
    if (caps.has(ModelCapability.AUDIO_INPUT)) types.add('audio');
    return types;
}

function getSupportedOutputTypes(caps: Set<ModelCapability>): Set<ContentType> {
    const types = new Set<ContentType>(['text']);
    if (caps.has(ModelCapability.IMAGE_GENERATION)) types.add('image');
    if (caps.has(ModelCapability.AUDIO_GENERATION)) types.add('audio');
    return types;
}

/** Construct rate, session, and token limiters from config thresholds. */
export function createLimits(config: SingleModelConfig): ModelLimits {
    const limits: ModelLimits = {};

    if (config.limits) {
        if (config.limits.tpm || config.limits.rpm || config.limits.tph || config.limits.rph) {
            limits.rate = new RateLimit({
                tpm: config.limits.tpm,
                rpm: config.limits.rpm,
                tph: config.limits.tph,
                rph: config.limits.rph,
                warningThreshold: config.limits.warningThreshold
            });
        }

        if (config.limits.messagesPerDay || config.limits.tokensPerDay) {
            limits.session = new SessionLimit({
                type: 'free',
                messagesPerDay: config.limits.messagesPerDay,
                sessionsPerDay: config.limits.sessionsPerDay,
                tokensPerDay: config.limits.tokensPerDay,
                tokensPerMonth: config.limits.tokensPerMonth
            });
        }

        if (config.limits.contextWindow && config.limits.maxOutputTokens) {
            limits.token = new TokenLimit({
                contextWindow: config.limits.contextWindow,
                maxOutputTokens: config.limits.maxOutputTokens,
                safetyMargin: config.limits.safetyMargin
            });
        }
    }

    return limits;
}

/** Create a pricing tracker from config, or undefined if no pricing configured. */
export function createPricing(config: SingleModelConfig): ModelPricing | undefined {
    if (!config.pricing) {
        return undefined;
    }

    return new ModelPricing(config.pricing, config.budget);
}
