/** A single conversation turn in Gemini's wire format. */
export interface GeminiMessage {
    role: 'user' | 'model';
    parts: GeminiPart[];
}

/** Union of all Gemini content block types (text, inline media, function calls/responses). */
export type GeminiPart =
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
    | { fileData: { mimeType: string; fileUri: string } }
    | { functionCall: { name: string; args: any } }
    | { functionResponse: { name: string; response: any } };

/** Wire-format request for Gemini's generateContent endpoint. */
export interface GeminiRequest {
    contents: GeminiMessage[];
    systemInstruction?: {
        role: 'user';
        parts: Array<{ text: string }>;
    };
    tools?: Array<{
        functionDeclarations: Array<{
            name: string;
            description?: string;
            parameters?: any;
        }>;
    }>;
    generationConfig?: {
        temperature?: number;
        topP?: number;
        topK?: number;
        maxOutputTokens?: number;
        stopSequences?: string[];
    };
}

/** Wire-format response from Gemini's generateContent endpoint. */
export interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: GeminiPart[];
            role: 'model';
        };
        finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
        index: number;
        safetyRatings?: Array<{
            category: string;
            probability: string;
        }>;
    }>;
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
        cachedContentTokenCount?: number;
    };
    modelVersion?: string;
}
