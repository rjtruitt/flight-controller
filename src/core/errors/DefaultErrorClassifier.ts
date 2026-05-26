import { IErrorClassifier } from './IErrorClassifier.js';
import { ErrorContext } from './IErrorHandler.js';

/** HTTP status-code-based error classifier (429 = rate limit, 401/403 = auth). */
export class DefaultErrorClassifier implements IErrorClassifier {
  isRateLimitError(context: ErrorContext): boolean {
    return context.statusCode === 429;
  }

  isAuthError(context: ErrorContext): boolean {
    return context.statusCode === 401 || context.statusCode === 403;
  }

  isSessionLimitError(_context: ErrorContext): boolean {
    return false;
  }

  getRetryAfter(context: ErrorContext): number | undefined {
    const retryAfter = context.headers?.['retry-after'] || context.headers?.['Retry-After'];
    if (retryAfter) {
      const seconds = parseInt(retryAfter);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
    }
    return 60000;
  }
}
