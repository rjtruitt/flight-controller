import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export interface SSOSessionConfig {
    sso_start_url: string;
    sso_region: string;
    sso_registration_scopes?: string;
    sessionName: string;
}

/** Load SSO session config from ~/.aws/config for a given profile. */
export async function loadSSOSessionConfig(profile: string): Promise<SSOSessionConfig> {
    const configPath = join(homedir(), '.aws', 'config');
    const content = await readFile(configPath, 'utf-8');

    const profileMatch = content.match(new RegExp(`\\[profile ${profile}\\]([\\s\\S]*?)(?=\\[|$)`));
    if (!profileMatch) {
        throw new Error(`Profile ${profile} not found in ~/.aws/config`);
    }

    const ssoSessionMatch = profileMatch[1].match(/sso_session\s*=\s*(.+)/);
    if (!ssoSessionMatch) {
        throw new Error(`Profile ${profile} does not have sso_session configured`);
    }

    const sessionName = ssoSessionMatch[1].trim();

    const sessionMatch = content.match(new RegExp(`\\[sso-session ${sessionName}\\]([\\s\\S]*?)(?=\\[|$)`));
    if (!sessionMatch) {
        throw new Error(`SSO session ${sessionName} not found in ~/.aws/config`);
    }

    const sessionConfig = sessionMatch[1];
    const startUrl = sessionConfig.match(/sso_start_url\s*=\s*(.+)/)?.[1].trim();
    const ssoRegion = sessionConfig.match(/sso_region\s*=\s*(.+)/)?.[1].trim();
    const scopes = sessionConfig.match(/sso_registration_scopes\s*=\s*(.+)/)?.[1].trim();

    if (!startUrl || !ssoRegion) {
        throw new Error(`SSO session ${sessionName} is missing required config (sso_start_url, sso_region)`);
    }

    return {
        sso_start_url: startUrl,
        sso_region: ssoRegion,
        sso_registration_scopes: scopes,
        sessionName
    };
}
