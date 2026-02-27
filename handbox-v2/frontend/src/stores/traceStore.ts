/**
 * Trace Store — Real-time execution trace capture and visualization.
 *
 * Captures LLM invocations, node executions, and timing for
 * debugging and performance analysis.
 */

import { create } from 'zustand'
import type { NodeSpan, ExecutionStatus } from '@/types/trace'
import type { LLMProvider, LLMResponse, TokenUsage } from '@/types'

/** LLM-specific trace information */
export interface LLMTrace {
  id: string
  timestamp: string
  provider: LLMProvider
  modelId: string
  prompt: string
  systemPrompt?: string
  response?: string
  usage?: TokenUsage
  latencyMs: number
  status: ExecutionStatus
  error?: string
  nodeId?: string // Associated node if part of workflow
  executionId?: string
}

/** Workflow execution trace */
export interface ExecutionTrace {
  id: string
  workflowId: string
  workflowName?: string
  startedAt: string
  completedAt?: string
  status: ExecutionStatus
  nodeSpans: NodeSpan[]
  llmTraces: LLMTrace[]
  totalNodes: number
  completedNodes: number
  failedNodes: number
  totalLatencyMs?: number
  totalTokens?: TokenUsage
  totalCost?: number
}

/** Trace filter options */
export interface TraceFilter {
  status?: ExecutionStatus[]
  provider?: LLMProvider[]
  minLatencyMs?: number
  maxLatencyMs?: number
  startDate?: string
  endDate?: string
  searchText?: string
}

interface TraceState {
  /** All captured traces */
  traces: ExecutionTrace[]

  /** Currently selected trace for detailed view */
  selectedTraceId: string | null

  /** Active (in-progress) execution trace */
  activeTrace: ExecutionTrace | null

  /** LLM invocation history (independent of workflow) */
  llmHistory: LLMTrace[]

  /** Filter settings */
  filter: TraceFilter

  /** Recording state */
  isRecording: boolean

  /** Max traces to keep in memory */
  maxTraces: number

  /** Actions */
  startTrace: (workflowId: string, workflowName?: string) => string
  endTrace: (traceId: string, status: ExecutionStatus, error?: string) => void
  addNodeSpan: (traceId: string, span: NodeSpan) => void
  updateNodeSpan: (traceId: string, spanId: string, updates: Partial<NodeSpan>) => void

  /** LLM trace actions */
  startLLMTrace: (
    provider: LLMProvider,
    modelId: string,
    prompt: string,
    systemPrompt?: string,
    nodeId?: string,
    executionId?: string
  ) => string
  endLLMTrace: (
    traceId: string,
    response?: LLMResponse,
    error?: string
  ) => void

  /** Selection */
  selectTrace: (traceId: string | null) => void
  getSelectedTrace: () => ExecutionTrace | null

  /** Filtering */
  setFilter: (filter: Partial<TraceFilter>) => void
  clearFilter: () => void
  getFilteredTraces: () => ExecutionTrace[]

  /** Recording control */
  setRecording: (recording: boolean) => void
  clearTraces: () => void
  clearLLMHistory: () => void

  /** Statistics */
  getStats: () => TraceStats
}

export interface TraceStats {
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  avgLatencyMs: number
  totalTokensUsed: TokenUsage
  totalCost: number
  byProvider: Record<LLMProvider, {
    invocations: number
    tokens: TokenUsage
    avgLatencyMs: number
  }>
}

