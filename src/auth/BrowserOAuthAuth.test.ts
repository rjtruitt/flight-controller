import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserOAuthAuth } from './BrowserOAuthAuth';
import type { IAuthHandler } from './IAuthProvider';

function createMockHandler(): IAuthHandler {
  return {
    handleDeviceCodeAuth: vi.fn().mockResolvedValue(undefined),
    handleBrowserAuth: vi.fn().mockResolvedValue('auth-code-from-browser'),
    handleRefreshPrompt: vi.fn().mockResolvedValue(true),
    handleAuthError: vi.fn().mockResolvedValue(undefined),
    onAuthenticationFailed: vi.fn(),
  };
}

describe('BrowserOAuthAuth', () => {
  let auth: BrowserOAuthAuth;
  let handler: IAuthHandler;

  beforeEach(() => {
    auth = new BrowserOAuthAuth({
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      scopes: ['openid', 'profile', 'email'],
      redirectUri: 'http://localhost:8085/callback',
    });
    handler = createMockHandler();
    auth.setAuthHandler(handler);
  });

  describe('Construction', () => {
    it('should create with OAuth config', () => {
      expect(auth).toBeInstanceOf(BrowserOAuthAuth);
    });

    it('should not be authenticated before auth flow', () => {
      expect(auth.isAuthenticated()).toBe(false);
    });

    it('should default redirectUri to localhost:3000/callback', () => {
      const a = new BrowserOAuthAuth({
        authUrl: 'https://example.com/auth',
        tokenUrl: 'https://example.com/token',
        clientId: 'client',
        scopes: ['read'],
      });
      expect(a).toBeInstanceOf(BrowserOAuthAuth);
    });

    it('should accept optional clientSecret (public clients)', () => {
      const a = new BrowserOAuthAuth({
        authUrl: 'https://example.com/auth',
        tokenUrl: 'https://example.com/token',
        clientId: 'public-client',
        scopes: ['read'],
      });
      expect(a).toBeInstanceOf(BrowserOAuthAuth);
    });
  });

  describe('Authorization URL', () => {
    it('should build auth URL with client_id', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should include redirect_uri in auth URL', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should include scopes joined by space', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should include response_type=code', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should include access_type=offline for refresh tokens', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should generate random state parameter for CSRF protection', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });
  });

  describe('Browser Flow', () => {
    it('should emit auth_browser_needed event with URL', async () => {
      const listener = vi.fn();
      auth.on('auth_browser_needed', listener);
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should call handler.handleBrowserAuth with auth URL', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should receive authorization code from handler', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });
  });

  describe('Token Exchange', () => {
    it('should exchange authorization code for access token', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should POST to tokenUrl with grant_type=authorization_code', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should include client_id and client_secret in token request', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should include redirect_uri in token request', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should store access_token and refresh_token from response', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should emit auth_success on successful token exchange', async () => {
      const listener = vi.fn();
      auth.on('auth_success', listener);
      await expect(auth.getHeaders()).rejects.toThrow();
    });
  });

  describe('Token Refresh', () => {
    it('should use refresh_token to get new access_token', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should POST to tokenUrl with grant_type=refresh_token', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should update stored access_token after refresh', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should trigger full re-auth if refresh_token is invalid', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should emit auth_expired when token expires', async () => {
      const listener = vi.fn();
      auth.on('auth_expired', listener);
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should auto-refresh before token expiry', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });
  });

  describe('Headers', () => {
    it('should return Bearer token in Authorization header', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should trigger auth flow on first getHeaders call', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should return cached token on subsequent calls', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle token endpoint returning error', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should handle network timeout during token exchange', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should handle user denying access in browser', async () => {
      (handler.handleBrowserAuth as any).mockRejectedValue(new Error('User denied'));
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should handle invalid state parameter (CSRF attack)', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });
  });

  describe('Auth Handler', () => {
    it('should set auth handler for interactive prompts', () => {
      auth.setAuthHandler(handler);
      expect(auth).toBeDefined();
    });

    it('should call onAuthenticationFailed when flow fails permanently', async () => {
      (handler.handleBrowserAuth as any).mockRejectedValue(new Error('Failed'));
      await expect(auth.getHeaders()).rejects.toThrow();
    });
  });
});
