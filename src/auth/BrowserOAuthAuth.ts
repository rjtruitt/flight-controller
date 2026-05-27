/**
 * Browser-based OAuth 2.0 Authorization Code flow with PKCE (S256),
 * localhost callback listener, state/CSRF protection, and refresh token support.
 *
 * Modeled after Claude Code's OAuth implementation — two modes:
 * 1. Automatic: Opens browser → redirects to localhost → captures code
 * 2. Manual: User copies code from browser and pastes it
 */
import { EventEmitter } from 'events';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { randomBytes, createHash } from 'crypto';
import { IAuthProvider, IAuthHandler } from './IAuthProvider.js';
import { AuthenticationError } from '../core/errors/LLMError.js';

/** Configuration for BrowserOAuthAuth. */
export interface BrowserOAuthAuthConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes: string[];
  /** Human-readable client name sent in metadata (e.g. "claude_code", "Armament"). */
  clientName?: string;
}

// ── PKCE crypto primitives ────────────────────────────────────────────────

function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateCodeVerifier(): string {
  return base64URLEncode(randomBytes(32));
}

function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256');
  hash.update(verifier);
  return base64URLEncode(hash.digest());
}

function generateState(): string {
  return base64URLEncode(randomBytes(32));
}

// ── Localhost callback listener ───────────────────────────────────────────

/**
 * Temporary localhost HTTP server that listens for OAuth authorization code
 * redirects. When the user authorizes in their browser, the provider redirects
 * to http://localhost:{port}/callback?code=AUTH_CODE&state=STATE.
 */
class AuthCodeListener {
  private server: Server;
  private port = 0;
  private resolver: ((code: string) => void) | null = null;
  private rejecter: ((err: Error) => void) | null = null;
  private expectedState: string | null = null;
  private pendingResponse: any = null;

  constructor() {
    this.server = createServer();
  }

  /** Start listening on an OS-assigned port. Returns the port number. */
  async start(port?: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once('error', (err: Error) => {
        reject(new Error(`OAuth callback server failed: ${err.message}`));
      });
      this.server.listen(port ?? 0, 'localhost', () => {
        const addr = this.server.address() as AddressInfo;
        this.port = addr.port;
        resolve(this.port);
      });
    });
  }

  getPort(): number {
    return this.port;
  }

  hasPendingResponse(): boolean {
    return this.pendingResponse !== null;
  }

  async waitForAuthorization(
    state: string,
    onReady: () => Promise<void>,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.resolver = resolve;
      this.rejecter = reject;
      this.expectedState = state;
      this.startLocalListener(onReady);
    });
  }

  /** Redirect the browser to a success page after token exchange. */
  handleSuccessRedirect(): void {
    if (!this.pendingResponse) return;
    this.pendingResponse.writeHead(302, {
      Location: 'https://localhost/oauth/code/success?app=armament',
    });
    this.pendingResponse.end();
    this.pendingResponse = null;
  }

  handleErrorRedirect(): void {
    if (!this.pendingResponse) return;
    this.pendingResponse.writeHead(302, {
      Location: 'https://localhost/oauth/code/success?app=armament&error=1',
    });
    this.pendingResponse.end();
    this.pendingResponse = null;
  }

  private startLocalListener(onReady: () => Promise<void>): void {
    this.server.on('request', this.handleRedirect.bind(this));
    this.server.on('error', (err: Error) => {
      this.reject(err);
      this.close();
    });
    // Catch errors from the onReady callback (e.g. handler rejection)
    onReady().catch((err: Error) => {
      this.reject(err);
      this.close();
    });
  }

  private handleRedirect(req: any, res: any): void {
    const parsedUrl = new URL(
      req.url || '',
      `http://${req.headers?.host || 'localhost'}`,
    );

    if (parsedUrl.pathname !== '/callback') {
      res.writeHead(404);
      res.end();
      return;
    }

    const authCode = parsedUrl.searchParams.get('code') ?? undefined;
    const state = parsedUrl.searchParams.get('state') ?? undefined;
    this.validateAndRespond(authCode, state, res);
  }

  private validateAndRespond(
    authCode: string | undefined,
    state: string | undefined,
    res: any,
  ): void {
    if (!authCode) {
      res.writeHead(400);
      res.end('Authorization code not found');
      this.reject(new Error('No authorization code received'));
      return;
    }

    if (state !== this.expectedState) {
      res.writeHead(400);
      res.end('Invalid state parameter');
      this.reject(new Error('Invalid state parameter — possible CSRF attack'));
      return;
    }

    this.pendingResponse = res;
    this.resolve(authCode);
  }

  private resolve(code: string): void {
    if (this.resolver) {
      this.resolver(code);
      this.resolver = null;
      this.rejecter = null;
    }
  }

  private reject(err: Error): void {
    if (this.rejecter) {
      this.rejecter(err);
      this.resolver = null;
      this.rejecter = null;
    }
  }

  close(): void {
    if (this.pendingResponse) this.handleErrorRedirect();
    if (this.server) {
      this.server.removeAllListeners();
      this.server.close();
    }
  }
}

// ── BrowserOAuthAuth ─────────────────────────────────────────────────────

/** Browser-based OAuth 2.0 Authorization Code flow with PKCE (S256). */
export class BrowserOAuthAuth extends EventEmitter implements IAuthProvider {
  private authHandler?: IAuthHandler;
  private accessToken?: string;
  private refreshToken?: string;
  private expiresAt?: number;
  private codeListener: AuthCodeListener | null = null;
  private manualCodeResolver: ((code: string) => void) | null = null;

  constructor(private config: BrowserOAuthAuthConfig) {
    super();
  }

  setAuthHandler(handler: IAuthHandler): void {
    this.authHandler = handler;
  }

