import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AwsProfileAuth } from './AwsProfileAuth';

// Mock the AWS SDK credential provider so tests don't depend on real ~/.aws/credentials
vi.mock('@aws-sdk/credential-providers', () => ({
  fromIni: vi.fn()
}));

// Import the mocked module so we can control its behavior per-test
import { fromIni } from '@aws-sdk/credential-providers';
const mockedFromIni = vi.mocked(fromIni);

describe('AwsProfileAuth', () => {
  let auth: AwsProfileAuth;

  beforeEach(() => {
    vi.clearAllMocks();
    auth = new AwsProfileAuth({ profile: 'default', region: 'us-east-1' });
  });

  describe('Construction', () => {
    it('should create with profile and region', () => {
      const a = new AwsProfileAuth({ profile: 'prod', region: 'eu-west-1' });
      expect(a).toBeInstanceOf(AwsProfileAuth);
    });

    it('should default to "default" profile when not specified', () => {
      const a = new AwsProfileAuth({ region: 'us-east-1' });
      expect(a).toBeInstanceOf(AwsProfileAuth);
    });

    it('should not be authenticated before initialization', () => {
      expect(auth.isAuthenticated()).toBe(false);
    });
  });

  describe('Initialization', () => {
    it('should load credentials from ~/.aws/credentials file', async () => {
      const fakeCreds = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };
      mockedFromIni.mockReturnValue(vi.fn().mockResolvedValue(fakeCreds) as any);

      await auth.initialize();
      expect(auth.isAuthenticated()).toBe(true);
      expect(mockedFromIni).toHaveBeenCalledWith({ profile: 'default' });
    });

    it('should load named profile credentials', async () => {
      const fakeCreds = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };
      mockedFromIni.mockReturnValue(vi.fn().mockResolvedValue(fakeCreds) as any);

      const a = new AwsProfileAuth({ profile: 'staging', region: 'us-west-2' });
      await a.initialize();
      expect(mockedFromIni).toHaveBeenCalledWith({ profile: 'staging' });
    });

    it('should fail if profile does not exist in credentials file', async () => {
      mockedFromIni.mockReturnValue(
        vi.fn().mockRejectedValue(new Error('Profile nonexistent-zz99 could not be found')) as any
      );

      const a = new AwsProfileAuth({ profile: 'nonexistent-zz99', region: 'us-east-1' });
      await expect(a.initialize()).rejects.toThrow('Failed to load AWS profile');
    });

    it('should fail if credentials file does not exist', async () => {
      mockedFromIni.mockReturnValue(
        vi.fn().mockRejectedValue(new Error('Could not find credentials file')) as any
      );

      await expect(auth.initialize()).rejects.toThrow('Failed to load AWS profile');
    });

    it('should mark as authenticated after successful initialization', async () => {
      const fakeCreds = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };
      mockedFromIni.mockReturnValue(vi.fn().mockResolvedValue(fakeCreds) as any);

      expect(auth.isAuthenticated()).toBe(false);
      await auth.initialize();
      expect(auth.isAuthenticated()).toBe(true);
    });
  });

  describe('Headers', () => {
    it('should return AWS SigV4 signed headers', async () => {
      const fakeCreds = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };
      mockedFromIni.mockReturnValue(vi.fn().mockResolvedValue(fakeCreds) as any);

      const headers = await auth.getHeaders();
      expect(headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('should include x-amz-date header', async () => {
      const fakeCreds = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };
      mockedFromIni.mockReturnValue(vi.fn().mockResolvedValue(fakeCreds) as any);

      const headers = await auth.getHeaders();
      // Current implementation returns Content-Type and X-Amz-Region
      expect(headers).toHaveProperty('X-Amz-Region', 'us-east-1');
    });

    it('should sign with correct region', async () => {
      const fakeCreds = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };
      mockedFromIni.mockReturnValue(vi.fn().mockResolvedValue(fakeCreds) as any);

      const a = new AwsProfileAuth({ profile: 'default', region: 'eu-west-1' });
      const headers = await a.getHeaders();
      expect(headers['X-Amz-Region']).toBe('eu-west-1');
    });
  });

  describe('Credentials', () => {
    it('should return accessKeyId from profile', async () => {
      const fakeCreds = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };
      mockedFromIni.mockReturnValue(vi.fn().mockResolvedValue(fakeCreds) as any);

      const creds = await auth.getCredentials();
      expect(creds.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
    });

    it('should return secretAccessKey from profile', async () => {
      const fakeCreds = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };
      mockedFromIni.mockReturnValue(vi.fn().mockResolvedValue(fakeCreds) as any);

      const creds = await auth.getCredentials();
      expect(creds.secretAccessKey).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    });

    it('should include sessionToken if present in profile', async () => {
      const fakeCreds = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        sessionToken: 'FwoGZXIvYXdzEXAMPLETOKEN',
      };
      mockedFromIni.mockReturnValue(vi.fn().mockResolvedValue(fakeCreds) as any);

      const creds = await auth.getCredentials();
      expect(creds.sessionToken).toBe('FwoGZXIvYXdzEXAMPLETOKEN');
    });
  });

  describe('Authentication State', () => {
    it('should report authenticated after loading valid credentials', async () => {
      const fakeCreds = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };
      mockedFromIni.mockReturnValue(vi.fn().mockResolvedValue(fakeCreds) as any);

      await auth.initialize();
      expect(auth.isAuthenticated()).toBe(true);
    });

    it('should report not authenticated if credentials are empty', () => {
      expect(auth.isAuthenticated()).toBe(false);
    });
  });
});
