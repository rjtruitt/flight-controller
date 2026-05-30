import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiProvider, GeminiProviderConfig } from './GeminiProvider';
import { OpenAIContext } from '../../core/types/Context';
import { ModelIdentity } from '../../core/model/ModelIdentity';
import { ModelCapability } from '../../core/types/Capabilities';

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn().mockReturnValue({
    generateContent: mockGenerateContent
});
const mockFromOpenAI = vi.fn().mockReturnValue({
    contents: [{ parts: [{ text: 'Hello' }], role: 'user' }],
    generationConfig: { maxOutputTokens: 2048 }
});
const mockResponseToOpenAI = vi.fn().mockReturnValue({
    content: [{ type: 'text', text: 'Hello from Gemini' }],
    usage: { inputTokens: 6, outputTokens: 4, totalTokens: 10 },
    finishReason: 'stop',
    metadata: { modelId: 'gemini-2.0-flash', custom: {} }
});

function createConfig(overrides?: Partial<GeminiProviderConfig>): GeminiProviderConfig {
    return {
        apiKey: 'gemini-test-key',
        modelId: 'gemini-2.0-flash',
        identity: new ModelIdentity({
            id: 'gemini-2.0-flash',
            displayName: 'Gemini 2.0 Flash',
            provider: { id: 'google', displayName: 'Google' }
        }),
        capabilities: {
            capabilities: new Set([ModelCapability.CHAT, ModelCapability.MULTIMODAL_INPUT]),
            features: {
                contextWindow: 1048576,
                maxOutputTokens: 8192,
                supportsStreaming: true,
                supportsFunctions: true,
                supportsVision: true,
                supportsAudio: true
            },
            toolHandling: { mode: 'native', maxTools: 64 },
            inputTypes: new Set(['text' as const, 'image' as const]),
            outputTypes: new Set(['text' as const])
        },
        ...overrides
    };
}

function createContext(overrides?: Partial<OpenAIContext>): OpenAIContext {
    return {
        messages: [
            { role: 'user', content: [{ type: 'text', text: 'Hello, Gemini!' }] }
        ],
        maxTokens: 2048,
        ...overrides
    };
}

/**
 * Create provider with mocked internals (client + translator).
 */
function createMockedProvider(configOverrides?: Partial<GeminiProviderConfig>): GeminiProvider {
    const provider = new GeminiProvider(createConfig(configOverrides));
    (provider as any).client = { getGenerativeModel: mockGetGenerativeModel };
    (provider as any).translator = { fromOpenAI: mockFromOpenAI, responseToOpenAI: mockResponseToOpenAI };
    return provider;
}

