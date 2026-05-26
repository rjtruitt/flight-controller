import { IAuthProvider } from './IAuthProvider.js';

export interface AwsCredentialsAuthConfig {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    sessionToken?: string;
}

/** Static AWS credentials authentication (access key + secret). For non-SSO environments. */
export class AwsCredentialsAuth implements IAuthProvider {
    private readonly credentials: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
    private readonly region: string;

    constructor(config: AwsCredentialsAuthConfig) {
        this.credentials = {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            sessionToken: config.sessionToken
        };
        this.region = config.region;
    }

    async getHeaders(): Promise<Record<string, string>> {
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.slice(0, 8);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Amz-Date': amzDate,
            'Authorization': `AWS4-HMAC-SHA256 Credential=${this.credentials.accessKeyId}/${dateStamp}/${this.region}/bedrock/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=placeholder`
        };

        if (this.credentials.sessionToken) {
            headers['X-Amz-Security-Token'] = this.credentials.sessionToken;
        }

        return headers;
    }

    async getCredentials() {
        return this.credentials;
    }

    isAuthenticated(): boolean {
        return !!this.credentials.accessKeyId && !!this.credentials.secretAccessKey;
    }
}
