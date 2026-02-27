/**
 * ExecutionPanel — bottom panel showing execution status with inline output preview.
 * Improved UX: node output shown directly when selected, with copy functionality.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useExecutionStore } from '@/stores/executionStore'
import { useWorkflowStore, type NodeData } from '@/stores/workflowStore'
import { getCategoryColor } from '@/data/toolCatalog'
import {
  CheckCircle, XCircle, Clock, Loader2,
  Activity, List, AlertTriangle,
  Copy, Check, Maximize2, X,
} from 'lucide-react'

type Tab = 'status' | 'trace'

export function ExecutionPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('status')
  const { currentExecution, isRunning } = useExecutionStore()
  const { nodes } = useWorkflowStore()

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'status', label: 'Status', icon: <Activity size={12} /> },
    { id: 'trace', label: 'Trace', icon: <List size={12} /> },
  ]

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-neutral-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
              activeTab === tab.id
                ? 'bg-neutral-800 text-neutral-200'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}

        {/* Execution status badge */}
        {currentExecution && (
          <div className="ml-auto flex items-center gap-2">
            {isRunning ? (
              <div className="flex items-center gap-1.5 text-xs text-amber-400">
                <Loader2 size={12} className="animate-spin" />
                Running...
              </div>
            ) : currentExecution.status === 'completed' ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle size={12} />
                Completed ({currentExecution.completed_nodes}/{currentExecution.total_nodes} nodes)
              </div>
            ) : currentExecution.status === 'failed' ? (
              <div className="flex items-center gap-1.5 text-xs text-red-400">
                <XCircle size={12} />
                Failed
              </div>
            ) : currentExecution.status === 'cancelled' ? (
              <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                <XCircle size={12} />
                Cancelled
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'status' && (
          <StatusView nodes={nodes} currentExecution={currentExecution} isRunning={isRunning} />
        )}
        {activeTab === 'trace' && <TraceView currentExecution={currentExecution} />}
      </div>
    </div>
  )
}

