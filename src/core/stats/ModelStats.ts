import { IStatsTracker, RequestRecord, StatsSnapshot } from './IStatsTracker.js';

/** In-memory stats tracker with latency percentiles and token throughput. */
export class ModelStats implements IStatsTracker {
    private totalRequests = 0;
    private successfulRequests = 0;
    private failedRequests = 0;
    private totalLatencyMs = 0;
    private totalTokens = 0;
    private minLatencyMs?: number;
    private maxLatencyMs?: number;
    private firstRequestTime?: number;
    private lastRequestTime?: number;
    private recentLatencies: number[] = [];
    private readonly maxRecentSamples = 100;

    recordRequest(record: RequestRecord): void {
        const timestamp = record.timestamp ?? Date.now();

        this.totalRequests++;
        if (record.success) {
            this.successfulRequests++;
        } else {
            this.failedRequests++;
        }

        this.totalLatencyMs += record.latencyMs;
        this.minLatencyMs = Math.min(this.minLatencyMs ?? record.latencyMs, record.latencyMs);
        this.maxLatencyMs = Math.max(this.maxLatencyMs ?? record.latencyMs, record.latencyMs);

        this.recentLatencies.push(record.latencyMs);
        if (this.recentLatencies.length > this.maxRecentSamples) {
            this.recentLatencies.shift();
        }

        if (record.tokens) {
            this.totalTokens += record.tokens;
        }

        if (!this.firstRequestTime) {
            this.firstRequestTime = timestamp;
        }
        this.lastRequestTime = timestamp;
    }

    getAverageLatency(): number {
        return this.totalRequests > 0 ? this.totalLatencyMs / this.totalRequests : 0;
    }

    getMinLatency(): number | undefined {
        return this.minLatencyMs;
    }

    getMaxLatency(): number | undefined {
        return this.maxLatencyMs;
    }

    getP95Latency(): number | undefined {
        return this.getPercentile(95);
    }

    getP99Latency(): number | undefined {
        return this.getPercentile(99);
    }

    getErrorRate(): number {
        return this.totalRequests > 0
            ? (this.failedRequests / this.totalRequests) * 100
            : 0;
    }

    getSuccessRate(): number {
        return 100 - this.getErrorRate();
    }

    getTokensPerSecond(): number {
        if (!this.firstRequestTime || !this.lastRequestTime) {
            return 0;
        }

        const durationSeconds = (this.lastRequestTime - this.firstRequestTime) / 1000;
        return durationSeconds > 0 ? this.totalTokens / durationSeconds : 0;
    }

    getStats(): StatsSnapshot & {
        totalRequests: number;
        successfulRequests: number;
        failedRequests: number;
        errorRate: number;
        successRate: number;
        avgLatencyMs: number;
        minLatencyMs: number | undefined;
        maxLatencyMs: number | undefined;
        p95LatencyMs: number | undefined;
        p99LatencyMs: number | undefined;
        totalTokens: number;
        tokensPerSecond: number;
    } {
        return {
            totalRequests: this.totalRequests,
            successfulRequests: this.successfulRequests,
            failedRequests: this.failedRequests,
            errorRate: this.getErrorRate(),
            successRate: this.getSuccessRate(),
            avgLatencyMs: this.getAverageLatency(),
            minLatencyMs: this.minLatencyMs,
            maxLatencyMs: this.maxLatencyMs,
            p95LatencyMs: this.getP95Latency(),
            p99LatencyMs: this.getP99Latency(),
            totalTokens: this.totalTokens,
            tokensPerSecond: this.getTokensPerSecond()
        };
    }

    reset(): void {
        this.totalRequests = 0;
        this.successfulRequests = 0;
        this.failedRequests = 0;
        this.totalLatencyMs = 0;
        this.totalTokens = 0;
        this.minLatencyMs = undefined;
        this.maxLatencyMs = undefined;
        this.firstRequestTime = undefined;
        this.lastRequestTime = undefined;
        this.recentLatencies = [];
    }

    private getPercentile(percentile: number): number | undefined {
        if (this.recentLatencies.length === 0) {
            return undefined;
        }

        const sorted = [...this.recentLatencies].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index];
    }
}
