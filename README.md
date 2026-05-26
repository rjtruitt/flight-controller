# Flight Controller

**LLM provider abstraction layer** — a single interface for Anthropic, OpenAI, Bedrock, Gemini, and any API-compatible provider, with unified rate limiting, cost tracking, retry logic, and model routing.

```
npm install llm-flight-controller
```

---

## What It Does

Flight Controller sits between your application and LLM providers. You write code once using a universal message format; Flight Controller handles the translation, throttling, auth, and failover.

- **Provider adapters** — Anthropic (direct API), OpenAI (and any OpenAI-compatible endpoint), AWS Bedrock (with SSO), Google Gemini
- **Unified message format** — One `OpenAIContext` type works across all providers; content blocks for text, images, audio, video, documents, tool calls, thinking/reasoning, and cache markers
- **Streaming** — Unified `AsyncGenerator<StreamChunk>` across all providers
- **Rate limiting** — Token bucket + fixed window + adaptive learning (discovers limits from provider throttling)
- **Bottleneck & Combined limiters** — Wraps [bottleneck](https://github.com/SGrondin/bottleneck) or combines multiple strategies
- **Session & token limits** — Per-session caps with cooldowns; per-request token cap with safety margin
- **Cost tracking** — Per-million-token pricing with cache read/write discounts; budget enforcement (per-request, daily, monthly)
- **Stats & telemetry** — Latency percentiles (P50/P95/P99), error rates, tokens/second
- **Model registry** — Look up models by capability, provider, or performance; find cheapest/fastest/most reliable
- **Error handling** — Typed error hierarchy (`RateLimitError`, `AuthenticationError`, `ProviderError`, `ContextLengthError`, etc.) with pluggable classifiers
- **Fallback chains** — Cascade through models when one errors or rate-limits
- **Auth providers** — API key, AWS SSO, AWS profile/credentials, Azure managed identity, Azure service principal, Google ADC, Google service account, browser OAuth
- **Health checks** — Stateless health probes with quota extraction from response headers

---

## Quick Start

```typescript
import {
  AnthropicProvider,
  AnthropicProviderConfig,
  OpenAIContext,
} from 'llm-flight-controller';

const config: AnthropicProviderConfig = {
  apiKey: process.env.ANTHROPIC_API_KEY!,
  modelId: 'claude-sonnet-4-20250514',
  identity: new ModelIdentity({
    id: 'claude-sonnet-4',
    displayName: 'Claude Sonnet 4',
    provider: { id: 'anthropic', displayName: 'Anthropic' },
  }),
  capabilities: {
    capabilities: new Set([ModelCapability.TEXT_GENERATION, ModelCapability.CHAT]),
    features: {
      contextWindow: 200000,
      maxOutputTokens: 8192,
      supportsStreaming: true,
      supportsFunctions: true,
      supportsVision: true,
      supportsAudio: false,
    },
    toolHandling: { mode: 'native', maxTools: 64, supportsParallel: true },
    inputTypes: new Set(['text', 'image']),
    outputTypes: new Set(['text']),
  },
};

const model = new AnthropicProvider(config);

// Non-streaming
const response = await model.sendMessage({
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello!' }] }],
  maxTokens: 1024,
});

console.log(response.content);
console.log(response.usage); // { inputTokens, outputTokens, totalTokens }

// Streaming
for await (const chunk of model.sendMessageStream({
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Tell me a story' }] }],
  maxTokens: 4096,
})) {
  process.stdout.write(chunk.content.map(c => c.text).join(''));
}
```

---

## Architecture

### Directory Structure

```
src/
├── providers/               # Provider-specific adapters
│   ├── anthropic/           # Anthropic Messages API
│   │   ├── AnthropicProvider.ts
│   │   ├── AnthropicOpenAITranslator.ts
│   │   ├── AnthropicContentConverter.ts
│   │   └── AnthropicTypes.ts
│   ├── bedrock/             # AWS Bedrock Converse API
│   │   ├── BedrockProvider.ts
│   │   ├── BedrockOpenAITranslator.ts
│   │   ├── BedrockContentConverter.ts
│   │   └── BedrockTypes.ts
│   ├── openai/              # OpenAI + API-compatible (DeepSeek, Groq, etc.)
│   │   ├── OpenAIProvider.ts
│   │   ├── OpenAIOpenAITranslator.ts
│   │   ├── OpenAIContentConverter.ts
│   │   └── OpenAITypes.ts
│   └── gemini/              # Google Gemini API
│       ├── GeminiProvider.ts
│       ├── GeminiOpenAITranslator.ts
│       ├── GeminiPartConverter.ts
│       └── GeminiTypes.ts
├── core/                    # Shared infrastructure
│   ├── types/               # Universal message formats
│   │   ├── Message.ts       #   OpenAIMessage, OpenAIContent (text, image, audio, etc.)
│   │   ├── Context.ts       #   OpenAIContext (universal input format)
│   │   ├── Response.ts      #   ModelResponse, StreamChunk, TokenUsage
│   │   ├── Capabilities.ts  #   ModelCapabilities, ModelFeatures, ToolHandling
│   │   └── Errors.ts
│   ├── model/               # Abstract Model base class
│   │   ├── Model.ts         #   Template method pattern (sendRequest/estimateTokens)
│   │   ├── ModelIdentity.ts #   Provider + model ID + family + version + aliases
│   │   ├── ModelHealth.ts   #   Stateless health probes
│   │   ├── ModelLimitChecker.ts
│   │   ├── ModelUsageRecorder.ts
│   │   └── ModelBlockerEventFactory.ts
│   ├── limits/              # Rate limiting strategies
│   │   ├── AdaptiveRateLimiter.ts  # Learns limits from throttling
│   │   ├── TokenBucketStrategy.ts
│   │   ├── FixedWindowStrategy.ts
│   │   ├── BottleneckRateLimiter.ts
│   │   ├── CombinedRateLimiter.ts
│   │   ├── SessionLimit.ts
│   │   ├── TokenLimit.ts
│   │   └── LimitLearningStrategy.ts
│   ├── pricing/             # Cost tracking
│   │   ├── ModelPricing.ts  #   Per-million-token + cache + per-request costs
│   │   └── IPricingTracker.ts
│   ├── stats/               # Telemetry
│   │   ├── ModelStats.ts    #   Latency percentiles, error rate, tokens/sec
│   │   └── IStatsTracker.ts
│   ├── errors/              # Error handling
│   │   ├── LLMError.ts      #   Typed error hierarchy
│   │   ├── BaseErrorHandler.ts
│   │   └── DefaultErrorClassifier.ts
│   ├── registry/            # Model registry
│   │   └── ModelRegistry.ts #   Find by capability, provider, performance
│   ├── translator/          # Message format translation
│   │   ├── TranslatorRegistry.ts  # Routes through "Rosetta Stone"
│   │   └── IOpenAITranslator.ts   #   toOpenAI / fromOpenAI / responseToOpenAI
│   ├── factory/             # Construction
│   │   ├── ModelFactory.ts
│   │   ├── AuthProviderFactory.ts
│   │   └── ComponentFactory.ts
│   ├── config/              # Configuration
│   │   ├── ModelConfigTypes.ts
│   │   ├── ModelConfig.ts
│   │   ├── ModelConfigLoader.ts
│   │   └── KnownProviders.ts
│   └── events/              # Blocker events for external monitoring
│       └── BlockerEvent.ts
├── auth/                    # Authentication providers
│   ├── ApiKeyAuth.ts
│   ├── AWSSSOAuth.ts
│   ├── AWSAuthProvider.ts
│   ├── AwsCredentialsAuth.ts
│   ├── AwsProfileAuth.ts
│   ├── AzureManagedIdentityAuth.ts
│   ├── AzureServicePrincipalAuth.ts
│   ├── GoogleAdcAuth.ts
│   ├── GoogleServiceAccountAuth.ts
│   ├── BrowserOAuthAuth.ts
│   └── IAuthProvider.ts
├── index.ts                 # Public API exports
└── integration/
    └── MultiModelOrchestration.test.ts
```

### Data Flow

```
Your Application
      │
      ▼  OpenAIContext (universal format)
┌─────────────────────────────────────────┐
│              Model.sendMessage()        │
│  ┌───────────────────────────────────┐  │
│  │  ModelLimitChecker.checkAllLimits()│  │
│  │   • Rate limiter (token bucket)   │  │
│  │   • Session limiter (cooldowns)   │  │
│  │   • Token limiter (safety margin) │  │
│  └───────────┬───────────────────────┘  │
│              ▼                          │
│  ┌───────────────────────────────────┐  │
│  │  Provider.sendRequest()           │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  Translator.fromOpenAI()    │  │  │
│  │  │  → provider-native format   │  │  │
│  │  └─────────────┬───────────────┘  │  │
│  │                ▼                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  SDK call (Anthropic/       │  │  │
│  │  │  OpenAI/Bedrock/Gemini)     │  │  │
│  │  └─────────────┬───────────────┘  │  │
│  │                ▼                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  Translator.responseToOpenAI│  │  │
│  │  │  → ModelResponse (universal)│  │  │
│  │  └─────────────┬───────────────┘  │  │
│  └────────────────┬──────────────────┘  │
│                   ▼                     │
│  ModelUsageRecorder.recordSuccess()     │
│   • Updates stats (latency, tokens)     │
│   • Records pricing cost                │
│   • Replenishes rate limiter            │
└───────────────────┬─────────────────────┘
                    ▼
         ModelResponse (universal format)
```

### Retry Flow

```
sendMessage()
  │
  ├─► checkAllLimits() ── blocked? → throw / wait
  │
  ├─► sendRequest() ──── success? → record + return
  │       │
  │       ▼ fail
  │  RateLimitError? ──► emit BlockerEvent
  │       │                │
  │       │           exponential backoff
  │       │           (baseBackoffMs * 2^attempt)
  │       │                │
  │       ▼                ▼
  │  AuthenticationError? ──► emit BlockerEvent → throw
  │       │
  │       ▼
  │  Other error? ──► throw (propagates up)
  │
  └─► retry up to maxRetries (default 3)
       timeout budget: default 5 min wall clock
```

### Streaming Flow

```
sendMessageStream()
  │
  ├─► checkAllLimits() ── blocked? → throw
  │
  └─► sendStreamRequest()
        │
        ▼ yields
  AsyncGenerator<StreamChunk>
    • { content: [...] , done: false } — intermediate chunk
    • { content: [...] , done: true  } — final chunk with usage stats
```

---

## Key Design Decisions

### 1. "Rosetta Stone" Universal Format

Every provider translates **to** and **from** a single `OpenAIContext` format. This means:
- You write your application logic once, regardless of which provider is on the other end
- The `TranslatorRegistry` can route between any two providers: `toOpenAI(providerA)` → `fromOpenAI(providerB)`
- The `BaseContentAdapter` handles feature gaps: if a model doesn't support vision, images are downgraded to `[Image: ...]` text placeholders

### 2. Template Method in `Model` Base Class

`Model` is an abstract class. Subclasses (providers) only implement:
- `sendRequest(context)` — the actual API call, returns `ModelResponse`
- `estimateTokens(context)` — rough token count for pre-flight checks
- `sendStreamRequest(context)` — optional, throws by default with guidance to use non-streaming mode

Everything else (retry, rate limiting, auth, stats, pricing, blocker events) is handled by the base class.

### 3. Composable Rate Limiting

Rate limiters implement `IRateLimiter` or `IRateLimitStrategy`. They can be:
- **Chained** — `CombinedRateLimiter` runs multiple strategies in sequence
- **Shared** — One rate limiter instance can guard multiple models hitting the same API quota
- **Adaptive** — `AdaptiveRateLimiter` starts with no known limits and learns them from provider throttling responses (429s, rate limit headers)
- **Externally wrapped** — `BottleneckRateLimiter` wraps [bottleneck](https://github.com/SGrondin/bottleneck) for production-grade throttling

### 4. Typed Error Hierarchy

All errors extend `LLMError` with a machine-readable `code` and structured `context`. This lets consuming applications handle errors by code rather than string-matching:

```typescript
if (error instanceof RateLimitError) {
  const retryAfter = error.retryAfter;
  // queue for retry
}
```

### 5. Pluggable Authentication

The `IAuthProvider` interface abstracts credential management. This means:
- A provider can use API keys (OpenAI, Anthropic), SSO (Bedrock), or managed identities (Azure)
- Auth failures automatically trigger `BlockerEvent`s for external monitoring
- SSO providers handle the full device code / browser redirect flow

### 6. Provider-Specific Translators

Each provider has its own `IOpenAITranslator` implementation that handles:
- `toOpenAI(providerNative)` → universal format
- `fromOpenAI(universal)` → provider-native format
- `responseToOpenAI(providerResponse)` → `ModelResponse`

This keeps provider-specific logic (like Anthropic's thinking blocks, Bedrock's inference configuration, Gemini's part types) isolated from the core abstractions.

---

## How to Add a New Provider

### 1. Create the translator

```typescript
// src/providers/myprovider/MyProviderOpenAITranslator.ts
export class MyProviderOpenAITranslator implements IOpenAITranslator {
  getProviderId(): string { return 'myprovider'; }

  toOpenAI(native: MyProviderRequest): OpenAIContext {
    /* convert native format to universal */
  }

  fromOpenAI(ctx: OpenAIContext): MyProviderRequest {
    /* convert universal to native format */
  }

  responseToOpenAI(native: MyProviderResponse): ModelResponse {
    /* convert native response to universal */
  }
}
```

### 2. Create the provider class

```typescript
// src/providers/myprovider/MyProvider.ts
export class MyProvider extends Model {
  constructor(config: MyProviderConfig) {
    super({ identity, auth, capabilities, limits, pricing, stats, errorHandler });
    // init SDK client
  }

  protected async sendRequest(context: OpenAIContext): Promise<ModelResponse> {
    const native = this.translator.fromOpenAI(context);
    const response = await this.client.someEndpoint(native);
    return this.translator.responseToOpenAI(response);
  }

  protected estimateTokens(context: OpenAIContext): { input: number; output: number } {
    // Rough estimate: ~4 chars per token
    return { input: roughTokenCount(context), output: context.maxTokens || 4096 };
  }
}
```

### 3. Register in the public API

Add your exports to `src/index.ts`.

### 4. Add auth support (if needed)

Implement `IAuthProvider` in `src/auth/` for any new auth mechanisms.

---

## Examples

The `examples/` directory contains runnable patterns:

| File | What it shows |
|------|--------------|
| `cascade-fallback.ts` | Fallback chain through multiple models |
| `session-limit-switch.ts` | Switching models when session limits hit |
| `cost-optimizer.ts` | Picking cheapest model for a task |
| `load-balancer.ts` | Round-robin across models |
| `context-manager.ts` | Context preservation across model switches |
| `browser-subscription-rotator.html` | Browser-based key rotation UI |
| `round-robin-orchestrator.ts` | Full orchestration loop |
| `prompt-caching-example.ts` | Prompt caching with Bedrock |

---

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

Tests use [vitest](https://vitest.dev/) with mock providers. Integration tests in `src/integration/` validate multi-model orchestration patterns.

---

## License

MIT © Rob Truitt
