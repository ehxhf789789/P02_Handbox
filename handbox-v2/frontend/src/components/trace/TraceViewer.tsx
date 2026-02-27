/**
 * TraceViewer — Real-time execution trace visualization.
 *
 * Displays LLM invocations, node executions, and timing for debugging.
 */

import { useState, useMemo } from 'react'
import { useTraceStore, type LLMTrace, type ExecutionTrace } from '@/stores/traceStore'
import type { ExecutionStatus } from '@/types/trace'
import { TraceToWorkflow } from './TraceToWorkflow'
import { Wand2 } from 'lucide-react'

interface TraceViewerProps {
  className?: string
}

export function TraceViewer({ className = '' }: TraceViewerProps) {
  const {
    traces,
    llmHistory,
    activeTrace,
    selectedTraceId,
    filter,
    isRecording,
    selectTrace,
    // Filter actions - available for future filter UI
    setFilter: _setFilter,
    clearFilter: _clearFilter,
    setRecording,
    clearTraces,
    clearLLMHistory,
    getStats,
    getFilteredTraces,
  } = useTraceStore()

  // Silence unused variable warnings (for future use)
  void _setFilter
  void _clearFilter

  const [tab, setTab] = useState<'executions' | 'llm' | 'stats'>('llm')
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null)
  const [convertingTrace, setConvertingTrace] = useState<ExecutionTrace | null>(null)

  const stats = useMemo(() => getStats(), [traces, llmHistory])
  const filteredTraces = useMemo(() => getFilteredTraces(), [traces, filter])

  return (
    <div className={`flex flex-col h-full bg-zinc-900 text-zinc-100 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold">Trace Viewer</h2>
          <div className="flex gap-1">
            <TabButton active={tab === 'llm'} onClick={() => setTab('llm')}>
              LLM ({llmHistory.length})
            </TabButton>
            <TabButton active={tab === 'executions'} onClick={() => setTab('executions')}>
              Executions ({traces.length})
            </TabButton>
            <TabButton active={tab === 'stats'} onClick={() => setTab('stats')}>
              Stats
            </TabButton>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Recording toggle */}
          <button
            onClick={() => setRecording(!isRecording)}
            className={`px-2 py-1 rounded text-xs ${
              isRecording
                ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                : 'bg-zinc-700 text-zinc-400'
            }`}
          >
            {isRecording ? '⏺ Recording' : '⏸ Paused'}
          </button>

          {/* Clear button */}
          <button
            onClick={() => {
              if (tab === 'llm') clearLLMHistory()
              else if (tab === 'executions') clearTraces()
            }}
            className="px-2 py-1 rounded text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-400"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Active trace indicator */}
      {activeTrace && (
        <div className="px-4 py-2 bg-blue-500/10 border-b border-blue-500/30">
          <div className="flex items-center gap-2 text-xs">
            <span className="animate-pulse">●</span>
            <span className="text-blue-400">
              Running: {activeTrace.workflowName || activeTrace.workflowId}
            </span>
            <span className="text-zinc-500">
              {activeTrace.completedNodes}/{activeTrace.totalNodes} nodes
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'llm' && (
          <LLMTraceList
            traces={llmHistory}
            expandedId={expandedTraceId}
            onExpand={setExpandedTraceId}
          />
        )}

        {tab === 'executions' && (
          <ExecutionTraceList
            traces={filteredTraces}
            selectedId={selectedTraceId}
            onSelect={selectTrace}
            onConvertToWorkflow={setConvertingTrace}
          />
        )}

        {tab === 'stats' && <TraceStats stats={stats} />}
      </div>

      {/* Trace to Workflow Conversion Modal */}
      {convertingTrace && (
        <TraceToWorkflow
          trace={convertingTrace}
          isOpen={true}
          onClose={() => setConvertingTrace(null)}
          onSuccess={() => {
            setConvertingTrace(null)
          }}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs transition-colors ${
        active
          ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/50'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  )
}

function LLMTraceList({
  traces,
  expandedId,
  onExpand,
}: {
  traces: LLMTrace[]
  expandedId: string | null
  onExpand: (id: string | null) => void
}) {
  if (traces.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        No LLM invocations yet
      </div>
    )
  }

  return (
    <div className="divide-y divide-zinc-800">
      {traces.map((trace) => (
        <LLMTraceItem
          key={trace.id}
          trace={trace}
          expanded={expandedId === trace.id}
          onToggle={() => onExpand(expandedId === trace.id ? null : trace.id)}
        />
      ))}
    </div>
  )
}

function LLMTraceItem({
  trace,
  expanded,
  onToggle,
}: {
  trace: LLMTrace
  expanded: boolean
  onToggle: () => void
}) {
  const statusColor = getStatusColor(trace.status)
  const timestamp = new Date(trace.timestamp).toLocaleTimeString()

  return (
    <div className="px-4 py-2 hover:bg-zinc-800/50">
      {/* Summary row */}
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={onToggle}
      >
        <span className={`text-xs ${statusColor}`}>
          {getStatusIcon(trace.status)}
        </span>
        <span className="text-xs text-zinc-500 w-16">{timestamp}</span>
        <span className="text-xs font-mono text-indigo-400">
          {trace.provider}/{trace.modelId.split('/').pop()}
        </span>
        <span className="text-xs text-zinc-400 truncate flex-1">
          {trace.prompt.slice(0, 50)}...
        </span>
        <span className="text-xs text-zinc-500">
          {trace.latencyMs}ms
        </span>
        {trace.usage && (
          <span className="text-xs text-zinc-600">
            {trace.usage.inputTokens + trace.usage.outputTokens} tok
          </span>
        )}
        <span className="text-xs text-zinc-600">
          {expanded ? '▼' : '▶'}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 ml-6 space-y-2">
          <div className="text-xs">
            <div className="text-zinc-500 mb-1">Prompt:</div>
            <pre className="bg-zinc-800 p-2 rounded text-zinc-300 whitespace-pre-wrap text-[10px] max-h-40 overflow-auto">
              {trace.prompt}
            </pre>
          </div>

          {trace.systemPrompt && (
            <div className="text-xs">
              <div className="text-zinc-500 mb-1">System:</div>
              <pre className="bg-zinc-800 p-2 rounded text-zinc-300 whitespace-pre-wrap text-[10px] max-h-20 overflow-auto">
                {trace.systemPrompt}
              </pre>
            </div>
          )}

          {trace.response && (
            <div className="text-xs">
              <div className="text-zinc-500 mb-1">Response:</div>
              <pre className="bg-zinc-800 p-2 rounded text-emerald-300 whitespace-pre-wrap text-[10px] max-h-40 overflow-auto">
                {trace.response}
              </pre>
            </div>
          )}

          {trace.error && (
            <div className="text-xs">
              <div className="text-zinc-500 mb-1">Error:</div>
              <pre className="bg-red-900/20 p-2 rounded text-red-400 whitespace-pre-wrap text-[10px]">
                {trace.error}
              </pre>
            </div>
          )}

          {trace.usage && (
            <div className="flex gap-4 text-xs text-zinc-500">
              <span>Input: {trace.usage.inputTokens} tokens</span>
              <span>Output: {trace.usage.outputTokens} tokens</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ExecutionTraceList({
  traces,
  selectedId,
  onSelect,
  onConvertToWorkflow,
}: {
  traces: ExecutionTrace[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onConvertToWorkflow: (trace: ExecutionTrace) => void
}) {
  if (traces.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        No executions recorded
      </div>
    )
  }

  return (
    <div className="divide-y divide-zinc-800">
      {traces.map((trace) => (
        <div
          key={trace.id}
          onClick={() => onSelect(trace.id === selectedId ? null : trace.id)}
          className={`px-4 py-3 cursor-pointer transition-colors ${
            trace.id === selectedId
              ? 'bg-indigo-500/10 border-l-2 border-indigo-500'
              : 'hover:bg-zinc-800/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`text-sm ${getStatusColor(trace.status)}`}>
              {getStatusIcon(trace.status)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {trace.workflowName || trace.workflowId}
              </div>
              <div className="text-xs text-zinc-500">
                {new Date(trace.startedAt).toLocaleString()}
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="text-zinc-400">
                {trace.completedNodes}/{trace.totalNodes} nodes
              </div>
              {trace.totalLatencyMs && (
                <div className="text-zinc-500">
                  {(trace.totalLatencyMs / 1000).toFixed(2)}s
                </div>
              )}
            </div>
          </div>

          {/* Node progress bar */}
          {trace.totalNodes > 0 && (
            <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  trace.failedNodes > 0 ? 'bg-red-500' : 'bg-emerald-500'
                }`}
                style={{
                  width: `${(trace.completedNodes / trace.totalNodes) * 100}%`,
                }}
              />
            </div>
          )}

          {/* LLM calls summary and Convert button */}
          <div className="mt-2 flex items-center justify-between">
            {trace.llmTraces.length > 0 && (
              <div className="text-xs text-zinc-500">
                {trace.llmTraces.length} LLM calls
                {trace.totalTokens && (
                  <span className="ml-2">
                    • {trace.totalTokens.inputTokens + trace.totalTokens.outputTokens} tokens
                  </span>
                )}
              </div>
            )}
            {trace.status === 'completed' && trace.llmTraces.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onConvertToWorkflow(trace)
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded
                           bg-violet-500/20 hover:bg-violet-500/30 text-violet-400
                           transition-colors"
                title="Convert to reusable workflow"
              >
                <Wand2 size={12} />
                Save as Workflow
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function TraceStats({ stats }: { stats: ReturnType<typeof useTraceStore.getState>['getStats'] extends () => infer R ? R : never }) {
  return (
    <div className="p-4 space-y-4">
      {/* Overview */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Total Executions"
          value={stats.totalExecutions}
          subtext={`${stats.successfulExecutions} successful`}
        />
        <StatCard
          label="Avg Latency"
          value={`${(stats.avgLatencyMs / 1000).toFixed(2)}s`}
          subtext="per execution"
        />
        <StatCard
          label="Total Tokens"
          value={stats.totalTokensUsed.inputTokens + stats.totalTokensUsed.outputTokens}
          subtext={`${stats.totalTokensUsed.inputTokens} in / ${stats.totalTokensUsed.outputTokens} out`}
        />
      </div>

      {/* By Provider */}
      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-2">By Provider</h3>
        <div className="space-y-2">
          {Object.entries(stats.byProvider)
            .filter(([, data]) => data.invocations > 0)
            .map(([provider, data]) => (
              <div
                key={provider}
                className="flex items-center justify-between p-2 bg-zinc-800 rounded"
              >
                <span className="text-sm font-mono text-indigo-400">{provider}</span>
                <div className="flex gap-4 text-xs text-zinc-400">
                  <span>{data.invocations} calls</span>
                  <span>{data.avgLatencyMs.toFixed(0)}ms avg</span>
                  <span>
                    {data.tokens.inputTokens + data.tokens.outputTokens} tokens
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string
  value: string | number
  subtext?: string
}) {
  return (
    <div className="p-3 bg-zinc-800 rounded">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-xl font-bold text-zinc-100">{value}</div>
      {subtext && <div className="text-xs text-zinc-500">{subtext}</div>}
    </div>
  )
}

function getStatusIcon(status: ExecutionStatus): string {
  switch (status) {
    case 'completed':
      return '✓'
    case 'failed':
      return '✗'
    case 'running':
      return '●'
    case 'pending':
      return '○'
    case 'cancelled':
      return '⊘'
    case 'skipped':
      return '↷'
    case 'cache_hit':
      return '⚡'
    default:
      return '?'
  }
}

function getStatusColor(status: ExecutionStatus): string {
  switch (status) {
    case 'completed':
      return 'text-emerald-400'
    case 'failed':
      return 'text-red-400'
    case 'running':
      return 'text-blue-400'
    case 'pending':
      return 'text-zinc-400'
    case 'cancelled':
      return 'text-orange-400'
    case 'skipped':
      return 'text-yellow-400'
    case 'cache_hit':
      return 'text-purple-400'
    default:
      return 'text-zinc-400'
  }
}

export default TraceViewer
