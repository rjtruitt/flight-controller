import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIProvider, OpenAIProviderConfig } from './OpenAIProvider';
import { OpenAIContext } from '../../core/types/Context';
import { ModelIdentity } from '../../core/model/ModelIdentity';
import { ModelCapability } from '../../core/types/Capabilities';

const mockCompletionsCreate = vi.fn();
const mockFromOpenAI = vi.fn().mockReturnValue({ messages: [], model: '' });
const mockResponseToOpenAI = vi.fn().mockReturnValue({
    content: [{ type: 'text', text: 'Hello from GPT' }],
    usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
    finishReason: 'stop',
    metadata: { modelId: 'gpt-4-turbo', custom: {} }
});

function createConfig(overrides?: Partial<OpenAIProviderConfig>): OpenAIProviderConfig {
    return {
        apiKey: 'sk-test-key',
        modelId: 'gpt-4-turbo',
        identity: new ModelIdentity({
            id: 'gpt-4-turbo',
            displayName: 'GPT-4 Turbo',
            provider: { id: 'openai', displayName: 'OpenAI' }
        }),
        capabilities: {
            capabilities: new Set([ModelCapability.CHAT, ModelCapability.FUNCTION_CALLING]),
            features: {
                contextWindow: 128000,
                maxOutputTokens: 4096,
                supportsStreaming: true,
                supportsFunctions: true,
                supportsVision: true,
                supportsAudio: false
            },
            toolHandling: { mode: 'native', maxTools: 128, supportsParallel: true },
            inputTypes: new Set(['text' as const, 'image' as const]),
            outputTypes: new Set(['text' as const])
        },
        ...overrides
    };
}

function createContext(overrides?: Partial<OpenAIContext>): OpenAIContext {
    return {
        messages: [
            { role: 'user', content: [{ type: 'text', text: 'Hello, GPT!' }] }
        ],
        maxTokens: 1000,
        ...overrides
    };
}

/**
 * Create provider with mocked internals (client + translator).
 */
function createMockedProvider(configOverrides?: Partial<OpenAIProviderConfig>): OpenAIProvider {
    const provider = new OpenAIProvider(createConfig(configOverrides));
    (provider as any).client = { chat: { completions: { create: mockCompletionsCreate } } };
    (provider as any).translator = { fromOpenAI: mockFromOpenAI, responseToOpenAI: mockResponseToOpenAI };
    return provider;
}

describe('OpenAIProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCompletionsCreate.mockResolvedValue({
            choices: [{ message: { content: 'Hi!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
            _request: { headers: { 'x-ratelimit-remaining-requests': '99' } }
        });
        mockFromOpenAI.mockReturnValue({ messages: [], model: '' });
        mockResponseToOpenAI.mockReturnValue({
            content: [{ type: 'text', text: 'Hello from GPT' }],
            usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
            finishReason: 'stop',
            metadata: { modelId: 'gpt-4-turbo', custom: {} }
        });
    });

    describe('Construction', () => {
        it('creates client with apiKey', () => {
            const provider = new OpenAIProvider(createConfig());
            expect((provider as any).client).toBeDefined();
            expect((provider as any).client.chat.completions).toBeDefined();
        });

        it('applies baseURL via config', () => {
            const provider = new OpenAIProvider(createConfig({
                baseURL: 'https://custom.openai.endpoint.com/v1'
            }));
            expect(provider).toBeDefined();
            expect(provider.getIdentity().provider.id).toBe('openai');
        });

        it('stores identity and capabilities', () => {
            const provider = new OpenAIProvider(createConfig());

            expect(provider.getIdentity().id).toBe('gpt-4-turbo');
            expect(provider.getIdentity().displayName).toBe('GPT-4 Turbo');
            expect(provider.getCapabilities().features.contextWindow).toBe(128000);
        });
    });

    describe('sendRequest', () => {
        let provider: OpenAIProvider;

        beforeEach(() => {
            provider = createMockedProvider();
        });

        it('calls translator.fromOpenAI with context', async () => {
            const context = createContext();

            await provider.sendMessage(context);

            expect(mockFromOpenAI).toHaveBeenCalledWith(context);
        });

        it('calls client.chat.completions.create with correct params', async () => {
            const context = createContext();
            mockFromOpenAI.mockReturnValue({
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 1000
            });

            await provider.sendMessage(context);

            expect(mockCompletionsCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: 'gpt-4-turbo',
                    messages: [{ role: 'user', content: 'Hello' }],
                    max_tokens: 1000
                })
            );
        });

        it('translates response back via responseToOpenAI', async () => {
            const result = await provider.sendMessage(createContext());

            expect(mockResponseToOpenAI).toHaveBeenCalled();
            expect(result.content[0]).toEqual({ type: 'text', text: 'Hello from GPT' });
        });

        it('passes tools when present in translated request', async () => {
            mockFromOpenAI.mockReturnValue({
                messages: [{ role: 'user', content: 'Hello' }],
                tools: [{ type: 'function', function: { name: 'search', parameters: { type: 'object' } } }]
            });

            await provider.sendMessage(createContext());

            expect(mockCompletionsCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    tools: [{ type: 'function', function: { name: 'search', parameters: { type: 'object' } } }]
                })
            );
        });

        it('handles streaming option', async () => {
            mockFromOpenAI.mockReturnValue({
                messages: [{ role: 'user', content: 'Hello' }],
                stream: true
            });

            await provider.sendMessage(createContext());

            expect(mockCompletionsCreate).toHaveBeenCalledWith(
                expect.objectContaining({ stream: true })
            );
        });
    });

    describe('Error Handling', () => {
        let provider: OpenAIProvider;

        beforeEach(() => {
            provider = createMockedProvider();
        });

        it('throws rate limit error for 429', async () => {
            mockCompletionsCreate.mockRejectedValue({
                status: 429,
                message: 'Rate limit exceeded'
            });

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Rate limit exceeded');
        });

        it('throws authentication error for 401', async () => {
            mockCompletionsCreate.mockRejectedValue({
                status: 401,
                message: 'Incorrect API key'
            });

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Authentication failed: Invalid API key');
        });

        it('rethrows errors for status 400', async () => {
            const error = new Error('Invalid model specified');
            (error as any).status = 400;
            mockCompletionsCreate.mockRejectedValue(error);

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Invalid model specified');
        });

        it('rethrows network errors', async () => {
            const error = new Error('ECONNREFUSED');
            mockCompletionsCreate.mockRejectedValue(error);

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('ECONNREFUSED');
        });

        it('rethrows unknown errors', async () => {
            const error = new Error('Unexpected server error');
            (error as any).status = 503;
            mockCompletionsCreate.mockRejectedValue(error);

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Unexpected server error');
        });
    });

    describe('Token Estimation', () => {
        it('estimates input tokens from message text length', () => {
            const provider = createMockedProvider();
            const estimate = (provider as any).estimateTokens(createContext({
                messages: [{ role: 'user', content: [{ type: 'text', text: 'A'.repeat(200) }] }]
            }));

            // 200 chars / 4 = 50 tokens
            expect(estimate.input).toBe(50);
        });

        it('uses maxTokens for output estimate (defaults to 1000)', () => {
            const provider = createMockedProvider();
            const estimate = (provider as any).estimateTokens(createContext({ maxTokens: 2000 }));

            expect(estimate.output).toBe(2000);
        });
    });
});
