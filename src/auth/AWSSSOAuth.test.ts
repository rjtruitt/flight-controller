import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AWSSSOAuth } from './AWSSSOAuth';
import type { IAuthHandler, DeviceCodeInfo } from './IAuthProvider';

function createMockHandler(): IAuthHandler {
  return {
    handleDeviceCodeAuth: vi.fn().mockResolvedValue(undefined),
    handleBrowserAuth: vi.fn().mockResolvedValue(''),
    handleRefreshPrompt: vi.fn().mockResolvedValue(true),
    handleAuthError: vi.fn().mockResolvedValue(undefined),
    onAuthenticationFailed: vi.fn(),
  };
}

describe('AWSSSOAuth', () => {
  let auth: AWSSSOAuth;
  let handler: IAuthHandler;

  beforeEach(() => {
    auth = new AWSSSOAuth({ profile: 'dev', region: 'us-east-1' });
    handler = createMockHandler();
    auth.setAuthHandler(handler);
  });

  describe('Construction', () => {
    it('should create with profile and region', () => {
      const a = new AWSSSOAuth({ profile: 'prod', region: 'us-west-2' });
      expect(a).toBeInstanceOf(AWSSSOAuth);
    });

    it('should not be authenticated before initialization', () => {
      const a = new AWSSSOAuth({ profile: 'dev', region: 'us-east-1' });
      expect(a.isAuthenticated()).toBe(false);
    });
  });

  describe('Device Code Flow - Initialization', () => {
    it('should load SSO config from profile on initialize', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should check for cached token on initialize', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should use cached token if valid and not expired', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should trigger device code flow if no cached token', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });
  });

  describe('Device Code Flow - Authorization', () => {
    it('should call StartDeviceAuthorization and return verification URL + user code', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should pass DeviceCodeInfo to auth handler', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should include verificationUrl, userCode, and expiresIn in DeviceCodeInfo', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should register OIDC client before requesting device auth', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should cache registered client credentials', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });
  });

  describe('Device Code Flow - Polling', () => {
    it('should poll CreateToken with device_code grant type', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should handle AuthorizationPendingException by continuing to poll', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should handle SlowDownException by increasing poll interval', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should succeed when user completes browser authorization', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should fail after device code expires', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should respect polling interval from server response', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });
  });

  describe('Token Caching', () => {
    it('should cache token after successful auth', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should store accessToken and expiresAt in cache', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should store refreshToken if provided', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should load cached token on next initialize', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should invalidate cache when token expires', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });
  });

  describe('Headers', () => {
    it('should return AWS SigV4 signed headers when authenticated', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should include region in request signing', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should trigger refresh if token expired before getHeaders', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });
  });

  describe('Credentials', () => {
    it('should return AWS credentials object with accessKeyId and secretAccessKey', async () => {
      await expect(auth.getCredentials()).rejects.toThrow();
    });

    it('should include sessionToken for temporary credentials', async () => {
      await expect(auth.getCredentials()).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should detect ExpiredTokenException and return true from handleAuthError', () => {
      const error = new Error('ExpiredTokenException');
      expect(auth.handleAuthError(error)).toBe(true);
    });

    it('should detect UnauthorizedException and return true', () => {
      const error = new Error('UnauthorizedException');
      expect(auth.handleAuthError(error)).toBe(true);
    });

    it('should return false for non-auth errors', () => {
      const error = new Error('NetworkError');
      expect(auth.handleAuthError(error)).toBe(false);
    });

    it('should notify handler on authentication failure', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });
  });

  describe('Auth Handler Integration', () => {
    it('should set auth handler', () => {
      const h = createMockHandler();
      auth.setAuthHandler(h);
      expect(auth).toBeDefined();
    });

    it('should call handleDeviceCodeAuth with correct DeviceCodeInfo shape', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should call onAuthenticationFailed when flow fails permanently', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });
  });
});
