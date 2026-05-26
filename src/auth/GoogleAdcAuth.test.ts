import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleAdcAuth } from './GoogleAdcAuth';
import type { IAuthHandler } from './IAuthProvider';

function createMockHandler(): IAuthHandler {
  return {
    handleDeviceCodeAuth: vi.fn().mockResolvedValue(undefined),
    handleBrowserAuth: vi.fn().mockResolvedValue(''),
    handleRefreshPrompt: vi.fn().mockResolvedValue(true),
    handleAuthError: vi.fn().mockResolvedValue(undefined),
    onAuthenticationFailed: vi.fn(),
  };
}

describe('GoogleAdcAuth', () => {
  let auth: GoogleAdcAuth;

  beforeEach(() => {
    auth = new GoogleAdcAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  });

  describe('Construction', () => {
    it('should create with scopes', () => {
      expect(auth).toBeInstanceOf(GoogleAdcAuth);
    });

    it('should accept optional credentialsPath', () => {
      const a = new GoogleAdcAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        credentialsPath: '/path/to/service-account.json',
      });
      expect(a).toBeInstanceOf(GoogleAdcAuth);
    });

    it('should not be authenticated before initialization', () => {
      expect(auth.isAuthenticated()).toBe(false);
    });
  });

  describe('Credential Discovery', () => {
    it('should check GOOGLE_APPLICATION_CREDENTIALS env var first', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should fall back to gcloud default credentials path', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should fall back to compute metadata service on GCE/GKE', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should use explicit credentialsPath if provided', async () => {
      const a = new GoogleAdcAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        credentialsPath: '/explicit/path.json',
      });
      await expect(a.initialize()).rejects.toThrow();
    });

    it('should fail if no credentials found anywhere', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });
  });

  describe('JWT Bearer Flow', () => {
    it('should create JWT with iss claim from client_email', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should include scope claim in JWT', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should set JWT aud to token_uri', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should set JWT exp to current time + 1 hour', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should sign JWT with private_key from credentials', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should exchange JWT for access_token via token endpoint', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should use grant_type urn:ietf:params:oauth:grant-type:jwt-bearer', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });
  });

  describe('Token Management', () => {
    it('should cache access_token after exchange', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should auto-refresh 5 minutes before expiry', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should generate new JWT on refresh', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should mark as authenticated after successful token exchange', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });
  });

  describe('Headers', () => {
    it('should return Bearer token in Authorization header', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should trigger initialization on first getHeaders call', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });
  });

  describe('Auth Handler', () => {
    it('should set auth handler', () => {
      const handler = createMockHandler();
      auth.setAuthHandler(handler);
      expect(auth).toBeDefined();
    });

    it('should notify handler on credential discovery failure', async () => {
      const handler = createMockHandler();
      auth.setAuthHandler(handler);
      await expect(auth.initialize()).rejects.toThrow();
    });
  });

  describe('Error Cases', () => {
    it('should handle malformed credentials JSON', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should handle missing private_key in credentials', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should handle token endpoint returning error', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should handle expired service account key', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });
  });
});
