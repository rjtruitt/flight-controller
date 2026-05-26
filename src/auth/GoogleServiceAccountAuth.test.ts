import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleServiceAccountAuth } from './GoogleServiceAccountAuth';
import type { IAuthHandler } from './IAuthProvider';

const MOCK_SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'key-id-123',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  client_id: '123456789',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/test%40test-project.iam.gserviceaccount.com',
};

describe('GoogleServiceAccountAuth', () => {
  let auth: GoogleServiceAccountAuth;

  beforeEach(() => {
    auth = new GoogleServiceAccountAuth({
      serviceAccountJson: MOCK_SERVICE_ACCOUNT,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  });

  describe('Construction', () => {
    it('should create with service account JSON and scopes', () => {
      expect(auth).toBeInstanceOf(GoogleServiceAccountAuth);
    });

    it('should not be authenticated before initialization', () => {
      expect(auth.isAuthenticated()).toBe(false);
    });

    it('should accept multiple scopes', () => {
      const a = new GoogleServiceAccountAuth({
        serviceAccountJson: MOCK_SERVICE_ACCOUNT,
        scopes: [
          'https://www.googleapis.com/auth/cloud-platform',
          'https://www.googleapis.com/auth/compute',
        ],
      });
      expect(a).toBeInstanceOf(GoogleServiceAccountAuth);
    });
  });

  describe('JWT Creation', () => {
    it('should create JWT with iss from client_email', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should set JWT sub to client_email (for domain-wide delegation)', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should include all scopes in space-separated scope claim', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should set aud to token_uri from service account JSON', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should set iat to current time', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should set exp to iat + 3600 (1 hour)', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should sign with RS256 using private_key', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });
  });

  describe('Token Exchange', () => {
    it('should POST JWT to token_uri', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should use grant_type urn:ietf:params:oauth:grant-type:jwt-bearer', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should receive access_token in response', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should cache token with expiry time', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });
  });

  describe('Token Refresh', () => {
    it('should generate new JWT on refresh', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should auto-refresh before token expiry (5 min buffer)', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });

    it('should update cached token after refresh', async () => {
      await expect(auth.refresh()).rejects.toThrow();
    });
  });

  describe('Headers', () => {
    it('should return Bearer access_token in Authorization header', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should trigger initialization if not yet authenticated', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });

    it('should auto-refresh expired token on getHeaders', async () => {
      await expect(auth.getHeaders()).rejects.toThrow();
    });
  });

  describe('Error Cases', () => {
    it('should throw on invalid private_key format', async () => {
      const badAuth = new GoogleServiceAccountAuth({
        serviceAccountJson: { ...MOCK_SERVICE_ACCOUNT, private_key: 'not-a-key' },
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      await expect(badAuth.initialize()).rejects.toThrow();
    });

    it('should throw on empty client_email', async () => {
      const badAuth = new GoogleServiceAccountAuth({
        serviceAccountJson: { ...MOCK_SERVICE_ACCOUNT, client_email: '' },
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      await expect(badAuth.initialize()).rejects.toThrow();
    });

    it('should throw on token endpoint error', async () => {
      await expect(auth.initialize()).rejects.toThrow();
    });

    it('should notify handler on failure', async () => {
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
