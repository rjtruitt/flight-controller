import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnthropicProvider, AnthropicProviderConfig } from './AnthropicProvider';
import { OpenAIContext } from '../../core/types/Context';
import { ModelIdentity } from '../../core/model/ModelIdentity';
import { ModelCapability } from '../../core/types/Capabilities';

const mockMessagesCreate = vi.fn();
const mockFromOpenAI = vi.fn().mockReturnValue({ messages: [], model: '' });
const mockResponseToOpenAI = vi.fn().mockReturnValue({
    content: [{ type: 'text', text: 'Hello' }],
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    finishReason: 'stop',
    metadata: { modelId: 'claude-sonnet-4-20250514', custom: {} }
});

function createConfig(overrides?: Partial<AnthropicProviderConfig>): AnthropicProviderConfig {
    return {
        apiKey: 'test-api-key',
        modelId: 'claude-sonnet-4-20250514',
        identity: new ModelIdentity({
            id: 'claude-sonnet-4',
            displayName: 'Claude Sonnet 4',
            provider: { id: 'anthropic', displayName: 'Anthropic' }
        }),
        capabilities: {
            capabilities: new Set([ModelCapability.CHAT, ModelCapability.FUNCTION_CALLING]),
            features: {
                contextWindow: 200000,
                maxOutputTokens: 8192,
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
            { role: 'user', content: [{ type: 'text', text: 'Hello, Claude!' }] }
        ],
        maxTokens: 4096,
        ...overrides
    };
}

/**
 * Create provider with mocked internals (client + translator).
 * Since vi.mock cannot intercept transitive CJS dependencies in this project,
 * we patch private properties after construction.
 */
function createMockedProvider(configOverrides?: Partial<AnthropicProviderConfig>): AnthropicProvider {
    const provider = new AnthropicProvider(createConfig(configOverrides));
    // Patch private client and translator
    (provider as any).client = { messages: { create: mockMessagesCreate } };
    (provider as any).translator = { fromOpenAI: mockFromOpenAI, responseToOpenAI: mockResponseToOpenAI };
    return provider;
}

describe('AnthropicProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockMessagesCreate.mockResolvedValue({
            content: [{ type: 'text', text: 'Hi there!' }],
            usage: { input_tokens: 10, output_tokens: 5 },
            stop_reason: 'end_turn',
            response: { headers: { 'x-ratelimit-remaining': '99' } }
        });
        mockFromOpenAI.mockReturnValue({ messages: [], model: '' });
        mockResponseToOpenAI.mockReturnValue({
            content: [{ type: 'text', text: 'Hello' }],
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            finishReason: 'stop',
            metadata: { modelId: 'claude-sonnet-4-20250514', custom: {} }
        });
    });

    describe('Construction', () => {
        it('creates client with apiKey', () => {
            const provider = new AnthropicProvider(createConfig());
            // Verify the client was created (it's a private property)
            expect((provider as any).client).toBeDefined();
            expect((provider as any).client.messages).toBeDefined();
        });

        it('applies baseURL via config', () => {
            // The baseURL is passed to the Anthropic constructor
            // We verify it doesn't throw and the provider is created
            const provider = new AnthropicProvider(createConfig({
                baseURL: 'https://custom.endpoint.com'
            }));
            expect(provider).toBeDefined();
            expect(provider.getIdentity().provider.id).toBe('anthropic');
        });

        it('stores identity and capabilities', () => {
            const provider = new AnthropicProvider(createConfig());

            expect(provider.getIdentity().id).toBe('claude-sonnet-4');
            expect(provider.getIdentity().displayName).toBe('Claude Sonnet 4');
            expect(provider.getCapabilities().features.contextWindow).toBe(200000);
            expect(provider.getCapabilities().features.supportsVision).toBe(true);
        });
    });

    describe('sendRequest', () => {
        let provider: AnthropicProvider;

        beforeEach(() => {
            provider = createMockedProvider();
        });

        it('calls translator.fromOpenAI with context', async () => {
            const context = createContext();

            await provider.sendMessage(context);

            expect(mockFromOpenAI).toHaveBeenCalledWith(context);
        });

        it('calls client.messages.create with correct params including model', async () => {
            const context = createContext();
            mockFromOpenAI.mockReturnValue({
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 4096
            });

            await provider.sendMessage(context);

            expect(mockMessagesCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: 'claude-sonnet-4-20250514',
                    messages: [{ role: 'user', content: 'Hello' }],
                    max_tokens: 4096
                })
            );
        });

        it('translates response back via responseToOpenAI', async () => {
            const context = createContext();

            const result = await provider.sendMessage(context);

            expect(mockResponseToOpenAI).toHaveBeenCalled();
            expect(result.content[0]).toEqual({ type: 'text', text: 'Hello' });
        });

        it('attaches headers to metadata', async () => {
            const context = createContext();
            mockResponseToOpenAI.mockReturnValue({
                content: [{ type: 'text', text: 'Hello' }],
                usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
                finishReason: 'stop',
                metadata: { modelId: 'claude-sonnet-4-20250514', custom: {} }
            });

            const result = await provider.sendMessage(context);

            expect(result.metadata?.custom).toHaveProperty('headers');
        });

        it('handles streaming option in translated request', async () => {
            mockFromOpenAI.mockReturnValue({
                messages: [{ role: 'user', content: 'Hello' }],
                stream: true
            });

            await provider.sendMessage(createContext());

            expect(mockMessagesCreate).toHaveBeenCalledWith(
                expect.objectContaining({ stream: true })
            );
        });

        it('passes tools when present in translated request', async () => {
            mockFromOpenAI.mockReturnValue({
                messages: [{ role: 'user', content: 'Hello' }],
                tools: [{ name: 'get_weather', input_schema: { type: 'object' } }]
            });

            await provider.sendMessage(createContext({
                tools: [{
                    type: 'function',
                    function: { name: 'get_weather', parameters: { type: 'object' } }
                }]
            }));

            expect(mockMessagesCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    tools: [{ name: 'get_weather', input_schema: { type: 'object' } }]
                })
            );
        });
    });

    describe('Error Handling', () => {
        let provider: AnthropicProvider;

        beforeEach(() => {
            provider = createMockedProvider();
        });

        it('throws session limit message for 429 with "daily" in message', async () => {
            mockMessagesCreate.mockRejectedValue({
                status: 429,
                message: 'Daily limit exceeded for this model'
            });

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Session limit exceeded');
        });

        it('throws session limit message for 429 with "session" in message', async () => {
            mockMessagesCreate.mockRejectedValue({
                status: 429,
                message: 'Session rate limit reached'
            });

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Session limit exceeded');
        });

        it('throws rate limit error for 429 without session keywords', async () => {
            mockMessagesCreate.mockRejectedValue({
                status: 429,
                message: 'Too many requests'
            });

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Rate limit exceeded');
        });

        it('throws authentication error for 401', async () => {
            mockMessagesCreate.mockRejectedValue({
                status: 401,
                message: 'Invalid API key'
            });

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Authentication failed: Invalid API key');
        });

        it('rethrows errors not caught by provider error handling (e.g. 400)', async () => {
            const error = new Error('Invalid request body');
            (error as any).status = 400;
            mockMessagesCreate.mockRejectedValue(error);

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Invalid request body');
        });

        it('rethrows unknown errors without status code', async () => {
            const error = new Error('Network connectivity issue');
            mockMessagesCreate.mockRejectedValue(error);

            await expect(provider.sendMessage(createContext()))
                .rejects.toThrow('Network connectivity issue');
        });
    });

    describe('Token Estimation', () => {
        it('estimates input tokens from message length (~4 chars per token)', () => {
            const provider = createMockedProvider();
            // Access the protected method via casting
            const estimate = (provider as any).estimateTokens(createContext({
                messages: [{ role: 'user', content: [{ type: 'text', text: 'A'.repeat(400) }] }]
            }));

            // 400 chars / 4 chars per token = 100 tokens
            expect(estimate.input).toBe(100);
        });

        it('uses maxTokens for output estimate', () => {
            const provider = createMockedProvider();
            const estimate = (provider as any).estimateTokens(createContext({ maxTokens: 8192 }));

            expect(estimate.output).toBe(8192);
        });

        it('handles empty messages gracefully', () => {
            const provider = createMockedProvider();
            const estimate = (provider as any).estimateTokens(createContext({ messages: [] }));

            expect(estimate.input).toBe(0);
            expect(estimate.output).toBe(4096); // default maxTokens from context
        });
    });
});
