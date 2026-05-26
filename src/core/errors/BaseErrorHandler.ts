import { IErrorHandler, ErrorContext, ParsedError } from './IErrorHandler.js';
import { IErrorClassifier } from './IErrorClassifier.js';
import { DefaultErrorClassifier } from './DefaultErrorClassifier.js';
import {
    RateLimitError,
    AuthenticationError,
    ValidationError,
    ProviderError,
    TimeoutError
} from '../types/Errors.js';
import { BlockerEvent, BlockerType, BlockerAction } from '../events/BlockerEvent.js';

/** Standard error handler: classifies HTTP errors and produces BlockerEvents + typed ModelErrors. */
export class BaseErrorHandler implements IErrorHandler {
    protected classifier: IErrorClassifier;

    constructor(
        protected readonly providerName: string,
        classifier?: IErrorClassifier
    ) {
        this.classifier = classifier || new DefaultErrorClassifier();
    }

    parseError(context: ErrorContext): ParsedError {
        if (this.classifier.isRateLimitError(context)) {
            return this.handleRateLimitError(context);
        }

        if (this.classifier.isAuthError(context)) {
            return this.handleAuthError(context);
        }

        if (this.classifier.isSessionLimitError(context)) {
            return this.handleSessionLimitError(context);
        }

        if (this.isValidationError(context)) {
            return this.handleValidationError(context);
        }

        if (this.isTimeoutError(context)) {
            return this.handleTimeoutError(context);
        }

        return this.handleProviderError(context);
    }

    isRateLimitError(context: ErrorContext): boolean {
        return this.classifier.isRateLimitError(context);
    }

    isAuthError(context: ErrorContext): boolean {
        return this.classifier.isAuthError(context);
    }

    isSessionLimitError(context: ErrorContext): boolean {
        return this.classifier.isSessionLimitError(context);
    }

    getRetryAfter(context: ErrorContext): number | undefined {
        return this.classifier.getRetryAfter(context);
    }

    protected isValidationError(context: ErrorContext): boolean {
        return context.statusCode === 400 || context.statusCode === 422;
    }

    protected isTimeoutError(context: ErrorContext): boolean {
        return context.statusCode === 408 ||
               context.statusCode === 504 ||
               context.originalError?.code === 'ETIMEDOUT';
    }

    protected handleRateLimitError(context: ErrorContext): ParsedError {
        const retryAfterMs = this.getRetryAfter(context);
        const message = this.extractMessage(context) || 'Rate limit exceeded';

        const modelError = new RateLimitError(message, retryAfterMs);

        const blockerEvent: BlockerEvent = {
            type: BlockerType.RATE_LIMIT_EXCEEDED,
            severity: 'warning',
            blocking: true,
            message,
            suggestedActions: [BlockerAction.WAIT, BlockerAction.SWITCH_MODEL],
            data: {
                waitMs: retryAfterMs
            }
        };

        return {
            modelError,
            blockerEvent,
            retryable: true,
            retryAfterMs
        };
    }

    protected handleAuthError(context: ErrorContext): ParsedError {
        const message = this.extractMessage(context) || 'Authentication failed';

        const modelError = new AuthenticationError(message);

        const blockerEvent: BlockerEvent = {
            type: BlockerType.AUTH_FAILED,
            severity: 'critical',
            blocking: true,
            message,
            suggestedActions: [BlockerAction.AUTHENTICATE]
        };

        return {
            modelError,
            blockerEvent,
            retryable: false
        };
    }

    protected handleSessionLimitError(context: ErrorContext): ParsedError {
        const message = this.extractMessage(context) || 'Session limit exceeded';

        const modelError = new RateLimitError(message, undefined, 'session');

        const blockerEvent: BlockerEvent = {
            type: BlockerType.SESSION_LIMIT_EXCEEDED,
            severity: 'error',
            blocking: true,
            message,
            suggestedActions: [BlockerAction.SWITCH_MODEL]
        };

        return {
            modelError,
            blockerEvent,
            retryable: false
        };
    }

    protected handleValidationError(context: ErrorContext): ParsedError {
        const message = this.extractMessage(context) || 'Invalid request';

        const modelError = new ValidationError(message);

        return {
            modelError,
            retryable: false
        };
    }

    protected handleTimeoutError(_context: ErrorContext): ParsedError {
        const message = 'Request timed out';

        const modelError = new TimeoutError(message, 30000);

        const blockerEvent: BlockerEvent = {
            type: BlockerType.TIMEOUT_ERROR,
            severity: 'warning',
            blocking: true,
            message,
            suggestedActions: [BlockerAction.RETRY]
        };

        return {
            modelError,
            blockerEvent,
            retryable: true,
            retryAfterMs: 5000
        };
    }

    protected handleProviderError(context: ErrorContext): ParsedError {
        const message = this.extractMessage(context) || 'Provider error';

        const modelError = new ProviderError(
            message,
            this.providerName,
            context.statusCode !== 500, // Retry unless 500
            context.originalError
        );

        const blockerEvent: BlockerEvent = {
            type: BlockerType.PROVIDER_ERROR,
            severity: 'error',
            blocking: true,
            message,
            suggestedActions: [BlockerAction.RETRY, BlockerAction.SWITCH_MODEL],
            data: {
                errorCode: context.statusCode?.toString()
            }
        };

        return {
            modelError,
            blockerEvent,
            retryable: context.statusCode !== 500
        };
    }

    protected extractMessage(context: ErrorContext): string | undefined {
        if (typeof context.body === 'string') {
            return context.body;
        }

        if (context.body?.error?.message) {
            return context.body.error.message;
        }

        if (context.body?.message) {
            return context.body.message;
        }

        if (context.originalError?.message) {
            return context.originalError.message;
        }

        return undefined;
    }
}
