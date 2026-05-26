import { IAuthProvider } from './IAuthProvider.js';

export interface AwsProfileAuthConfig {
    profile?: string;
    region: string;
}

/** AWS profile-based authentication. Requires @aws-sdk/credential-providers. */
export class AwsProfileAuth implements IAuthProvider {
    private readonly profileName: string;
    private readonly region: string;
    private credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };

    constructor(config: AwsProfileAuthConfig) {
        this.profileName = config.profile ?? 'default';
        this.region = config.region;
    }

    async initialize(): Promise<void> {
        try {
            const { fromIni } = await import('@aws-sdk/credential-providers');

            const credentialProvider = fromIni({ profile: this.profileName });
            this.credentials = await credentialProvider();
        } catch (error) {
            const err = error as Error;
            throw new Error(
                `Failed to load AWS profile "${this.profileName}": ${err.message}\n` +
                `Make sure AWS CLI is configured and profile exists in ~/.aws/credentials`
            );
        }
    }

    async getHeaders(): Promise<Record<string, string>> {
        if (!this.credentials) {
            await this.initialize();
        }

        return {
            'Content-Type': 'application/json',
            'X-Amz-Region': this.region
        };
    }

    async getCredentials() {
        if (!this.credentials) {
            await this.initialize();
        }
        return this.credentials!;
    }

    isAuthenticated(): boolean {
        return !!this.credentials;
    }
}
