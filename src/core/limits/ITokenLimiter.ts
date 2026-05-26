/** Input/output token counts for a pending request. */
export interface TokenUsageRequest {
    inputTokens: number;
    requestedOutputTokens?: number;
}

/** Result of checking whether a request fits within the model's context window. */
export interface TokenLimitCheck {
    allowed: boolean;
    reason?: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        contextLimit: number;
        outputLimit: number;
    };
}

/** Enforces context window and max output token constraints for a model. */
export interface ITokenLimiter {
    checkLimit(usage: TokenUsageRequest): TokenLimitCheck;
    getAvailableOutputTokens(inputTokens: number): number;
    isApproachingLimit?(inputTokens: number, threshold?: number): boolean;
}
