/**
 * Model Comparison Store — A/B testing across different LLM providers.
 *
 * Run the same prompt or workflow with multiple models and compare results.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'
import type { LLMResponse } from '@/types'
import type {
  ComparisonRequest,
  ComparisonResult,
  ComparisonModelConfig,
  ComparisonModelResult,
  ComparisonModelStats,
} from '@/types/comparison'
import { useTraceStore } from './traceStore'

interface ComparisonState {
  /** Saved comparison results */
  results: ComparisonResult[]

  /** Currently running comparison */
  activeComparison: ComparisonRequest | null

  /** Progress of active comparison */
  progress: {
    totalRuns: number
    completedRuns: number
    currentModel?: string
  }

  /** Preset model groups for quick comparison */
  presets: ComparisonPreset[]

  /** Running state */
  isRunning: boolean

  /** Actions */
  runComparison: (request: ComparisonRequest) => Promise<ComparisonResult>
  cancelComparison: () => void
  deleteResult: (id: string) => void
  clearResults: () => void

  /** Preset management */
  addPreset: (preset: ComparisonPreset) => void
  removePreset: (id: string) => void
  getPreset: (id: string) => ComparisonPreset | undefined

  /** Result analysis */
  getResultById: (id: string) => ComparisonResult | undefined
  getWinner: (resultId: string) => ComparisonModelConfig | null
}

export interface ComparisonPreset {
  id: string
  name: string
  description?: string
  models: ComparisonModelConfig[]
}

/** Default comparison presets */
const DEFAULT_PRESETS: ComparisonPreset[] = [
  {
    id: 'cost-vs-quality',
    name: 'Cost vs Quality',
    description: 'Compare expensive vs budget models',
    models: [
      { provider: 'openai', modelId: 'gpt-4o', label: 'GPT-4o (Premium)' },
      { provider: 'openai', modelId: 'gpt-4o-mini', label: 'GPT-4o Mini (Budget)' },
    ],
  },
  {
    id: 'cross-provider',
    name: 'Cross-Provider',
    description: 'Compare different providers',
    models: [
      { provider: 'openai', modelId: 'gpt-4o', label: 'OpenAI GPT-4o' },
      { provider: 'anthropic', modelId: 'anthropic-sonnet-4-20250514', label: 'Claude Sonnet' },
      { provider: 'bedrock', modelId: 'anthropic.claude-3-sonnet-20240229-v1:0', label: 'Bedrock Claude' },
    ],
  },
  {
    id: 'local-vs-cloud',
    name: 'Local vs Cloud',
    description: 'Compare local model against cloud',
    models: [
      { provider: 'local', modelId: 'llama3.2', label: 'Local Llama 3.2' },
      { provider: 'openai', modelId: 'gpt-4o-mini', label: 'Cloud GPT-4o Mini' },
    ],
  },
]

