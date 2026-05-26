import { SSOOIDCClient, StartDeviceAuthorizationCommand, CreateTokenCommand } from '@aws-sdk/client-sso-oidc';
import { IAuthProvider, IAuthHandler } from './IAuthProvider.js';
import { AuthenticationError } from '../core/errors/LLMError.js';
import { loadSSOSessionConfig, SSOSessionConfig } from './AWSSSOConfigLoader.js';
import { loadCachedToken, saveCachedToken, getOrRegisterClient, SSOToken } from './AWSSSOTokenCache.js';

/** Profile + region pair identifying which SSO session to use. */
export interface AWSSSOConfig {
    profile: string;
    region: string;
}

/** AWS SSO authentication via OAuth 2.0 Device Authorization Grant. */
export class AWSSSOAuth implements IAuthProvider {
    private config: AWSSSOConfig;
    private authHandler?: IAuthHandler;
    private token?: SSOToken;
    private ssoSessionConfig?: SSOSessionConfig;

    constructor(config: AWSSSOConfig) {
        this.config = config;
    }

    setAuthHandler(handler: IAuthHandler): void {
        this.authHandler = handler;
    }

    isAuthenticated(): boolean {
        if (!this.token) {
            return false;
        }

        const expiresAt = new Date(this.token.expiresAt);
        return expiresAt.getTime() > Date.now();
    }

    async initialize(): Promise<void> {
        this.ssoSessionConfig = await loadSSOSessionConfig(this.config.profile);

        try {
            this.token = await loadCachedToken(this.ssoSessionConfig.sessionName);
            if (this.isAuthenticated()) {
                return;
            }
        } catch {
            // Cache miss — will re-authenticate below
        }

        throw new AuthenticationError('AWS SSO token not found or expired. Authentication required.');
    }

    async refresh(): Promise<void> {
        if (!this.ssoSessionConfig) {
            await this.initialize();
        }

        if (!this.authHandler) {
            throw new AuthenticationError('No auth handler set. Cannot perform interactive authentication.');
        }

        const client = new SSOOIDCClient({ region: this.ssoSessionConfig!.sso_region });

        try {
            const clientCreds = await getOrRegisterClient(
                client,
                this.ssoSessionConfig!.sso_start_url,
                this.ssoSessionConfig!.sso_registration_scopes || 'sso:account:access'
            );

            const deviceAuth = await client.send(new StartDeviceAuthorizationCommand({
                clientId: clientCreds.clientId,
                clientSecret: clientCreds.clientSecret,
                startUrl: this.ssoSessionConfig!.sso_start_url
            }));

            await this.authHandler.handleDeviceCodeAuth({
                verificationUrl: deviceAuth.verificationUri!,
                userCode: deviceAuth.userCode!,
                verificationUrlComplete: deviceAuth.verificationUriComplete,
                expiresIn: deviceAuth.expiresIn!,
                interval: deviceAuth.interval || 5
            });

            const expiresAt = Date.now() + (deviceAuth.expiresIn! * 1000);
            const interval = (deviceAuth.interval || 5) * 1000;

            while (Date.now() < expiresAt) {
                await new Promise(resolve => setTimeout(resolve, interval));

                try {
                    const tokenResponse = await client.send(new CreateTokenCommand({
                        clientId: clientCreds.clientId,
                        clientSecret: clientCreds.clientSecret,
                        grantType: 'urn:ietf:params:oauth:grant-type:device_code',
                        deviceCode: deviceAuth.deviceCode!
                    }));

                    this.token = {
                        accessToken: tokenResponse.accessToken!,
                        expiresAt: new Date(Date.now() + (tokenResponse.expiresIn! * 1000)).toISOString(),
                        refreshToken: tokenResponse.refreshToken,
                        clientId: clientCreds.clientId,
                        clientSecret: clientCreds.clientSecret,
                        registeredAt: clientCreds.registeredAt
                    };

                    await saveCachedToken(this.ssoSessionConfig!.sessionName, this.token);
                    return;

                } catch (error: any) {
                    if (error.name === 'AuthorizationPendingException') {
                        continue;
                    }
                    if (error.name === 'SlowDownException') {
                        await new Promise(resolve => setTimeout(resolve, interval));
                        continue;
                    }
                    throw error;
                }
            }

            throw new AuthenticationError('Device authorization timed out. User did not complete authentication.');

        } catch (error) {
            throw new AuthenticationError(
                `SSO authentication failed: ${(error as Error).message}`,
                {},
                error as Error
            );
        }
    }

    async getHeaders(): Promise<Record<string, string>> {
        if (!this.isAuthenticated()) {
            throw new AuthenticationError('Not authenticated');
        }
        return {};
    }

    async getCredentials() {
        if (!this.isAuthenticated()) {
            throw new AuthenticationError('Not authenticated');
        }
        const { fromSSO } = await import('@aws-sdk/credential-providers');
        return fromSSO({ profile: this.config.profile });
    }

    handleAuthError(error: Error): boolean {
        const errorMessage = error.message.toLowerCase();
        const errorName = (error as any).name?.toLowerCase() || '';

        if (errorName.includes('expiredtoken') ||
            errorMessage.includes('expiredtoken') ||
            errorMessage.includes('token has expired') ||
            errorMessage.includes('token is expired')) {
            this.token = undefined;
            return true;
        }

        if (errorName.includes('unauthorizedexception') ||
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('access denied') ||
            errorMessage.includes('invalid credentials')) {
            this.token = undefined;
            return true;
        }

        return false;
    }
}
