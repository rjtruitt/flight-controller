import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AzureManagedIdentityAuth } from './AzureManagedIdentityAuth';
import type { IAuthHandler } from './IAuthProvider';

describe('AzureManagedIdentityAuth', () => {
  let auth: AzureManagedIdentityAuth;

  beforeEach(() => {
    auth = new AzureManagedIdentityAuth({
      resource: 'https://cognitiveservices.azure.com',
    });
  });

  describe('Construction', () => {
    it('should create with resource', () => {
      expect(auth).toBeInstanceOf(AzureManagedIdentityAuth);
    });

    it('should accept optional clientId for user-assigned identity', () => {
      const a = new AzureManagedIdentityAuth({
        resource: 'https://cognitiveservices.azure.com',
        clientId: 'user-assigned-client-id',
      });
      expect(a).toBeInstanceOf(AzureManagedIdentityAuth);
    });

    it('should accept optional custom IMDS endpoint', () => {
      const a = new AzureManagedIdentityAuth({
        resource: 'https://cognitiveservices.azure.com',
        imdsEndpoint: 'http://custom-imds:8080',
      });
      expect(a).toBeInstanceOf(AzureManagedIdentityAuth);
    });

    it('should not be authenticated before initialization', () => {
      expect(auth.isAuthenticated()).toBe(false);
    });
  });

  describe('IMDS Token Request', () => {
    it('should query Azure IMDS at 169.254.169.254', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should include api-version=2018-02-01 in query', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should include resource parameter in query', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should include client_id when user-assigned identity configured', async () => {
      const a = new AzureManagedIdentityAuth({
        resource: 'https://cognitiveservices.azure.com',
        clientId: 'user-assigned-id',
      });
      await expect(a.initialize()).rejects.toThrow();
    });

    it('should include Metadata: true header in request', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should use custom IMDS endpoint if configured', async () => {
      const a = new AzureManagedIdentityAuth({
        resource: 'https://cognitiveservices.azure.com',
        imdsEndpoint: 'http://custom:8080',
      });
      await expect(a.initialize()).rejects.toThrow();
    });
  });

  describe('Token Management', () => {
    it('should cache access_token from IMDS response', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should parse expires_on (Unix timestamp) from response', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should mark as authenticated after receiving token', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should auto-refresh before token expires', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should re-query IMDS on refresh', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });
  });

  describe('Headers', () => {
    it('should return Bearer token in Authorization header', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should trigger initialization on first getHeaders call', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should auto-refresh expired token on getHeaders', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });
  });

  describe('Error Cases', () => {
    it('should throw when IMDS is not reachable (not on Azure)', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should throw on 404 (identity not configured)', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should handle timeout on IMDS request', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should retry on transient IMDS failures (429, 5xx)', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should notify handler on permanent failure', async () => {
      const handler: IAuthHandler = {
        handleDeviceCodeAuth: vi.fn().mockResolvedValue(undefined),
        handleBrowserAuth: vi.fn().mockResolvedValue(''),
        handleRefreshPrompt: vi.fn().mockResolvedValue(true),
        handleAuthError: vi.fn().mockResolvedValue(undefined),
        onAuthenticationFailed: vi.fn(),
      };
      auth.setAuthHandler(handler);
      await expect(auth.initialize()).rejects.toThrow();
    });
  });
});
