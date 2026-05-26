/** Consumption counters for session-scoped limits. */
export interface SessionUsage {
    messages?: number;
    sessions?: number;
    tokens?: number;
}

/** Result of a session limit check, with optional reset time for blocked requests. */
export interface SessionLimitCheck {
    allowed: boolean;
    reason?: string;
    resetAt?: Date;
}

/** Enforces daily/monthly session quotas (messages, sessions, or token budgets). */
export interface ISessionLimiter {
    checkLimit(usage: SessionUsage): SessionLimitCheck;
    recordUsage(usage: SessionUsage): void;
    reset?(): void;
}