export const useTraceStore = create<TraceState>()((set, get) => ({
  traces: [],
  selectedTraceId: null,
  activeTrace: null,
  llmHistory: [],
  filter: {},
  isRecording: true,
  maxTraces: 100,

  startTrace: (workflowId, workflowName) => {
    const id = crypto.randomUUID()
    const trace: ExecutionTrace = {
      id,
      workflowId,
      workflowName,
      startedAt: new Date().toISOString(),
      status: 'running',
      nodeSpans: [],
      llmTraces: [],
      totalNodes: 0,
      completedNodes: 0,
      failedNodes: 0,
    }

    set({ activeTrace: trace })
    return id
  },

  endTrace: (traceId, status, _error) => {
    const { activeTrace, traces, maxTraces } = get()

    if (activeTrace?.id === traceId) {
      const completedTrace: ExecutionTrace = {
        ...activeTrace,
        completedAt: new Date().toISOString(),
        status,
        totalLatencyMs: Date.now() - new Date(activeTrace.startedAt).getTime(),
        totalTokens: activeTrace.llmTraces.reduce(
          (acc, t) => ({
            inputTokens: acc.inputTokens + (t.usage?.inputTokens || 0),
            outputTokens: acc.outputTokens + (t.usage?.outputTokens || 0),
          }),
          { inputTokens: 0, outputTokens: 0 }
        ),
      }

      // Keep only maxTraces
      const newTraces = [completedTrace, ...traces].slice(0, maxTraces)

      set({
        activeTrace: null,
        traces: newTraces,
      })
    }
  },

  addNodeSpan: (traceId, span) => {
    const { activeTrace } = get()
    if (activeTrace?.id === traceId) {
      set({
        activeTrace: {
          ...activeTrace,
          nodeSpans: [...activeTrace.nodeSpans, span],
          totalNodes: activeTrace.totalNodes + 1,
        },
      })
    }
  },

  updateNodeSpan: (traceId, spanId, updates) => {
    const { activeTrace } = get()
    if (activeTrace?.id === traceId) {
      const updatedSpans = activeTrace.nodeSpans.map(span =>
        span.span_id === spanId ? { ...span, ...updates } : span
      )

      const completedNodes = updatedSpans.filter(s => s.status === 'completed').length
      const failedNodes = updatedSpans.filter(s => s.status === 'failed').length

      set({
        activeTrace: {
          ...activeTrace,
          nodeSpans: updatedSpans,
          completedNodes,
          failedNodes,
        },
      })
    }
  },

  startLLMTrace: (provider, modelId, prompt, systemPrompt, nodeId, executionId) => {
    const { isRecording, activeTrace } = get()
    if (!isRecording) return ''

    const id = crypto.randomUUID()
    const trace: LLMTrace = {
      id,
      timestamp: new Date().toISOString(),
      provider,
      modelId,
      prompt,
      systemPrompt,
      latencyMs: 0,
      status: 'running',
      nodeId,
      executionId,
    }

    // Add to active trace if exists
    if (activeTrace) {
      set({
        activeTrace: {
          ...activeTrace,
          llmTraces: [...activeTrace.llmTraces, trace],
        },
      })
    }

    // Also add to global LLM history
    set(state => ({
      llmHistory: [trace, ...state.llmHistory].slice(0, 500),
    }))

    return id
  },

  endLLMTrace: (traceId, response, error) => {
    const { activeTrace, llmHistory } = get()
    const endTime = new Date()

    const updateTrace = (trace: LLMTrace): LLMTrace => {
      if (trace.id !== traceId) return trace
      return {
        ...trace,
        response: response?.text,
        usage: response?.usage,
        latencyMs: endTime.getTime() - new Date(trace.timestamp).getTime(),
        status: error ? 'failed' : 'completed',
        error,
      }
    }

    // Update in active trace
    if (activeTrace) {
      set({
        activeTrace: {
          ...activeTrace,
          llmTraces: activeTrace.llmTraces.map(updateTrace),
        },
      })
    }

    // Update in global history
    set({
      llmHistory: llmHistory.map(updateTrace),
    })
  },

  selectTrace: (traceId) => {
    set({ selectedTraceId: traceId })
  },

  getSelectedTrace: () => {
    const { selectedTraceId, traces, activeTrace } = get()
    if (!selectedTraceId) return null
    if (activeTrace?.id === selectedTraceId) return activeTrace
    return traces.find(t => t.id === selectedTraceId) || null
  },

  setFilter: (newFilter) => {
    set(state => ({
      filter: { ...state.filter, ...newFilter },
    }))
  },

  clearFilter: () => {
    set({ filter: {} })
  },

  getFilteredTraces: () => {
    const { traces, filter } = get()

    return traces.filter(trace => {
      if (filter.status?.length && !filter.status.includes(trace.status)) {
        return false
      }

      if (filter.minLatencyMs && (trace.totalLatencyMs || 0) < filter.minLatencyMs) {
        return false
      }

      if (filter.maxLatencyMs && (trace.totalLatencyMs || 0) > filter.maxLatencyMs) {
        return false
      }

      if (filter.startDate && trace.startedAt < filter.startDate) {
        return false
      }

      if (filter.endDate && trace.startedAt > filter.endDate) {
        return false
      }

      if (filter.searchText) {
        const search = filter.searchText.toLowerCase()
        const matchesName = trace.workflowName?.toLowerCase().includes(search)
        const matchesId = trace.workflowId.toLowerCase().includes(search)
        if (!matchesName && !matchesId) return false
      }

      return true
    })
  },

  setRecording: (recording) => {
    set({ isRecording: recording })
  },

  clearTraces: () => {
    set({ traces: [], selectedTraceId: null })
  },

  clearLLMHistory: () => {
    set({ llmHistory: [] })
  },

  getStats: () => {
    const { traces, llmHistory } = get()

    const successfulExecutions = traces.filter(t => t.status === 'completed').length
    const failedExecutions = traces.filter(t => t.status === 'failed').length
    const totalLatency = traces.reduce((sum, t) => sum + (t.totalLatencyMs || 0), 0)

    const byProvider: TraceStats['byProvider'] = {
      bedrock: { invocations: 0, tokens: { inputTokens: 0, outputTokens: 0 }, avgLatencyMs: 0 },
      openai: { invocations: 0, tokens: { inputTokens: 0, outputTokens: 0 }, avgLatencyMs: 0 },
      anthropic: { invocations: 0, tokens: { inputTokens: 0, outputTokens: 0 }, avgLatencyMs: 0 },
      local: { invocations: 0, tokens: { inputTokens: 0, outputTokens: 0 }, avgLatencyMs: 0 },
    }

    let totalTokens: TokenUsage = { inputTokens: 0, outputTokens: 0 }

    for (const llm of llmHistory) {
      const provider = llm.provider
      byProvider[provider].invocations++
      if (llm.usage) {
        byProvider[provider].tokens.inputTokens += llm.usage.inputTokens
        byProvider[provider].tokens.outputTokens += llm.usage.outputTokens
        totalTokens.inputTokens += llm.usage.inputTokens
        totalTokens.outputTokens += llm.usage.outputTokens
      }
      byProvider[provider].avgLatencyMs =
        (byProvider[provider].avgLatencyMs * (byProvider[provider].invocations - 1) + llm.latencyMs) /
        byProvider[provider].invocations
    }

    return {
      totalExecutions: traces.length,
      successfulExecutions,
      failedExecutions,
      avgLatencyMs: traces.length > 0 ? totalLatency / traces.length : 0,
      totalTokensUsed: totalTokens,
      totalCost: 0, // Calculate based on MODEL_COSTS
      byProvider,
    }
  },
}))
