import { getSSOTokenFilepath, getSSOTokenFromFile } from '@smithy/shared-ini-file-loader';
import { SSOOIDCClient, RegisterClientCommand } from '@aws-sdk/client-sso-oidc';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';

/** Cached SSO access token with metadata for 90-day client validity. */
export interface SSOToken {
    accessToken: string;
    expiresAt: string;
    refreshToken?: string;
    clientId: string;
    clientSecret: string;
    registeredAt: string;
}

/** OIDC client registration credentials cached on disk. */
export interface ClientCredentials {
    clientId: string;
    clientSecret: string;
    registeredAt: string;
}

/** Load a cached SSO token from ~/.aws/sso/cache/. Returns the token or throws if missing/expired. */
export async function loadCachedToken(sessionName: string): Promise<SSOToken> {
    getSSOTokenFilepath(sessionName);
    const token = await getSSOTokenFromFile(sessionName);
    return token as SSOToken;
}

/** Save an SSO token to ~/.aws/sso/cache/ for future sessions. */
export async function saveCachedToken(sessionName: string, token: SSOToken): Promise<void> {
    const cachePath = getSSOTokenFilepath(sessionName);
    await mkdir(join(homedir(), '.aws', 'sso', 'cache'), { recursive: true });
    await writeFile(cachePath, JSON.stringify(token, null, 2), 'utf-8');
}

/** Compute the cache file path for OIDC client credentials from an SSO start URL. */
export function getClientCachePath(startUrl: string): string {
    const hash = createHash('sha1')
        .update(startUrl + '-client')
        .digest('hex');
    return join(homedir(), '.aws', 'sso', 'cache', `${hash}.json`);
}

/** Load cached OIDC client credentials. Returns undefined if cache is missing or expired (90 days). */
export async function loadCachedClient(startUrl: string): Promise<ClientCredentials | undefined> {
    const cachePath = getClientCachePath(startUrl);
    try {
        const cached = JSON.parse(await readFile(cachePath, 'utf-8'));
        const registeredAt = new Date(cached.registeredAt);
        // Client registrations are valid for 90 days
        if (Date.now() - registeredAt.getTime() < 90 * 24 * 60 * 60 * 1000) {
            return cached;
        }
    } catch {
        // Cache file not found or unreadable — register a new client
    }
    return undefined;
}

/**
 * Get or register an OIDC client for SSO device authorization.
 * Checks disk cache first, then registers a new client with SSO OIDC if none cached.
 */
export async function getOrRegisterClient(
    client: SSOOIDCClient,
    startUrl: string,
    scopes: string
): Promise<ClientCredentials> {
    const cached = await loadCachedClient(startUrl);
    if (cached) return cached;

    const registration = await client.send(new RegisterClientCommand({
        clientName: 'llm-flight-controller',
        clientType: 'public',
        scopes: scopes.split(',')
    }));

    const clientCreds: ClientCredentials = {
        clientId: registration.clientId!,
        clientSecret: registration.clientSecret!,
        registeredAt: new Date().toISOString()
    };

    const cachePath = getClientCachePath(startUrl);
    await mkdir(join(homedir(), '.aws', 'sso', 'cache'), { recursive: true });
    await writeFile(cachePath, JSON.stringify(clientCreds, null, 2), 'utf-8');

    return clientCreds;
}
