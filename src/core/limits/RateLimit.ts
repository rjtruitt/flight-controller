import { RollingWindow } from './RollingWindow.js';
import { IRateLimiter, UsageRecord, RateLimitCheck } from './IRateLimiter.js';

export interface RateLimitConfig {
    tpm?: number;
    rpm?: number;
    tph?: number;
    rph?: number;
    /** Warning threshold as fraction (e.g., 0.8 = warn at 80%) */
    warningThreshold?: number;
}

/** Rolling-window rate limiter supporting TPM, RPM, TPH, and RPH quotas. */
export class RateLimit implements IRateLimiter {
    private readonly config: Required<RateLimitConfig>;
    private readonly tpmWindow: RollingWindow;
    private readonly rpmWindow: RollingWindow;
    private readonly tphWindow: RollingWindow;
    private readonly rphWindow: RollingWindow;

    constructor(config: RateLimitConfig) {
        this.config = {
            tpm: config.tpm ?? Infinity,
            rpm: config.rpm ?? Infinity,
            tph: config.tph ?? Infinity,
            rph: config.rph ?? Infinity,
            warningThreshold: config.warningThreshold ?? 0.8
        };

        this.tpmWindow = new RollingWindow({ windowMs: 60_000 });
        this.rpmWindow = new RollingWindow({ windowMs: 60_000 });
        this.tphWindow = new RollingWindow({ windowMs: 3_600_000 });
        this.rphWindow = new RollingWindow({ windowMs: 3_600_000 });
    }

    checkLimit(usage: UsageRecord): RateLimitCheck {
        const now = Date.now();
        const tokens = usage.tokens ?? 0;
        const requests = usage.requests ?? 0;

        const currentTPM = this.tpmWindow.getTotal(now);
        if (currentTPM + tokens > this.config.tpm) {
            const oldestEntry = this.tpmWindow.getEntries(now)[0];
            const waitMs = oldestEntry ? oldestEntry.timestamp + 60_000 - now : 60_000;

            return {
                allowed: false,
                reason: 'tpm_exceeded',
                waitMs: Math.max(0, waitMs),
                usage: {
                    tpm: currentTPM,
                    rpm: this.rpmWindow.getTotal(now),
                    tpmLimit: this.config.tpm,
                    rpmLimit: this.config.rpm
                }
            };
        }

        const currentRPM = this.rpmWindow.getCount(now);
        if (currentRPM + requests > this.config.rpm) {
            const oldestEntry = this.rpmWindow.getEntries(now)[0];
            const waitMs = oldestEntry ? oldestEntry.timestamp + 60_000 - now : 60_000;

            return {
                allowed: false,
                reason: 'rpm_exceeded',
                waitMs: Math.max(0, waitMs),
                usage: {
                    tpm: currentTPM,
                    rpm: currentRPM,
                    tpmLimit: this.config.tpm,
                    rpmLimit: this.config.rpm
                }
            };
        }

        const currentTPH = this.tphWindow.getTotal(now);
        if (currentTPH + tokens > this.config.tph) {
            return {
                allowed: false,
                reason: 'tph_exceeded',
                waitMs: 3_600_000
            };
        }

        const currentRPH = this.rphWindow.getCount(now);
        if (currentRPH + requests > this.config.rph) {
            return {
                allowed: false,
                reason: 'rph_exceeded',
                waitMs: 3_600_000
            };
        }

        return {
            allowed: true,
            usage: {
                tpm: currentTPM,
                rpm: currentRPM,
                tpmLimit: this.config.tpm,
                rpmLimit: this.config.rpm
            }
        };
    }

    recordUsage(usage: UsageRecord, timestamp: number = Date.now()): void {
        if (usage.tokens) {
            this.tpmWindow.add(usage.tokens, timestamp);
            this.tphWindow.add(usage.tokens, timestamp);
        }
        if (usage.requests) {
            this.rpmWindow.add(usage.requests, timestamp);
            this.rphWindow.add(usage.requests, timestamp);
        }
    }

    isApproachingLimit(now: number = Date.now()): boolean {
        const tpmUsage = this.tpmWindow.getTotal(now) / this.config.tpm;
        const rpmUsage = this.rpmWindow.getCount(now) / this.config.rpm;

        return tpmUsage >= this.config.warningThreshold ||
               rpmUsage >= this.config.warningThreshold;
    }

    getUsage(now: number = Date.now()): {
        tpm: number;
        rpm: number;
        tph: number;
        rph: number;
        tpmPercent: number;
        rpmPercent: number;
    } {
        const tpm = this.tpmWindow.getTotal(now);
        const rpm = this.rpmWindow.getCount(now);
        const tph = this.tphWindow.getTotal(now);
        const rph = this.rphWindow.getCount(now);

        return {
            tpm,
            rpm,
            tph,
            rph,
            tpmPercent: (tpm / this.config.tpm) * 100,
            rpmPercent: (rpm / this.config.rpm) * 100
        };
    }

    reset(): void {
        this.tpmWindow.clear();
        this.rpmWindow.clear();
        this.tphWindow.clear();
        this.rphWindow.clear();
    }
}
