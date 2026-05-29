import { GoogleGenerativeAI } from '@google/generative-ai';
import { Model, ModelConfig } from '../../core/model/Model.js';
import { ModelResponse } from '../../core/types/Response.js';
import { OpenAIContext } from '../../core/types/Context.js';
import { GeminiOpenAITranslator } from './GeminiOpenAITranslator.js';
import { GeminiResponse } from './GeminiTypes.js';
import { RateLimitError, AuthenticationError, ProviderError } from '../../core/errors/LLMError.js';

/** Extracts retry delay in seconds from a Gemini error message. Checks RetryInfo JSON and "retry in Ns" text. */
function extractRetrySeconds(errorMessage: string): number | undefined {
    // Try JSON RetryInfo
    const retryMatch = errorMessage.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
    if (retryMatch) return parseFloat(retryMatch[1]);
    // Try "retry in N.NNNs" text
    const textMatch = errorMessage.match(/retry\s+in\s+(\d+(?:\.\d+)?)\s*s/i);
    if (textMatch) return parseFloat(textMatch[1]);
    return undefined;
}

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

            // Catch JSON parse errors and provide context
            if (errorMessage.includes('bad control character') || errorMessage.includes('json.parse') || errorMessage.includes('unexpected token')) {
                console.error(`[GeminiProvider] JSON error — messages in context: ${(context as any).messages?.length ?? 0}`);
                throw new ProviderError('gemini', `JSON parse error in Gemini response: ${error.message}`, { modelId: this.modelId }, undefined, error);
            }

            if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
                const retryAfter = extractRetrySeconds(errorMessage);
                const timer = retryAfter ? ` — retry in ${Math.ceil(retryAfter)}s` : '';
                throw new RateLimitError(`Session limit exceeded${timer}`, { provider: 'gemini', retryAfter }, retryAfter, error);
            }

            if (errorMessage.includes('api key') || errorMessage.includes('unauthorized')) {
                throw new AuthenticationError('Authentication failed: Invalid API key', { provider: 'gemini' });
            }

            throw error;
        }
    }

    /** Stream Gemini content using generateContentStream. */
    protected async *sendStreamRequest(context: OpenAIContext): AsyncGenerator<import('../../core/types/Response.js').StreamChunk> {
        const geminiRequest = this.translator.fromOpenAI(context);
        const model = this.client.getGenerativeModel({ model: this.modelId });

        const request: any = {
            contents: geminiRequest.contents,
            generationConfig: geminiRequest.generationConfig,
        };
        if (geminiRequest.systemInstruction) request.systemInstruction = geminiRequest.systemInstruction;
        if (geminiRequest.tools) request.tools = geminiRequest.tools;

        try {
            const result = await model.generateContentStream(request);

            for await (const chunk of result.stream) {
                const parts = (chunk.candidates?.[0]?.content?.parts as any[]) || [];
                const text = parts.map((p: any) => p.text || '').join('');
                const content: import('../../core/types/Message.js').OpenAIContent[] = [];
                if (text) {
                    content.push({ type: 'text', text });
                }
                for (const p of parts) {
                    if (p.functionCall) {
                        // functionCall.args from Gemini SDK is already a parsed object.
                        // Pass it as-is (matching OpenAI provider's pattern with JSON.parse).
                        content.push({
                            type: 'tool_call',
                            id: p.functionCall.name || 'fc_' + Date.now(),
                            name: p.functionCall.name,
                            arguments: p.functionCall.args || {},
                        });
                    }
                }
                yield {
                    content,
                    done: false,
                    usage: chunk.usageMetadata
                        ? {
                            inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
                            outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
                            totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
                            cacheReadTokens: (chunk.usageMetadata as any).cachedContentTokenCount ?? 0,
                            cacheWriteTokens: 0,
                        }
                        : undefined,
                };
            }

            // Final done chunk with usage if available
            yield {
                content: [],
                done: true,
            };
        } catch (error: any) {
            const errorMessage = error.message?.toLowerCase() || '';
            if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
                const retryAfter = extractRetrySeconds(errorMessage);
                const timer = retryAfter ? ` — retry in ${Math.ceil(retryAfter)}s` : '';
                throw new RateLimitError(`Session limit exceeded${timer}`, { provider: 'gemini', retryAfter }, retryAfter, error);
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
