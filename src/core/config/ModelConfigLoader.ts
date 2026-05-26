import { readFile } from 'fs/promises';
import { ModelsConfigFile, SingleModelConfig } from './ModelConfigTypes.js';
import { validateConfig } from './ModelConfigValidator.js';

/**
 * Load a model configuration from a JSON file on disk.
 * Parses the file, validates the structure, and returns the typed config.
 * @param filePath - Absolute or relative path to the JSON config file
 * @returns Parsed and validated model configuration
 */
export async function loadConfigFromFile(filePath: string): Promise<ModelsConfigFile> {
    const content = await readFile(filePath, 'utf-8');
    const config = JSON.parse(content);
    validateConfig(config);
    return config;
}

/**
 * Load a model configuration from an in-memory object.
 * Validates the structure and returns the typed config.
 * @param config - Raw configuration object
 * @returns Validated model configuration
 */
export function loadConfigFromObject(config: ModelsConfigFile): ModelsConfigFile {
    validateConfig(config);
    return config;
}

/**
 * Merge a model's configuration with global defaults.
 * Deep-merges auth, limits, and top-level properties. The model-specific
 * config takes precedence over defaults.
 * @param config - Model-specific configuration
 * @param defaults - Global default values to merge with
 * @returns Merged configuration with defaults applied
 */
export function mergeWithDefaults(
    config: SingleModelConfig,
    defaults?: ModelsConfigFile['defaults']
): SingleModelConfig {
    if (!defaults) {
        return config;
    }

    return {
        ...config,
        auth: {
            ...defaults.auth,
            ...config.auth
        },
        limits: {
            ...defaults.limits,
            ...config.limits
        },
        enableStats: config.enableStats ?? defaults.enableStats
    };
}
