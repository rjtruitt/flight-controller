export interface RollingWindowConfig {
    windowMs: number;
    maxEntries?: number;
}

export interface WindowEntry {
    timestamp: number;
    value: number;
}

/** Tracks values over a sliding time window for rate limiting. */
export class RollingWindow {
    private readonly windowMs: number;
    private readonly maxEntries: number;
    private entries: WindowEntry[] = [];

    /**
     * @param config - Window duration and max entry count
     */
    constructor(config: RollingWindowConfig) {
        this.windowMs = config.windowMs;
        this.maxEntries = config.maxEntries ?? 10000;
    }

    /**
     * Add a value to the window at the given timestamp.
     * Automatically prunes entries outside the window first.
     * @param value - The value to record (e.g. token count)
     * @param timestamp - Timestamp in ms (defaults to now)
     */
    add(value: number, timestamp: number = Date.now()): void {
        this.cleanup(timestamp);
        this.entries.push({ timestamp, value });

        if (this.entries.length > this.maxEntries) {
            this.entries = this.entries.slice(-this.maxEntries);
        }
    }

    /**
     * Get the sum of all values within the current window.
     * @param now - Current timestamp (defaults to now)
     * @returns Sum of values in the window
     */
    getTotal(now: number = Date.now()): number {
        this.cleanup(now);
        return this.entries.reduce((sum, entry) => sum + entry.value, 0);
    }

    /**
     * Get the number of entries within the current window.
     * @param now - Current timestamp (defaults to now)
     * @returns Entry count
     */
    getCount(now: number = Date.now()): number {
        this.cleanup(now);
        return this.entries.length;
    }

    /**
     * Get all entries within the current window.
     * @param now - Current timestamp (defaults to now)
     * @returns Copy of current window entries
     */
    getEntries(now: number = Date.now()): WindowEntry[] {
        this.cleanup(now);
        return [...this.entries];
    }

    /**
     * Check whether the window is empty (no entries).
     * @param now - Current timestamp (defaults to now)
     */
    isEmpty(now: number = Date.now()): boolean {
        this.cleanup(now);
        return this.entries.length === 0;
    }

    /** Clear all entries from the window. */
    clear(): void {
        this.entries = [];
    }

    /**
     * Get the start timestamp of the current window.
     * @param now - Current timestamp (defaults to now)
     * @returns Window start in ms
     */
    getWindowStart(now: number = Date.now()): number {
        return now - this.windowMs;
    }

    private cleanup(now: number): void {
        const cutoff = now - this.windowMs;
        this.entries = this.entries.filter(entry => entry.timestamp > cutoff);
    }
}
