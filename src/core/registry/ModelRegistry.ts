import { Model } from '../model/Model.js';
import { ModelCapability } from '../types/Capabilities.js';

/** Central registry of active Model instances for capability/provider/performance lookup. */
export class ModelRegistry {
    private models: Map<string, Model> = new Map();

    register(name: string, model: Model): void {
        this.models.set(name, model);
    }

    unregister(name: string): boolean {
        return this.models.delete(name);
    }

    get(name: string): Model | undefined {
        return this.models.get(name);
    }

    has(name: string): boolean {
        return this.models.has(name);
    }

    getNames(): string[] {
        return Array.from(this.models.keys());
    }

    getAll(): Model[] {
        return Array.from(this.models.values());
    }

    findByCapability(capability: ModelCapability): Model[] {
        return this.getAll().filter(model =>
            model.getCapabilities().capabilities.has(capability)
        );
    }

    findByProvider(providerId: string): Model[] {
        return this.getAll().filter(model =>
            model.getIdentity().provider.id === providerId
        );
    }

    findByCapabilities(capabilities: ModelCapability[]): Model[] {
        return this.getAll().filter(model => {
            const modelCaps = model.getCapabilities().capabilities;
            return capabilities.every(cap => modelCaps.has(cap));
        });
    }

    findCheapest(_models?: Model[]): Model | undefined {
        return undefined;
    }

    findFastest(models?: Model[]): Model | undefined {
        const candidates = models || this.getAll();

        let fastest: Model | undefined;
        let lowestLatency = Infinity;

        for (const model of candidates) {
            const stats = model.getStats();
            if (!stats) continue;

            const avgLatency = stats.getAverageLatency();
            if (avgLatency < lowestLatency) {
                lowestLatency = avgLatency;
                fastest = model;
            }
        }

        return fastest;
    }

    findMostReliable(models?: Model[]): Model | undefined {
        const candidates = models || this.getAll();

        let mostReliable: Model | undefined;
        let lowestErrorRate = Infinity;

        for (const model of candidates) {
            const stats = model.getStats();
            if (!stats) continue;

            const errorRate = stats.getErrorRate();
            if (errorRate < lowestErrorRate) {
                lowestErrorRate = errorRate;
                mostReliable = model;
            }
        }

        return mostReliable;
    }

    findBest(requirements: {
        capabilities?: ModelCapability[];
        provider?: string;
        maxCost?: number;
        maxLatency?: number;
        minReliability?: number;
    }): Model | undefined {
        let candidates = this.getAll();

        if (requirements.capabilities) {
            candidates = this.findByCapabilities(requirements.capabilities);
        }

        if (requirements.provider) {
            candidates = candidates.filter(m =>
                m.getIdentity().provider.id === requirements.provider
            );
        }

        if (requirements.maxLatency !== undefined) {
            candidates = candidates.filter(m => {
                const stats = m.getStats();
                const avgLatency = stats?.getAverageLatency();
                return avgLatency === undefined || avgLatency <= requirements.maxLatency!;
            });
        }

        if (requirements.minReliability !== undefined) {
            candidates = candidates.filter(m => {
                const stats = m.getStats();
                const errorRate = stats?.getErrorRate();
                return errorRate === undefined || (100 - errorRate) >= requirements.minReliability!;
            });
        }

        return this.findFastest(candidates);
    }

    clear(): void {
        this.models.clear();
    }

    size(): number {
        return this.models.size;
    }
}
