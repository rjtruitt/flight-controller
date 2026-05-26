import { IAuthProvider, IAuthHandler, AuthenticationError } from './IAuthProvider.js';

export interface AzureManagedIdentityConfig {
    resource: string;
    clientId?: string;
    imdsEndpoint?: string;
}

/** Azure Managed Identity authentication via the Instance Metadata Service (IMDS). */
export class AzureManagedIdentityAuth implements IAuthProvider {
    private accessToken?: string;
    private expiresAt?: number;
    private authHandler?: IAuthHandler;
    private readonly imdsEndpoint: string;

    constructor(private config: AzureManagedIdentityConfig) {
        this.imdsEndpoint = config.imdsEndpoint || 'http://169.254.169.254/metadata/identity/oauth2/token';
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
            const params = new URLSearchParams({
                'api-version': '2018-02-01',
                'resource': this.config.resource
            });

            if (this.config.clientId) {
                params.append('client_id', this.config.clientId);
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(`${this.imdsEndpoint}?${params.toString()}`, {
                headers: {
                    'Metadata': 'true'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new AuthenticationError(
                    `Azure IMDS request failed: ${response.statusText}`
                );
            }

            const data: any = await response.json();
            this.accessToken = data.access_token;
            this.expiresAt = parseInt(data.expires_on) * 1000;

        } catch (error) {
            if (this.authHandler) {
                this.authHandler.onAuthenticationFailed({
                    provider: 'azure_managed_identity',
                    reason: error instanceof Error ? error.message : 'Failed to fetch token',
                    canRetry: true
                });
            }
            throw error;
        }
    }
}
