import { ErrorContext } from './IErrorHandler.js';

/** Pluggable error classification strategy. */
export interface IErrorClassifier {
  isRateLimitError(context: ErrorContext): boolean;
  isAuthError(context: ErrorContext): boolean;
  isSessionLimitError(context: ErrorContext): boolean;
  getRetryAfter(context: ErrorContext): number | undefined;
}
