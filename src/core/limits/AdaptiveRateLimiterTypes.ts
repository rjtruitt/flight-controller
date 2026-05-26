import { IRateLimitStrategy } from './IRateLimitStrategy.js';

/** Which dimension this limiter tracks. */
export type LimitType = 'rpm' | 'tpm';
/** Active limiting algorithm. Starts as 'unknown' until a limit is learned. */
export type LimitStrategy = 'token-bucket' | 'fixed-window' | 'unknown';

export interface RateLimitConfig {
  type: LimitType;

  limit?: number;
  useTokenBucket?: boolean;
  enableLearning?: boolean;
  learningReductionRate?: number;
  maxConsecutiveFailures?: number;
  customStrategy?: IRateLimitStrategy;
}

export interface LimitState {
  type: LimitType;
  limit: number | null;
  strategy: LimitStrategy;
  confidence: number; // 0-1

  availableTokens: number;
  lastRefill: number;
  refillRate: number | null; // tokens per millisecond

  consecutiveFailures: number;
  observations: LimitObservation[];
}

export interface LimitObservation {
  timestamp: number;
  unitsConsumed: number; // requests or tokens
  limitHit: boolean;
  timeSinceStart: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  waitMs: number;
  reason?: string;
  state: {
    available: number;
    limit: number | null;
    strategy: LimitStrategy;
  };
}

export interface LearnedLimitEvent {
  type: LimitType;
  limit: number;
  strategy: LimitStrategy;
  confidence: number;
  adjustmentReason?: string;
}