export const useComparisonStore = create<ComparisonState>()(
  persist(
    (set, get) => ({
      results: [],
      activeComparison: null,
      progress: { totalRuns: 0, completedRuns: 0 },
      presets: DEFAULT_PRESETS,
      isRunning: false,

      runComparison: async (request) => {
        const traceStore = useTraceStore.getState()

        set({
          isRunning: true,
          activeComparison: request,
          progress: {
            totalRuns: request.models.length * (request.runsPerModel || 1),
            completedRuns: 0,
          },
        })

        const results: ComparisonModelResult[] = []
        const runsPerModel = request.runsPerModel || 1

        try {
          for (const model of request.models) {
            for (let run = 0; run < runsPerModel; run++) {
              // Check if cancelled
              if (!get().isRunning) {
                throw new Error('Comparison cancelled')
              }

              set(state => ({
                progress: { ...state.progress, currentModel: model.label || model.modelId },
              }))

              const startTime = Date.now()

              // Start LLM trace
              const traceId = traceStore.startLLMTrace(
                model.provider,
                model.modelId,
                request.prompt,
                request.systemPrompt
              )

              try {
                const response = await invoke<LLMResponse>('invoke_llm', {
                  request: {
                    prompt: request.prompt,
                    system_prompt: request.systemPrompt,
                    model_id: model.modelId,
                    max_tokens: request.maxTokens || 4096,
                    temperature: request.temperature || 0.7,
                    provider: model.provider,
                  },
                })

                const latencyMs = Date.now() - startTime

                // End trace with success
                traceStore.endLLMTrace(traceId, response)

                results.push({
                  model,
                  status: 'completed',
                  response,
                  latencyMs,
                  usage: response.usage,
                  timestamp: new Date().toISOString(),
                })
              } catch (error) {
                const latencyMs = Date.now() - startTime

                // End trace with error
                traceStore.endLLMTrace(traceId, undefined, String(error))

                results.push({
                  model,
                  status: 'failed',
                  error: String(error),
                  latencyMs,
                  timestamp: new Date().toISOString(),
                })
              }

              set(state => ({
                progress: {
                  ...state.progress,
                  completedRuns: state.progress.completedRuns + 1,
                },
              }))
            }
          }
        } catch (error) {
          // Handle cancellation or other errors
          console.error('Comparison error:', error)
        }

        // Calculate stats per model
        const stats: ComparisonModelStats[] = request.models.map(model => {
          const modelResults = results.filter(
            r => r.model.provider === model.provider && r.model.modelId === model.modelId
          )

          const successes = modelResults.filter(r => r.status === 'completed')
          const latencies = modelResults.map(r => r.latencyMs)

          return {
            model,
            runs: modelResults.length,
            successes: successes.length,
            failures: modelResults.length - successes.length,
            avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length || 0,
            minLatencyMs: Math.min(...latencies) || 0,
            maxLatencyMs: Math.max(...latencies) || 0,
            totalInputTokens: successes.reduce((sum, r) => sum + (r.usage?.inputTokens || 0), 0),
            totalOutputTokens: successes.reduce((sum, r) => sum + (r.usage?.outputTokens || 0), 0),
            totalCost: 0, // Would calculate using calculateCost
            successRate: modelResults.length > 0 ? successes.length / modelResults.length : 0,
          }
        })

        const now = new Date().toISOString()
        const comparisonResult: ComparisonResult = {
          id: request.id,
          request,
          results,
          stats,
          metadata: {
            startedAt: now,
            completedAt: now,
            totalDurationMs: results.reduce((sum, r) => sum + r.latencyMs, 0),
          },
        }

        set(state => ({
          results: [comparisonResult, ...state.results].slice(0, 50),
          isRunning: false,
          activeComparison: null,
          progress: { totalRuns: 0, completedRuns: 0 },
        }))

        return comparisonResult
      },

      cancelComparison: () => {
        set({
          isRunning: false,
          activeComparison: null,
          progress: { totalRuns: 0, completedRuns: 0 },
        })
      },

      deleteResult: (id) => {
        set(state => ({
          results: state.results.filter(r => r.id !== id),
        }))
      },

      clearResults: () => {
        set({ results: [] })
      },

      addPreset: (preset) => {
        set(state => ({
          presets: [...state.presets, preset],
        }))
      },

      removePreset: (id) => {
        set(state => ({
          presets: state.presets.filter(p => p.id !== id),
        }))
      },

      getPreset: (id) => {
        return get().presets.find(p => p.id === id)
      },

      getResultById: (id) => {
        return get().results.find(r => r.id === id)
      },

      getWinner: (resultId) => {
        const result = get().results.find(r => r.id === resultId)
        if (!result || result.stats.length === 0) return null

        // Winner is the model with highest success rate, then lowest latency
        const sorted = [...result.stats].sort((a, b) => {
          if (a.successRate !== b.successRate) {
            return b.successRate - a.successRate
          }
          return a.avgLatencyMs - b.avgLatencyMs
        })

        return sorted[0]?.model || null
      },
    }),
    {
      name: 'handbox-comparison',
      partialize: (state) => ({
        results: state.results.slice(0, 10), // Only persist last 10 results
        presets: state.presets,
      }),
    }
  )
)
