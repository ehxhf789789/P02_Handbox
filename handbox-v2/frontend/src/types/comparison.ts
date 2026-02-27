/**
 * Model Comparison Types for Handbox v2
 *
 * Enables running the same workflow with different LLM providers/models
 * for A/B testing and quality comparison.
 */

import type { LLMProvider, LLMResponse, TokenUsage } from './llm'
import type { ExecutionStatus } from './trace'

/** Configuration for a single model in comparison */
export interface ComparisonModelConfig {
  provider: LLMProvider
  modelId: string
  label?: string // User-friendly label (e.g., "GPT-4o", "Claude Sonnet")
}

/** Request for model comparison execution */
export interface ComparisonRequest {
  /** Unique ID for this comparison run */
  id: string
  /** The prompt to test across models */
  prompt: string
  /** System prompt (shared across all models) */
  systemPrompt?: string
  /** Models to compare */
  models: ComparisonModelConfig[]
  /** Max tokens per response */
  maxTokens?: number
  /** Temperature (shared) */
  temperature?: number
  /** Number of runs per model for statistical significance */
  runsPerModel?: number
  /** Workflow ID if comparing workflow execution */
  workflowId?: string
}

/** Result from a single model run */
export interface ComparisonModelResult {
  /** Model configuration */
  model: ComparisonModelConfig
  /** Execution status */
  status: ExecutionStatus
  /** Response from LLM */
  response?: LLMResponse
  /** Error message if failed */
  error?: string
  /** Execution time in ms */
  latencyMs: number
  /** Token usage */
  usage?: TokenUsage
  /** Cost estimate in USD */
  estimatedCost?: number
  /** Timestamp */
  timestamp: string
}

/** Aggregated statistics for a model across multiple runs */
export interface ComparisonModelStats {
  model: ComparisonModelConfig
  runs: number
  successes: number
  failures: number
  avgLatencyMs: number
  minLatencyMs: number
  maxLatencyMs: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  successRate: number
}

/** Complete comparison result */
export interface ComparisonResult {
  /** Comparison request ID */
  id: string
  /** Request that generated this result */
  request: ComparisonRequest
  /** Results from each model */
  results: ComparisonModelResult[]
  /** Aggregated stats per model */
  stats: ComparisonModelStats[]
  /** Overall comparison metadata */
  metadata: {
    startedAt: string
    completedAt: string
    totalDurationMs: number
  }
  /** User annotations/notes */
  annotations?: {
    winner?: string // Model ID of the preferred model
    notes?: string
    ratings?: Record<string, number> // Model ID -> rating (1-5)
  }
}

/** Per-node model override configuration */
export interface NodeModelOverride {
  nodeId: string
  provider: LLMProvider
  modelId: string
  /** Override reason (for documentation) */
  reason?: string
}

/** Workflow-level model configuration */
export interface WorkflowModelConfig {
  /** Default model for all nodes */
  defaultProvider: LLMProvider
  defaultModelId: string
  /** Per-node overrides */
  nodeOverrides: NodeModelOverride[]
  /** Fallback chain if primary model fails */
  fallbackChain?: ComparisonModelConfig[]
}

/** Cost estimation by provider */
export interface ModelCostEstimate {
  provider: LLMProvider
  modelId: string
  inputTokenCost: number  // Cost per 1K input tokens
  outputTokenCost: number // Cost per 1K output tokens
  currency: 'USD'
}

/** Known model costs (can be updated) */
export const MODEL_COSTS: ModelCostEstimate[] = [
  // OpenAI
  { provider: 'openai', modelId: 'gpt-4o', inputTokenCost: 0.0025, outputTokenCost: 0.01, currency: 'USD' },
  { provider: 'openai', modelId: 'gpt-4o-mini', inputTokenCost: 0.00015, outputTokenCost: 0.0006, currency: 'USD' },
  { provider: 'openai', modelId: 'gpt-4-turbo', inputTokenCost: 0.01, outputTokenCost: 0.03, currency: 'USD' },

  // Anthropic
  { provider: 'anthropic', modelId: 'claude-3-opus-20240229', inputTokenCost: 0.015, outputTokenCost: 0.075, currency: 'USD' },
  { provider: 'anthropic', modelId: 'anthropic-sonnet-4-20250514', inputTokenCost: 0.003, outputTokenCost: 0.015, currency: 'USD' },
  { provider: 'anthropic', modelId: 'claude-3-haiku-20240307', inputTokenCost: 0.00025, outputTokenCost: 0.00125, currency: 'USD' },

  // AWS Bedrock (Claude models via Bedrock)
  { provider: 'bedrock', modelId: 'anthropic.claude-3-sonnet-20240229-v1:0', inputTokenCost: 0.003, outputTokenCost: 0.015, currency: 'USD' },
  { provider: 'bedrock', modelId: 'anthropic.claude-3-haiku-20240307-v1:0', inputTokenCost: 0.00025, outputTokenCost: 0.00125, currency: 'USD' },

  // Local (free)
  { provider: 'local', modelId: '*', inputTokenCost: 0, outputTokenCost: 0, currency: 'USD' },
]

/** Calculate cost for a given usage */
export function calculateCost(
  provider: LLMProvider,
  modelId: string,
  usage: TokenUsage
): number {
  const costInfo = MODEL_COSTS.find(
    c => c.provider === provider && (c.modelId === modelId || c.modelId === '*')
  )
  if (!costInfo) return 0

  const inputCost = (usage.inputTokens / 1000) * costInfo.inputTokenCost
  const outputCost = (usage.outputTokens / 1000) * costInfo.outputTokenCost
  return inputCost + outputCost
}
