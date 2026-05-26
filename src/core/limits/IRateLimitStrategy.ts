import { LimitState, LimitCheckResult } from './AdaptiveRateLimiterTypes.js';

/** Pluggable strategy for deciding whether to allow or delay consumption. */
export interface IRateLimitStrategy {
  check(state: LimitState, units: number): LimitCheckResult;
  consume(state: LimitState, units: number): void;
}
