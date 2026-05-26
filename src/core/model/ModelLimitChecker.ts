import { OpenAIContext } from '../types/Context.js';
import { IRateLimiter } from '../limits/IRateLimiter.js';
import { ISessionLimiter } from '../limits/ISessionLimiter.js';
import { ITokenLimiter } from '../limits/ITokenLimiter.js';
import { IPricingTracker } from '../pricing/IPricingTracker.js';
import { IAuthProvider } from '../../auth/IAuthProvider.js';
import { BlockerEvent, BlockerType, BlockerAction, IBlockerHandler } from '../events/BlockerEvent.js';
import { RateLimitError, AuthenticationError } from '../errors/LLMError.js';
import { ModelIdentity } from './ModelIdentity.js';

export interface LimitCheckerDependencies {
    identity: ModelIdentity;
    auth: IAuthProvider;
    rateLimiter?: IRateLimiter;
    sessionLimiter?: ISessionLimiter;
    tokenLimiter?: ITokenLimiter;
    pricingTracker?: IPricingTracker;
    blockerHandler?: IBlockerHandler;
    estimateTokens: (context: OpenAIContext) => { input: number; output: number };
}

/** Pre-flight guard: checks auth, rate, token, and budget limits before sending a request. */
export class ModelLimitChecker {
    private readonly deps: LimitCheckerDependencies;

    constructor(deps: LimitCheckerDependencies) {
        this.deps = deps;
    }

    async checkAllLimits(context: OpenAIContext): Promise<void> {
        await this.checkAuthentication();
        await this.checkRateLimits(context);
        this.checkTokenLimits(context);
        this.checkPricingBudget(context);
    }

    private async checkAuthentication(): Promise<void> {
        if (!this.deps.auth.isAuthenticated()) {
            if (this.deps.auth.initialize) {
                await this.deps.auth.initialize();
            }

            if (!this.deps.auth.isAuthenticated()) {
                const blockerEvent: BlockerEvent = {
                    type: BlockerType.AUTH_REQUIRED,
                    severity: 'critical',
                    blocking: true,
                    message: `Authentication required for ${this.deps.identity.displayName}`,
                    suggestedActions: [BlockerAction.AUTHENTICATE]
                };

                this.emitBlockerEvent(blockerEvent);
                throw new AuthenticationError('Authentication required');
            }
        }
    }

    private async checkRateLimits(context: OpenAIContext): Promise<void> {
        const tokenEstimate = this.deps.estimateTokens(context);

        if (this.deps.rateLimiter) {
            const rateCheck = this.deps.rateLimiter.checkLimit({
                tokens: tokenEstimate.input + tokenEstimate.output,
                requests: 1
            });

            if (!rateCheck.allowed) {
                const blockerEvent: BlockerEvent = {
                    type: BlockerType.RATE_LIMIT_EXCEEDED,
                    severity: 'warning',
                    blocking: true,
                    message: rateCheck.reason || 'Rate limit exceeded',
                    suggestedActions: [BlockerAction.WAIT, BlockerAction.SWITCH_MODEL],
                    data: {
                        waitMs: rateCheck.waitMs,
                        currentUsage: rateCheck.usage
                    }
                };

                this.emitBlockerEvent(blockerEvent);
                throw new RateLimitError(blockerEvent.message, {}, rateCheck.waitMs);
            }

            if (this.deps.rateLimiter.isApproachingLimit()) {
                this.emitBlockerEvent({
                    type: BlockerType.RATE_LIMIT_WARNING,
                    severity: 'info',
                    blocking: false,
                    message: `Approaching rate limit for ${this.deps.identity.displayName}`,
                    suggestedActions: [BlockerAction.SWITCH_MODEL]
                });
            }
        }

        if (this.deps.sessionLimiter) {
            const sessionCheck = this.deps.sessionLimiter.checkLimit({ tokens: tokenEstimate.input });

            if (!sessionCheck.allowed) {
                const blockerEvent: BlockerEvent = {
                    type: BlockerType.SESSION_LIMIT_EXCEEDED,
                    severity: 'error',
                    blocking: true,
                    message: sessionCheck.reason || 'Session limit exceeded',
                    suggestedActions: [BlockerAction.SWITCH_MODEL],
                    data: {
                        resetAt: sessionCheck.resetAt
                    }
                };

                this.emitBlockerEvent(blockerEvent);
                throw new RateLimitError(blockerEvent.message, { type: 'session' });
            }
        }
    }

    private checkTokenLimits(context: OpenAIContext): void {
        if (!this.deps.tokenLimiter) {
            return;
        }

        const tokenEstimate = this.deps.estimateTokens(context);
        const tokenCheck = this.deps.tokenLimiter.checkLimit({
            inputTokens: tokenEstimate.input,
            requestedOutputTokens: tokenEstimate.output
        });

        if (!tokenCheck.allowed) {
            const blockerEvent: BlockerEvent = {
                type: BlockerType.CONTEXT_TOO_LARGE,
                severity: 'error',
                blocking: true,
                message: tokenCheck.reason || 'Context too large',
                suggestedActions: [BlockerAction.COMPRESS_CONTEXT, BlockerAction.SWITCH_MODEL],
                data: {
                    currentTokens: tokenEstimate.input,
                    maxTokens: tokenCheck.usage?.contextLimit
                }
            };

            this.emitBlockerEvent(blockerEvent);
            throw new Error(blockerEvent.message);
        }
    }

    private checkPricingBudget(context: OpenAIContext): void {
        if (!this.deps.pricingTracker) {
            return;
        }

        const tokenEstimate = this.deps.estimateTokens(context);
        const estimatedCost = this.deps.pricingTracker.calculateCost({
            inputTokens: tokenEstimate.input,
            outputTokens: tokenEstimate.output,
            totalTokens: tokenEstimate.input + tokenEstimate.output
        });

        const budgetCheck = this.deps.pricingTracker.checkBudget(estimatedCost);

        if (!budgetCheck.allowed) {
            const blockerEvent: BlockerEvent = {
                type: BlockerType.DAILY_LIMIT_EXCEEDED,
                severity: 'error',
                blocking: true,
                message: budgetCheck.reason || 'Budget exceeded',
                suggestedActions: [BlockerAction.SWITCH_MODEL, BlockerAction.CANCEL],
                data: {
                    metadata: {
                        currentCost: budgetCheck.currentCost,
                        limit: budgetCheck.limit,
                        estimatedCost
                    }
                }
            };

            this.emitBlockerEvent(blockerEvent);
            throw new Error(blockerEvent.message);
        }
    }

    private emitBlockerEvent(event: BlockerEvent): void {
        if (this.deps.blockerHandler) {
            this.deps.blockerHandler.handleBlocker(event);
        }
    }
}
