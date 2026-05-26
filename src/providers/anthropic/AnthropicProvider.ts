import Anthropic from '@anthropic-ai/sdk';
import { Model, ModelConfig } from '../../core/model/Model.js';
import { ModelResponse } from '../../core/types/Response.js';
import { OpenAIContext } from '../../core/types/Context.js';
import { AnthropicOpenAITranslator } from './AnthropicOpenAITranslator.js';

export interface AnthropicProviderConfig extends Omit<ModelConfig, 'auth'> {
    apiKey: string;
    modelId: string;
    baseURL?: string;
}

/** Anthropic Messages API provider (direct API key auth). */
export class AnthropicProvider extends Model {
    private client: Anthropic;
    private translator: AnthropicOpenAITranslator;
    private modelId: string;

    constructor(config: AnthropicProviderConfig) {
        super({
            identity: config.identity,
            auth: {
                isAuthenticated: () => true,
                authenticate: async () => {},
                getAuthHeaders: async () => ({ 'x-api-key': config.apiKey })
            } as any,
            capabilities: config.capabilities,
            limits: config.limits,
            pricing: config.pricing,
            stats: config.stats,
            errorHandler: config.errorHandler
        });

        this.client = new Anthropic({
            apiKey: config.apiKey,
            baseURL: config.baseURL
        });

        this.translator = new AnthropicOpenAITranslator();
        this.modelId = config.modelId;
    }

    protected async sendRequest(context: OpenAIContext): Promise<ModelResponse> {
        const anthropicRequest = this.translator.fromOpenAI(context);
        anthropicRequest.model = this.modelId;

        try {
            const response = await this.client.messages.create(anthropicRequest as any);

            const headers = (response as any).response?.headers || {};

            const rosettaResponse = this.translator.responseToOpenAI(response as any);

            if (rosettaResponse.metadata) {
                rosettaResponse.metadata.custom = {
                    ...rosettaResponse.metadata.custom,
                    headers
                };
            }

            return rosettaResponse;
        } catch (error: any) {
            if (error.status === 429) {
                const errorMessage = error.message?.toLowerCase() || '';
                if (errorMessage.includes('daily') || errorMessage.includes('session')) {
                    throw new Error('Session limit exceeded');
                }
                throw new Error('Rate limit exceeded');
            }
            if (error.status === 401) {
                throw new Error('Authentication failed: Invalid API key');
            }

            throw error;
        }
    }

    protected estimateTokens(context: OpenAIContext): { input: number; output: number } {
        const textContent = context.messages
            .flatMap(m => m.content)
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');

        const inputTokens = Math.ceil(textContent.length / 4);
        const outputTokens = context.maxTokens || 4096;

        return { input: inputTokens, output: outputTokens };
    }
}
