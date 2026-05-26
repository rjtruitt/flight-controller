export enum BlockerType {
    AUTH_REQUIRED = 'auth_required',
    AUTH_EXPIRED = 'auth_expired',
    AUTH_BROWSER_NEEDED = 'auth_browser_needed',
    AUTH_REFRESH_NEEDED = 'auth_refresh_needed',
    AUTH_FAILED = 'auth_failed',

    RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
    RATE_LIMIT_WARNING = 'rate_limit_warning',

    SESSION_LIMIT_EXCEEDED = 'session_limit_exceeded',
    DAILY_LIMIT_EXCEEDED = 'daily_limit_exceeded',
    MONTHLY_LIMIT_EXCEEDED = 'monthly_limit_exceeded',

    CONTEXT_TOO_LARGE = 'context_too_large',
    TOKEN_LIMIT_EXCEEDED = 'token_limit_exceeded',

    MODEL_OVERLOADED = 'model_overloaded',
    MODEL_UNAVAILABLE = 'model_unavailable',
    MODEL_ERROR = 'model_error',

    PROVIDER_ERROR = 'provider_error',
    NETWORK_ERROR = 'network_error',
    TIMEOUT_ERROR = 'timeout_error'
}

export enum BlockerAction {
    RETRY = 'retry',
    WAIT = 'wait',
    SWITCH_MODEL = 'switch_model',
    COMPRESS_CONTEXT = 'compress_context',
    AUTHENTICATE = 'authenticate',
    CANCEL = 'cancel',
    IGNORE = 'ignore'
}

export interface BlockerEvent {
    type: BlockerType;
    severity: 'info' | 'warning' | 'error' | 'critical';
    blocking: boolean;
    message: string;
    suggestedActions: BlockerAction[];
    data?: {
        authUrl?: string;
        expiresIn?: number;

        waitMs?: number;
        resetAt?: Date;
        currentUsage?: {
            tpm?: number;
            rpm?: number;
            tpmLimit?: number;
            rpmLimit?: number;
        };

        currentTokens?: number;
        maxTokens?: number;
        availableTokens?: number;

        alternativeModels?: string[];
        modelId?: string;

        error?: Error;
        errorCode?: string;

        metadata?: Record<string, unknown>;
    };
}

/** Orchestrator-implemented handler for blocker events. */
export interface IBlockerHandler {
    handleBlocker(event: BlockerEvent): Promise<BlockerAction>;
}
