import { ModelIdentity } from './ModelIdentity.js';
import { IAuthProvider } from '../../auth/IAuthProvider.js';
import { ModelCapabilities } from '../types/Capabilities.js';
import { IRateLimiter } from '../limits/IRateLimiter.js';
import { ISessionLimiter } from '../limits/ISessionLimiter.js';
import { ITokenLimiter } from '../limits/ITokenLimiter.js';
import { IPricingTracker } from '../pricing/IPricingTracker.js';
import { IStatsTracker } from '../stats/IStatsTracker.js';
import { IErrorHandler } from '../errors/IErrorHandler.js';
import { BlockerEvent, IBlockerHandler } from '../events/BlockerEvent.js';
import { OpenAIContext } from '../types/Context.js';
import { ModelResponse, StreamChunk } from '../types/Response.js';
import { RateLimitError, AuthenticationError } from '../errors/LLMError.js';
import { checkModelHealth, extractRemainingQuota, HealthCheckResult } from './ModelHealth.js';
import { ModelLimitChecker } from './ModelLimitChecker.js';
import { ModelUsageRecorder } from './ModelUsageRecorder.js';
import { ModelBlockerEventFactory } from './ModelBlockerEventFactory.js';

/** Rate, session, and token limiters that guard a model from exceeding quotas. */
export interface ModelLimits {
    rate?: IRateLimiter;
    session?: ISessionLimiter;
    token?: ITokenLimiter;
}

/** Controls exponential backoff on transient failures (rate limits, timeouts). */
export interface RetryConfig {
    maxRetries?: number;
    /** Total wall-clock budget across all retries. */
    timeoutMs?: number;
    maxBackoffMs?: number;
    baseBackoffMs?: number;
}

/** Everything needed to construct a Model instance. */
export interface ModelConfig {
    identity: ModelIdentity;
    auth: IAuthProvider;
    capabilities: ModelCapabilities;
    limits?: ModelLimits;
    pricing?: IPricingTracker;
    stats?: IStatsTracker;
    errorHandler?: IErrorHandler;
    retry?: RetryConfig;
}

/**
 * Abstract base for all LLM providers. Handles retry, rate limiting, auth,
 * stats, and blocker events so subclasses only implement sendRequest/estimateTokens.
 */
export abstract class Model {
    protected readonly identity: ModelIdentity;
    protected readonly auth: IAuthProvider;
    protected readonly capabilities: ModelCapabilities;
    protected readonly limits: ModelLimits;
    protected readonly pricing?: IPricingTracker;
    protected readonly stats?: IStatsTracker;
    protected readonly errorHandler?: IErrorHandler;
    protected readonly retryConfig: Required<RetryConfig>;
    protected blockerHandler?: IBlockerHandler;
    private limitChecker: ModelLimitChecker;
    private usageRecorder: ModelUsageRecorder;

    constructor(config: ModelConfig) {
        this.identity = config.identity;
        this.auth = config.auth;
        this.capabilities = config.capabilities;
        this.limits = config.limits || {};
        this.pricing = config.pricing;
        this.stats = config.stats;
        this.errorHandler = config.errorHandler;

        this.retryConfig = {
            maxRetries: config.retry?.maxRetries ?? 3,
            timeoutMs: config.retry?.timeoutMs ?? 300000, // 5 minutes
            maxBackoffMs: config.retry?.maxBackoffMs ?? 60000, // 60 seconds
            baseBackoffMs: config.retry?.baseBackoffMs ?? 1000 // 1 second
        };

        this.limitChecker = new ModelLimitChecker({
            identity: this.identity,
            auth: this.auth,
            rateLimiter: this.limits.rate,
            sessionLimiter: this.limits.session,
            tokenLimiter: this.limits.token,
            pricingTracker: this.pricing,
            blockerHandler: this.blockerHandler,
            estimateTokens: this.estimateTokens.bind(this)
        });

        this.usageRecorder = new ModelUsageRecorder({
            stats: this.stats,
            rateLimiter: this.limits.rate,
            sessionLimiter: this.limits.session,
            pricingTracker: this.pricing
        });
    }

    /** Attach a handler that receives blocking events (rate limits, auth failures). */
    setBlockerHandler(handler: IBlockerHandler): void {
        this.blockerHandler = handler;
        this.limitChecker = new ModelLimitChecker({
            identity: this.identity,
            auth: this.auth,
            rateLimiter: this.limits.rate,
            sessionLimiter: this.limits.session,
            tokenLimiter: this.limits.token,
            pricingTracker: this.pricing,
            blockerHandler: handler,
            estimateTokens: this.estimateTokens.bind(this)
        });
    }

    /** Get the model's identity (provider, family, aliases). */
    getIdentity(): ModelIdentity {
        return this.identity;
    }

