import { getSSOTokenFilepath, getSSOTokenFromFile } from '@smithy/shared-ini-file-loader';
import { SSOOIDCClient, RegisterClientCommand } from '@aws-sdk/client-sso-oidc';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';

export interface SSOToken {
    accessToken: string;
    expiresAt: string;
    refreshToken?: string;
    clientId: string;
    clientSecret: string;
    registeredAt: string;
}

export interface ClientCredentials {
    clientId: string;
    clientSecret: string;
    registeredAt: string;
}

export async function loadCachedToken(sessionName: string): Promise<SSOToken> {
    getSSOTokenFilepath(sessionName);
    const token = await getSSOTokenFromFile(sessionName);
    return token as SSOToken;
}

export async function saveCachedToken(sessionName: string, token: SSOToken): Promise<void> {
    const cachePath = getSSOTokenFilepath(sessionName);
    await mkdir(join(homedir(), '.aws', 'sso', 'cache'), { recursive: true });
    await writeFile(cachePath, JSON.stringify(token, null, 2), 'utf-8');
}

export function getClientCachePath(startUrl: string): string {
    const hash = createHash('sha1')
        .update(startUrl + '-client')
        .digest('hex');
    return join(homedir(), '.aws', 'sso', 'cache', `${hash}.json`);
}

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
    }
    return undefined;
}

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
