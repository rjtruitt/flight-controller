import {
  LimitType,
  LimitStrategy,
  RateLimitConfig,
  LimitState,
  LimitCheckResult,
  LearnedLimitEvent
} from './AdaptiveRateLimiterTypes.js';
import { IRateLimitStrategy } from './IRateLimitStrategy.js';
import { TokenBucketStrategy } from './TokenBucketStrategy.js';
import { FixedWindowStrategy } from './FixedWindowStrategy.js';
import { LimitLearningStrategy } from './LimitLearningStrategy.js';

export type { LimitType, LimitStrategy, RateLimitConfig, LimitState, LimitCheckResult, LearnedLimitEvent };

/** Rate limiter that learns actual limits from provider throttling behavior. */
export class AdaptiveRateLimiter {
  private config: Required<Omit<RateLimitConfig, 'limit' | 'customStrategy'>> & { limit?: number; customStrategy?: IRateLimitStrategy };
  private state: LimitState;
  private startTime: number;
  private tokenBucketStrategy: IRateLimitStrategy;
  private fixedWindowStrategy: IRateLimitStrategy;

  private onLimitDiscovered?: (event: LearnedLimitEvent) => void;
  private onStrategyChanged?: (from: LimitStrategy, to: LimitStrategy, reason: string) => void;
  private onLimitAdjusted?: (event: LearnedLimitEvent) => void;

  constructor(config: RateLimitConfig) {
    this.config = {
      type: config.type,
      limit: config.limit ?? undefined,
      useTokenBucket: config.useTokenBucket ?? true,
      enableLearning: config.enableLearning ?? true,
      learningReductionRate: config.learningReductionRate ?? 0.95,
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 3,
      customStrategy: config.customStrategy
    };

    this.startTime = Date.now();
    this.tokenBucketStrategy = new TokenBucketStrategy();
    this.fixedWindowStrategy = new FixedWindowStrategy();

    this.state = {
      type: config.type,
      limit: config.limit ?? null,
      strategy: config.limit ? 'token-bucket' : 'unknown',
      confidence: config.limit ? 0.8 : 0,
      availableTokens: config.limit ?? Infinity,
      lastRefill: Date.now(),
      refillRate: config.limit ? (config.limit / 60000) : null, // per ms
      consecutiveFailures: 0,
      observations: []
    };
  }

  async check(units: number): Promise<LimitCheckResult> {
    if (!this.state.limit) {
      return {
        allowed: true,
        waitMs: 0,
        state: {
          available: Infinity,
          limit: null,
          strategy: 'unknown'
        }
      };
    }

    if (this.config.customStrategy) {
      return this.config.customStrategy.check(this.state, units);
    }

    if (this.config.useTokenBucket && this.state.strategy === 'token-bucket') {
      return this.tokenBucketStrategy.check(this.state, units);
    }

    return this.fixedWindowStrategy.check(this.state, units);
  }

  async consume(units: number): Promise<void> {
    if (this.config.customStrategy) {
      this.config.customStrategy.consume(this.state, units);
    } else if (this.config.useTokenBucket && this.state.strategy === 'token-bucket') {
      this.tokenBucketStrategy.consume(this.state, units);
    } else {
      this.fixedWindowStrategy.consume(this.state, units);
    }

    this.state.observations.push({
      timestamp: Date.now(),
      unitsConsumed: units,
      limitHit: false,
      timeSinceStart: Date.now() - this.startTime
    });

    if (this.config.enableLearning) {
      LimitLearningStrategy.recordSuccess(this.state);
    }
  }

  async onThrottled(unitsAttempted: number): Promise<void> {
    const timeSinceStart = Date.now() - this.startTime;

    this.state.observations.push({
      timestamp: Date.now(),
      unitsConsumed: unitsAttempted,
      limitHit: true,
      timeSinceStart
    });

    if (!this.state.limit && this.config.enableLearning) {
      const event = LimitLearningStrategy.discoverLimit(this.state, unitsAttempted, timeSinceStart);
      if (event && this.onLimitDiscovered) {
        this.onLimitDiscovered(event);
      }

    } else if (this.state.strategy === 'token-bucket' && this.config.enableLearning) {
      const result = LimitLearningStrategy.adjustLimit(this.state, {
        learningReductionRate: this.config.learningReductionRate,
        maxConsecutiveFailures: this.config.maxConsecutiveFailures
      });

      if (result.strategyChanged && this.onStrategyChanged) {
        this.onStrategyChanged(
          result.strategyChanged.from as LimitStrategy,
          result.strategyChanged.to as LimitStrategy,
          result.strategyChanged.reason
        );
      }

      if (result.event && this.onLimitAdjusted) {
        this.onLimitAdjusted(result.event);
      }
    }

    this.state.availableTokens = 0;
  }

  async syncFromHeaders(remaining: number, limit: number, resetTime: Date): Promise<void> {
    this.state.limit = limit;
    this.state.availableTokens = remaining;
    this.state.strategy = 'token-bucket';
    this.state.confidence = 1.0;
    this.state.refillRate = limit / 60000;

    const now = Date.now();
    const resetMs = resetTime.getTime();

    if (resetMs > now) {
      this.state.lastRefill = now;
    }
  }

  getState(): LimitState {
    return { ...this.state };
  }

  on(event: 'limit.discovered', callback: (event: LearnedLimitEvent) => void): void;
  on(event: 'strategy.changed', callback: (from: LimitStrategy, to: LimitStrategy, reason: string) => void): void;
  on(event: 'limit.adjusted', callback: (event: LearnedLimitEvent) => void): void;
  on(event: string, callback: any): void {
    switch (event) {
      case 'limit.discovered':
        this.onLimitDiscovered = callback;
        break;
      case 'strategy.changed':
        this.onStrategyChanged = callback;
        break;
      case 'limit.adjusted':
        this.onLimitAdjusted = callback;
        break;
    }
  }
}
