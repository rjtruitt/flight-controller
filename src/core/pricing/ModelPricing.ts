import { TokenUsage } from '../types/Response.js';
import { IPricingTracker } from './IPricingTracker.js';

export interface PricingConfig {
    /** Cost per million input tokens. */
    inputTokens: number;
    /** Cost per million output tokens. */
    outputTokens: number;
    cacheRead?: number;
    cacheWrite?: number;
    perRequest?: number;
    perImage?: number;
}

export interface Budget {
    daily?: number;
    monthly?: number;
    perRequest?: number;
}

/** Pricing tracker that computes per-million-token costs and enforces budget caps. */
export class ModelPricing implements IPricingTracker {
    private readonly config: PricingConfig;
    private totalCost = 0;
    private requestCount = 0;

    constructor(config: PricingConfig, private budget?: Budget) {
        this.config = config;
    }

    calculateCost(usage: TokenUsage): number {
        let cost = 0;

        cost += (usage.inputTokens / 1_000_000) * this.config.inputTokens;

        cost += (usage.outputTokens / 1_000_000) * this.config.outputTokens;

        if (usage.cacheReadTokens && this.config.cacheRead) {
            cost += (usage.cacheReadTokens / 1_000_000) * this.config.cacheRead;
        }
        if (usage.cacheWriteTokens && this.config.cacheWrite) {
            cost += (usage.cacheWriteTokens / 1_000_000) * this.config.cacheWrite;
        }

        if (this.config.perRequest) {
            cost += this.config.perRequest;
        }

        return cost;
    }

    recordUsage(usage: TokenUsage): void {
        const cost = this.calculateCost(usage);
        this.totalCost += cost;
        this.requestCount++;
    }

    checkBudget(estimatedCost: number): {
        allowed: boolean;
        reason?: string;
        currentCost?: number;
        limit?: number;
    } {
        if (this.budget?.perRequest && estimatedCost > this.budget.perRequest) {
            return {
                allowed: false,
                reason: 'per_request_budget_exceeded',
                currentCost: estimatedCost,
                limit: this.budget.perRequest
            };
        }

        if (this.budget?.daily && this.totalCost + estimatedCost > this.budget.daily) {
            return {
                allowed: false,
                reason: 'daily_budget_exceeded',
                currentCost: this.totalCost,
                limit: this.budget.daily
            };
        }

        if (this.budget?.monthly && this.totalCost + estimatedCost > this.budget.monthly) {
            return {
                allowed: false,
                reason: 'monthly_budget_exceeded',
                currentCost: this.totalCost,
                limit: this.budget.monthly
            };
        }

        return { allowed: true };
    }

    getTotalCost(): number {
        return this.totalCost;
    }

    getAverageCost(): number {
        return this.requestCount > 0 ? this.totalCost / this.requestCount : 0;
    }

    getRequestCount(): number {
        return this.requestCount;
    }

    reset(): void {
        this.totalCost = 0;
        this.requestCount = 0;
    }
}
