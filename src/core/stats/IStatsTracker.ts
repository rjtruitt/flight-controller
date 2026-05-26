/** A single request observation for stats tracking. */
export interface RequestRecord {
    latencyMs: number;
    tokens?: number;
    success: boolean;
    error?: Error;
    timestamp?: number;
}

export interface StatsSnapshot {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    errorRate: number;
    successRate: number;
    avgLatencyMs: number;
    minLatencyMs?: number;
    maxLatencyMs?: number;
    p95LatencyMs?: number;
    p99LatencyMs?: number;
    totalTokens: number;
    tokensPerSecond: number;
}

/** Collects per-model performance metrics (latency, error rate, throughput). */
export interface IStatsTracker {
    recordRequest(record: RequestRecord): void;
    getAverageLatency(): number;
    getErrorRate(): number;
    getStats?(): StatsSnapshot;
    reset?(): void;
}
