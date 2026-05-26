import { AdaptiveRateLimiter, RateLimitConfig, LimitCheckResult } from './AdaptiveRateLimiter.js';
import { ParsedRateLimits } from './HeaderParser.js';

/** Adaptive-algorithm rate limit config for both RPM and TPM dimensions. */
export interface CombinedLimitConfig {
  rpm?: RateLimitConfig;
  tpm?: RateLimitConfig;
}

/** Result of checking both RPM and TPM limits; identifies which limit blocked. */
export interface CombinedCheckResult {
  allowed: boolean;
  waitMs: number;
  limitedBy?: 'rpm' | 'tpm';
  rpmState?: LimitCheckResult;
  tpmState?: LimitCheckResult;
}

/** Coordinates RPM and TPM rate limits. Shareable across Model instances on the same quota. */
export class CombinedRateLimiter {
  private rpmLimiter?: AdaptiveRateLimiter;
  private tpmLimiter?: AdaptiveRateLimiter;

  constructor(config: CombinedLimitConfig) {
    if (config.rpm) {
      this.rpmLimiter = new AdaptiveRateLimiter(config.rpm);
    }

    if (config.tpm) {
      this.tpmLimiter = new AdaptiveRateLimiter(config.tpm);
    }
  }

  async check(estimatedTokens: number): Promise<CombinedCheckResult> {
    const results: CombinedCheckResult = {
      allowed: true,
      waitMs: 0
    };

    if (this.rpmLimiter) {
      const rpmCheck = await this.rpmLimiter.check(1);
      results.rpmState = rpmCheck;

      if (!rpmCheck.allowed) {
        results.allowed = false;
        results.waitMs = rpmCheck.waitMs;
        results.limitedBy = 'rpm';
      }
    }

    if (this.tpmLimiter) {
      const tpmCheck = await this.tpmLimiter.check(estimatedTokens);
      results.tpmState = tpmCheck;

      if (!tpmCheck.allowed) {
        results.allowed = false;

        if (results.limitedBy === 'rpm') {
          results.waitMs = Math.min(results.waitMs, tpmCheck.waitMs);
          results.limitedBy = results.waitMs === tpmCheck.waitMs ? 'tpm' : 'rpm';
        } else {
          results.waitMs = tpmCheck.waitMs;
          results.limitedBy = 'tpm';
        }
      }
    }

    return results;
  }

  async consume(actualTokens: number): Promise<void> {
    if (this.rpmLimiter) {
      await this.rpmLimiter.consume(1);
    }

    if (this.tpmLimiter) {
      await this.tpmLimiter.consume(actualTokens);
    }
  }

  /** For Bedrock (no headers), learns both RPM and TPM simultaneously. */
  async onThrottled(attemptedTokens: number, limitType?: 'rpm' | 'tpm'): Promise<void> {
    if (limitType === 'rpm' && this.rpmLimiter) {
      await this.rpmLimiter.onThrottled(1);
    } else if (limitType === 'tpm' && this.tpmLimiter) {
      await this.tpmLimiter.onThrottled(attemptedTokens);
    } else {
      if (this.rpmLimiter) {
        await this.rpmLimiter.onThrottled(1);
      }
      if (this.tpmLimiter) {
        await this.tpmLimiter.onThrottled(attemptedTokens);
      }
    }
  }

  /** Syncs internal state from provider response headers (OpenAI/Anthropic style). */
  async syncFromHeaders(parsed: ParsedRateLimits): Promise<void> {
    if (parsed.rpm && this.rpmLimiter) {
      await this.rpmLimiter.syncFromHeaders(
        parsed.rpm.remaining,
        parsed.rpm.limit,
        parsed.rpm.reset
      );
    }

    if (parsed.tpm && this.tpmLimiter) {
      await this.tpmLimiter.syncFromHeaders(
        parsed.tpm.remaining,
        parsed.tpm.limit,
        parsed.tpm.reset
      );
    }
  }

  on(event: string, callback: (...args: unknown[]) => void): void {
    if (this.rpmLimiter) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.rpmLimiter.on(event as any, callback);
    }
    if (this.tpmLimiter) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.tpmLimiter.on(event as any, callback);
    }
  }

  async adaptOnThrottle(_message?: string): Promise<void> {
    if (this.rpmLimiter) {
      await this.rpmLimiter.onThrottled(1);
    }
    if (this.tpmLimiter) {
      await this.tpmLimiter.onThrottled(1000);
    }
  }

  async schedule<T>(estimatedTokens: number, fn: () => Promise<T>): Promise<T> {
    if (this.rpmLimiter) {
      await this.rpmLimiter.consume(1);
    }
    if (this.tpmLimiter) {
      await this.tpmLimiter.consume(estimatedTokens);
    }

    return fn();
  }

  getState() {
    return {
      rpm: this.rpmLimiter?.getState(),
      tpm: this.tpmLimiter?.getState()
    };
  }
}