function StatusView({
  nodes,
  currentExecution,
  isRunning,
}: {
  nodes: ReturnType<typeof useWorkflowStore.getState>['nodes']
  currentExecution: ReturnType<typeof useExecutionStore.getState>['currentExecution']
  isRunning: boolean
}) {
  const { nodeStatuses, nodeDetails, selectedNodeId, selectNode } = useExecutionStore()
  const [_expandedErrors, _setExpandedErrors] = useState<Set<string>>(new Set())
  // Silence unused variable warnings (for future expandable error UI)
  void _expandedErrors
  void _setExpandedErrors
  const [leftPanelWidth, setLeftPanelWidth] = useState(280) // pixels
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const newWidth = e.clientX - containerRect.left
      // Clamp between 150px and 600px
      setLeftPanelWidth(Math.max(150, Math.min(600, newWidth)))
    }

    const handleMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  if (!currentExecution) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-600 text-xs p-3">
        Run 버튼을 눌러 워크플로우를 실행하세요
      </div>
    )
  }

  // Future use: expand/collapse error details per node
  const _toggleErrorExpanded = (nodeId: string) => {
    _setExpandedErrors((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }
  void _toggleErrorExpanded // Silence unused warning

  // Get selected node details
  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null
  const selectedNodeData = selectedNode?.data as NodeData | undefined
  const selectedDetail = selectedNodeId ? nodeDetails[selectedNodeId] : null

  return (
    <div ref={containerRef} className="flex h-full">
      {/* Left: Node list */}
      <div
        style={{ width: selectedNodeId ? leftPanelWidth : '100%' }}
        className="overflow-auto p-3 space-y-1.5 shrink-0"
      >
        <div className="text-[10px] text-neutral-500 uppercase mb-2">
          노드를 클릭하면 출력을 확인할 수 있습니다
        </div>
        {nodes.map((node, i) => {
          const data = node.data as NodeData
          const color = getCategoryColor(data.category)
          const nodeStatus = nodeStatuses[node.id]
          const detail = nodeDetails[node.id]

          const isCompleted = nodeStatus === 'completed' || currentExecution.completed_nodes > i
          const isFailed = nodeStatus === 'failed'
          const isCurrent = nodeStatus === 'running' || (isRunning && currentExecution.completed_nodes === i)
          const isSelected = selectedNodeId === node.id
          const hasError = detail?.error
          const _isErrorExpanded = _expandedErrors.has(node.id)
          void _isErrorExpanded // Silence unused warning

          return (
            <div key={node.id}>
              <div
                onClick={() => selectNode(isSelected ? null : node.id)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-900/40 ring-1 ring-blue-500'
                    : 'bg-neutral-900/50 hover:bg-neutral-800/50'
                }`}
              >
                {isFailed ? (
                  <XCircle size={13} className="text-red-500 shrink-0" />
                ) : isCompleted ? (
                  <CheckCircle size={13} className="text-emerald-500 shrink-0" />
                ) : isCurrent ? (
                  <Loader2 size={13} className="text-amber-400 animate-spin shrink-0" />
                ) : (
                  <Clock size={13} className="text-neutral-600 shrink-0" />
                )}
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
                <span className="text-xs text-neutral-300 truncate flex-1">{data.label}</span>
                {detail?.duration_ms !== undefined && (
                  <span className="text-[10px] text-neutral-600">{detail.duration_ms}ms</span>
                )}
                {hasError && !isSelected && (
                  <AlertTriangle size={12} className="text-red-400 shrink-0" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Resizable divider */}
      {selectedNodeId && (
        <div
          onMouseDown={handleMouseDown}
          className="w-1 bg-neutral-800 hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors"
          title="드래그하여 크기 조절"
        />
      )}

      {/* Right: Output preview */}
      {selectedNodeId && selectedDetail && (
        <OutputPreview
          nodeId={selectedNodeId}
          nodeLabel={selectedNodeData?.label ?? selectedNodeId}
          detail={selectedDetail}
          onClose={() => selectNode(null)}
        />
      )}
    </div>
  )
}

function OutputPreview({
  nodeId,
  nodeLabel,
  detail,
  onClose,
}: {
  nodeId: string
  nodeLabel: string
  detail: {
    status?: string
    duration_ms?: number
    input?: unknown
    output?: unknown
    error?: string
  }
  onClose: () => void
}) {
  const [copied, setCopied] = useState<'input' | 'output' | null>(null)
  const [fullscreen, setFullscreen] = useState<'input' | 'output' | null>(null)
  const outputRef = useRef<HTMLPreElement>(null)
  const inputRef = useRef<HTMLPreElement>(null)

  const formatValue = (value: unknown): string => {
    if (value === undefined || value === null) return ''
    if (typeof value === 'string') return value
    return JSON.stringify(value, null, 2)
  }

  const copyToClipboard = async (type: 'input' | 'output') => {
    const value = type === 'input' ? detail.input : detail.output
    const text = formatValue(value)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const outputText = formatValue(detail.output)
  const inputText = formatValue(detail.input)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 bg-neutral-900/50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-300 font-medium">{nodeLabel}</span>
          <span className="text-[10px] text-neutral-600 font-mono">{nodeId}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            detail.status === 'completed' ? 'bg-emerald-900/50 text-emerald-400' :
            detail.status === 'failed' ? 'bg-red-900/50 text-red-400' :
            detail.status === 'running' ? 'bg-amber-900/50 text-amber-400' :
            'bg-neutral-800 text-neutral-400'
          }`}>
            {detail.status}
            {detail.duration_ms !== undefined && ` (${detail.duration_ms}ms)`}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-neutral-800 rounded text-neutral-500 hover:text-neutral-300"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Error */}
        {detail.error && (
          <div className="p-2.5 bg-red-950/40 border border-red-900/50 rounded-md">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle size={12} className="text-red-400" />
              <span className="text-xs font-medium text-red-400">Error</span>
            </div>
            <pre className="text-[11px] text-red-300 font-mono whitespace-pre-wrap break-all">
              {detail.error}
            </pre>
          </div>
        )}

        {/* Output */}
        {detail.output !== undefined && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 uppercase font-semibold">Output</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => copyToClipboard('output')}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
                  title="Copy to clipboard"
                >
                  {copied === 'output' ? (
                    <>
                      <Check size={10} className="text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={10} />
                      <span>Copy All</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setFullscreen(fullscreen === 'output' ? null : 'output')}
                  className="p-1 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded"
                  title="Toggle fullscreen"
                >
                  <Maximize2 size={10} />
                </button>
              </div>
            </div>
            <pre
              ref={outputRef}
              className={`text-[11px] text-neutral-300 bg-neutral-900 p-3 rounded-md overflow-auto font-mono whitespace-pre-wrap break-words select-all ${
                fullscreen === 'output' ? 'max-h-none' : 'max-h-[50vh]'
              }`}
              style={{ wordBreak: 'break-word' }}
            >
              {outputText || '(empty)'}
            </pre>
          </div>
        )}

        {/* Input */}
        {detail.input !== undefined && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 uppercase font-semibold">Input</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => copyToClipboard('input')}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
                  title="Copy to clipboard"
                >
                  {copied === 'input' ? (
                    <>
                      <Check size={10} className="text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={10} />
                      <span>Copy All</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setFullscreen(fullscreen === 'input' ? null : 'input')}
                  className="p-1 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded"
                  title="Toggle fullscreen"
                >
                  <Maximize2 size={10} />
                </button>
              </div>
            </div>
            <pre
              ref={inputRef}
              className={`text-[11px] text-neutral-400 bg-neutral-900/70 p-3 rounded-md overflow-auto font-mono whitespace-pre-wrap break-all select-all ${
                fullscreen === 'input' ? 'max-h-none' : 'max-h-40'
              }`}
            >
              {inputText || '(empty)'}
            </pre>
          </div>
        )}

        {/* No data */}
        {!detail.input && !detail.output && !detail.error && (
          <div className="text-center text-neutral-600 text-xs py-8">
            이 노드에 대한 데이터가 없습니다
          </div>
        )}
      </div>
    </div>
  )
}

function TraceView({
  currentExecution,
}: {
  currentExecution: ReturnType<typeof useExecutionStore.getState>['currentExecution']
}) {
  const { spans } = useExecutionStore()

  if (!currentExecution) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-600 text-xs p-3">
        실행 trace가 여기에 표시됩니다
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-emerald-400'
      case 'failed': return 'text-red-400'
      case 'running': return 'text-amber-400'
      case 'cancelled': return 'text-neutral-400'
      default: return 'text-neutral-500'
    }
  }

  return (
    <div className="p-3 space-y-1 overflow-auto">
      <div className="grid grid-cols-[80px_1fr_80px_80px_60px] gap-2 px-2 py-1 text-[10px] text-neutral-600 uppercase font-semibold border-b border-neutral-800">
        <span>Time</span>
        <span>Event</span>
        <span>Node</span>
        <span>Status</span>
        <span>Duration</span>
      </div>
      {/* Workflow start */}
      <div className="grid grid-cols-[80px_1fr_80px_80px_60px] gap-2 px-2 py-1 text-[10px] text-neutral-400">
        <span>{new Date(currentExecution.started_at).toLocaleTimeString()}</span>
        <span>Workflow execution started</span>
        <span>-</span>
        <span className="text-amber-400">started</span>
        <span>-</span>
      </div>
      {/* Node spans */}
      {spans.map((span) => (
        <div key={span.span_id} className="grid grid-cols-[80px_1fr_80px_80px_60px] gap-2 px-2 py-1 text-[10px] text-neutral-400">
          <span>{new Date(span.started_at).toLocaleTimeString()}</span>
          <span>Node {span.status === 'running' ? 'started' : span.status}</span>
          <span className="font-mono truncate">{span.node_id}</span>
          <span className={getStatusColor(span.status)}>{span.status}</span>
          <span>{span.duration_ms !== null ? `${span.duration_ms}ms` : '-'}</span>
        </div>
      ))}
      {/* Workflow end */}
      {currentExecution.completed_at && (
        <div className="grid grid-cols-[80px_1fr_80px_80px_60px] gap-2 px-2 py-1 text-[10px] text-neutral-400">
          <span>{new Date(currentExecution.completed_at).toLocaleTimeString()}</span>
          <span>Workflow execution {currentExecution.status}</span>
          <span>-</span>
          <span className={getStatusColor(currentExecution.status)}>
            {currentExecution.status}
          </span>
          <span>-</span>
        </div>
      )}
    </div>
  )
}
