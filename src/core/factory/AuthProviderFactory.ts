import { IAuthProvider } from '../../auth/IAuthProvider.js';
import { ApiKeyAuth } from '../../auth/ApiKeyAuth.js';
import { AwsProfileAuth } from '../../auth/AwsProfileAuth.js';
import { AwsCredentialsAuth } from '../../auth/AwsCredentialsAuth.js';
import { AzureManagedIdentityAuth } from '../../auth/AzureManagedIdentityAuth.js';
import { AzureServicePrincipalAuth } from '../../auth/AzureServicePrincipalAuth.js';
import { GoogleAdcAuth } from '../../auth/GoogleAdcAuth.js';
import { GoogleServiceAccountAuth } from '../../auth/GoogleServiceAccountAuth.js';
import { BrowserOAuthAuth } from '../../auth/BrowserOAuthAuth.js';
import { AuthConfig } from '../config/ModelConfigTypes.js';

/** Instantiates the appropriate IAuthProvider from a discriminated AuthConfig. */
export function createAuthProvider(authConfig: AuthConfig): IAuthProvider {
    switch (authConfig.type) {
        case 'api_key':
            return new ApiKeyAuth({
                apiKey: authConfig.apiKey!,
                headerName: authConfig.headerName,
                headerPrefix: authConfig.headerPrefix
            });

        case 'aws_profile':
            return new AwsProfileAuth({
                profile: authConfig.profile,
                region: authConfig.region!
            });

        case 'aws_credentials':
            return new AwsCredentialsAuth({
                region: authConfig.region!,
                accessKeyId: authConfig.accessKeyId!,
                secretAccessKey: authConfig.secretAccessKey!,
                sessionToken: authConfig.sessionToken
            });

        case 'azure_managed_identity':
            return new AzureManagedIdentityAuth({
                resource: authConfig.resource!,
                clientId: authConfig.clientId
            });

        case 'azure_service_principal':
            return new AzureServicePrincipalAuth({
                tenantId: authConfig.tenantId!,
                clientId: authConfig.clientId!,
                clientSecret: authConfig.clientSecret!,
                scope: authConfig.scope!
            });

        case 'google_adc':
            return new GoogleAdcAuth({
                scopes: authConfig.scopes!,
                credentialsPath: authConfig.credentialsPath
            });

        case 'google_service_account':
            return new GoogleServiceAccountAuth({
                serviceAccountJson: authConfig.serviceAccountJson!,
                scopes: authConfig.scopes!
            });

        case 'browser_oauth':
            return new BrowserOAuthAuth({
                authUrl: authConfig.authUrl!,
                tokenUrl: authConfig.tokenUrl!,
                clientId: authConfig.clientId!,
                clientSecret: authConfig.clientSecret,
                redirectUri: authConfig.redirectUri,
                scopes: authConfig.scopes!,
                clientName: authConfig.clientName ?? 'Armament',
            });

        default:
            throw new Error(`Unknown auth type: ${(authConfig as any).type}`);
    }
}
