import { ModelsConfigFile, SingleModelConfig } from './ModelConfigTypes.js';
import { loadConfigFromFile, loadConfigFromObject, mergeWithDefaults } from './ModelConfigLoader.js';

export * from './ModelConfigTypes.js';

/** Loads, validates, and provides access to model configurations. */
export class ModelConfig {
    private config: ModelsConfigFile;

    private constructor(config: ModelsConfigFile) {
        this.config = config;
    }

    static async fromFile(filePath: string): Promise<ModelConfig> {
        const config = await loadConfigFromFile(filePath);
        return new ModelConfig(config);
    }

    static fromObject(config: ModelsConfigFile): ModelConfig {
        const validatedConfig = loadConfigFromObject(config);
        return new ModelConfig(validatedConfig);
    }

    getModel(name: string): SingleModelConfig | undefined {
        const modelConfig = this.config.models[name];
        if (!modelConfig) {
            return undefined;
        }
        return mergeWithDefaults(modelConfig, this.config.defaults);
    }

    getModelNames(): string[] {
        return Object.keys(this.config.models);
    }

    hasModel(name: string): boolean {
        return name in this.config.models;
    }

    getModelsByProvider(provider: string): { name: string; config: SingleModelConfig }[] {
        const results: { name: string; config: SingleModelConfig }[] = [];

        for (const [name, config] of Object.entries(this.config.models)) {
            if (config.provider === provider) {
                results.push({
                    name,
                    config: mergeWithDefaults(config, this.config.defaults)
                });
            }
        }

        return results;
    }
}
