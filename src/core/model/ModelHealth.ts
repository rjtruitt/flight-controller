import { OpenAIContext } from '../types/Context.js';
import { ModelResponse } from '../types/Response.js';
import { IErrorHandler } from '../errors/IErrorHandler.js';

export interface HealthCheckResult {
    available: boolean;
    error?: string;
    remainingQuota?: number;
    hasSessionLimits?: boolean;
    errorType?: 'session_limit' | 'rate_limit' | 'auth' | 'other';
    suggestedCooldown?: number;
}

export interface ModelHealthCheckable {
    sendRequest(context: OpenAIContext): Promise<ModelResponse>;
    errorHandler?: IErrorHandler;
    hasSessionLimits(): boolean;
}

export async function checkModelHealth(
    model: ModelHealthCheckable
): Promise<HealthCheckResult> {
    const hasSessionLimits = model.hasSessionLimits();
    const suggestedCooldown = undefined;

    try {
        const minimalContext: OpenAIContext = {
            messages: [
                {
                    role: 'user',
                    content: [{ type: 'text', text: 'hi' }]
                }
            ],
            maxTokens: 1
        };

        const response = await model.sendRequest(minimalContext);
        const remainingQuota = extractRemainingQuota(response);

        return {
            available: true,
            remainingQuota,
            hasSessionLimits,
            suggestedCooldown
        };
    } catch (error) {
        const errorInfo = parseHealthCheckError(error, model.errorHandler);

        return {
            available: false,
            error: error instanceof Error ? error.message : String(error),
            hasSessionLimits,
            errorType: errorInfo.errorType,
            suggestedCooldown: errorInfo.retryAfter || suggestedCooldown
        };
    }
}

export function extractRemainingQuota(response: ModelResponse): number | undefined {
    const headers = response.metadata?.custom?.headers as Record<string, string> | undefined;
    if (!headers) return undefined;

    const openaiRemaining = headers['x-ratelimit-remaining-requests'];
    if (openaiRemaining) return parseInt(openaiRemaining);

    const anthropicRemaining = headers['anthropic-ratelimit-requests-remaining'];
    if (anthropicRemaining) return parseInt(anthropicRemaining);

    return undefined;
}

function parseHealthCheckError(
    error: unknown,
    errorHandler?: IErrorHandler
): { errorType: 'session_limit' | 'rate_limit' | 'auth' | 'other'; retryAfter?: number } {
    let errorType: 'session_limit' | 'rate_limit' | 'auth' | 'other' = 'other';
    let retryAfter: number | undefined;

    if (errorHandler) {
        const errorContext = {
            originalError: error instanceof Error ? error : new Error(String(error)),
            body: undefined,
            headers: undefined
        };

        const parsed = errorHandler.parseError(errorContext);

        const errorCode = parsed.modelError.code;
        if (errorCode === 'session_limit_exceeded') {
            errorType = 'session_limit';
        } else if (errorCode === 'rate_limit_exceeded') {
            errorType = 'rate_limit';
        } else if (errorCode === 'auth_failed' || errorCode === 'invalid_api_key') {
            errorType = 'auth';
        }

        retryAfter = errorHandler.getRetryAfter?.(errorContext);
    } else {
        const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

        if (
            errorMsg.includes('session limit') ||
            errorMsg.includes('daily limit') ||
            errorMsg.includes('quota exceeded') ||
            errorMsg.includes('message limit')
        ) {
            errorType = 'session_limit';
        } else if (
            errorMsg.includes('rate limit') ||
            errorMsg.includes('too many requests') ||
            errorMsg.includes('429')
        ) {
            errorType = 'rate_limit';
        } else if (
            errorMsg.includes('unauthorized') ||
            errorMsg.includes('authentication') ||
            errorMsg.includes('invalid api key') ||
            errorMsg.includes('401')
        ) {
            errorType = 'auth';
        }
    }

    return { errorType, retryAfter };
}
