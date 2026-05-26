import { ModelResponse } from '../types/Response.js';
import { IRateLimiter } from '../limits/IRateLimiter.js';
import { ISessionLimiter } from '../limits/ISessionLimiter.js';
import { IPricingTracker } from '../pricing/IPricingTracker.js';
import { IStatsTracker } from '../stats/IStatsTracker.js';

export interface UsageRecorderConfig {
  stats?: IStatsTracker;
  rateLimiter?: IRateLimiter;
  sessionLimiter?: ISessionLimiter;
  pricingTracker?: IPricingTracker;
}

/** Post-response recorder: updates stats, rate limit state, session counts, and pricing. */
export class ModelUsageRecorder {
  constructor(private readonly config: UsageRecorderConfig) {}

  recordSuccess(response: ModelResponse, latencyMs: number): void {
    this.recordStats(response, latencyMs, true);
    this.recordRateLimit(response);
    this.recordSession(response);
    this.recordPricing(response);
  }

  recordFailure(error: Error, latencyMs: number): void {
    if (this.config.stats) {
      this.config.stats.recordRequest({
        latencyMs,
        success: false,
        error
      });
    }
  }

  private recordStats(response: ModelResponse, latencyMs: number, success: boolean): void {
    if (this.config.stats && response.usage) {
      this.config.stats.recordRequest({
        latencyMs,
        tokens: response.usage.inputTokens + response.usage.outputTokens,
        success
      });
    }
  }

  private recordRateLimit(response: ModelResponse): void {
    if (this.config.rateLimiter && response.usage) {
      this.config.rateLimiter.recordUsage({
        tokens: response.usage.inputTokens + response.usage.outputTokens,
        requests: 1
      });
    }
  }

  private recordSession(response: ModelResponse): void {
    if (this.config.sessionLimiter && response.usage) {
      this.config.sessionLimiter.recordUsage({ tokens: response.usage.inputTokens });
    }
  }

  private recordPricing(response: ModelResponse): void {
    if (this.config.pricingTracker && response.usage) {
      this.config.pricingTracker.recordUsage(response.usage);
    }
  }
}
