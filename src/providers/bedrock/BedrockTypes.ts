/** A single message in Bedrock's Converse API format. */
export interface BedrockMessage {
    role: 'user' | 'assistant';
    content: BedrockContent[];
}

/** Union of Bedrock content block types (text, image, document, tool use/result). */
export type BedrockContent =
    | { text: string; cachePoint?: { type: 'default' } }
    | { image: { format: string; source: { bytes: Buffer } }; cachePoint?: { type: 'default' } }
    | { document: { format: string; name: string; source: { bytes: Buffer } }; cachePoint?: { type: 'default' } }
    | { toolUse: { toolUseId: string; name: string; input: any }; cachePoint?: { type: 'default' } }
    | { toolResult: { toolUseId: string; content: BedrockContent[]; status?: string }; cachePoint?: { type: 'default' } };

/** Input payload for Bedrock's Converse/ConverseStream commands. */
export interface BedrockRequest {
    modelId: string;
    messages: BedrockMessage[];
    system?: Array<{ text: string; cachePoint?: { type: 'default' } }>;
    inferenceConfig?: {
        maxTokens?: number;
        temperature?: number;
        topP?: number;
        stopSequences?: string[];
    };
    toolConfig?: {
        tools: Array<
            | {
                  toolSpec: {
                      name: string;
                      description?: string;
                      inputSchema: {
                          json: any;
                      };
                  };
              }
            | { cachePoint: { type: 'default' } }
        >;
        toolChoice?: {
            auto?: {};
            any?: {};
            tool?: { name: string };
        };
    };
    additionalModelRequestFields?: Record<string, unknown>;
}

/** Response payload from Bedrock's Converse command. */
export interface BedrockResponse {
    output: {
        message: {
            role: 'assistant';
            content: BedrockContent[];
        };
    };
    stopReason: 'stop' | 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'content_filtered';
    usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        cacheReadInputTokens?: number;
        cacheWriteInputTokens?: number;
    };
    metrics?: {
        latencyMs: number;
    };
}