    /** Get declared capabilities (context window, streaming, vision, etc.). */
    getCapabilities(): ModelCapabilities {
        return this.capabilities;
    }

    /** Get the stats tracker, if configured. */
    getStats(): IStatsTracker | undefined {
        return this.stats;
    }

    /** Stateless health probe -- does not track history or cooldowns. */
    async checkHealth(): Promise<HealthCheckResult> {
        return checkModelHealth({
            sendRequest: this.sendRequest.bind(this),
            errorHandler: this.errorHandler,
            hasSessionLimits: () => !!this.limits.session
        });
    }

    /** Extract remaining quota from response headers/metadata, if available. */
    extractRemainingQuota(response: ModelResponse): number | undefined {
        return extractRemainingQuota(response);
    }

    /** Query whether session limits are configured for this model. */
    getSessionLimitConfig(): { cooldownDuration?: number; hasSessionLimits: boolean } | undefined {
        const sessionLimit = this.limits.session;
        if (!sessionLimit) return undefined;

        return {
            cooldownDuration: undefined,
            hasSessionLimits: true
        };
    }

    /** Send a request with automatic retry, rate limiting, and usage tracking. */
    async sendMessage(context: OpenAIContext, options?: Partial<RetryConfig>): Promise<ModelResponse> {
        const startTime = Date.now();

        const config: Required<RetryConfig> = {
            maxRetries: options?.maxRetries ?? this.retryConfig.maxRetries,
            timeoutMs: options?.timeoutMs ?? this.retryConfig.timeoutMs,
            maxBackoffMs: options?.maxBackoffMs ?? this.retryConfig.maxBackoffMs,
            baseBackoffMs: options?.baseBackoffMs ?? this.retryConfig.baseBackoffMs
        };

        let lastError: Error | undefined;

        for (let attempt = 0; attempt < config.maxRetries; attempt++) {
            if (Date.now() - startTime > config.timeoutMs) {
                throw new Error(`Request timed out after ${config.timeoutMs}ms across ${attempt} retries`);
            }

            try {
                await this.limitChecker.checkAllLimits(context);

                const response = await this.sendRequest(context);
                this.usageRecorder.recordSuccess(response, Date.now() - startTime);

                return response;
            } catch (error) {
                const errorObj = error instanceof Error ? error : new Error(String(error));
                lastError = errorObj;
                this.usageRecorder.recordFailure(errorObj, Date.now() - startTime);

                if (error instanceof RateLimitError) {
                    this.emitBlockerEvent(ModelBlockerEventFactory.createFromError(errorObj));

                    if (attempt === config.maxRetries - 1) {
                        throw error;
                    }

                    const rateLimitError = error as RateLimitError;
                    const waitMs = rateLimitError.retryAfter
                        ? Math.min(rateLimitError.retryAfter, config.maxBackoffMs)
                        : Math.min(config.baseBackoffMs * Math.pow(2, attempt), config.maxBackoffMs);

                    if (Date.now() - startTime + waitMs > config.timeoutMs) {
                        throw new Error(`Cannot retry: would exceed timeout (${config.timeoutMs}ms)`);
                    }

                    await new Promise(resolve => setTimeout(resolve, waitMs));
                    continue;
                }

                if (error instanceof AuthenticationError) {
                    this.emitBlockerEvent(ModelBlockerEventFactory.createFromError(errorObj));
                    throw error;
                }

                throw error;
            }
        }

        throw lastError || new Error('Request failed after all retries');
    }

    /** Provider-specific request implementation (no retry logic -- handled by sendMessage). */
    protected abstract sendRequest(context: OpenAIContext): Promise<ModelResponse>;
    /** Estimate input/output token counts for pre-flight limit checks. */
    protected abstract estimateTokens(context: OpenAIContext): { input: number; output: number };

    /** Stream a response. Checks limits up front; yields StreamChunks until done. */
    async *sendMessageStream(context: OpenAIContext): AsyncGenerator<StreamChunk> {
        await this.limitChecker.checkAllLimits(context);
        yield* this.sendStreamRequest(context);
    }

    protected async *sendStreamRequest(_context: OpenAIContext): AsyncGenerator<StreamChunk> {
        const identity = this.getIdentity?.();
        const providerName = identity?.provider?.displayName ?? identity?.provider?.id ?? 'unknown';
        const modelId = identity?.id ?? 'unknown';
        throw new Error(`Streaming is not implemented for ${providerName}/${modelId}. Set streaming=off to use non-streaming mode.`);
    }

    private emitBlockerEvent(event: BlockerEvent): void {
        if (this.blockerHandler) {
            this.blockerHandler.handleBlocker(event);
        }
    }
}
