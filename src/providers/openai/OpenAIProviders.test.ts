import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIProviders, OpenAIProvider } from './OpenAIProvider';
import { ModelIdentity } from '../../core/model/ModelIdentity';
import { ModelCapability } from '../../core/types/Capabilities';

function createBaseConfig() {
    return {
        apiKey: 'test-key-123',
        modelId: 'test-model',
        identity: new ModelIdentity({
            id: 'test-model',
            displayName: 'Test Model',
            provider: { id: 'test', displayName: 'Test' }
        }),
        capabilities: {
            capabilities: new Set([ModelCapability.CHAT]),
            features: {
                contextWindow: 128000,
                maxOutputTokens: 4096,
                supportsStreaming: true,
                supportsFunctions: true,
                supportsVision: false,
                supportsAudio: false
            },
            toolHandling: { mode: 'native' as const },
            inputTypes: new Set(['text' as const]),
            outputTypes: new Set(['text' as const])
        }
    };
}

describe('OpenAIProviders Factory', () => {
    describe('createDeepSeek', () => {
        it('sets correct baseURL for DeepSeek', () => {
            const provider = OpenAIProviders.createDeepSeek(createBaseConfig());
            // Access the private client to verify baseURL was passed
            const client = (provider as any).client;
            expect(client.baseURL).toContain('deepseek.com');
        });

        it('passes apiKey through', () => {
            const provider = OpenAIProviders.createDeepSeek(createBaseConfig());
            const client = (provider as any).client;
            expect(client.apiKey).toBe('test-key-123');
        });
    });

    describe('createGroq', () => {
        it('sets correct baseURL for Groq', () => {
            const provider = OpenAIProviders.createGroq(createBaseConfig());
            const client = (provider as any).client;
            expect(client.baseURL).toContain('groq.com');
        });

        it('passes apiKey through', () => {
            const provider = OpenAIProviders.createGroq(createBaseConfig());
            const client = (provider as any).client;
            expect(client.apiKey).toBe('test-key-123');
        });
    });

    describe('createTogether', () => {
        it('sets correct baseURL for Together AI', () => {
            const provider = OpenAIProviders.createTogether(createBaseConfig());
            const client = (provider as any).client;
            expect(client.baseURL).toContain('together.xyz');
        });

        it('passes apiKey through', () => {
            const provider = OpenAIProviders.createTogether(createBaseConfig());
            const client = (provider as any).client;
            expect(client.apiKey).toBe('test-key-123');
        });
    });

    describe('createPerplexity', () => {
        it('sets correct baseURL for Perplexity', () => {
            const provider = OpenAIProviders.createPerplexity(createBaseConfig());
            const client = (provider as any).client;
            expect(client.baseURL).toContain('perplexity.ai');
        });

        it('passes apiKey through', () => {
            const provider = OpenAIProviders.createPerplexity(createBaseConfig());
            const client = (provider as any).client;
            expect(client.apiKey).toBe('test-key-123');
        });
    });

    describe('createOllama', () => {
        it('sets apiKey to "none" (no key required)', () => {
            const { apiKey, ...configWithoutKey } = createBaseConfig();
            const provider = OpenAIProviders.createOllama(configWithoutKey);
            const client = (provider as any).client;
            expect(client.apiKey).toBe('none');
        });

        it('sets correct baseURL for local Ollama', () => {
            const { apiKey, ...configWithoutKey } = createBaseConfig();
            const provider = OpenAIProviders.createOllama(configWithoutKey);
            const client = (provider as any).client;
            expect(client.baseURL).toBe('http://localhost:11434/v1');
        });
    });

    describe('createLMStudio', () => {
        it('sets apiKey to "none" (no key required)', () => {
            const { apiKey, ...configWithoutKey } = createBaseConfig();
            const provider = OpenAIProviders.createLMStudio(configWithoutKey);
            const client = (provider as any).client;
            expect(client.apiKey).toBe('none');
        });

        it('sets correct baseURL for local LM Studio', () => {
            const { apiKey, ...configWithoutKey } = createBaseConfig();
            const provider = OpenAIProviders.createLMStudio(configWithoutKey);
            const client = (provider as any).client;
            expect(client.baseURL).toBe('http://localhost:1234/v1');
        });
    });

    describe('createCustom', () => {
        it('passes config unchanged to provider', () => {
            const config = {
                ...createBaseConfig(),
                baseURL: 'https://my-custom-llm.internal/api/v1'
            };
            const provider = OpenAIProviders.createCustom(config);
            const client = (provider as any).client;
            expect(client.baseURL).toBe('https://my-custom-llm.internal/api/v1');
            expect(client.apiKey).toBe('test-key-123');
        });

        it('returns an OpenAIProvider instance', () => {
            const config = {
                ...createBaseConfig(),
                baseURL: 'https://required-endpoint.example.com/v1'
            };
            const provider = OpenAIProviders.createCustom(config);
            expect(provider).toBeInstanceOf(OpenAIProvider);
        });
    });
});
