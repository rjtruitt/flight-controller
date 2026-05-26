/**
 * Barrel exports for limits module.
 * @module limits
 */
export {
  AdaptiveRateLimiter,
  type RateLimitConfig,
  type LimitState,
  type LimitCheckResult,
  type LearnedLimitEvent,
  type LimitType,
  type LimitStrategy
} from './AdaptiveRateLimiter.js';

export {
  BottleneckRateLimiter,
  type BottleneckLimitConfig,
  type RateLimitCheckResult
} from './BottleneckRateLimiter.js';

export {
  CombinedRateLimiter,
  type CombinedLimitConfig,
  type CombinedCheckResult
} from './CombinedRateLimiter.js';

export { type IRateLimiter, type UsageRecord, type RateLimitCheck } from './IRateLimiter.js';
export { type ISessionLimiter, type SessionUsage, type SessionLimitCheck } from './ISessionLimiter.js';
export { type ITokenLimiter, type TokenUsageRequest, type TokenLimitCheck } from './ITokenLimiter.js';
export { type IRateLimitStrategy } from './IRateLimitStrategy.js';

export { RateLimit, type RateLimitConfig as RollingRateLimitConfig } from './RateLimit.js';
export { SessionLimit, type SessionLimitConfig, type SessionLimitType } from './SessionLimit.js';
export { TokenLimit, type TokenLimitConfig } from './TokenLimit.js';

export { TokenBucketStrategy } from './TokenBucketStrategy.js';
export { FixedWindowStrategy } from './FixedWindowStrategy.js';
export { LimitLearningStrategy } from './LimitLearningStrategy.js';

export { RollingWindow, type RollingWindowConfig, type WindowEntry } from './RollingWindow.js';
export { type IResetCalculator, DailyResetCalculator, MonthlyResetCalculator, CustomResetCalculator } from './SessionResetCalculator.js';

export {
  parseOpenAIHeaders,
  parseAnthropicHeaders,
  parseGeminiHeaders,
  type ParsedRateLimits
} from './HeaderParser.js';
