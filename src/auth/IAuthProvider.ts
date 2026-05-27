/** Device code info for OAuth 2.0 Device Authorization Grant flows. */
export interface DeviceCodeInfo {
    verificationUrl: string;
    userCode: string;
    verificationUrlComplete?: string;
    expiresIn: number;
    interval: number;
}

/** Handler for interactive authentication flows. Implemented by the orchestrator. */
export interface IAuthHandler {
    handleDeviceCodeAuth(info: DeviceCodeInfo): Promise<void>;
    /** Open browser for OAuth. Returns the authorization code.
     *  url — primary auth URL (automatic redirect to localhost listener)
     *  manualUrl — fallback URL for manual copy-paste (if different) */
    handleBrowserAuth(url: string, manualUrl?: string): Promise<string>;
    handleRefreshPrompt(message: string): Promise<boolean>;
    handleAuthError(error: Error): Promise<void>;
    onAuthenticationFailed(info: {
        provider: string;
        reason: string;
        canRetry: boolean;
    }): void;
}

/** Authentication provider interface for obtaining and refreshing credentials. */
export interface IAuthProvider {
    /** Return auth headers (e.g. Authorization, x-api-key) for outbound requests. */
    getHeaders(): Promise<Record<string, string>>;
    /** One-time async initialization (SSO login, token exchange, etc.). */
    initialize?(): Promise<void>;
    /** Force-refresh credentials (e.g. after expiry or 401). */
    refresh?(): Promise<void>;
    /** True if credentials are currently valid. */
    isAuthenticated(): boolean;
    /** Attach a handler for interactive auth flows (device code, browser redirect). */
    setAuthHandler?(handler: IAuthHandler): void;
    /** Returns true if the error is auth-related and should trigger refresh. */
    handleAuthError?(error: Error): boolean;
}

export { AuthenticationError } from '../core/errors/LLMError.js';
