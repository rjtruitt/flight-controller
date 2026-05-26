/** Base error class for all flight-controller errors. */
export abstract class LLMError extends Error {
    public readonly code: string;
    public readonly context: Record<string, unknown>;
    public readonly cause?: Error;

    constructor(
        code: string,
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.context = context;
        this.cause = cause;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            context: this.context,
            stack: this.stack,
            cause: this.cause?.message
        };
    }
}

export class RateLimitError extends LLMError {
    public readonly retryAfter?: number;

    constructor(
        message: string,
        context: Record<string, unknown> = {},
        retryAfter?: number,
        cause?: Error
    ) {
        super('RATE_LIMIT_EXCEEDED', message, context, cause);
        this.retryAfter = retryAfter;
    }
}

export class AuthenticationError extends LLMError {
    constructor(
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super('AUTH_FAILED', message, context, cause);
    }
}

export class ValidationError extends LLMError {
    public readonly field: string;

    constructor(
        field: string,
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super('VALIDATION_FAILED', message, { ...context, field }, cause);
        this.field = field;
    }
}

export class ModelNotFoundError extends LLMError {
    public readonly modelId: string;

    constructor(
        modelId: string,
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super('MODEL_NOT_FOUND', message, { ...context, modelId }, cause);
        this.modelId = modelId;
    }
}

export class ProviderError extends LLMError {
    public readonly provider: string;
    public readonly statusCode?: number;

    constructor(
        provider: string,
        message: string,
        context: Record<string, unknown> = {},
        statusCode?: number,
        cause?: Error
    ) {
        super('PROVIDER_ERROR', message, { ...context, provider, statusCode }, cause);
        this.provider = provider;
        this.statusCode = statusCode;
    }
}

export class ContextLengthError extends LLMError {
    public readonly requestedTokens: number;
    public readonly maxTokens: number;

    constructor(
        requestedTokens: number,
        maxTokens: number,
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super(
            'CONTEXT_LENGTH_EXCEEDED',
            message,
            { ...context, requestedTokens, maxTokens },
            cause
        );
        this.requestedTokens = requestedTokens;
        this.maxTokens = maxTokens;
    }
}

export class NetworkError extends LLMError {
    constructor(
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super('NETWORK_ERROR', message, context, cause);
    }
}

export class ParseError extends LLMError {
    constructor(
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super('PARSE_ERROR', message, context, cause);
    }
}
