import { GoogleGenerativeAI } from '@google/generative-ai';
import { Model, ModelConfig } from '../../core/model/Model.js';
import { ModelResponse } from '../../core/types/Response.js';
import { OpenAIContext } from '../../core/types/Context.js';
import { GeminiOpenAITranslator } from './GeminiOpenAITranslator.js';
import { GeminiResponse } from './GeminiTypes.js';

/** Configuration for Google Gemini. Auth is handled via API key. */
export interface GeminiProviderConfig extends Omit<ModelConfig, 'auth'> {
    apiKey: string;
    modelId: string;
}

/** Google Gemini provider using the generateContent API. */
export class GeminiProvider extends Model {
    private client: GoogleGenerativeAI;
    private translator: GeminiOpenAITranslator;
    private modelId: string;

    constructor(config: GeminiProviderConfig) {
        super({
            identity: config.identity,
            auth: {
                isAuthenticated: () => true,
                authenticate: async () => {},
                getAuthHeaders: async () => ({ 'x-goog-api-key': config.apiKey })
            } as any,
            capabilities: config.capabilities,
            limits: config.limits,
            pricing: config.pricing,
            stats: config.stats,
            errorHandler: config.errorHandler
        });

        this.client = new GoogleGenerativeAI(config.apiKey);
        this.translator = new GeminiOpenAITranslator();
        this.modelId = config.modelId;
    }

    protected async sendRequest(context: OpenAIContext): Promise<ModelResponse> {
        const geminiRequest = this.translator.fromOpenAI(context);

        try {
            const model = this.client.getGenerativeModel({ model: this.modelId });

            const request: any = {
                contents: geminiRequest.contents,
                generationConfig: geminiRequest.generationConfig
            };

            if (geminiRequest.systemInstruction) {
                request.systemInstruction = geminiRequest.systemInstruction;
            }

            if (geminiRequest.tools) {
                request.tools = geminiRequest.tools;
            }

            const result = await model.generateContent(request);
            const response = result.response;

            const geminiResponse: GeminiResponse = {
                candidates: [
                    {
                        content: {
                            parts: (response.candidates?.[0]?.content?.parts as any) || [],
                            role: 'model'
                        },
                        finishReason: (response.candidates?.[0]?.finishReason as any) || 'STOP',
                        index: 0,
                        safetyRatings: response.candidates?.[0]?.safetyRatings
                    }
                ],
                usageMetadata: response.usageMetadata
                    ? {
                          promptTokenCount: response.usageMetadata.promptTokenCount || 0,
                          candidatesTokenCount: response.usageMetadata.candidatesTokenCount || 0,
                          totalTokenCount: response.usageMetadata.totalTokenCount || 0,
                          cachedContentTokenCount: (response.usageMetadata as any).cachedContentTokenCount ?? 0,
                      }
                    : undefined,
                modelVersion: this.modelId
            };

            const rosettaResponse = this.translator.responseToOpenAI(geminiResponse);

            return rosettaResponse;
        } catch (error: any) {
            const errorMessage = error.message?.toLowerCase() || '';

            if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
                if (errorMessage.includes('daily') || errorMessage.includes('session')) {
                    throw new Error('Session limit exceeded');
                }
                throw new Error('Rate limit exceeded');
            }

            if (errorMessage.includes('api key') || errorMessage.includes('unauthorized')) {
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
        const outputTokens = context.maxTokens || 2048;

        return { input: inputTokens, output: outputTokens };
    }
}
