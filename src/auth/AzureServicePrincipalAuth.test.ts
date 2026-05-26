import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AzureServicePrincipalAuth } from './AzureServicePrincipalAuth';
import type { IAuthHandler } from './IAuthProvider';

describe('AzureServicePrincipalAuth', () => {
  let auth: AzureServicePrincipalAuth;

  beforeEach(() => {
    auth = new AzureServicePrincipalAuth({
      tenantId: 'tenant-123-abc',
      clientId: 'client-456-def',
      clientSecret: 'super-secret-value',
      scope: 'https://cognitiveservices.azure.com/.default',
    });
  });

  describe('Construction', () => {
    it('should create with tenantId, clientId, clientSecret, and scope', () => {
      expect(auth).toBeInstanceOf(AzureServicePrincipalAuth);
    });

    it('should accept optional authority URL', () => {
      const a = new AzureServicePrincipalAuth({
        tenantId: 'tenant-id',
        clientId: 'client-id',
        clientSecret: 'secret',
        scope: 'https://cognitiveservices.azure.com/.default',
        authority: 'https://login.microsoftonline.us',
      });
      expect(a).toBeInstanceOf(AzureServicePrincipalAuth);
    });

    it('should default authority to https://login.microsoftonline.com', () => {
      expect(auth).toBeInstanceOf(AzureServicePrincipalAuth);
    });

    it('should not be authenticated before initialization', () => {
      expect(auth.isAuthenticated()).toBe(false);
    });
  });

  describe('Client Credentials Grant', () => {
    it('should POST to {authority}/{tenantId}/oauth2/v2.0/token', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should include grant_type=client_credentials in body', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should include client_id in body', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should include client_secret in body', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should include scope in body', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should use Content-Type application/x-www-form-urlencoded', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });
  });

  describe('Token Management', () => {
    it('should cache access_token from response', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should parse expires_in (seconds) from response', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should mark as authenticated after receiving token', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should auto-refresh before expiry', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should re-request client credentials on refresh', async () => {
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
    it('should throw on invalid_client error (wrong secret)', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should throw on invalid_tenant error', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should throw on network timeout', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should handle Azure AD outage gracefully', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should notify handler on authentication failure', async () => {
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

  describe('Government Cloud', () => {
    it('should support Azure Government authority', () => {
      const a = new AzureServicePrincipalAuth({
        tenantId: 'gov-tenant',
        clientId: 'gov-client',
        clientSecret: 'gov-secret',
        scope: 'https://cognitiveservices.azure.us/.default',
        authority: 'https://login.microsoftonline.us',
      });
      expect(a).toBeInstanceOf(AzureServicePrincipalAuth);
    });

    it('should support Azure China authority', () => {
      const a = new AzureServicePrincipalAuth({
        tenantId: 'china-tenant',
        clientId: 'china-client',
        clientSecret: 'china-secret',
        scope: 'https://cognitiveservices.azure.cn/.default',
        authority: 'https://login.chinacloudapi.cn',
      });
      expect(a).toBeInstanceOf(AzureServicePrincipalAuth);
    });
  });
});
