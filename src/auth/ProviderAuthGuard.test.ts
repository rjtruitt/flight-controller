import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderAuthGuard } from './ProviderAuthGuard';
import type { IAuthProvider } from './IAuthProvider';

// ── Mock Auth Provider ────────────────────────────────────────────────────

function createMockAuth(overrides?: Partial<IAuthProvider>): IAuthProvider {
    return {
        isAuthenticated: vi.fn().mockReturnValue(true),
        getHeaders: vi.fn().mockResolvedValue({ 'Authorization': 'Bearer test' }),
        refresh: vi.fn().mockResolvedValue(undefined),
        handleAuthError: vi.fn().mockReturnValue(false),
        ...overrides,
    } as IAuthProvider;
}

describe('ProviderAuthGuard', () => {
    let inner: IAuthProvider;
    let guard: ProviderAuthGuard;

    beforeEach(() => {
        inner = createMockAuth();
        guard = new ProviderAuthGuard(inner);
    });

    // ── Passthrough ─────────────────────────────────────────────────────

    describe('Passthrough', () => {
        it('should delegate isAuthenticated to inner when ready', () => {
            expect(guard.isAuthenticated()).toBe(true);
            expect(inner.isAuthenticated).toHaveBeenCalled();
        });

        it('should delegate getHeaders to inner', async () => {
            const headers = await guard.getHeaders();
            expect(headers['Authorization']).toBe('Bearer test');
            expect(inner.getHeaders).toHaveBeenCalled();
        });

        it('should handleAuthError on inner', () => {
            const err = new Error('expired token');
            const result = guard.handleAuthError(err);
            expect(result).toBe(false);
            expect(inner.handleAuthError).toHaveBeenCalledWith(err);
        });
    });

    // ── Refresh deduplication ────────────────────────────────────────────

    describe('Refresh deduplication', () => {
        it('should call inner.refresh() once', async () => {
            await guard.refresh();
            expect(inner.refresh).toHaveBeenCalledTimes(1);
        });

        it('should resolve multiple callers with a single refresh', async () => {
            // Slow refresh that takes 100ms
            const slowInner = createMockAuth({
                refresh: vi.fn().mockImplementation(
                    () => new Promise(resolve => setTimeout(resolve, 100))
                ),
            });
            const slowGuard = new ProviderAuthGuard(slowInner);

            // Fire 5 simultaneous refresh calls
            const promises = Array.from({ length: 5 }, () => slowGuard.refresh());
            await Promise.all(promises);

            // Only ONE actual refresh happened
            expect(slowInner.refresh).toHaveBeenCalledTimes(1);
        });

        it('should resolve all callers with the same result on success', async () => {
            const slowInner = createMockAuth({
                refresh: vi.fn().mockImplementation(
                    () => new Promise(resolve => setTimeout(resolve, 50))
                ),
            });
            const slowGuard = new ProviderAuthGuard(slowInner);

            const results = await Promise.allSettled([
                slowGuard.refresh(),
                slowGuard.refresh(),
                slowGuard.refresh(),
            ]);

            expect(results.every(r => r.status === 'fulfilled')).toBe(true);
            expect(slowInner.refresh).toHaveBeenCalledTimes(1);
        });

        it('should reject all callers on refresh failure', async () => {
            const failingInner = createMockAuth({
                refresh: vi.fn().mockRejectedValue(new Error('SSO failed')),
            });
            const failingGuard = new ProviderAuthGuard(failingInner);

            const promises = Array.from({ length: 3 }, () => failingGuard.refresh());
            const results = await Promise.allSettled(promises);

            expect(results.every(r => r.status === 'rejected')).toBe(true);
            expect(failingInner.refresh).toHaveBeenCalledTimes(1);
        });
    });

    // ── State machine ────────────────────────────────────────────────────

    describe('State machine', () => {
        it('should report not authenticated after handleAuthError returns true', () => {
            const err = new Error('ExpiredTokenException');
            const innerWithHandler = createMockAuth({
                handleAuthError: vi.fn().mockReturnValue(true),
                isAuthenticated: vi.fn().mockReturnValue(false),
            });
            const g = new ProviderAuthGuard(innerWithHandler);

            g.handleAuthError(err);
            expect(g.isAuthenticated()).toBe(false);
        });

        it('should recover from failed state on next refresh', async () => {
            // First refresh fails
            const innerWithFail = createMockAuth({
                refresh: vi.fn()
                    .mockRejectedValueOnce(new Error('Network error'))
                    .mockResolvedValueOnce(undefined),
            });
            const failingGuard = new ProviderAuthGuard(innerWithFail);

            // First attempt fails
            await expect(failingGuard.refresh()).rejects.toThrow('Network error');

            // Inner's isAuthenticated still returns true for a "ready" auth
            // But the guard's state was "failed" and reset to "ready"
            expect(failingGuard.isAuthenticated()).toBe(true);

            // Second attempt succeeds (mock returns undefined now)
            await failingGuard.refresh();
            expect(innerWithFail.refresh).toHaveBeenCalledTimes(2);
        });

        it('should allow refresh after error and return to ready state', async () => {
            const innerWithRefresh = createMockAuth({
                refresh: vi.fn()
                    .mockRejectedValueOnce(new Error('fail'))
                    .mockResolvedValueOnce(undefined),
            });
            const g = new ProviderAuthGuard(innerWithRefresh);

            await expect(g.refresh()).rejects.toThrow('fail');
            expect(() => g.isAuthenticated()).not.toThrow();
            await g.refresh();
            expect(innerWithRefresh.refresh).toHaveBeenCalledTimes(2);
        });
    });

    // ── Queue mechanics ─────────────────────────────────────────────────

    describe('Queue mechanics', () => {
        it('should queue callers during a slow refresh', async () => {
            let resolveRefresh: () => void = () => {};
            const controlledInner = createMockAuth({
                refresh: vi.fn().mockImplementation(
                    () => new Promise<void>(resolve => { resolveRefresh = resolve; })
                ),
            });
            const controlledGuard = new ProviderAuthGuard(controlledInner);

            // Start refresh
            const promise1 = controlledGuard.refresh();

            // While it's pending, queue more callers
            const promise2 = controlledGuard.refresh();
            const promise3 = controlledGuard.refresh();

            // All should be pending
            expect(controlledInner.refresh).toHaveBeenCalledTimes(1);

            // Complete the refresh
            resolveRefresh();
            await Promise.all([promise1, promise2, promise3]);

            expect(controlledInner.refresh).toHaveBeenCalledTimes(1);
        });

        it('should resolve queue waiters with existing promise when available', async () => {
            let resolveRefresh: () => void = () => {};
            const slowInner = createMockAuth({
                refresh: vi.fn().mockImplementation(
                    () => new Promise<void>(resolve => { resolveRefresh = resolve; })
                ),
            });
            const slowGuard = new ProviderAuthGuard(slowInner);

            // First caller starts refresh
            const p1 = slowGuard.refresh();

            // Grab the stored promise before second caller
            const p2 = slowGuard.refresh();

            // Resolve
            resolveRefresh();
            await Promise.all([p1, p2]);

            expect(slowInner.refresh).toHaveBeenCalledTimes(1);
        });
    });

    // ── Cleanup / delegation ─────────────────────────────────────────────

    describe('Delegation', () => {
        it('should delegate getCredentials to inner', () => {
            const withCreds = createMockAuth() as any;
            withCreds.getCredentials = vi.fn().mockReturnValue({ accessKeyId: 'AKI...' });
            const g = new ProviderAuthGuard(withCreds);
            expect(g.getCredentials().accessKeyId).toBe('AKI...');
        });

        it('should delegate getProfile and getRegion to inner', () => {
            const withMeta = createMockAuth() as any;
            withMeta.getProfile = vi.fn().mockReturnValue('my-profile');
            withMeta.getRegion = vi.fn().mockReturnValue('us-west-2');
            const g = new ProviderAuthGuard(withMeta);
            expect(g.getProfile()).toBe('my-profile');
            expect(g.getRegion()).toBe('us-west-2');
        });
    });
});
