import { AuthConfig, SingleModelConfig, ModelsConfigFile } from './ModelConfigTypes.js';

/**
 * Validate a complete model configuration file.
 * Checks that models is a non-empty object and validates each entry.
 * @param config - The model configuration to validate
 * @throws {Error} If config is invalid or any model fails validation
 */
export function validateConfig(config: ModelsConfigFile): void {
    if (!config.models || typeof config.models !== 'object') {
        throw new Error('Invalid config: models object required');
    }

    for (const [name, model] of Object.entries(config.models)) {
        validateModelConfig(name, model);
    }
}

/**
 * Validate a single model's configuration.
 * Ensures provider, modelId, and auth config are all present.
 * @param name - Model name (used in error messages)
 * @param config - The model's configuration to validate
 * @throws {Error} If required fields are missing
 */
export function validateModelConfig(name: string, config: SingleModelConfig): void {
    if (!config.provider) {
        throw new Error(`Model ${name}: provider required`);
    }

    if (!config.modelId) {
        throw new Error(`Model ${name}: modelId required`);
    }

    if (!config.auth || !config.auth.type) {
        throw new Error(`Model ${name}: auth configuration required`);
    }

    validateAuthConfig(name, config.auth);
}

/**
 * Validate authentication configuration for a model.
 * Checks for required fields based on the auth type.
 * @param modelName - Model name (used in error messages)
 * @param auth - Authentication configuration to validate
 * @throws {Error} If required auth fields are missing for the given auth type
 */
export function validateAuthConfig(modelName: string, auth: AuthConfig): void {
    switch (auth.type) {
        case 'api_key':
            if (!auth.apiKey) {
                throw new Error(`Model ${modelName}: apiKey required for api_key auth`);
            }
            break;

        case 'aws_profile':
            if (!auth.region) {
                throw new Error(`Model ${modelName}: region required for aws_profile auth`);
            }
            break;

        case 'aws_credentials':
            if (!auth.region || !auth.accessKeyId || !auth.secretAccessKey) {
                throw new Error(`Model ${modelName}: region, accessKeyId, secretAccessKey required for aws_credentials auth`);
            }
            break;

        case 'azure_managed_identity':
            if (!auth.resource) {
                throw new Error(`Model ${modelName}: resource required for azure_managed_identity auth`);
            }
            break;

        case 'azure_service_principal':
            if (!auth.tenantId || !auth.clientId || !auth.clientSecret || !auth.scope) {
                throw new Error(`Model ${modelName}: tenantId, clientId, clientSecret, scope required for azure_service_principal auth`);
            }
            break;

        case 'google_adc':
            if (!auth.scopes || auth.scopes.length === 0) {
                throw new Error(`Model ${modelName}: scopes required for google_adc auth`);
            }
            break;

        case 'google_service_account':
            if (!auth.serviceAccountJson || !auth.scopes) {
                throw new Error(`Model ${modelName}: serviceAccountJson and scopes required for google_service_account auth`);
            }
            break;

        case 'browser_oauth':
            if (!auth.authUrl || !auth.tokenUrl || !auth.clientId || !auth.scopes) {
                throw new Error(`Model ${modelName}: authUrl, tokenUrl, clientId, scopes required for browser_oauth auth`);
            }
            break;
    }
}
