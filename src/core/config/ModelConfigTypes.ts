import { ModelCapability } from '../types/Capabilities.js';

/** Authentication configuration for a model. Discriminated on `type`. */
export interface AuthConfig {
    type: 'api_key' | 'aws_profile' | 'aws_credentials' | 'azure_managed_identity' | 'azure_service_principal' | 'google_adc' | 'google_service_account' | 'browser_oauth';

    apiKey?: string;
    headerName?: string;
    headerPrefix?: string;

    profile?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;

    resource?: string;
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
    scope?: string;

    scopes?: string[];
    credentialsPath?: string;
    serviceAccountJson?: any;

    authUrl?: string;
    tokenUrl?: string;
    redirectUri?: string;
    /** Human-readable client name for OAuth metadata (e.g. "claude_code", "Armament"). */
    clientName?: string;
}

export interface LimitsConfig {
    tpm?: number;
    rpm?: number;
    tph?: number;
    rph?: number;
    warningThreshold?: number;

    messagesPerDay?: number;
    sessionsPerDay?: number;
    tokensPerDay?: number;
    tokensPerMonth?: number;

    contextWindow?: number;
    maxOutputTokens?: number;
    safetyMargin?: number;
}

export interface PricingConfig {
    inputTokens: number;
    outputTokens: number;
    cacheRead?: number;
    cacheWrite?: number;
    perRequest?: number;
    perImage?: number;
}

export interface BudgetConfig {
    daily?: number;
    monthly?: number;
    perRequest?: number;
}

/** Complete configuration for a single model: provider, auth, capabilities, limits, pricing. */
export interface SingleModelConfig {
    provider: string;
    modelId: string;
    displayName?: string;
    family?: string;
    version?: string;
    aliases?: string[];

    auth: AuthConfig;

    capabilities?: {
        features?: ModelCapability[];
        maxImageSize?: number;
        maxAudioDuration?: number;
        supportedImageFormats?: string[];
        toolHandling?: 'native' | 'context' | 'none';
    };

    limits?: LimitsConfig;
    pricing?: PricingConfig;
    budget?: BudgetConfig;
    enableStats?: boolean;
}

/** Top-level config file schema containing all model definitions and shared defaults. */
export interface ModelsConfigFile {
    models: {
        [name: string]: SingleModelConfig;
    };
    defaults?: {
        auth?: Partial<AuthConfig>;
        limits?: Partial<LimitsConfig>;
        enableStats?: boolean;
    };
}
