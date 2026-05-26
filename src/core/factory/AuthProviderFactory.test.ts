import { describe, it, expect } from 'vitest';
import { createAuthProvider } from './AuthProviderFactory';
import { ApiKeyAuth } from '../../auth/ApiKeyAuth';
import { AwsProfileAuth } from '../../auth/AwsProfileAuth';
import { AwsCredentialsAuth } from '../../auth/AwsCredentialsAuth';
import { AzureManagedIdentityAuth } from '../../auth/AzureManagedIdentityAuth';
import { AzureServicePrincipalAuth } from '../../auth/AzureServicePrincipalAuth';
import { GoogleAdcAuth } from '../../auth/GoogleAdcAuth';
import { GoogleServiceAccountAuth } from '../../auth/GoogleServiceAccountAuth';
import { BrowserOAuthAuth } from '../../auth/BrowserOAuthAuth';

describe('AuthProviderFactory', () => {
  describe('api_key', () => {
    it('should create ApiKeyAuth provider', () => {
      const provider = createAuthProvider({
        type: 'api_key',
        apiKey: 'sk-test-123',
      });
      expect(provider).toBeInstanceOf(ApiKeyAuth);
    });

    it('should pass headerName and headerPrefix', () => {
      const provider = createAuthProvider({
        type: 'api_key',
        apiKey: 'key',
        headerName: 'X-API-Key',
        headerPrefix: '',
      });
      expect(provider).toBeInstanceOf(ApiKeyAuth);
    });
  });

  describe('aws_profile', () => {
    it('should create AwsProfileAuth provider', () => {
      const provider = createAuthProvider({
        type: 'aws_profile',
        profile: 'dev',
        region: 'us-east-1',
      });
      expect(provider).toBeInstanceOf(AwsProfileAuth);
    });

    it('should handle optional profile (defaults to "default")', () => {
      const provider = createAuthProvider({
        type: 'aws_profile',
        region: 'us-east-1',
      });
      expect(provider).toBeInstanceOf(AwsProfileAuth);
    });
  });

  describe('aws_credentials', () => {
    it('should create AwsCredentialsAuth provider', () => {
      const provider = createAuthProvider({
        type: 'aws_credentials',
        region: 'us-west-2',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      });
      expect(provider).toBeInstanceOf(AwsCredentialsAuth);
    });

    it('should pass session token when provided', () => {
      const provider = createAuthProvider({
        type: 'aws_credentials',
        region: 'us-east-1',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'secret',
        sessionToken: 'FwoGZXIvYXdzEBY...',
      });
      expect(provider).toBeInstanceOf(AwsCredentialsAuth);
    });
  });

  describe('azure_managed_identity', () => {
    it('should create AzureManagedIdentityAuth provider', () => {
      const provider = createAuthProvider({
        type: 'azure_managed_identity',
        resource: 'https://cognitiveservices.azure.com',
      });
      expect(provider).toBeInstanceOf(AzureManagedIdentityAuth);
    });

    it('should pass clientId for user-assigned identity', () => {
      const provider = createAuthProvider({
        type: 'azure_managed_identity',
        resource: 'https://cognitiveservices.azure.com',
        clientId: 'user-assigned-id',
      });
      expect(provider).toBeInstanceOf(AzureManagedIdentityAuth);
    });
  });

  describe('azure_service_principal', () => {
    it('should create AzureServicePrincipalAuth provider', () => {
      const provider = createAuthProvider({
        type: 'azure_service_principal',
        tenantId: 'tenant-id',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        scope: 'https://cognitiveservices.azure.com/.default',
      });
      expect(provider).toBeInstanceOf(AzureServicePrincipalAuth);
    });
  });

  describe('google_adc', () => {
    it('should create GoogleAdcAuth provider', () => {
      const provider = createAuthProvider({
        type: 'google_adc',
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      expect(provider).toBeInstanceOf(GoogleAdcAuth);
    });

    it('should pass credentialsPath when provided', () => {
      const provider = createAuthProvider({
        type: 'google_adc',
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        credentialsPath: '/path/to/creds.json',
      });
      expect(provider).toBeInstanceOf(GoogleAdcAuth);
    });
  });

  describe('google_service_account', () => {
    it('should create GoogleServiceAccountAuth provider', () => {
      const provider = createAuthProvider({
        type: 'google_service_account',
        serviceAccountJson: {
          type: 'service_account',
          project_id: 'test',
          private_key_id: 'key-id',
          private_key: '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n',
          client_email: 'sa@test.iam.gserviceaccount.com',
          client_id: '123',
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
          auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/sa',
        },
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      expect(provider).toBeInstanceOf(GoogleServiceAccountAuth);
    });
  });

  describe('browser_oauth', () => {
    it('should create BrowserOAuthAuth provider', () => {
      const provider = createAuthProvider({
        type: 'browser_oauth',
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        scopes: ['openid', 'profile'],
        redirectUri: 'http://localhost:8085/callback',
      });
      expect(provider).toBeInstanceOf(BrowserOAuthAuth);
    });

    it('should handle missing clientSecret (public client)', () => {
      const provider = createAuthProvider({
        type: 'browser_oauth',
        authUrl: 'https://example.com/auth',
        tokenUrl: 'https://example.com/token',
        clientId: 'public-client',
        scopes: ['read'],
      });
      expect(provider).toBeInstanceOf(BrowserOAuthAuth);
    });
  });

  describe('Unknown type', () => {
    it('should throw on unknown auth type', () => {
      expect(() => createAuthProvider({ type: 'unknown_type' } as any)).toThrow('Unknown auth type');
    });

    it('should include the unknown type in error message', () => {
      expect(() => createAuthProvider({ type: 'magic_auth' } as any)).toThrow('magic_auth');
    });
  });
});
