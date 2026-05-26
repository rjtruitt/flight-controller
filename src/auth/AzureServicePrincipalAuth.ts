import { IAuthProvider, IAuthHandler, AuthenticationError } from './IAuthProvider.js';

export interface AzureServicePrincipalConfig {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    scope: string;
    authority?: string;
}

/** Azure Service Principal (client credentials grant) authentication. */
export class AzureServicePrincipalAuth implements IAuthProvider {
    private accessToken?: string;
    private expiresAt?: number;
    private authHandler?: IAuthHandler;
    private readonly tokenEndpoint: string;

    constructor(private config: AzureServicePrincipalConfig) {
        const authority = config.authority || 'https://login.microsoftonline.com';
        this.tokenEndpoint = `${authority}/${config.tenantId}/oauth2/v2.0/token`;
    }

    setAuthHandler(handler: IAuthHandler): void {
        this.authHandler = handler;
    }

    async initialize(): Promise<void> {
        await this.fetchToken();
    }

    async getHeaders(): Promise<Record<string, string>> {
        if (!this.isAuthenticated()) {
            await this.refresh();
        }

        return {
            'Authorization': `Bearer ${this.accessToken}`
        };
    }

    async refresh(): Promise<void> {
        await this.fetchToken();
    }

    isAuthenticated(): boolean {
        if (!this.accessToken || !this.expiresAt) {
            return false;
        }
        // 5-minute buffer before expiry
        return Date.now() < this.expiresAt - 5 * 60 * 1000;
    }

    private async fetchToken(): Promise<void> {
        try {
            const body = new URLSearchParams({
                'grant_type': 'client_credentials',
                'client_id': this.config.clientId,
                'client_secret': this.config.clientSecret,
                'scope': this.config.scope
            });

            const response = await fetch(this.tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body.toString()
            });

            if (!response.ok) {
                const error: any = await response.json().catch(() => ({ error: response.statusText }));
                throw new AuthenticationError(
                    `Azure OAuth token request failed: ${error.error_description || error.error}`
                );
            }

            const data: any = await response.json();
            this.accessToken = data.access_token;
            this.expiresAt = Date.now() + (data.expires_in * 1000);

        } catch (error) {
            if (this.authHandler) {
                this.authHandler.onAuthenticationFailed({
                    provider: 'azure_service_principal',
                    reason: error instanceof Error ? error.message : 'Failed to fetch token',
                    canRetry: true
                });
            }
            throw error;
        }
    }
}
