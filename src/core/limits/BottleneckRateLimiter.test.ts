import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BottleneckRateLimiter, BottleneckLimitConfig } from './BottleneckRateLimiter';

// Track all created instances for assertions
let bottleneckInstances: any[] = [];

// Mock Bottleneck as a class
vi.mock('bottleneck', () => {
    class MockBottleneck {
        _config: any;
        constructor(config: any) {
            this._config = config;
            bottleneckInstances.push(this);
        }
        schedule = vi.fn().mockImplementation((optsOrFn: any, fn?: any) => {
            const callback = fn || optsOrFn;
            if (typeof callback === 'function') return callback();
            return Promise.resolve();
        });
        check = vi.fn().mockResolvedValue(true);
        counts = vi.fn().mockResolvedValue({ RECEIVED: 100, EXECUTING: 2, DONE: 50 });
        chain = vi.fn();
        stop = vi.fn().mockResolvedValue(undefined);
        updateSettings = vi.fn().mockResolvedValue(undefined);
    }
    return { default: MockBottleneck };
});

describe('BottleneckRateLimiter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        bottleneckInstances = [];
    });

    describe('Construction', () => {
        it('creates RPM limiter when rpm configured', () => {
            new BottleneckRateLimiter({ rpm: 60 });

            expect(bottleneckInstances.length).toBe(1);
            expect(bottleneckInstances[0]._config).toMatchObject({
                reservoir: 60,
                reservoirRefreshAmount: 60,
                reservoirRefreshInterval: 60000
            });
        });

        it('creates TPM limiter when tpm configured', () => {
            new BottleneckRateLimiter({ tpm: 100000 });

            expect(bottleneckInstances.length).toBe(1);
            expect(bottleneckInstances[0]._config).toMatchObject({
                reservoir: 100000,
                reservoirRefreshAmount: 100000,
                reservoirRefreshInterval: 60000
            });
        });

        it('chains both when rpm and tpm configured', () => {
            new BottleneckRateLimiter({ rpm: 60, tpm: 100000 });

            // Should create 2 Bottleneck instances
            expect(bottleneckInstances.length).toBe(2);
            // RPM limiter should chain to TPM limiter
            expect(bottleneckInstances[0].chain).toHaveBeenCalledWith(bottleneckInstances[1]);
        });

        it('creates no limiter when no config provided', () => {
            new BottleneckRateLimiter({});

            expect(bottleneckInstances.length).toBe(0);
        });
    });

    describe('Check', () => {
        it('returns allowed:true when no limiter configured', async () => {
            const limiter = new BottleneckRateLimiter({});

            const result = await limiter.check(1000);

            expect(result.allowed).toBe(true);
            expect(result.waitMs).toBe(0);
        });

        it('returns allowed:true when under limits', async () => {
            const limiter = new BottleneckRateLimiter({ rpm: 60 });
            bottleneckInstances[0].check.mockResolvedValue(true);

            const result = await limiter.check(500);

            expect(result.allowed).toBe(true);
            expect(result.waitMs).toBe(0);
        });

        it('returns allowed:false with waitMs when over limit', async () => {
            const limiter = new BottleneckRateLimiter({ rpm: 60 });
            bottleneckInstances[0].check.mockResolvedValue(false);

            const result = await limiter.check(500);

            expect(result.allowed).toBe(false);
            expect(result.waitMs).toBe(1000); // Default estimate
        });

        it('handles check errors gracefully (returns allowed:true)', async () => {
            const limiter = new BottleneckRateLimiter({ rpm: 60 });
            bottleneckInstances[0].check.mockRejectedValue(new Error('Limiter error'));

            const result = await limiter.check(500);

            expect(result.allowed).toBe(true);
            expect(result.waitMs).toBe(0);
        });
    });

    describe('Schedule', () => {
        it('executes immediately when no limiter configured', async () => {
            const limiter = new BottleneckRateLimiter({});
            const fn = vi.fn().mockResolvedValue('result');

            const result = await limiter.schedule(100, fn);

            expect(result).toBe('result');
            expect(fn).toHaveBeenCalled();
        });

        it('schedules through RPM limiter with weight 1', async () => {
            const limiter = new BottleneckRateLimiter({ rpm: 60 });
            const fn = vi.fn().mockResolvedValue('scheduled');

            await limiter.schedule(500, fn);

            expect(bottleneckInstances[0].schedule).toHaveBeenCalledWith(
                expect.objectContaining({ weight: 1 }),
                expect.any(Function)
            );
        });

        it('schedules through TPM limiter with token weight', async () => {
            const limiter = new BottleneckRateLimiter({ tpm: 100000 });
            const fn = vi.fn().mockResolvedValue('token-scheduled');

            await limiter.schedule(2500, fn);

            expect(bottleneckInstances[0].schedule).toHaveBeenCalledWith(
                expect.objectContaining({ weight: 2500 }),
                expect.any(Function)
            );
        });

        it('chains through both RPM and TPM when both configured', async () => {
            const limiter = new BottleneckRateLimiter({ rpm: 60, tpm: 100000 });
            const fn = vi.fn().mockResolvedValue('chained');

            // RPM limiter schedule should be called (it wraps TPM)
            bottleneckInstances[0].schedule.mockImplementation((_opts: any, innerFn: any) => {
                // RPM calls inner fn which should schedule through TPM
                return innerFn();
            });

            await limiter.schedule(1000, fn);

            // RPM schedule should be called with weight 1
            expect(bottleneckInstances[0].schedule).toHaveBeenCalledWith(
                expect.objectContaining({ weight: 1 }),
                expect.any(Function)
            );
        });

        it('handles rejection from limiter', async () => {
            const limiter = new BottleneckRateLimiter({ rpm: 60 });
            const fn = vi.fn();

            bottleneckInstances[0].schedule.mockRejectedValue(
                new Error('Bottleneck: This job has been dropped')
            );

            await expect(limiter.schedule(100, fn))
                .rejects.toThrow('This job has been dropped');
        });
    });

    describe('Adaptive Throttling', () => {
        it('does nothing when adaptive is disabled', async () => {
            const limiter = new BottleneckRateLimiter({
                rpm: 100,
                tpm: 100000,
                enableAdaptive: false
            });

            await limiter.adaptOnThrottle('token limit exceeded');

            // Neither limiter should have updateSettings called
            expect(bottleneckInstances[0].updateSettings).not.toHaveBeenCalled();
            expect(bottleneckInstances[1].updateSettings).not.toHaveBeenCalled();
        });

        it('reduces TPM by 10% for token-related errors', async () => {
            const limiter = new BottleneckRateLimiter({
                tpm: 100000,
                enableAdaptive: true
            });

            await limiter.adaptOnThrottle('token limit exceeded');

            expect(bottleneckInstances[0].updateSettings).toHaveBeenCalledWith(
                expect.objectContaining({
                    reservoir: 90000,
                    reservoirRefreshAmount: 90000
                })
            );
        });

        it('reduces RPM by 10% for request-related errors', async () => {
            const limiter = new BottleneckRateLimiter({
                rpm: 100,
                enableAdaptive: true
            });

            await limiter.adaptOnThrottle('rate limit exceeded');

            expect(bottleneckInstances[0].updateSettings).toHaveBeenCalledWith(
                expect.objectContaining({
                    reservoir: 90,
                    reservoirRefreshAmount: 90
                })
            );
        });

        it('reduces both RPM and TPM for ambiguous errors', async () => {
            const limiter = new BottleneckRateLimiter({
                rpm: 100,
                tpm: 100000,
                enableAdaptive: true
            });

            await limiter.adaptOnThrottle('unknown throttle reason');

            // Both limiters should have updateSettings called
            expect(bottleneckInstances[0].updateSettings).toHaveBeenCalled(); // RPM
            expect(bottleneckInstances[1].updateSettings).toHaveBeenCalled(); // TPM
        });

        it('emits throttled event with current limits', async () => {
            const limiter = new BottleneckRateLimiter({
                rpm: 100,
                tpm: 100000,
                enableAdaptive: true
            });

            const throttleHandler = vi.fn();
            limiter.on('throttled', throttleHandler);

            await limiter.adaptOnThrottle('rate limit hit');

            expect(throttleHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    rpm: expect.any(Number),
                    tpm: expect.any(Number),
                    reason: 'rate limit hit'
                })
            );
        });

        it('calls onLimitChanged callback', async () => {
            const onLimitChanged = vi.fn();
            const limiter = new BottleneckRateLimiter({
                rpm: 100,
                tpm: 100000,
                enableAdaptive: true,
                onLimitChanged
            });

            await limiter.adaptOnThrottle('token overflow');

            expect(onLimitChanged).toHaveBeenCalledWith(
                expect.objectContaining({
                    rpm: expect.any(Number),
                    tpm: expect.any(Number)
                })
            );
        });

        it('respects minimum limits (10k TPM, 10 RPM)', async () => {
            const limiter = new BottleneckRateLimiter({
                rpm: 11, // Just above minimum
                tpm: 11000, // Just above minimum
                enableAdaptive: true
            });

            // Adapt multiple times to drive toward minimum
            for (let i = 0; i < 10; i++) {
                await limiter.adaptOnThrottle('ambiguous');
            }

            const limits = limiter.getCurrentLimits();

            // Should never go below minimums
            expect(limits.rpm!).toBeGreaterThanOrEqual(10);
            expect(limits.tpm!).toBeGreaterThanOrEqual(10000);
        });
    });

    describe('State & Cleanup', () => {
        it('getCurrentLimits reflects adapted values', async () => {
            const limiter = new BottleneckRateLimiter({
                rpm: 100,
                tpm: 50000,
                enableAdaptive: true
            });

            const initial = limiter.getCurrentLimits();
            expect(initial.rpm).toBe(100);
            expect(initial.tpm).toBe(50000);

            await limiter.adaptOnThrottle('rate limit exceeded');

            const adapted = limiter.getCurrentLimits();
            // RPM reduced by 10%
            expect(adapted.rpm).toBe(90);
        });

        it('getState returns reservoir info from bottleneck', async () => {
            const limiter = new BottleneckRateLimiter({ rpm: 60, tpm: 100000 });

            bottleneckInstances[0].counts.mockResolvedValue({ RECEIVED: 100, EXECUTING: 3, DONE: 50 });
            bottleneckInstances[1].counts.mockResolvedValue({ RECEIVED: 80000, EXECUTING: 1, DONE: 30000 });

            const state = await limiter.getState();

            expect(state).toHaveProperty('rpm');
            expect(state).toHaveProperty('tpm');
            expect(state.rpm).toHaveProperty('running', 3);
        });

        it('stop() stops both limiters', async () => {
            const limiter = new BottleneckRateLimiter({ rpm: 60, tpm: 100000 });

            await limiter.stop();

            expect(bottleneckInstances[0].stop).toHaveBeenCalled();
            expect(bottleneckInstances[1].stop).toHaveBeenCalled();
        });
    });
});
