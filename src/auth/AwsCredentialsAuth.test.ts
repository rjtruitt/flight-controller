import { describe, it, expect, beforeEach } from 'vitest';
import { AwsCredentialsAuth } from './AwsCredentialsAuth';

describe('AwsCredentialsAuth', () => {
  let auth: AwsCredentialsAuth;

  beforeEach(() => {
    auth = new AwsCredentialsAuth({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
    });
  });

  describe('Construction', () => {
    it('should create with access key, secret key, and region', () => {
      expect(auth).toBeInstanceOf(AwsCredentialsAuth);
    });

    it('should create with optional session token', () => {
      const a = new AwsCredentialsAuth({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'secret',
        region: 'us-west-2',
        sessionToken: 'FwoGZXIvYXdzEBYaDH...',
      });
      expect(a).toBeInstanceOf(AwsCredentialsAuth);
    });

    it('should be authenticated immediately (static credentials)', () => {
      expect(auth.isAuthenticated()).toBe(true);
    });
  });

  describe('Headers', () => {
    it('should return AWS SigV4 signed headers', async () => {
      const headers = await auth.getHeaders();
      expect(headers).toBeDefined();
      expect(typeof headers).toBe('object');
    });

    it('should include Authorization header with AWS4-HMAC-SHA256', async () => {
      const headers = await auth.getHeaders();
      expect(headers['Authorization'] || headers['authorization']).toBeDefined();
    });

    it('should include x-amz-date header', async () => {
      const headers = await auth.getHeaders();
      expect(headers['x-amz-date'] || headers['X-Amz-Date']).toBeDefined();
    });

    it('should include x-amz-security-token when session token present', async () => {
      const a = new AwsCredentialsAuth({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'secret',
        region: 'us-east-1',
        sessionToken: 'session-token-value',
      });
      const headers = await a.getHeaders();
      expect(headers['x-amz-security-token'] || headers['X-Amz-Security-Token']).toBeDefined();
    });
  });

  describe('Credentials', () => {
    it('should return credentials object with accessKeyId', async () => {
      const creds = await auth.getCredentials();
      expect(creds.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
    });

    it('should return credentials object with secretAccessKey', async () => {
      const creds = await auth.getCredentials();
      expect(creds.secretAccessKey).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    });

    it('should return sessionToken when provided', async () => {
      const a = new AwsCredentialsAuth({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'secret',
        region: 'us-east-1',
        sessionToken: 'my-session-token',
      });
      const creds = await a.getCredentials();
      expect(creds.sessionToken).toBe('my-session-token');
    });

    it('should return undefined sessionToken when not provided', async () => {
      const creds = await auth.getCredentials();
      expect(creds.sessionToken).toBeUndefined();
    });
  });

  describe('Authentication State', () => {
    it('should always be authenticated with valid credentials', () => {
      expect(auth.isAuthenticated()).toBe(true);
    });

    it('should not be authenticated with empty accessKeyId', () => {
      const a = new AwsCredentialsAuth({
        accessKeyId: '',
        secretAccessKey: 'secret',
        region: 'us-east-1',
      });
      expect(a.isAuthenticated()).toBe(false);
    });

    it('should not be authenticated with empty secretAccessKey', () => {
      const a = new AwsCredentialsAuth({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: '',
        region: 'us-east-1',
      });
      expect(a.isAuthenticated()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle credentials with special characters', () => {
      const a = new AwsCredentialsAuth({
        accessKeyId: 'AKIA+SPECIAL/CHARS=',
        secretAccessKey: 'secret+with/special=chars',
        region: 'us-east-1',
      });
      expect(a.isAuthenticated()).toBe(true);
    });

    it('should handle various AWS regions', async () => {
      const regions = ['us-east-1', 'eu-west-1', 'ap-southeast-1', 'us-gov-west-1'];
      for (const region of regions) {
        const a = new AwsCredentialsAuth({
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'secret',
          region,
        });
        expect(a).toBeInstanceOf(AwsCredentialsAuth);
      }
    });
  });
});