describe('GeminiProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGenerateContent.mockResolvedValue({
            response: {
                candidates: [{
                    content: { parts: [{ text: 'Hi from Gemini!' }], role: 'model' },
                    finishReason: 'STOP',
                    safetyRatings: []
                }],
                usageMetadata: {
                    promptTokenCount: 6,
                    candidatesTokenCount: 4,
                    totalTokenCount: 10
                }
            }
        });
        mockGetGenerativeModel.mockReturnValue({ generateContent: mockGenerateContent });
        mockFromOpenAI.mockReturnValue({
            contents: [{ parts: [{ text: 'Hello' }], role: 'user' }],
            generationConfig: { maxOutputTokens: 2048 }
        });
        mockResponseToOpenAI.mockReturnValue({
            content: [{ type: 'text', text: 'Hello from Gemini' }],
            usage: { inputTokens: 6, outputTokens: 4, totalTokens: 10 },
            finishReason: 'stop',
            metadata: { modelId: 'gemini-2.0-flash', custom: {} }
        });
    });

    describe('Construction', () => {
        it('creates GoogleGenerativeAI client with apiKey', () => {
            const provider = new GeminiProvider(createConfig());
            expect((provider as any).client).toBeDefined();
        });

        it('stores identity', () => {
            const provider = new GeminiProvider(createConfig());

            expect(provider.getIdentity().id).toBe('gemini-2.0-flash');
            expect(provider.getIdentity().displayName).toBe('Gemini 2.0 Flash');
            expect(provider.getIdentity().provider.id).toBe('google');
        });

        it('stores capabilities', () => {
            const provider = new GeminiProvider(createConfig());

            expect(provider.getCapabilities().features.contextWindow).toBe(1048576);
            expect(provider.getCapabilities().features.supportsVision).toBe(true);
            expect(provider.getCapabilities().features.supportsAudio).toBe(true);
        });
    });

    describe('sendRequest', () => {
        let provider: GeminiProvider;

        beforeEach(() => {
            provider = createMockedProvider();
        });

        it('calls translator.fromOpenAI with context', async () => {
            const context = createContext();

            await provider.sendMessage(context);

            expect(mockFromOpenAI).toHaveBeenCalledWith(context);
        });

        it('gets model instance with correct modelId', async () => {
            await provider.sendMessage(createContext());

            expect(mockGetGenerativeModel).toHaveBeenCalledWith({
                model: 'gemini-2.0-flash'
            });
        });

        it('calls generateContent with translated request', async () => {
            mockFromOpenAI.mockReturnValue({
                contents: [{ parts: [{ text: 'Test' }], role: 'user' }],
                generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
            });

            await provider.sendMessage(createContext());

            expect(mockGenerateContent).toHaveBeenCalledWith(
                expect.objectContaining({
                    contents: [{ parts: [{ text: 'Test' }], role: 'user' }],
                    generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
                })
            );
        });

        it('handles system instructions when present', async () => {
            mockFromOpenAI.mockReturnValue({
                contents: [{ parts: [{ text: 'Hello' }], role: 'user' }],
                generationConfig: { maxOutputTokens: 2048 },
                systemInstruction: { parts: [{ text: 'You are helpful.' }] }
            });

            await provider.sendMessage(createContext());

            expect(mockGenerateContent).toHaveBeenCalledWith(
                expect.objectContaining({
                    systemInstruction: { parts: [{ text: 'You are helpful.' }] }
                })
            );
        });

        it('handles tools when present', async () => {
            mockFromOpenAI.mockReturnValue({
                contents: [{ parts: [{ text: 'Hello' }], role: 'user' }],
                generationConfig: { maxOutputTokens: 2048 },
                tools: [{ functionDeclarations: [{ name: 'search', description: 'Search' }] }]
            });

            await provider.sendMessage(createContext());

            expect(mockGenerateContent).toHaveBeenCalledWith(
                expect.objectContaining({
                    tools: [{ functionDeclarations: [{ name: 'search', description: 'Search' }] }]
                })
            );
        });
    });

    describe('Error Handling', () => {
        let provider: GeminiProvider;

        beforeEach(() => {
            provider = createMockedProvider();
        });

        it('throws session limit for quota error with "daily" keyword', async () => {
            mockGenerateContent.mockRejectedValue(
                new Error('Quota exceeded: daily limit reached')
            );

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Session limit exceeded');
        });

        it('throws session limit for limit error with "session" keyword', async () => {
            mockGenerateContent.mockRejectedValue(
                new Error('Rate limit: session quota exhausted')
            );

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Session limit exceeded');
        });

        it('throws session limit for quota/limit error without session keywords', async () => {
            mockGenerateContent.mockRejectedValue(
                new Error('Quota exceeded: too many requests')
            );

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Session limit exceeded');
        });

        it('throws authentication error for unauthorized/api key errors', async () => {
            mockGenerateContent.mockRejectedValue(
                new Error('API key not valid. Please pass a valid API key.')
            );

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Authentication failed: Invalid API key');
        });

        it('rethrows generic errors unchanged', async () => {
            mockGenerateContent.mockRejectedValue(
                new Error('Internal server error')
            );

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Internal server error');
        });
    });

    describe('Token Estimation', () => {
        it('estimates input tokens from text content (~4 chars per token)', () => {
            const provider = createMockedProvider();
            const estimate = (provider as any).estimateTokens(createContext({
                messages: [{ role: 'user', content: [{ type: 'text', text: 'A'.repeat(400) }] }]
            }));

            expect(estimate.input).toBe(100); // 400 / 4
        });

        it('uses maxTokens for output estimate (defaults to 2048)', () => {
            const provider = createMockedProvider();
            const estimate = (provider as any).estimateTokens(createContext({ maxTokens: 4096 }));

            expect(estimate.output).toBe(4096);
        });
    });
});
