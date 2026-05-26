import Bottleneck from 'bottleneck';
import { EventEmitter } from 'events';

/** Configuration for Bottleneck-based rate limiting. */
export interface BottleneckLimitConfig {
    rpm?: number;
    tpm?: number;
    maxConcurrent?: number;
    /** Minimum ms between dispatched requests (overrides rpm-derived spacing). */
    minTime?: number;
    /** When true, limits are reduced by 10% on each throttle event. */
    enableAdaptive?: boolean;
    onLimitChanged?: (limits: { rpm?: number; tpm?: number }) => void;
}

/** Result of a pre-flight rate limit check. */
export interface RateLimitCheckResult {
    allowed: boolean;
    waitMs: number;
}

/** Bottleneck-based rate limiter supporting both RPM and TPM limits. Emits 'throttled' events. */
export class BottleneckRateLimiter extends EventEmitter {
    private rpmLimiter?: Bottleneck;
    private tpmLimiter?: Bottleneck;
    private currentRpm?: number;
    private currentTpm?: number;
    private enableAdaptive: boolean;
    private onLimitChanged?: (limits: { rpm?: number; tpm?: number }) => void;

    constructor(config: BottleneckLimitConfig) {
        super();
        this.currentRpm = config.rpm;
        this.currentTpm = config.tpm;
        this.enableAdaptive = config.enableAdaptive ?? false;
        this.onLimitChanged = config.onLimitChanged;

        if (config.rpm) {
            this.rpmLimiter = new Bottleneck({
                reservoir: config.rpm,
                reservoirRefreshAmount: config.rpm,
                reservoirRefreshInterval: 60000, // 60 seconds
                maxConcurrent: config.maxConcurrent ?? null,
                minTime: config.minTime ?? Math.floor(60000 / config.rpm)
            });
        }

        if (config.tpm) {
            this.tpmLimiter = new Bottleneck({
                reservoir: config.tpm,
                reservoirRefreshAmount: config.tpm,
                reservoirRefreshInterval: 60000
            });
        }

        if (this.rpmLimiter && this.tpmLimiter) {
            this.rpmLimiter.chain(this.tpmLimiter);
        }
    }

    async check(_estimatedTokens: number): Promise<RateLimitCheckResult> {
        const limiter = this.rpmLimiter || this.tpmLimiter;

        if (!limiter) {
            return { allowed: true, waitMs: 0 };
        }

        try {
            const wouldRun = await limiter.check();
            return {
                allowed: wouldRun,
                waitMs: wouldRun ? 0 : 1000 // Estimate 1s wait if not allowed
            };
        } catch (error) {
            return { allowed: true, waitMs: 0 };
        }
    }

    /** Queues `fn` behind the rate limiter. Uses token weight for TPM, 1 for RPM. */
    async schedule<T>(estimatedTokens: number, fn: () => Promise<T>): Promise<T> {
        if (this.rpmLimiter && this.tpmLimiter) {
            return this.rpmLimiter.schedule({ weight: 1 }, async () => {
                return this.tpmLimiter!.schedule({ weight: Math.ceil(estimatedTokens) }, fn);
            });
        }

        const limiter = this.rpmLimiter || this.tpmLimiter;

        if (!limiter) {
            return fn();
        }

        const weight = this.rpmLimiter ? 1 : Math.ceil(estimatedTokens);
        return limiter.schedule({ weight }, fn);
    }

    async getState(): Promise<{
        rpm?: { reservoir: number; running: number };
        tpm?: { reservoir: number; running: number };
    }> {
        const state: any = {};

        if (this.rpmLimiter) {
            const counts = await this.rpmLimiter.counts();
            state.rpm = {
                reservoir: counts.RECEIVED - counts.EXECUTING - (counts.DONE ?? 0),
                running: counts.EXECUTING
            };
        }

        if (this.tpmLimiter) {
            const counts = await this.tpmLimiter.counts();
            state.tpm = {
                reservoir: counts.RECEIVED - counts.EXECUTING - (counts.DONE ?? 0),
                running: counts.EXECUTING
            };
        }

        return state;
    }

    /** Reduces limits by 10% (adaptive mode only). Emits 'throttled' event. */
    async adaptOnThrottle(errorMessage?: string): Promise<void> {
        if (!this.enableAdaptive) {
            return;
        }

        const isTpmThrottle = errorMessage?.toLowerCase().includes('token');
        const isRpmThrottle = errorMessage?.toLowerCase().includes('request') ||
                              errorMessage?.toLowerCase().includes('rate limit');

        const reduceTpm = isTpmThrottle || (!isTpmThrottle && !isRpmThrottle);
        const reduceRpm = isRpmThrottle || (!isTpmThrottle && !isRpmThrottle);

        if (reduceTpm && this.currentTpm) {
            this.currentTpm = Math.max(10000, Math.floor(this.currentTpm * 0.9));

            if (this.tpmLimiter) {
                await this.tpmLimiter.updateSettings({
                    reservoir: this.currentTpm,
                    reservoirRefreshAmount: this.currentTpm
                });
            }
        }

        if (reduceRpm && this.currentRpm) {
            this.currentRpm = Math.max(10, Math.floor(this.currentRpm * 0.9));

            if (this.rpmLimiter) {
                await this.rpmLimiter.updateSettings({
                    reservoir: this.currentRpm,
                    reservoirRefreshAmount: this.currentRpm
                });
            }
        }

        this.emit('throttled', {
            rpm: this.currentRpm,
            tpm: this.currentTpm,
            reason: errorMessage || 'Unknown throttle',
            reducedRpm: reduceRpm,
            reducedTpm: reduceTpm
        });

        if (this.onLimitChanged) {
            this.onLimitChanged({
                rpm: this.currentRpm,
                tpm: this.currentTpm
            });
        }
    }

    getCurrentLimits(): { rpm?: number; tpm?: number } {
        return {
            rpm: this.currentRpm,
            tpm: this.currentTpm
        };
    }

    async stop(): Promise<void> {
        if (this.rpmLimiter) {
            await this.rpmLimiter.stop();
        }
        if (this.tpmLimiter) {
            await this.tpmLimiter.stop();
        }
    }
}