  async getHeaders(): Promise<Record<string, string>> {
    if (this.accessToken && Date.now() >= this.expiresAt!) {
      await this.handleTokenExpired();
    }

    if (!this.accessToken) {
      await this.performBrowserAuth();
    }

    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async handleTokenExpired(): Promise<void> {
    this.emit('auth_expired', {
      message: 'Your authentication token has expired',
      expiresIn: 0,
    });

    if (this.authHandler) {
      const shouldRefresh = await this.authHandler.handleRefreshPrompt(
        'Your token has expired. Would you like to refresh it now?',
      );

      if (shouldRefresh) {
        await this.refresh();
      } else {
        throw new AuthenticationError('Token expired and refresh declined');
      }
    } else {
      await this.refresh();
    }
  }

  private async performBrowserAuth(): Promise<void> {
    // 1. Start localhost callback listener
    this.codeListener = new AuthCodeListener();
    const port = await this.codeListener.start();

    // 2. Generate PKCE values and state
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    // 3. Build auth URLs
    const automaticUrl = this.buildAuthUrl(codeChallenge, state, port, false);
    const manualUrl = this.buildAuthUrl(codeChallenge, state, port, true);

    this.emit('auth_browser_needed', {
      url: manualUrl,
      automaticUrl,
      message: 'Please authenticate in your browser',
    });

    // 4. Wait for auth code (automatic via callback or manual paste)
    const authorizationCode = await this.waitForAuthorizationCode(
      state,
      automaticUrl,
      manualUrl,
    );

    // 5. Determine if automatic flow worked
    const isAutomatic = this.codeListener?.hasPendingResponse() ?? false;

    try {
      // 6. Exchange code for tokens
      await this.exchangeCodeForToken(
        authorizationCode,
        codeVerifier,
        port,
        !isAutomatic,
      );

      // 7. Redirect browser on success
      if (isAutomatic && this.codeListener) {
        this.codeListener.handleSuccessRedirect();
      }

      this.emit('auth_success', {
        message: 'Authentication successful',
        expiresIn: this.expiresAt! - Date.now(),
      });
    } catch (error) {
      if (isAutomatic && this.codeListener) {
        this.codeListener.handleErrorRedirect();
      }
      throw error;
    } finally {
      this.codeListener?.close();
      this.codeListener = null;
    }
  }

  private async waitForAuthorizationCode(
    state: string,
    automaticUrl: string,
    manualUrl: string,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // Manual fallback resolver
      this.manualCodeResolver = resolve;

      // Timeout after 5 minutes
      const timeout = setTimeout(() => {
        this.manualCodeResolver = null;
        reject(new Error('Authorization timed out after 5 minutes'));
      }, 300_000);

      const cleanup = () => { clearTimeout(timeout); };

      // Start automatic listener
      this.codeListener!
        .waitForAuthorization(state, async () => {
          // Show URL and try browser
          if (this.authHandler) {
            await this.authHandler.handleBrowserAuth(
              automaticUrl,
              manualUrl,
            );
          } else {
            // No handler — just show URLs
            this.emit('auth_browser_needed', {
              url: manualUrl,
              automaticUrl,
              message: 'Open this URL in your browser to authenticate',
            });
          }
        })
        .then((code: string) => {
          this.manualCodeResolver = null;
          cleanup();
          resolve(code);
        })
        .catch((err: Error) => {
          this.manualCodeResolver = null;
          cleanup();
          reject(err);
        });
    });
  }

  /** Called externally when user manually pastes an auth code. */
  handleManualAuthCode(code: string): void {
    if (this.manualCodeResolver) {
      this.manualCodeResolver(code);
      this.manualCodeResolver = null;
      this.codeListener?.close();
    }
  }

  async refresh(): Promise<void> {
    if (!this.refreshToken) {
      throw new AuthenticationError('No refresh token available');
    }

    const body: Record<string, string> = {
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
      client_id: this.config.clientId,
    };
    // Only include client_secret if configured (public clients omit it)
    if (this.config.clientSecret) {
      body.client_secret = this.config.clientSecret;
    }

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new AuthenticationError(
        `Token refresh failed: ${response.statusText}`,
      );
    }

    const data: any = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token ?? this.refreshToken;
    this.expiresAt = Date.now() + (data.expires_in * 1000);

    this.emit('auth_success', { message: 'Token refreshed' });
  }

  private buildAuthUrl(
    codeChallenge: string,
    state: string,
    port: number,
    isManual: boolean,
  ): string {
    const redirectUri = isManual
      ? this.config.redirectUri ?? 'http://localhost:0/callback'
      : `http://localhost:${port}/callback`;

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      scope: this.config.scopes.join(' '),
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      access_type: 'offline',
    });

    return `${this.config.authUrl}?${params.toString()}`;
  }

  private async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    port: number,
    isManual: boolean,
  ): Promise<void> {
    const redirectUri = isManual
      ? this.config.redirectUri ?? 'http://localhost:0/callback'
      : `http://localhost:${port}/callback`;

    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      client_id: this.config.clientId,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    };
    // Only include client_secret if configured (public clients use PKCE instead)
    if (this.config.clientSecret) {
      body.client_secret = this.config.clientSecret;
    }

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new AuthenticationError(
        `Token exchange failed (${response.status}): ${errorText}`,
      );
    }

    const data: any = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.expiresAt = Date.now() + (data.expires_in * 1000);
  }

  isAuthenticated(): boolean {
    return !!this.accessToken && Date.now() < this.expiresAt!;
  }

  /** Clean up any resources (callback server, etc.). */
  cleanup(): void {
    this.codeListener?.close();
    this.codeListener = null;
    this.manualCodeResolver = null;
  }
}
