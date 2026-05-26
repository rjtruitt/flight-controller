/**
 * Prompt Caching Example - AWS Bedrock with Claude Sonnet 4
 *
 * Demonstrates how to use prompt caching to reduce token costs by up to 90%
 * for repeated context (system prompts, tools, conversation history).
 *
 * Cost comparison (Claude Sonnet 4 on Bedrock):
 * - Normal input tokens: $3.00 per 1M tokens
 * - Cached read tokens: $0.30 per 1M tokens (90% discount!)
 * - Cache write tokens: $3.75 per 1M tokens (25% premium, one-time)
 *
 * Example scenario: Multi-turn conversation with 10k token system prompt
 * - Turn 1: 10k write ($0.0375) + normal processing
 * - Turn 2-10: 10k read ($0.003 per turn = $0.027 total)
 * - Savings: $0.27 vs $0.30 for uncached = 90% reduction
 */

import { BedrockProvider } from '../src/providers/bedrock/BedrockProvider';
import { PromptCachingStrategy } from '../src/providers/bedrock/BedrockOpenAITranslator';

async function main() {
    // EXAMPLE 1: Default caching (caches system prompts + tools)
    const model = new BedrockProvider({
        modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        region: 'us-east-1',
        profile: 'default',
        identity: {
            providerId: 'bedrock',
            modelId: 'claude-sonnet-4',
            modelName: 'Claude Sonnet 4'
        },
        // Default caching: system prompts + tools
        // (enabled: true, cacheSystem: true, cacheTools: true)
    });

    // EXAMPLE 2: Aggressive caching (also cache conversation history)
    const aggressiveModel = new BedrockProvider({
        modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        region: 'us-east-1',
        profile: 'default',
        identity: {
            providerId: 'bedrock',
            modelId: 'claude-sonnet-4',
            modelName: 'Claude Sonnet 4'
        },
        cachingStrategy: {
            enabled: true,
            cacheSystem: true,
            cacheTools: true,
            // Cache message 5 positions from end (preserves recent context)
            cacheHistoryDistance: 5
        }
    });

    // EXAMPLE 3: Minimal caching (only tools, not system)
    const minimalModel = new BedrockProvider({
        modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        region: 'us-east-1',
        profile: 'default',
        identity: {
            providerId: 'bedrock',
            modelId: 'claude-sonnet-4',
            modelName: 'Claude Sonnet 4'
        },
        cachingStrategy: {
            enabled: true,
            cacheSystem: false,  // Don't cache system prompt
            cacheTools: true     // Only cache tools
        }
    });

    // EXAMPLE 4: Disable caching (useful for testing or non-Anthropic models)
    const noCacheModel = new BedrockProvider({
        modelId: 'us.meta.llama3-1-405b-instruct-v1:0',
        region: 'us-east-1',
        profile: 'default',
        identity: {
            providerId: 'bedrock',
            modelId: 'llama-3.1-405b',
            modelName: 'Llama 3.1 405B'
        },
        cachingStrategy: {
            enabled: false  // Meta models don't support caching
        }
    });

    // EXAMPLE 5: Multi-turn conversation with caching
    const conversation = await demonstrateCaching(model);

    console.log('\n=== Caching Analytics ===');
    console.log(`Total tokens saved: ${conversation.tokensSaved}`);
    console.log(`Cost savings: $${conversation.costSavings.toFixed(4)}`);
}

/**
 * Demonstrate caching with multi-turn conversation
 */
async function demonstrateCaching(model: BedrockProvider) {
    const systemPrompt = `You are a helpful AI assistant with extensive knowledge of software architecture.
Your role is to help developers design robust, scalable systems.

Key principles:
1. Start simple, add complexity only when needed
2. Optimize for readability and maintainability
3. Consider failure modes and edge cases
4. Use proven patterns before inventing new ones
5. Document decisions and tradeoffs

You have access to the following architectural patterns:
- Microservices: Distributed systems with service boundaries
- Event-driven: Async communication via message queues
- CQRS: Separate read and write models
- Serverless: Function-as-a-service architectures
- Monolith: Single deployment unit

When recommending patterns, always explain:
- Why this pattern fits the requirements
- What tradeoffs are being made
- What complexity is being added
- What failure modes to watch for`.repeat(10); // 10x to simulate large prompt

    // Turn 1: Cache write (system + tools)
    console.log('\n=== Turn 1: Cache write ===');
    const response1 = await model.sendMessage({
        messages: [
            {
                role: 'system',
                content: [{ type: 'text', text: systemPrompt }]
            },
            {
                role: 'user',
                content: [{ type: 'text', text: 'What architecture should I use for a social media app?' }]
            }
        ],
        tools: createSampleTools()
    });

    console.log(`Input: ${response1.usage.inputTokens} tokens`);
    console.log(`Cache write: ${response1.usage.cacheWriteTokens || 0} tokens`);
    console.log(`Output: ${response1.usage.outputTokens} tokens`);

    // Turn 2: Cache read (system + tools cached)
    console.log('\n=== Turn 2: Cache read ===');
    const response2 = await model.sendMessage({
        messages: [
            {
                role: 'system',
                content: [{ type: 'text', text: systemPrompt }]
            },
            {
                role: 'user',
                content: [{ type: 'text', text: 'What architecture should I use for a social media app?' }]
            },
            {
                role: 'assistant',
                content: [{ type: 'text', text: response1.content[0].text }]
            },
            {
                role: 'user',
                content: [{ type: 'text', text: 'How would you handle real-time notifications?' }]
            }
        ],
        tools: createSampleTools()
    });

    console.log(`Input: ${response2.usage.inputTokens} tokens`);
    console.log(`Cache read: ${response2.usage.cacheReadTokens || 0} tokens`);
    console.log(`Output: ${response2.usage.outputTokens} tokens`);

    // Calculate savings
    const normalCost = (response1.usage.inputTokens + response2.usage.inputTokens) * 0.000003; // $3/1M
    const cacheCost =
        (response1.usage.inputTokens * 0.000003) +
        ((response1.usage.cacheWriteTokens || 0) * 0.00000375) +
        (response2.usage.inputTokens * 0.000003) +
        ((response2.usage.cacheReadTokens || 0) * 0.0000003);

    return {
        tokensSaved: (response2.usage.cacheReadTokens || 0),
        costSavings: normalCost - cacheCost
    };
}

