/** Tokens and/or requests consumed in a single operation. */
export interface UsageRecord {
    tokens?: number;
    requests?: number;
}

/** Result of a rate limit check indicating whether the operation is allowed. */
export interface RateLimitCheck {
    allowed: boolean;
    reason?: string;
    waitMs?: number;
    usage?: {
        tpm: number;
        rpm: number;
        tpmLimit: number;
        rpmLimit: number;
    };
}

/** Rate limiter that tracks usage against configured TPM/RPM quotas. */
export interface IRateLimiter {
    checkLimit(usage: UsageRecord): RateLimitCheck;
    recordUsage(usage: UsageRecord): void;
    isApproachingLimit(threshold?: number): boolean;
    reset?(): void;
}
