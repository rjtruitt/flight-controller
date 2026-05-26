import { fromIni } from '@aws-sdk/credential-providers';
import { IAuthProvider } from './IAuthProvider.js';
import { AuthenticationError } from '../core/errors/LLMError.js';

/** Simple AWS credential config. Uses fromIni() credential chain. */
export interface AWSAuthConfig {
    profile?: string;
    region: string;
}

/** AWS authentication provider with credential loading and auth error detection. */
export class AWSAuthProvider implements IAuthProvider {
    private config: AWSAuthConfig;
    // Optimistic default; set to false on auth failure
    private authenticated: boolean = true;

    constructor(config: AWSAuthConfig) {
        this.config = config;
    }

    isAuthenticated(): boolean {
        return this.authenticated;
    }

    async initialize(): Promise<void> {
        try {
            const credentials = this.getCredentials();
            await credentials(); // Resolve to verify they work
            this.authenticated = true;
        } catch (error) {
            this.authenticated = false;
            throw this.createAuthError(error as Error);
        }
    }

    /** AWS SDK lacks programmatic SSO login; throws with CLI instructions. */
    async refresh(): Promise<void> {
        throw this.createAuthError(new Error('Token expired'));
    }

    async getHeaders(): Promise<Record<string, string>> {
        // AWS SDK handles auth internally via credential providers
        return {};
    }

    getCredentials() {
        if (this.config.profile) {
            return fromIni({ profile: this.config.profile });
        }
        return fromIni(); // Default credential chain
    }

    getProfile(): string | undefined {
        return this.config.profile;
    }

    getRegion(): string {
        return this.config.region;
    }

    handleAuthError(error: Error): boolean {
        const errorMessage = error.message.toLowerCase();
        const errorName = (error as any).name?.toLowerCase() || '';

        if (errorName.includes('expiredtoken') ||
            errorMessage.includes('expiredtoken') ||
            errorMessage.includes('token has expired') ||
            errorMessage.includes('token is expired')) {
            this.authenticated = false;
            return true;
        }

        if (errorName.includes('unauthorizedexception') ||
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('access denied') ||
            errorMessage.includes('invalid credentials')) {
            this.authenticated = false;
            return true;
        }

        return false;
    }

    private createAuthError(originalError: Error): AuthenticationError {
        const command = `aws sso login${this.config.profile ? ` --profile ${this.config.profile}` : ''}`;
        const message = `AWS SSO token expired or invalid. Please run: ${command}`;

        const error = new AuthenticationError(message, {}, originalError);

        (error as any).profile = this.config.profile;
        (error as any).region = this.config.region;
        (error as any).command = command;

        return error;
    }
}