/**
 * Sample tools for demonstration
 */
function createSampleTools() {
    return [
        {
            type: 'function' as const,
            function: {
                name: 'analyze_traffic_patterns',
                description: 'Analyze expected traffic patterns and scale requirements',
                parameters: {
                    type: 'object',
                    properties: {
                        daily_active_users: { type: 'number' },
                        peak_multiplier: { type: 'number' },
                        geographical_distribution: { type: 'string' }
                    },
                    required: ['daily_active_users']
                }
            }
        },
        {
            type: 'function' as const,
            function: {
                name: 'estimate_costs',
                description: 'Estimate infrastructure costs for given architecture',
                parameters: {
                    type: 'object',
                    properties: {
                        architecture_type: { type: 'string', enum: ['microservices', 'monolith', 'serverless'] },
                        scale_tier: { type: 'string', enum: ['small', 'medium', 'large', 'xlarge'] }
                    },
                    required: ['architecture_type', 'scale_tier']
                }
            }
        }
    ];
}

/**
 * Cost analysis helper
 */
function analyzeCachingBenefit() {
    console.log('\n=== Caching Cost Analysis ===\n');

    // Scenario: 100-turn conversation with 10k token system prompt + 5k token tools
    const turnsPerConversation = 100;
    const systemTokens = 10000;
    const toolTokens = 5000;
    const cachedTokens = systemTokens + toolTokens; // 15k tokens cached

    // Pricing (Claude Sonnet 4 on Bedrock)
    const normalRate = 3.00 / 1_000_000;      // $3 per 1M tokens
    const cacheWriteRate = 3.75 / 1_000_000;  // $3.75 per 1M tokens (25% premium)
    const cacheReadRate = 0.30 / 1_000_000;   // $0.30 per 1M tokens (90% discount)

    // Without caching: Pay normal rate every turn
    const costWithoutCache = cachedTokens * normalRate * turnsPerConversation;

    // With caching: Pay write once, then read rate for remaining turns
    const costWithCache =
        (cachedTokens * cacheWriteRate) +  // Write once
        (cachedTokens * cacheReadRate * (turnsPerConversation - 1));  // Read 99 times

    console.log('Scenario: 100-turn conversation');
    console.log(`Cached content: ${cachedTokens.toLocaleString()} tokens (system + tools)`);
    console.log('');
    console.log('Without caching:');
    console.log(`  ${cachedTokens.toLocaleString()} tokens × $${normalRate * 1_000_000}/1M × ${turnsPerConversation} turns`);
    console.log(`  = $${costWithoutCache.toFixed(4)}`);
    console.log('');
    console.log('With caching:');
    console.log(`  Write: ${cachedTokens.toLocaleString()} tokens × $${cacheWriteRate * 1_000_000}/1M = $${(cachedTokens * cacheWriteRate).toFixed(4)}`);
    console.log(`  Read:  ${cachedTokens.toLocaleString()} tokens × $${cacheReadRate * 1_000_000}/1M × ${turnsPerConversation - 1} turns = $${(cachedTokens * cacheReadRate * (turnsPerConversation - 1)).toFixed(4)}`);
    console.log(`  Total: $${costWithCache.toFixed(4)}`);
    console.log('');
    console.log(`💰 Savings: $${(costWithoutCache - costWithCache).toFixed(4)} (${((1 - costWithCache / costWithoutCache) * 100).toFixed(1)}% reduction)`);
}

// Run examples
if (require.main === module) {
    analyzeCachingBenefit();
    // Uncomment to run actual API calls:
    // main().catch(console.error);
}
