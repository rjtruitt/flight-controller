import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseErrorHandler } from './BaseErrorHandler';
import { ErrorContext } from './IErrorHandler';
import { DefaultErrorClassifier } from './DefaultErrorClassifier';
import {
    RateLimitError,
    AuthenticationError,
    ValidationError,
    ProviderError,
    TimeoutError
} from '../types/Errors';
import { BlockerType, BlockerAction } from '../events/BlockerEvent';

describe('BaseErrorHandler', () => {
    let handler: BaseErrorHandler;

    beforeEach(() => {
        handler = new BaseErrorHandler('test-provider');
    });

    describe('Error Classification', () => {
        it('classifies 429 as rate limit error', () => {
            const context: ErrorContext = { statusCode: 429 };

            const result = handler.parseError(context);

            expect(result.modelError).toBeInstanceOf(RateLimitError);
        });

        it('classifies 401 as authentication error', () => {
            const context: ErrorContext = { statusCode: 401 };

            const result = handler.parseError(context);

            expect(result.modelError).toBeInstanceOf(AuthenticationError);
        });

        it('classifies 403 as authentication error', () => {
            const context: ErrorContext = { statusCode: 403 };

            const result = handler.parseError(context);

            expect(result.modelError).toBeInstanceOf(AuthenticationError);
        });

        it('detects session limit from classifier (overridden classifier)', () => {
            // Create a custom classifier that detects session limits
            const sessionClassifier = new DefaultErrorClassifier();
            sessionClassifier.isSessionLimitError = vi.fn().mockReturnValue(true);
            sessionClassifier.isRateLimitError = vi.fn().mockReturnValue(false);
            sessionClassifier.isAuthError = vi.fn().mockReturnValue(false);

            const sessionHandler = new BaseErrorHandler('test-provider', sessionClassifier);
            const context: ErrorContext = { statusCode: 429, body: 'Daily limit reached' };

            const result = sessionHandler.parseError(context);

            expect(result.modelError).toBeInstanceOf(RateLimitError);
            expect((result.modelError as RateLimitError).limitType).toBe('session');
        });

        it('classifies 400 as validation error', () => {
            const context: ErrorContext = { statusCode: 400, body: { error: { message: 'Invalid params' } } };

            const result = handler.parseError(context);

            expect(result.modelError).toBeInstanceOf(ValidationError);
        });

        it('classifies 422 as validation error', () => {
            const context: ErrorContext = { statusCode: 422, body: { message: 'Unprocessable entity' } };

            const result = handler.parseError(context);

            expect(result.modelError).toBeInstanceOf(ValidationError);
        });

        it('classifies 408/504/ETIMEDOUT as timeout error', () => {
            const context408: ErrorContext = { statusCode: 408 };
            const context504: ErrorContext = { statusCode: 504 };
            const contextEtimedout: ErrorContext = { originalError: { code: 'ETIMEDOUT' } };

            expect(handler.parseError(context408).modelError).toBeInstanceOf(TimeoutError);
            expect(handler.parseError(context504).modelError).toBeInstanceOf(TimeoutError);
            expect(handler.parseError(contextEtimedout).modelError).toBeInstanceOf(TimeoutError);
        });

        it('classifies 500+ as provider error', () => {
            const context: ErrorContext = { statusCode: 500, body: { message: 'Internal error' } };

            const result = handler.parseError(context);

            expect(result.modelError).toBeInstanceOf(ProviderError);
            expect(result.modelError.message).toBe('Internal error');
        });

        it('parses string body as message', () => {
            const context: ErrorContext = { statusCode: 500, body: 'Something broke' };

            const result = handler.parseError(context);

            expect(result.modelError.message).toBe('Something broke');
        });

        it('extracts nested error.message from body', () => {
            const context: ErrorContext = {
                statusCode: 500,
                body: { error: { message: 'Deeply nested error message' } }
            };

            const result = handler.parseError(context);

            expect(result.modelError.message).toBe('Deeply nested error message');
        });
    });

    describe('Retry Decisions', () => {
        it('rate limit is retryable with waitMs', () => {
            const context: ErrorContext = {
                statusCode: 429,
                headers: { 'retry-after': '30' }
            };

            const result = handler.parseError(context);

            expect(result.retryable).toBe(true);
            expect(result.retryAfterMs).toBe(30000); // 30 seconds in ms
        });

        it('authentication error is NOT retryable', () => {
            const context: ErrorContext = { statusCode: 401 };

            const result = handler.parseError(context);

            expect(result.retryable).toBe(false);
        });

        it('timeout is retryable with 5000ms wait', () => {
            const context: ErrorContext = { statusCode: 408 };

            const result = handler.parseError(context);

            expect(result.retryable).toBe(true);
            expect(result.retryAfterMs).toBe(5000);
        });

        it('provider 500 error has retryable determined by status code', () => {
            const context500: ErrorContext = { statusCode: 500 };
            const context502: ErrorContext = { statusCode: 502 };

            const result500 = handler.parseError(context500);
            const result502 = handler.parseError(context502);

            // 500 is NOT retryable per the implementation (context.statusCode !== 500 -> false)
            expect(result500.retryable).toBe(false);
            // 502 IS retryable (502 !== 500 -> true)
            expect(result502.retryable).toBe(true);
        });

        it('validation error is NOT retryable', () => {
            const context: ErrorContext = { statusCode: 400 };

            const result = handler.parseError(context);

            expect(result.retryable).toBe(false);
        });
    });

    describe('Blocker Events', () => {
        it('emits blocker event on rate limit', () => {
            const context: ErrorContext = { statusCode: 429 };

            const result = handler.parseError(context);

            expect(result.blockerEvent).toBeDefined();
            expect(result.blockerEvent!.type).toBe(BlockerType.RATE_LIMIT_EXCEEDED);
            expect(result.blockerEvent!.severity).toBe('warning');
            expect(result.blockerEvent!.blocking).toBe(true);
        });

        it('emits blocker event on authentication failure', () => {
            const context: ErrorContext = { statusCode: 401 };

            const result = handler.parseError(context);

            expect(result.blockerEvent).toBeDefined();
            expect(result.blockerEvent!.type).toBe(BlockerType.AUTH_FAILED);
            expect(result.blockerEvent!.severity).toBe('critical');
            expect(result.blockerEvent!.suggestedActions).toContain(BlockerAction.AUTHENTICATE);
        });

        it('emits blocker event on session limit', () => {
            // Use a classifier that detects session limits
            const sessionClassifier = new DefaultErrorClassifier();
            sessionClassifier.isSessionLimitError = vi.fn().mockReturnValue(true);
            sessionClassifier.isRateLimitError = vi.fn().mockReturnValue(false);
            sessionClassifier.isAuthError = vi.fn().mockReturnValue(false);

            const sessionHandler = new BaseErrorHandler('test-provider', sessionClassifier);
            const context: ErrorContext = { statusCode: 429, body: 'Daily limit' };

            const result = sessionHandler.parseError(context);

            expect(result.blockerEvent).toBeDefined();
            expect(result.blockerEvent!.type).toBe(BlockerType.SESSION_LIMIT_EXCEEDED);
            expect(result.blockerEvent!.severity).toBe('error');
        });

        it('session limit suggests SWITCH_MODEL action', () => {
            const sessionClassifier = new DefaultErrorClassifier();
            sessionClassifier.isSessionLimitError = vi.fn().mockReturnValue(true);
            sessionClassifier.isRateLimitError = vi.fn().mockReturnValue(false);
            sessionClassifier.isAuthError = vi.fn().mockReturnValue(false);

            const sessionHandler = new BaseErrorHandler('test-provider', sessionClassifier);
            const context: ErrorContext = { statusCode: 429, body: 'Session limit' };

            const result = sessionHandler.parseError(context);

            expect(result.blockerEvent!.suggestedActions).toContain(BlockerAction.SWITCH_MODEL);
        });
    });
});
