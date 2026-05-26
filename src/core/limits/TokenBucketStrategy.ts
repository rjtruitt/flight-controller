import { IRateLimitStrategy } from './IRateLimitStrategy.js';
import { LimitState, LimitCheckResult } from './AdaptiveRateLimiterTypes.js';

/** Smooth rate limiting via continuous token refill (tokens accrue proportionally over time). */
export class TokenBucketStrategy implements IRateLimitStrategy {
  /**
   * Check whether `units` can be consumed from the current state.
   * Refills tokens proportionally based on elapsed time since last refill.
   * @param state - Current rate limiter state
   * @param units - Number of units to consume
   * @returns Check result indicating whether the operation is allowed
   */
  check(state: LimitState, units: number): LimitCheckResult {
    if (!state.limit) {
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

    this.refillTokens(state);

    if (state.availableTokens >= units) {
      return {
        allowed: true,
        waitMs: 0,
        state: {
          available: state.availableTokens,
          limit: state.limit,
          strategy: state.strategy
        }
      };
    } else {
      const needed = units - state.availableTokens;
      const waitMs = state.refillRate
        ? Math.ceil(needed / state.refillRate)
        : 60000; // Default 1 minute

      return {
        allowed: false,
        waitMs,
        reason: `Insufficient ${state.type}: need ${units}, have ${Math.floor(state.availableTokens)}`,
        state: {
          available: state.availableTokens,
          limit: state.limit,
          strategy: state.strategy
        }
      };
    }
  }

  /**
   * Consume `units` from the state. Refills tokens first, then deducts.
   * @param state - Current rate limiter state (mutated in place)
   * @param units - Number of units to consume
   */
  consume(state: LimitState, units: number): void {
    this.refillTokens(state);
    state.availableTokens = Math.max(0, state.availableTokens - units);
  }

  /**
   * Refill available tokens based on elapsed time since the last refill.
   * Tokens accrue at `state.refillRate` per millisecond, capped at `state.limit`.
   * @param state - Rate limiter state to refill (mutated in place)
   */
  private refillTokens(state: LimitState): void {
    if (!state.refillRate || !state.limit) return;

    const now = Date.now();
    const elapsed = now - state.lastRefill;

    if (elapsed > 0) {
      const tokensToAdd = Math.floor(elapsed * state.refillRate);

      if (tokensToAdd > 0) {
        state.availableTokens = Math.min(
          state.availableTokens + tokensToAdd,
          state.limit
        );
        state.lastRefill = now;
      }
    }
  }
}
