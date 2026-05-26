import { ModelError } from '../types/Errors.js';
import { BlockerEvent } from '../events/BlockerEvent.js';

export interface ParsedError {
    modelError: ModelError;
    blockerEvent?: BlockerEvent;
    retryable?: boolean;
    retryAfterMs?: number;
}

export interface ErrorContext {
    statusCode?: number;
    headers?: Record<string, string>;
    body?: any;
    originalError?: any;
    request?: {
        url?: string;
        method?: string;
        body?: any;
    };
}

/** Parses provider-specific errors into standardized format. */
export interface IErrorHandler {
    parseError(context: ErrorContext): ParsedError;
    isRateLimitError?(context: ErrorContext): boolean;
    isAuthError?(context: ErrorContext): boolean;
    isSessionLimitError?(context: ErrorContext): boolean;
    getRetryAfter?(context: ErrorContext): number | undefined;
}
