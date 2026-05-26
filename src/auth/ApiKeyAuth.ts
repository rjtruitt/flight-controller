import { IAuthProvider } from './IAuthProvider.js';

export interface ApiKeyAuthConfig {
    apiKey: string;
    headerName?: string;
    headerPrefix?: string;
    additionalHeaders?: Record<string, string>;
}

/** Simple bearer token / API key authentication. */
export class ApiKeyAuth implements IAuthProvider {
    private readonly apiKey: string;
    private readonly headerName: string;
    private readonly headerPrefix?: string;
    private readonly additionalHeaders: Record<string, string>;

    constructor(apiKey: string);
    constructor(config: ApiKeyAuthConfig);
    constructor(apiKeyOrConfig: string | ApiKeyAuthConfig) {
        if (typeof apiKeyOrConfig === 'string') {
            this.apiKey = apiKeyOrConfig;
            this.headerName = 'Authorization';
            this.headerPrefix = 'Bearer';
            this.additionalHeaders = {};
        } else {
            this.apiKey = apiKeyOrConfig.apiKey;
            this.headerName = apiKeyOrConfig.headerName ?? 'Authorization';
            this.headerPrefix = apiKeyOrConfig.headerPrefix ?? 'Bearer';
            this.additionalHeaders = apiKeyOrConfig.additionalHeaders ?? {};
        }
    }

    async getHeaders(): Promise<Record<string, string>> {
        const authValue = this.headerPrefix
            ? `${this.headerPrefix} ${this.apiKey}`
            : this.apiKey;

        return {
            [this.headerName]: authValue,
            'Content-Type': 'application/json',
            ...this.additionalHeaders
        };
    }

    isAuthenticated(): boolean {
        return !!this.apiKey;
    }
}
