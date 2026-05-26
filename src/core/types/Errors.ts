/** Error codes categorizing all model and provider failures. */
export enum ErrorCode {
    RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
    TOKEN_LIMIT_EXCEEDED = 'token_limit_exceeded',
    SESSION_LIMIT_EXCEEDED = 'session_limit_exceeded',

    AUTH_FAILED = 'auth_failed',
    INVALID_API_KEY = 'invalid_api_key',
    INSUFFICIENT_QUOTA = 'insufficient_quota',

    INVALID_REQUEST = 'invalid_request',
    INVALID_MODEL = 'invalid_model',
    INVALID_CONTEXT = 'invalid_context',
    INVALID_TOOL = 'invalid_tool',

    MODEL_NOT_FOUND = 'model_not_found',
    MODEL_OVERLOADED = 'model_overloaded',
    MODEL_TIMEOUT = 'model_timeout',
    CONTEXT_LENGTH_EXCEEDED = 'context_length_exceeded',

    PROVIDER_ERROR = 'provider_error',
    PROVIDER_UNAVAILABLE = 'provider_unavailable',
    NETWORK_ERROR = 'network_error',

    CONTENT_FILTERED = 'content_filtered',
    UNSAFE_CONTENT = 'unsafe_content',

    INTERNAL_ERROR = 'internal_error',
    UNKNOWN_ERROR = 'unknown_error'
}

/** Base error for provider-facing failures. Carries an ErrorCode and retryability flag. */
export class ModelError extends Error {
    constructor(
        public readonly code: ErrorCode,
        message: string,
        public readonly retryable: boolean = false,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'ModelError';
        Object.setPrototypeOf(this, ModelError.prototype);
    }
}

/** Error raised when a rate or token limit has been exceeded. */
export class RateLimitError extends ModelError {
    constructor(
        message: string,
        public readonly retryAfterMs?: number,
        public readonly limitType?: 'tpm' | 'rpm' | 'session'
    ) {
        super(ErrorCode.RATE_LIMIT_EXCEEDED, message, true);
        this.name = 'RateLimitError';
        Object.setPrototypeOf(this, RateLimitError.prototype);
    }
}

/** Error raised when authentication with a provider fails. */
export class AuthenticationError extends ModelError {
    constructor(message: string, originalError?: Error) {
        super(ErrorCode.AUTH_FAILED, message, false, originalError);
        this.name = 'AuthenticationError';
        Object.setPrototypeOf(this, AuthenticationError.prototype);
    }
}

/** Error raised when a request fails validation. */
export class ValidationError extends ModelError {
    constructor(message: string, code: ErrorCode = ErrorCode.INVALID_REQUEST) {
        super(code, message, false);
        this.name = 'ValidationError';
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}

/** Error raised when a provider encounters an issue (e.g. overloaded, unavailable). */
export class ProviderError extends ModelError {
    constructor(
        message: string,
        public readonly providerName: string,
        retryable: boolean = true,
        originalError?: Error
    ) {
        super(ErrorCode.PROVIDER_ERROR, message, retryable, originalError);
        this.name = 'ProviderError';
        Object.setPrototypeOf(this, ProviderError.prototype);
    }
}

/** Error raised when a model request times out. */
export class TimeoutError extends ModelError {
    constructor(message: string, public readonly timeoutMs: number) {
        super(ErrorCode.MODEL_TIMEOUT, message, true);
        this.name = 'TimeoutError';
        Object.setPrototypeOf(this, TimeoutError.prototype);
    }
}

/** Error raised when the model response was filtered due to content policy. */
export class ContentFilterError extends ModelError {
    constructor(message: string) {
        super(ErrorCode.CONTENT_FILTERED, message, false);
        this.name = 'ContentFilterError';
        Object.setPrototypeOf(this, ContentFilterError.prototype);
    }
}
