import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserOAuthAuth, type BrowserOAuthAuthConfig } from './BrowserOAuthAuth';
import type { IAuthHandler } from './IAuthProvider';

// ── Helpers ───────────────────────────────────────────────────────────────

function createMockHandler(): IAuthHandler {
  return {
    handleDeviceCodeAuth: vi.fn().mockResolvedValue(undefined),
    handleBrowserAuth: vi.fn().mockResolvedValue('auth-code-from-browser'),
    handleRefreshPrompt: vi.fn().mockResolvedValue(true),
    handleAuthError: vi.fn().mockResolvedValue(undefined),
    onAuthenticationFailed: vi.fn(),
  };
}

function makeConfig(overrides?: Partial<BrowserOAuthAuthConfig>): BrowserOAuthAuthConfig {
  return {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    scopes: ['openid', 'profile', 'email'],
    redirectUri: 'http://localhost:8085/callback',
    ...overrides,
  };
}

/** Wait for auth_browser_needed event, then inject a manual auth code. */
async function autoInjectCode(
  auth: BrowserOAuthAuth,
  code = 'test-auth-code',
  mockToken?: boolean,
): Promise<void> {
  const eventReceived = new Promise<void>((resolve) => {
    auth.on('auth_browser_needed', () => {
      // Wait a tick for manualCodeResolver to be set up
      setTimeout(() => {
        auth.handleManualAuthCode(code);
        resolve();
      }, 10);
    });
  });
  await eventReceived;
}

