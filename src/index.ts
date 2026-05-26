/**
 * Flight Controller — LLM provider abstraction layer.
 *
 * Public API surface. All exports are intended for external consumption.
 *
 * ## Providers
 * - {@link AnthropicProvider} — Anthropic Messages API
 * - {@link OpenAIProvider} — OpenAI and compatible endpoints (DeepSeek, Groq, Ollama, etc.)
 * - {@link BedrockProvider} — AWS Bedrock Converse API
 * - {@link GeminiProvider} — Google Gemini generateContent API
 *
 * ## Core
 * - {@link Model} — Abstract base class (Template Method pattern)
 * - {@link ModelIdentity} — Immutable model descriptor
 * - {@link OpenAIContext} — Universal request format ("Rosetta Stone")
 * - {@link ModelResponse} — Universal response format
 * - {@link IOpenAITranslator} — Bidirectional provider ↔ OpenAI adapter
 *
 * ## Rate Limiting
 * - {@link RateLimit} — Rolling-window rate limiter (TPM/RPM/TPH/RPH)
 * - {@link SessionLimit} — Per-day/month session caps
 * - {@link AdaptiveRateLimiter} — Learns limits from provider throttling
 * - {@link BottleneckRateLimiter} — Production-grade queue via bottleneck library
 *
 * ## Error Handling
 * - {@link LLMError} — Base typed error with code and context
 * - {@link RateLimitError}, {@link AuthenticationError}, {@link ProviderError}, etc.
 * - {@link IErrorHandler} — Pluggable error classification
 * - {@link BlockerEvent} — Observer-pattern events for orchestration decisions
 *
 * ## Auth
 * - {@link IAuthProvider} — Auth provider interface (10 implementations)
 * - {@link AWSSSOAuth} — AWS SSO OIDC device code grant
 * - {@link AWSAuthProvider} — Composite AWS credential chain
 *
 * @module llm-flight-controller
 */

export { BedrockProvider, BedrockProviderConfig } from './providers/bedrock/BedrockProvider.js';
export { OpenAIProvider, OpenAIProviderConfig, OpenAIProviders } from './providers/openai/OpenAIProvider.js';
export { AnthropicProvider, AnthropicProviderConfig } from './providers/anthropic/AnthropicProvider.js';
export { GeminiProvider, GeminiProviderConfig } from './providers/gemini/GeminiProvider.js';


export { Model, ModelConfig } from './core/model/Model.js';
export { ModelIdentity } from './core/model/ModelIdentity.js';
export { ITokenCounter } from './core/model/ITokenCounter.js';

export { CombinedRateLimiter, CombinedLimitConfig } from './core/limits/CombinedRateLimiter.js';
export { BottleneckRateLimiter, BottleneckLimitConfig } from './core/limits/BottleneckRateLimiter.js';
export { AdaptiveRateLimiter, RateLimitConfig } from './core/limits/AdaptiveRateLimiter.js';
export { RateLimit } from './core/limits/RateLimit.js';
export { SessionLimit } from './core/limits/SessionLimit.js';
export { TokenLimit, TokenLimitConfig } from './core/limits/TokenLimit.js';
export { IRateLimiter } from './core/limits/IRateLimiter.js';
export { ISessionLimiter } from './core/limits/ISessionLimiter.js';
export { ITokenLimiter, TokenUsageRequest, TokenLimitCheck } from './core/limits/ITokenLimiter.js';
export { IRateLimitStrategy } from './core/limits/IRateLimitStrategy.js';
export { TokenBucketStrategy } from './core/limits/TokenBucketStrategy.js';
export { FixedWindowStrategy } from './core/limits/FixedWindowStrategy.js';
export { IResetCalculator } from './core/limits/SessionResetCalculator.js';

export { OpenAIContext, ToolDefinition, ContextMetadata } from './core/types/Context.js';
export { OpenAIMessage, OpenAIContent, MessageRole, TextContent, ImageContent, AudioContent, VideoContent, DocumentContent, ToolCallContent, ToolResultContent, ThinkingContent, CacheMarkerContent } from './core/types/Message.js';
export { ModelResponse, TokenUsage, StreamChunk, FinishReason } from './core/types/Response.js';
export { ModelCapabilities, ModelCapability, ContentType, ModelFeatures, ToolHandling } from './core/types/Capabilities.js';
export { ErrorCode, ModelError } from './core/types/Errors.js';
export { ModelPricing, PricingConfig, Budget } from './core/pricing/ModelPricing.js';
export { IPricingTracker, BudgetCheck } from './core/pricing/IPricingTracker.js';
export { ModelStats } from './core/stats/ModelStats.js';
export { IStatsTracker, RequestRecord, StatsSnapshot } from './core/stats/IStatsTracker.js';
export { HealthCheckResult, checkModelHealth, extractRemainingQuota } from './core/model/ModelHealth.js';
export { IBlockerHandler, BlockerType, BlockerAction } from './core/events/BlockerEvent.js';
export { loadConfigFromFile, loadConfigFromObject, mergeWithDefaults } from './core/config/ModelConfigLoader.js';

export { IOpenAITranslator } from './core/translator/IOpenAITranslator.js';
export { BedrockOpenAITranslator } from './providers/bedrock/BedrockOpenAITranslator.js';
export { OpenAIOpenAITranslator } from './providers/openai/OpenAIOpenAITranslator.js';
export { AnthropicOpenAITranslator } from './providers/anthropic/AnthropicOpenAITranslator.js';
export { GeminiOpenAITranslator } from './providers/gemini/GeminiOpenAITranslator.js';

export { ModelRegistry } from './core/registry/ModelRegistry.js';

export { IErrorHandler } from './core/errors/IErrorHandler.js';
export { IErrorClassifier } from './core/errors/IErrorClassifier.js';
export { DefaultErrorClassifier } from './core/errors/DefaultErrorClassifier.js';
export { BaseErrorHandler } from './core/errors/BaseErrorHandler.js';
export { BlockerEvent } from './core/events/BlockerEvent.js';
export {
    LLMError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    ModelNotFoundError,
    ProviderError,
    ContextLengthError,
    NetworkError,
    ParseError
} from './core/errors/LLMError.js';

export { AWSAuthProvider } from './auth/AWSAuthProvider.js';
export { AWSSSOAuth } from './auth/AWSSSOAuth.js';
export { ApiKeyAuth } from './auth/ApiKeyAuth.js';
export { AwsProfileAuth } from './auth/AwsProfileAuth.js';
export { AwsCredentialsAuth } from './auth/AwsCredentialsAuth.js';
export { BrowserOAuthAuth } from './auth/BrowserOAuthAuth.js';
export { AzureManagedIdentityAuth } from './auth/AzureManagedIdentityAuth.js';
export { AzureServicePrincipalAuth } from './auth/AzureServicePrincipalAuth.js';
export { GoogleAdcAuth } from './auth/GoogleAdcAuth.js';
export { GoogleServiceAccountAuth } from './auth/GoogleServiceAccountAuth.js';
export { IAuthProvider, IAuthHandler, DeviceCodeInfo } from './auth/IAuthProvider.js';
