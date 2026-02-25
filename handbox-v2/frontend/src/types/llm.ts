/**
 * LLM Provider types for Handbox v2
 */

export type LLMProvider = 'bedrock' | 'openai' | 'anthropic' | 'local'

export interface LLMConfig {
  provider: LLMProvider
  modelId: string
  apiKey?: string
  endpoint?: string
  region?: string
}

export interface LLMRequest {
  prompt: string
  systemPrompt?: string
  modelId?: string
  maxTokens?: number
  temperature?: number
  provider?: LLMProvider
}

export interface LLMResponse {
  text: string
  model: string
  usage: TokenUsage
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface EmbeddingRequest {
  text: string
  modelId?: string
}

export interface EmbeddingResponse {
  embedding: number[]
  dimension: number
}

export interface ModelInfo {
  id: string
  name: string
  provider: LLMProvider
  maxTokens: number
  supportsVision: boolean
}

export interface ConnectionResult {
  connected: boolean
  provider: LLMProvider
  region?: string
  error?: string
}
