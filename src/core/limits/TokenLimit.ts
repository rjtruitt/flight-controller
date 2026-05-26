import { ITokenLimiter, TokenUsageRequest, TokenLimitCheck } from './ITokenLimiter.js';

export interface TokenLimitConfig {
    contextWindow: number;
    maxOutputTokens: number;
    /** Fraction of limit to use (e.g., 0.95 = 95%) */
    safetyMargin?: number;
}

/** Validates input/output token counts against a model's context window and output cap. */
export class TokenLimit implements ITokenLimiter {
    private readonly config: Required<TokenLimitConfig>;

    constructor(config: TokenLimitConfig) {
        this.config = {
            contextWindow: config.contextWindow,
            maxOutputTokens: config.maxOutputTokens,
            safetyMargin: config.safetyMargin ?? 1.0
        };
    }

    checkLimit(usage: TokenUsageRequest): TokenLimitCheck {
        const inputTokens = usage.inputTokens;
        const outputTokens = usage.requestedOutputTokens ?? this.config.maxOutputTokens;
        const totalTokens = inputTokens + outputTokens;

        const effectiveContextLimit = this.config.contextWindow * this.config.safetyMargin;
        const effectiveOutputLimit = this.config.maxOutputTokens * this.config.safetyMargin;

        if (inputTokens > effectiveContextLimit) {
            return {
                allowed: false,
                reason: 'input_exceeds_context_window',
                usage: {
                    inputTokens,
                    outputTokens,
                    totalTokens,
                    contextLimit: this.config.contextWindow,
                    outputLimit: this.config.maxOutputTokens
                }
            };
        }

        if (outputTokens > effectiveOutputLimit) {
            return {
                allowed: false,
                reason: 'output_exceeds_maximum',
                usage: {
                    inputTokens,
                    outputTokens,
                    totalTokens,
                    contextLimit: this.config.contextWindow,
                    outputLimit: this.config.maxOutputTokens
                }
            };
        }

        if (totalTokens > effectiveContextLimit) {
            return {
                allowed: false,
                reason: 'total_exceeds_context_window',
                usage: {
                    inputTokens,
                    outputTokens,
                    totalTokens,
                    contextLimit: this.config.contextWindow,
                    outputLimit: this.config.maxOutputTokens
                }
            };
        }

        return {
            allowed: true,
            usage: {
                inputTokens,
                outputTokens,
                totalTokens,
                contextLimit: this.config.contextWindow,
                outputLimit: this.config.maxOutputTokens
            }
        };
    }

    getAvailableOutputTokens(inputTokens: number): number {
        const effectiveLimit = this.config.contextWindow * this.config.safetyMargin;
        const available = Math.min(
            effectiveLimit - inputTokens,
            this.config.maxOutputTokens * this.config.safetyMargin
        );
        return Math.max(0, Math.floor(available));
    }

    isApproachingLimit(inputTokens: number, threshold: number = 0.8): boolean {
        const limitWithSafety = this.config.contextWindow * this.config.safetyMargin;
        return inputTokens / limitWithSafety >= threshold;
    }

    getLimits(): {
        contextWindow: number;
        maxOutputTokens: number;
        safetyMargin: number;
        effectiveContextWindow: number;
        effectiveMaxOutput: number;
    } {
        return {
            contextWindow: this.config.contextWindow,
            maxOutputTokens: this.config.maxOutputTokens,
            safetyMargin: this.config.safetyMargin,
            effectiveContextWindow: this.config.contextWindow * this.config.safetyMargin,
            effectiveMaxOutput: this.config.maxOutputTokens * this.config.safetyMargin
        };
    }
}
