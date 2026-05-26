import { OpenAIContext } from '../types/Context.js';

/** Pluggable token estimation strategy for pre-flight limit checks. */
export interface ITokenCounter {
  estimateTokens(context: OpenAIContext): { input: number; output: number };
}
