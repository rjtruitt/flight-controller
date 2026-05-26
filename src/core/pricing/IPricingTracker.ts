import { TokenUsage } from '../types/Response.js';

/** Result of checking whether a request's estimated cost fits within the budget. */
export interface BudgetCheck {
    allowed: boolean;
    reason?: string;
    currentCost?: number;
    limit?: number;
}

/** Tracks cumulative cost and enforces per-request/daily/monthly budgets. */
export interface IPricingTracker {
    calculateCost(usage: TokenUsage): number;
    recordUsage(usage: TokenUsage): void;
    checkBudget(estimatedCost: number): BudgetCheck;
    getTotalCost(): number;
    getAverageCost?(): number;
    reset?(): void;
}
