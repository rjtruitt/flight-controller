import { RollingWindow } from './RollingWindow.js';
import { ISessionLimiter, SessionUsage, SessionLimitCheck } from './ISessionLimiter.js';
import { IResetCalculator, DailyResetCalculator, MonthlyResetCalculator, CustomResetCalculator } from './SessionResetCalculator.js';

export type SessionLimitType = 'free' | 'paid' | 'enterprise';

export interface SessionLimitConfig {
    type: SessionLimitType;
    messagesPerDay?: number;
    sessionsPerDay?: number;
    tokensPerDay?: number;
    tokensPerMonth?: number;
    cooldownDuration?: number;
    calculateResetTime?: (hitTime: Date) => Date;
    resetCalculator?: IResetCalculator;
}

/** Enforces daily/monthly usage caps with automatic midnight reset. */
export class SessionLimit implements ISessionLimiter {
    private readonly config: SessionLimitConfig & {
        messagesPerDay: number;
        sessionsPerDay: number;
        tokensPerDay: number;
        tokensPerMonth: number;
    };
    private readonly dayWindow: RollingWindow;  // 24 hours
    private readonly monthWindow: RollingWindow; // 30 days
    private readonly dailyResetCalculator: IResetCalculator;
    private readonly monthlyResetCalculator: IResetCalculator;
    private messageCount = 0;
    private sessionCount = 0;
    private lastResetDate: string;

    constructor(config: SessionLimitConfig) {
        this.config = {
            ...config,
            messagesPerDay: config.messagesPerDay ?? Infinity,
            sessionsPerDay: config.sessionsPerDay ?? Infinity,
            tokensPerDay: config.tokensPerDay ?? Infinity,
            tokensPerMonth: config.tokensPerMonth ?? Infinity
        };

        this.dayWindow = new RollingWindow({ windowMs: 24 * 60 * 60 * 1000 });
        this.monthWindow = new RollingWindow({ windowMs: 30 * 24 * 60 * 60 * 1000 });
        this.lastResetDate = this.getCurrentDate();

        this.dailyResetCalculator = config.resetCalculator ??
          (config.calculateResetTime ? new CustomResetCalculator(config.calculateResetTime) : new DailyResetCalculator());
        this.monthlyResetCalculator = new MonthlyResetCalculator();
    }

    hasSessionLimits(): boolean {
        return this.config.messagesPerDay !== Infinity ||
               this.config.sessionsPerDay !== Infinity ||
               this.config.tokensPerDay !== Infinity ||
               this.config.tokensPerMonth !== Infinity;
    }

    getCooldownDuration(): number | undefined {
        return this.config.cooldownDuration;
    }

    getResetTimeCalculator(): ((hitTime: Date) => Date) | undefined {
        return this.config.calculateResetTime;
    }

    checkLimit(usage: SessionUsage): SessionLimitCheck {
        this.resetIfNewDay();

        const now = Date.now();

        if (usage.messages) {
            if (this.messageCount + usage.messages > this.config.messagesPerDay) {
                return {
                    allowed: false,
                    reason: 'messages_per_day_exceeded',
                    resetAt: this.getNextDayReset()
                };
            }
        }

        if (usage.sessions) {
            if (this.sessionCount + usage.sessions > this.config.sessionsPerDay) {
                return {
                    allowed: false,
                    reason: 'sessions_per_day_exceeded',
                    resetAt: this.getNextDayReset()
                };
            }
        }

        if (usage.tokens) {
            const dayTokens = this.dayWindow.getTotal(now);
            if (dayTokens + usage.tokens > this.config.tokensPerDay) {
                return {
                    allowed: false,
                    reason: 'tokens_per_day_exceeded',
                    resetAt: this.getNextDayReset()
                };
            }

            const monthTokens = this.monthWindow.getTotal(now);
            if (monthTokens + usage.tokens > this.config.tokensPerMonth) {
                return {
                    allowed: false,
                    reason: 'tokens_per_month_exceeded',
                    resetAt: this.getNextMonthReset()
                };
            }
        }

        return { allowed: true };
    }

    recordUsage(usage: SessionUsage, timestamp: number = Date.now()): void {
        this.resetIfNewDay();

        if (usage.messages) {
            this.messageCount += usage.messages;
        }
        if (usage.sessions) {
            this.sessionCount += usage.sessions;
        }
        if (usage.tokens) {
            this.dayWindow.add(usage.tokens, timestamp);
            this.monthWindow.add(usage.tokens, timestamp);
        }
    }

    getUsage(now: number = Date.now()): {
        messagesPerDay: number;
        sessionsPerDay: number;
        tokensPerDay: number;
        tokensPerMonth: number;
    } {
        this.resetIfNewDay();

        return {
            messagesPerDay: this.messageCount,
            sessionsPerDay: this.sessionCount,
            tokensPerDay: this.dayWindow.getTotal(now),
            tokensPerMonth: this.monthWindow.getTotal(now)
        };
    }

    private resetIfNewDay(): void {
        const currentDate = this.getCurrentDate();
        if (currentDate !== this.lastResetDate) {
            this.messageCount = 0;
            this.sessionCount = 0;
            this.lastResetDate = currentDate;
        }
    }

    private getCurrentDate(): string {
        return new Date().toISOString().split('T')[0];
    }

    private getNextDayReset(): Date {
        return this.dailyResetCalculator.calculateResetTime(new Date());
    }

    private getNextMonthReset(): Date {
        return this.monthlyResetCalculator.calculateResetTime(new Date());
    }

    reset(): void {
        this.messageCount = 0;
        this.sessionCount = 0;
        this.dayWindow.clear();
        this.monthWindow.clear();
    }
}
