/**
 * DebugPanel — Advanced debugging view for workflow execution.
 *
 * Features:
 * - Node input/output inspection
 * - Error diagnostics
 * - Execution timeline
 * - Variable watch
 */

import { useState, useMemo } from 'react'
import { useWorkflowStore, type NodeData } from '@/stores/workflowStore'
import { useExecutionStore, type NodeExecutionDetail } from '@/stores/executionStore'
import { errorHistory, type ClassifiedError } from '@/services/ErrorRecovery'
import {
  Bug,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  RefreshCw,
} from 'lucide-react'
import type { Node } from '@xyflow/react'

interface DebugPanelProps {
  className?: string
  selectedNodeId?: string | null
  onSelectNode?: (nodeId: string | null) => void
}

export function DebugPanel({
  className = '',
  selectedNodeId,
  onSelectNode,
}: DebugPanelProps) {
  const { nodes } = useWorkflowStore()
  const { nodeStatuses, nodeDetails, currentExecution, spans } = useExecutionStore()

  const [tab, setTab] = useState<'nodes' | 'errors' | 'timeline' | 'watch'>('nodes')
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [watchedVariables, setWatchedVariables] = useState<string[]>([])
  const [showRaw, setShowRaw] = useState(false)

  const errors = useMemo(() => errorHistory.getAll(), [])
  const errorStats = useMemo(() => errorHistory.getStats(), [])

  const toggleExpand = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  const copyToClipboard = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
  }

  return (
    <div className={`flex flex-col h-full bg-neutral-950 text-neutral-100 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Bug size={14} className="text-amber-400" />
          <h2 className="text-sm font-semibold">Debug Panel</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className={`p-1 rounded ${showRaw ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
            title={showRaw ? 'Show formatted' : 'Show raw'}
          >
            {showRaw ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800">
        <TabButton active={tab === 'nodes'} onClick={() => setTab('nodes')}>
          Nodes ({nodes.length})
        </TabButton>
        <TabButton
          active={tab === 'errors'}
          onClick={() => setTab('errors')}
          badge={errorStats.total > 0 ? errorStats.total : undefined}
        >
          Errors
        </TabButton>
        <TabButton active={tab === 'timeline'} onClick={() => setTab('timeline')}>
          Timeline
        </TabButton>
        <TabButton active={tab === 'watch'} onClick={() => setTab('watch')}>
          Watch
        </TabButton>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'nodes' && (
          <NodesView
            nodes={nodes as Node<NodeData>[]}
            nodeStatuses={nodeStatuses}
            nodeDetails={nodeDetails}
            selectedNodeId={selectedNodeId}
            expandedNodes={expandedNodes}
            showRaw={showRaw}
            onSelectNode={onSelectNode}
            onToggleExpand={toggleExpand}
            onCopy={copyToClipboard}
          />
        )}

        {tab === 'errors' && (
          <ErrorsView
            errors={errors}
            stats={errorStats}
            onClear={() => errorHistory.clear()}
          />
        )}

        {tab === 'timeline' && (
          <TimelineView
            spans={spans}
            currentExecution={currentExecution}
          />
        )}

        {tab === 'watch' && (
          <WatchView
            variables={watchedVariables}
            nodeDetails={nodeDetails}
            onAddVariable={(v) => setWatchedVariables([...watchedVariables, v])}
            onRemoveVariable={(v) =>
              setWatchedVariables(watchedVariables.filter(x => x !== v))
            }
          />
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  badge,
  children,
}: {
  active: boolean
  onClick: () => void
  badge?: number
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
        active
          ? 'border-b-2 border-amber-500 text-amber-400'
          : 'text-neutral-500 hover:text-neutral-300'
      }`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-red-500/20 text-red-400">
          {badge}
        </span>
      )}
    </button>
  )
}

function NodesView({
  nodes,
  nodeStatuses,
  nodeDetails,
  selectedNodeId,
  expandedNodes,
  showRaw,
  onSelectNode,
  onToggleExpand,
  onCopy,
}: {
  nodes: Node<NodeData>[]
  nodeStatuses: Record<string, string>
  nodeDetails: Record<string, NodeExecutionDetail>
  selectedNodeId?: string | null
  expandedNodes: Set<string>
  showRaw: boolean
  onSelectNode?: (nodeId: string | null) => void
  onToggleExpand: (nodeId: string) => void
  onCopy: (data: unknown) => void
}) {
  return (
    <div className="divide-y divide-neutral-800">
      {nodes.map(node => {
        const data = node.data as NodeData
        const status = nodeStatuses[node.id]
        const detail = nodeDetails[node.id]
        const isExpanded = expandedNodes.has(node.id)
        const isSelected = selectedNodeId === node.id

        return (
          <div
            key={node.id}
            className={`${isSelected ? 'bg-amber-500/5' : ''}`}
          >
            {/* Node header */}
            <div
              onClick={() => onToggleExpand(node.id)}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-900"
            >
              {isExpanded ? (
                <ChevronDown size={12} className="text-neutral-600" />
              ) : (
                <ChevronRight size={12} className="text-neutral-600" />
              )}

              <StatusIcon status={status} />

              <span
                className="text-xs font-medium flex-1 truncate"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectNode?.(node.id)
                }}
              >
                {data.label}
              </span>

              <span className="text-[10px] text-neutral-600 font-mono">
                {node.id.slice(0, 8)}
              </span>

              {detail?.duration_ms && (
                <span className="text-[10px] text-neutral-500">
                  {detail.duration_ms}ms
                </span>
              )}
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div className="px-3 pb-3 space-y-2">
                {/* Tool ref */}
                <div className="text-[10px]">
                  <span className="text-neutral-600">Tool: </span>
                  <span className="text-neutral-400 font-mono">{data.toolRef}</span>
                </div>

                {/* Input */}
                {detail?.input !== undefined && (
                  <DataBlock
                    label="Input"
                    data={detail.input}
                    showRaw={showRaw}
                    onCopy={() => onCopy(detail.input)}
                  />
                )}

                {/* Output */}
                {detail?.output !== undefined && (
                  <DataBlock
                    label="Output"
                    data={detail.output}
                    showRaw={showRaw}
                    onCopy={() => onCopy(detail.output)}
                  />
                )}

                {/* Error */}
                {detail?.error && (
                  <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-xs">
                    <div className="flex items-center gap-1 text-red-400 mb-1">
                      <AlertCircle size={10} />
                      Error
                    </div>
                    <pre className="text-red-300 text-[10px] whitespace-pre-wrap">
                      {detail.error}
                    </pre>
                  </div>
                )}

                {/* Config */}
                <DataBlock
                  label="Config"
                  data={data.config}
                  showRaw={showRaw}
                  onCopy={() => onCopy(data.config)}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DataBlock({
  label,
  data,
  showRaw,
  onCopy,
}: {
  label: string
  data: unknown
  showRaw: boolean
  onCopy: () => void
}) {
  return (
    <div className="p-2 bg-neutral-900 border border-neutral-800 rounded">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-neutral-500">{label}</span>
        <button
          onClick={onCopy}
          className="text-neutral-600 hover:text-neutral-400"
          title="Copy to clipboard"
        >
          <Copy size={10} />
        </button>
      </div>
      <pre className="text-[10px] text-neutral-300 whitespace-pre-wrap overflow-auto max-h-32">
        {showRaw
          ? JSON.stringify(data)
          : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

function StatusIcon({ status }: { status?: string }) {
  switch (status) {
    case 'completed':
    case 'cache_hit':
      return <CheckCircle2 size={12} className="text-emerald-500" />
    case 'failed':
      return <AlertCircle size={12} className="text-red-500" />
    case 'running':
      return <RefreshCw size={12} className="text-blue-500 animate-spin" />
    case 'pending':
      return <Clock size={12} className="text-neutral-500" />
    default:
      return <div className="w-3 h-3 rounded-full bg-neutral-700" />
  }
}

function ErrorsView({
  errors,
  stats,
  onClear,
}: {
  errors: ClassifiedError[]
  stats: ReturnType<typeof errorHistory.getStats>
  onClear: () => void
}) {
  if (errors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-600 text-sm">
        <CheckCircle2 size={24} className="mb-2" />
        No errors recorded
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="Total"
          value={stats.total}
          color="neutral"
        />
        <StatCard
          label="Critical"
          value={stats.bySeverity.critical}
          color="red"
        />
        <StatCard
          label="Retried"
          value={stats.retrySuccess}
          color="amber"
        />
      </div>

      {/* Clear button */}
      <div className="flex justify-end">
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300"
        >
          <Trash2 size={10} />
          Clear
        </button>
      </div>

      {/* Error list */}
      <div className="space-y-2">
        {errors.slice(0, 20).map(error => (
          <div
            key={error.id}
            className={`p-2 rounded border ${
              error.severity === 'critical'
                ? 'bg-red-500/10 border-red-500/30'
                : error.severity === 'warning'
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-neutral-800 border-neutral-700'
            }`}
          >
            <div className="flex items-start gap-2">
              {error.severity === 'critical' ? (
                <AlertCircle size={12} className="text-red-400 mt-0.5" />
              ) : (
                <AlertTriangle size={12} className="text-amber-400 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-neutral-200 truncate">
                    {error.message}
                  </span>
                  <span className="text-[9px] text-neutral-600 shrink-0">
                    {error.category}
                  </span>
                </div>
                <div className="text-[10px] text-neutral-500 mt-0.5">
                  Node: {error.nodeId.slice(0, 8)} • Retry: {error.retryCount}/{error.maxRetries}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: 'neutral' | 'red' | 'amber' | 'emerald'
}) {
  const colorClass =
    color === 'red' ? 'text-red-400' :
    color === 'amber' ? 'text-amber-400' :
    color === 'emerald' ? 'text-emerald-400' :
    'text-neutral-200'

  return (
    <div className="p-2 bg-neutral-900 rounded">
      <div className={`text-lg font-bold ${colorClass}`}>{value}</div>
      <div className="text-[10px] text-neutral-600">{label}</div>
    </div>
  )
}

function TimelineView({
  spans,
  currentExecution,
}: {
  spans: Array<{ span_id: string; node_id: string; started_at: string; completed_at?: string | null; status: string }>
  currentExecution: { started_at: string; completed_at?: string | null } | null
}) {
  if (!currentExecution && spans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-600 text-sm">
        <Clock size={24} className="mb-2" />
        No execution history
      </div>
    )
  }

  const startTime = currentExecution ? new Date(currentExecution.started_at).getTime() : 0
  const endTime = currentExecution?.completed_at
    ? new Date(currentExecution.completed_at).getTime()
    : Date.now()
  const totalDuration = endTime - startTime

  return (
    <div className="p-3 space-y-2">
      {/* Duration */}
      {currentExecution && (
        <div className="text-xs text-neutral-400">
          Total duration: {Math.round(totalDuration)}ms
        </div>
      )}

      {/* Timeline bars */}
      <div className="space-y-1">
        {spans.map(span => {
          const spanStart = new Date(span.started_at).getTime() - startTime
          const spanEnd = span.completed_at
            ? new Date(span.completed_at).getTime() - startTime
            : Date.now() - startTime
          const spanDuration = spanEnd - spanStart

          const left = totalDuration > 0 ? (spanStart / totalDuration) * 100 : 0
          const width = totalDuration > 0 ? (spanDuration / totalDuration) * 100 : 0

          return (
            <div key={span.span_id} className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500 w-16 truncate">
                {span.node_id.slice(0, 8)}
              </span>
              <div className="flex-1 h-3 bg-neutral-800 rounded relative">
                <div
                  className={`absolute h-full rounded ${
                    span.status === 'completed' ? 'bg-emerald-500' :
                    span.status === 'failed' ? 'bg-red-500' :
                    span.status === 'running' ? 'bg-blue-500' :
                    'bg-neutral-600'
                  }`}
                  style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
                />
              </div>
              <span className="text-[10px] text-neutral-600 w-12 text-right">
                {Math.round(spanDuration)}ms
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WatchView({
  variables,
  nodeDetails,
  onAddVariable,
  onRemoveVariable,
}: {
  variables: string[]
  nodeDetails: Record<string, NodeExecutionDetail>
  onAddVariable: (v: string) => void
  onRemoveVariable: (v: string) => void
}) {
  const [newVar, setNewVar] = useState('')

  const handleAdd = () => {
    if (newVar.trim() && !variables.includes(newVar.trim())) {
      onAddVariable(newVar.trim())
      setNewVar('')
    }
  }

  return (
    <div className="p-3 space-y-3">
      {/* Add variable */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newVar}
          onChange={(e) => setNewVar(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="nodeId.output.path"
          className="flex-1 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded
                   text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
        />
        <button
          onClick={handleAdd}
          className="px-2 py-1 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded"
        >
          Watch
        </button>
      </div>

      {/* Watch list */}
      <div className="space-y-2">
        {variables.map(v => {
          // Parse variable path (e.g., "node_1.output.text")
          const parts = v.split('.')
          const nodeId = parts[0] || ''
          const detail = nodeDetails[nodeId]
          let value: unknown = detail

          try {
            for (let i = 1; i < parts.length && value !== undefined; i++) {
              const key = parts[i]
              if (key) {
                value = (value as Record<string, unknown>)?.[key]
              }
            }
          } catch {
            value = undefined
          }

          return (
            <div key={v} className="p-2 bg-neutral-900 border border-neutral-800 rounded">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-amber-400 font-mono">{v}</span>
                <button
                  onClick={() => onRemoveVariable(v)}
                  className="text-neutral-600 hover:text-red-400"
                >
                  <Trash2 size={10} />
                </button>
              </div>
              <pre className="text-[10px] text-neutral-300 whitespace-pre-wrap overflow-auto max-h-20">
                {value === undefined
                  ? '(undefined)'
                  : JSON.stringify(value, null, 2)}
              </pre>
            </div>
          )
        })}

        {variables.length === 0 && (
          <div className="text-center text-xs text-neutral-600 py-4">
            Add variables to watch their values during execution
          </div>
        )}
      </div>
    </div>
  )
}

export default DebugPanel