describe('BrowserOAuthAuth', () => {
  let auth: BrowserOAuthAuth;
  let handler: IAuthHandler;

  beforeEach(() => {
    handler = createMockHandler();
    auth = new BrowserOAuthAuth(makeConfig());
    auth.setAuthHandler(handler);
  });

  afterEach(() => {
    auth.cleanup();
  });

  // ── Construction ───────────────────────────────────────────────────────

  describe('Construction', () => {
    it('should create with complete OAuth config', () => {
      expect(auth).toBeInstanceOf(BrowserOAuthAuth);
    });

    it('should not be authenticated before any flow', () => {
      expect(auth.isAuthenticated()).toBe(false);
    });

    it('should accept config without clientSecret (public client / PKCE)', () => {
      const pub = new BrowserOAuthAuth(makeConfig({ clientSecret: undefined }));
      expect(pub).toBeInstanceOf(BrowserOAuthAuth);
      pub.cleanup();
    });

    it('should accept optional clientName', () => {
      const named = new BrowserOAuthAuth(makeConfig({ clientName: 'claude_code' }));
      expect(named).toBeInstanceOf(BrowserOAuthAuth);
      named.cleanup();
    });
  });

  // ── PKCE Crypto (tested via URL output) ───────────────────────────────

  describe('PKCE Crypto', () => {
    it('should include code_challenge and code_challenge_method=S256 in auth URL', async () => {
      const urlPromise = captureAutoUrl(auth);
      auth.getHeaders().catch(() => {});
      const url = await urlPromise;
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')!.length).toBe(43);
    });

    it('should include state parameter for CSRF protection', async () => {
      const urlPromise = captureAutoUrl(auth);
      auth.getHeaders().catch(() => {});
      const url = await urlPromise;
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.get('state')!.length).toBe(43);
    });

    it('should generate different state values on each auth attempt', async () => {
      // First attempt
      auth.getHeaders().catch(() => {});
      const url1 = await captureAutoUrl(auth);
      const state1 = url1.searchParams.get('state');

      // Second attempt with new instance
      const auth2 = new BrowserOAuthAuth(makeConfig());
      auth2.getHeaders().catch(() => {});
      const url2 = await captureAutoUrl(auth2);
      const state2 = url2.searchParams.get('state');
      auth2.cleanup();

      expect(state1).not.toBe(state2);
    });
  });

  // ── Auth URL Construction ─────────────────────────────────────────────

  describe('Auth URL Construction', () => {
    it('should include client_id in auth URL', async () => {
      auth.getHeaders().catch(() => {});
      const url = await captureAutoUrl(auth);
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
    });

    it('should include response_type=code', async () => {
      auth.getHeaders().catch(() => {});
      const url = await captureAutoUrl(auth);
      expect(url.searchParams.get('response_type')).toBe('code');
    });

    it('should include scopes joined by space', async () => {
      auth.getHeaders().catch(() => {});
      const url = await captureAutoUrl(auth);
      expect(url.searchParams.get('scope')).toBe('openid profile email');
    });

    it('should include access_type=offline for refresh tokens', async () => {
      auth.getHeaders().catch(() => {});
      const url = await captureAutoUrl(auth);
      expect(url.searchParams.get('access_type')).toBe('offline');
    });

    it('should use localhost redirect for automatic flow', async () => {
      auth.getHeaders().catch(() => {});
      const url = await captureAutoUrl(auth);
      const redirectUri = url.searchParams.get('redirect_uri')!;
      expect(redirectUri).toMatch(/^http:\/\/localhost:\d+\/callback$/);
    });

    it('should not include client_secret in auth URL', async () => {
      auth.getHeaders().catch(() => {});
      const url = await captureAutoUrl(auth);
      expect(url.searchParams.has('client_secret')).toBe(false);
    });
  });

  // ── Auth Code Listener ─────────────────────────────────────────────────

  describe('Auth Code Listener', () => {
    it('should start listener on OS-assigned port', async () => {
      auth.getHeaders().catch(() => {});
      const url = await captureAutoUrl(auth);
      const redirectUri = url.searchParams.get('redirect_uri') || '';
      const port = parseInt(new URL(redirectUri).port);
      expect(port).toBeGreaterThan(0);
    });

    it('should call handleBrowserAuth with automatic URL (localhost redirect)', async () => {
      auth.getHeaders().catch(() => {});
      await captureAutoUrl(auth);
      expect(handler.handleBrowserAuth).toHaveBeenCalled();
      const autoUrl = (handler.handleBrowserAuth as any).mock.calls[0][0];
      const redirectUri = new URL(autoUrl).searchParams.get('redirect_uri');
      expect(redirectUri).toMatch(/^http:\/\/localhost:\d+\/callback$/);
    });

    it('should resolve getHeaders when manual auth code is injected', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          access_token: 'manual-token',
          refresh_token: 'manual-refresh',
          expires_in: 3600,
        }), { status: 200 }),
      );

      const promise = auth.getHeaders();
      await autoInjectCode(auth, 'pasted-code');
      const headers = await promise;

      expect(headers['Authorization']).toBe('Bearer manual-token');
      expect(auth.isAuthenticated()).toBe(true);

      mockFetch.mockRestore();
    });
  });

  // ── State Validation ──────────────────────────────────────────────────

  describe('State Validation', () => {
    it('should emit auth_browser_needed event with URL', async () => {
      const listener = vi.fn();
      auth.on('auth_browser_needed', listener);
      auth.getHeaders().catch(() => {});
      await vi.waitFor(() => expect(listener).toHaveBeenCalled());
      const evt = listener.mock.calls[0][0];
      expect(evt.url).toBeTruthy();
      expect(evt.automaticUrl).toBeTruthy();
      expect(typeof evt.message).toBe('string');
    });
  });

  // ── Token Exchange (with mocked fetch) ─────────────────────────────────

  describe('Token Exchange', () => {
    it('should POST to tokenUrl with grant_type=authorization_code', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          access_token: 'code-token',
          refresh_token: 'code-refresh',
          expires_in: 3600,
        }), { status: 200 }),
      );

      const promise = auth.getHeaders();
      await autoInjectCode(auth, 'test-auth-code');
      await promise;

      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0];
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);

      expect(callUrl).toBe('https://oauth2.googleapis.com/token');
      expect(callBody.grant_type).toBe('authorization_code');
      expect(callBody.code).toBe('test-auth-code');

      mockFetch.mockRestore();
    });

    it('should include code_verifier in token request (PKCE)', async () => {
      let capturedBody: any;
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (_url, opts: any) => {
          capturedBody = JSON.parse(opts.body);
          return new Response(JSON.stringify({
            access_token: 'pkce-token',
            refresh_token: 'pkce-refresh',
            expires_in: 3600,
          }), { status: 200 });
        },
      );

      const promise = auth.getHeaders();
      await autoInjectCode(auth, 'pkce-code');
      await promise;

      expect(capturedBody.code_verifier).toBeTruthy();
      expect(typeof capturedBody.code_verifier).toBe('string');
      expect(capturedBody.code_verifier.length).toBe(43);

      mockFetch.mockRestore();
    });

    it('should NOT include client_secret when not configured (public client)', async () => {
      const pubAuth = new BrowserOAuthAuth(makeConfig({ clientSecret: undefined }));
      pubAuth.setAuthHandler(handler);

      let capturedBody: any;
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (_url, opts: any) => {
          capturedBody = JSON.parse(opts.body);
          return new Response(JSON.stringify({
            access_token: 'public-token',
            refresh_token: 'public-refresh',
            expires_in: 3600,
          }), { status: 200 });
        },
      );

      const promise = pubAuth.getHeaders();
      await autoInjectCode(pubAuth, 'public-code');
      await promise;

      expect(capturedBody.client_secret).toBeUndefined();
      expect(capturedBody.code_verifier).toBeTruthy();

      mockFetch.mockRestore();
      pubAuth.cleanup();
    });

    it('should store access_token and refresh_token from response', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          access_token: 'stored-access',
          refresh_token: 'stored-refresh',
          expires_in: 3600,
        }), { status: 200 }),
      );

      const promise = auth.getHeaders();
      await autoInjectCode(auth, 'store-code');
      const headers = await promise;

      expect(headers['Authorization']).toBe('Bearer stored-access');
      expect(auth.isAuthenticated()).toBe(true);

      mockFetch.mockRestore();
    });

    it('should emit auth_success on successful token exchange', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          access_token: 'success-token',
          refresh_token: 'success-refresh',
          expires_in: 3600,
        }), { status: 200 }),
      );

      const successListener = vi.fn();
      auth.on('auth_success', successListener);

      const promise = auth.getHeaders();
      await autoInjectCode(auth, 's-code');
      await promise;

      expect(successListener).toHaveBeenCalled();

      mockFetch.mockRestore();
    });
  });

  // ── Token Refresh ──────────────────────────────────────────────────────

  describe('Token Refresh', () => {
    it('should use refresh_token to get new access_token', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch');

      // First — token exchange
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          access_token: 'first-access',
          refresh_token: 'first-refresh',
          expires_in: 3600,
        }), { status: 200 }),
      );

      const p1 = auth.getHeaders();
      await autoInjectCode(auth, 'code1');
      await p1;

      // Second — refresh
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          access_token: 'refreshed-access',
          refresh_token: 'new-refresh',
          expires_in: 7200,
        }), { status: 200 }),
      );

      await auth.refresh();

      const refreshCall = mockFetch.mock.calls[1];
      const refreshBody = JSON.parse(refreshCall[1].body as string);
      expect(refreshBody.grant_type).toBe('refresh_token');
      expect(refreshBody.refresh_token).toBe('first-refresh');

      mockFetch.mockRestore();
    });

    it('should throw if no refresh token available', async () => {
      const authNoRefresh = new BrowserOAuthAuth(makeConfig());
      await expect(authNoRefresh.refresh()).rejects.toThrow('No refresh token');
      authNoRefresh.cleanup();
    });

    it('should auto-refresh when token expires', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch');

      // Exchange — token with -1s expiry (immediately expired)
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          access_token: 'expiring-token',
          refresh_token: 'expiring-refresh',
          expires_in: -1,
        }), { status: 200 }),
      );

      // Refresh returns new valid token
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          access_token: 'fresh-token',
          refresh_token: 'fresh-refresh',
          expires_in: 7200,
        }), { status: 200 }),
      );

      const p1 = auth.getHeaders();
      await autoInjectCode(auth, 'code2');
      await p1;

      // Token was already expired by time of exchange — getHeaders triggers refresh
      const headers = await auth.getHeaders();
      expect(headers['Authorization']).toBe('Bearer fresh-token');
      expect(auth.isAuthenticated()).toBe(true);

      mockFetch.mockRestore();
    });
  });

  // ── Headers ────────────────────────────────────────────────────────────

  describe('Headers', () => {
    it('should return Bearer token in Authorization header', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          access_token: 'bearer-token',
          refresh_token: 'ref-token',
          expires_in: 3600,
        }), { status: 200 }),
      );

      const promise = auth.getHeaders();
      await autoInjectCode(auth, 'h-code');
      const headers = await promise;

      expect(headers['Authorization']).toBe('Bearer bearer-token');
      expect(headers['Content-Type']).toBe('application/json');

      mockFetch.mockRestore();
    });

    it('should return cached token on subsequent calls', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          access_token: 'cached-token',
          refresh_token: 'ref-token',
          expires_in: 3600,
        }), { status: 200 }),
      );

      const p1 = auth.getHeaders();
      await autoInjectCode(auth, 'c-code');
      const h1 = await p1;
      const h2 = await auth.getHeaders();

      expect(h1['Authorization']).toBe('Bearer cached-token');
      expect(h2['Authorization']).toBe('Bearer cached-token');

      // Only one exchange call
      const exchangeCalls = mockFetch.mock.calls.filter(
        c => JSON.parse(c[1].body as string).grant_type === 'authorization_code'
      );
      expect(exchangeCalls.length).toBe(1);

      mockFetch.mockRestore();
    });
  });

  // ── Error Handling ─────────────────────────────────────────────────────

  describe('Error Handling', () => {
    it('should throw on token endpoint error', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{"error":"invalid_grant"}', { status: 400 }),
      );

      const promise = auth.getHeaders();
      await autoInjectCode(auth, 'bad-code');
      await expect(promise).rejects.toThrow();

      mockFetch.mockRestore();
    });

    it('should throw when handler rejects (user denied)', async () => {
      (handler.handleBrowserAuth as any).mockRejectedValue(new Error('User denied'));
      const promise = auth.getHeaders();
      // The listener will reject because handler.handleBrowserAuth rejects
      await expect(promise).rejects.toThrow();
    });

    it('should throw on token refresh failure', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch');

      // Exchange succeeds
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          access_token: 'exp-token',
          refresh_token: 'bad-refresh',
          expires_in: 0,
        }), { status: 200 }),
      );

      const p1 = auth.getHeaders();
      await autoInjectCode(auth, 'e-code');
      await p1;

      // Refresh fails
      mockFetch.mockResolvedValueOnce(
        new Response('{"error":"invalid_grant"}', { status: 400 }),
      );

      await expect(auth.getHeaders()).rejects.toThrow();

      mockFetch.mockRestore();
    });
  });

  // ── clientName ─────────────────────────────────────────────────────────

  describe('clientName', () => {
    it('should accept custom client name in config', () => {
      const named = new BrowserOAuthAuth(makeConfig({ clientName: 'claude_code' }));
      expect(named).toBeInstanceOf(BrowserOAuthAuth);
      named.cleanup();
    });

    it('should default to undefined when not set', () => {
      const a = new BrowserOAuthAuth(makeConfig({ clientName: undefined }));
      expect(a).toBeInstanceOf(BrowserOAuthAuth);
      a.cleanup();
    });
  });

  // ── Cleanup ────────────────────────────────────────────────────────────

  describe('Cleanup', () => {
    it('should clean up listener resources without throwing', () => {
      expect(() => auth.cleanup()).not.toThrow();
    });

    it('should allow multiple cleanup calls', () => {
      auth.cleanup();
      expect(() => auth.cleanup()).not.toThrow();
    });
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────

/** Capture the auth URL emitted by the auth_browser_needed event. */
function captureAutoUrl(auth: BrowserOAuthAuth): Promise<URL> {
  return new Promise((resolve) => {
    auth.on('auth_browser_needed', (evt: { automaticUrl: string }) => {
      resolve(new URL(evt.automaticUrl));
    });
  });
}
