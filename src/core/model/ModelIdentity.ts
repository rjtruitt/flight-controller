export interface ProviderInfo {
    id: string;
    displayName: string;
    region?: string;
    endpoint?: string;
}

export type ModelTier = 'free' | 'pro' | 'enterprise';

export interface ModelIdentityConfig {
    id: string;
    displayName: string;
    description?: string;
    provider: ProviderInfo;
    family?: string;
    version?: string;
    aliases?: string[];
    tier?: ModelTier;
}

/** Immutable identity descriptor for a model (name, provider, aliases, tier). */
export class ModelIdentity {
    readonly id: string;
    readonly displayName: string;
    readonly description?: string;
    readonly provider: ProviderInfo;
    readonly family?: string;
    readonly version?: string;
    readonly aliases: string[];
    readonly tier?: ModelTier;

    constructor(config: ModelIdentityConfig) {
        this.id = config.id;
        this.displayName = config.displayName;
        this.description = config.description;
        this.provider = config.provider;
        this.family = config.family;
        this.version = config.version;
        this.aliases = config.aliases ?? [];
        this.tier = config.tier;
    }

    matches(idOrAlias: string): boolean {
        return this.id === idOrAlias || this.aliases.includes(idOrAlias);
    }

    getFullId(): string {
        return `${this.provider.id}:${this.id}`;
    }

    toJSON(): ModelIdentityConfig {
        return {
            id: this.id,
            displayName: this.displayName,
            description: this.description,
            provider: this.provider,
            family: this.family,
            version: this.version,
            aliases: this.aliases,
            tier: this.tier
        };
    }

    static fromJSON(json: ModelIdentityConfig): ModelIdentity {
        return new ModelIdentity(json);
    }
}
