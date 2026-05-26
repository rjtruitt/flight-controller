import { IOpenAITranslator, IContentAdapter, BaseContentAdapter } from './IOpenAITranslator.js';
import { OpenAIContext } from '../types/Context.js';
import { ModelCapabilities } from '../types/Capabilities.js';

/** Routes translations between any two registered providers via the OpenAI "Rosetta" intermediate. */
export class TranslatorRegistry {
    private translators: Map<string, IOpenAITranslator> = new Map();
    private adapters: Map<string, IContentAdapter> = new Map();
    private defaultAdapter: IContentAdapter;

    constructor() {
        this.defaultAdapter = new BaseContentAdapter();
    }

    register(providerId: string, translator: IOpenAITranslator): void {
        this.translators.set(providerId, translator);
    }

    registerAdapter(providerId: string, adapter: IContentAdapter): void {
        this.adapters.set(providerId, adapter);
    }

    get(providerId: string): IOpenAITranslator | undefined {
        return this.translators.get(providerId);
    }

    has(providerId: string): boolean {
        return this.translators.has(providerId);
    }

    translate<TSource = any, TTarget = any>(
        sourceFormat: TSource,
        sourceProviderId: string,
        targetProviderId: string,
        targetCapabilities?: ModelCapabilities
    ): TTarget {
        const sourceTranslator = this.translators.get(sourceProviderId);
        const targetTranslator = this.translators.get(targetProviderId);

        if (!sourceTranslator) {
            throw new Error(`No translator registered for source provider: ${sourceProviderId}`);
        }

        if (!targetTranslator) {
            throw new Error(`No translator registered for target provider: ${targetProviderId}`);
        }

        const rosettaContext = sourceTranslator.toOpenAI(sourceFormat);

        if (targetCapabilities) {
            const adapter = this.adapters.get(targetProviderId) || this.defaultAdapter;
            const capabilitySet = this.getCapabilitySet(targetCapabilities);

            rosettaContext.messages = rosettaContext.messages.map(msg => ({
                ...msg,
                content: adapter.adaptContent(msg.content, capabilitySet)
            }));
        }

        return targetTranslator.fromOpenAI(rosettaContext) as TTarget;
    }

    toOpenAI<T = any>(providerFormat: T, providerId: string): OpenAIContext {
        const translator = this.translators.get(providerId);

        if (!translator) {
            throw new Error(`No translator registered for provider: ${providerId}`);
        }

        return translator.toOpenAI(providerFormat);
    }

    fromOpenAI<T = any>(
        rosettaContext: OpenAIContext,
        providerId: string,
        targetCapabilities?: ModelCapabilities
    ): T {
        const translator = this.translators.get(providerId);

        if (!translator) {
            throw new Error(`No translator registered for provider: ${providerId}`);
        }

        let adapted = rosettaContext;
        if (targetCapabilities) {
            const adapter = this.adapters.get(providerId) || this.defaultAdapter;
            const capabilitySet = this.getCapabilitySet(targetCapabilities);

            adapted = {
                ...rosettaContext,
                messages: rosettaContext.messages.map(msg => ({
                    ...msg,
                    content: adapter.adaptContent(msg.content, capabilitySet)
                }))
            };
        }

        return translator.fromOpenAI(adapted) as T;
    }

    getProviderIds(): string[] {
        return Array.from(this.translators.keys());
    }

    private getCapabilitySet(capabilities: ModelCapabilities): Set<string> {
        const capSet = new Set<string>();

        if (capabilities.features.supportsVision) capSet.add('vision');
        if (capabilities.features.supportsAudio) capSet.add('audio');
        if (capabilities.features.supportsFunctions) capSet.add('native_tools');
        if (capabilities.toolHandling.mode === 'native') capSet.add('native_tools');

        for (const cap of capabilities.capabilities) {
            capSet.add(cap.toLowerCase().replace(/_/g, '-'));
        }

        return capSet;
    }
}

export const translatorRegistry = new TranslatorRegistry();
