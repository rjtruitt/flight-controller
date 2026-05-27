/**
 * ProviderAuthGuard — deduplicating mutex wrapper for IAuthProvider.
 *
 * Prevents the "5 agents, 5 popups" problem: when multiple callers trigger
 * refresh() on the same auth provider simultaneously, only ONE refresh flow
 * runs. All other callers wait for that single refresh to complete.
 *
 * State machine:
 *   ready → refreshing (on first refresh() call)
 *   refreshing → ready (on success)
 *   refreshing → failed (on error — resets to ready after rejection)
 *
 * Usage:
 *   const guarded = new ProviderAuthGuard(awsAuth);
 *   await guarded.refresh();  // Only one caller actually refreshes
 */
import { IAuthProvider, IAuthHandler } from './IAuthProvider.js';

type AuthState = 'ready' | 'refreshing' | 'failed';

interface Waiter {
    resolve: () => void;
    reject: (err: Error) => void;
}

export class ProviderAuthGuard implements IAuthProvider {
    private state: AuthState = 'ready';
    private waiters: Waiter[] = [];
    private currentRefreshPromise: Promise<void> | null = null;

    constructor(private inner: IAuthProvider) {}

    setAuthHandler(handler: IAuthHandler): void {
        if ('setAuthHandler' in this.inner) {
            (this.inner as any).setAuthHandler?.(handler);
        }
    }

    isAuthenticated(): boolean {
        return this.state === 'ready' && this.inner.isAuthenticated();
    }

    async getHeaders(): Promise<Record<string, string>> {
        return this.inner.getHeaders();
    }

    /**
     * Deduplicated refresh. If a refresh is already in progress,
     * queue this caller to be resolved/rejected when it completes.
     * Only ONE caller actually triggers the underlying refresh.
     */
    async refresh(): Promise<void> {
        // Fast path: no refresh in progress, just do it
        if (this.state === 'ready') {
            return this.doRefresh();
        }

        // Already refreshing — queue and wait
        if (this.state === 'refreshing') {
            return this.queueForRefresh();
        }

        // Failed state — reset and retry
        if (this.state === 'failed') {
            this.state = 'ready';
            return this.doRefresh();
        }

        return this.doRefresh();
    }

    private async doRefresh(): Promise<void> {
        this.state = 'refreshing';
        const promise = this.inner.refresh?.() ?? Promise.resolve();
        this.currentRefreshPromise = promise;

        try {
            await promise;
            this.state = 'ready';
            this.resolveWaiters();
        } catch (error) {
            this.state = 'failed';
            this.rejectWaiters(error as Error);
            // Reset state so next caller can retry
            this.state = 'ready';
            throw error;
        } finally {
            this.currentRefreshPromise = null;
        }
    }

    private async queueForRefresh(): Promise<void> {
        // If we already have a promise, wait on it
        if (this.currentRefreshPromise) {
            await this.currentRefreshPromise;
            return;
        }

        // Otherwise queue
        return new Promise<void>((resolve, reject) => {
            this.waiters.push({ resolve, reject });
        });
    }

    private resolveWaiters(): void {
        const w = this.waiters;
        this.waiters = [];
        for (const waiter of w) {
            waiter.resolve();
        }
    }

    private rejectWaiters(error: Error): void {
        const w = this.waiters;
        this.waiters = [];
        for (const waiter of w) {
            waiter.reject(error);
        }
    }

    handleAuthError(error: Error): boolean {
        if (this.inner.handleAuthError) {
            const result = this.inner.handleAuthError(error);
            if (result) {
                this.state = 'failed';
            }
            return result;
        }
        return false;
    }

    /** Delegate any other methods to inner provider. */
    getCredentials(): any {
        return (this.inner as any).getCredentials?.();
    }

    getProfile(): string | undefined {
        return (this.inner as any).getProfile?.();
    }

    getRegion(): string {
        return (this.inner as any).getRegion?.();
    }
}
