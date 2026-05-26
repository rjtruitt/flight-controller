import { Model } from '../model/Model.js';
import { SingleModelConfig } from '../config/ModelConfigTypes.js';
import { createAuthProvider } from './AuthProviderFactory.js';
import { createIdentity } from './ComponentFactory.js';

export { createAuthProvider } from './AuthProviderFactory.js';
export * from './ComponentFactory.js';

/** Creates Model instances from configuration. */
export class ModelFactory {
    /** Instantiate a provider-specific Model subclass from a flat config. */
    createModel(config: SingleModelConfig): Model {
        const identity = createIdentity(config);
        const auth = createAuthProvider(config.auth);

        throw new Error(
            `Provider ${config.provider} not yet implemented. ` +
            `Implement provider-specific Model subclass (e.g., AnthropicModel, BedrockModel). ` +
            `Config ready: identity=${identity.id}, auth=${auth.constructor.name}`
        );
    }
}
