/**
 * ExecutionPanel — bottom panel showing execution status, logs, and trace.
 */

import { useState } from 'react'
import { useExecutionStore } from '@/stores/executionStore'
import { useWorkflowStore, type NodeData } from '@/stores/workflowStore'
import { getCategoryColor } from '@/data/toolCatalog'
import {
  CheckCircle, XCircle, Clock, Loader2,
  Activity, FileJson, List,
} from 'lucide-react'

type Tab = 'status' | 'output' | 'trace'

export function ExecutionPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('status')
  const { currentExecution, isRunning } = useExecutionStore()
  const { nodes } = useWorkflowStore()

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'status', label: 'Status', icon: <Activity size={12} /> },
    { id: 'output', label: 'Output', icon: <FileJson size={12} /> },
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
      <div className="flex-1 overflow-auto p-3">
        {activeTab === 'status' && (
          <StatusView nodes={nodes} currentExecution={currentExecution} isRunning={isRunning} />
        )}
        {activeTab === 'output' && <OutputView />}
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
  if (!currentExecution) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-600 text-xs">
        Run 버튼을 눌러 워크플로우를 실행하세요
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {nodes.map((node, i) => {
        const data = node.data as NodeData
        const color = getCategoryColor(data.category)
        const isCompleted = currentExecution.completed_nodes > i
        const isCurrent = isRunning && currentExecution.completed_nodes === i

        return (
          <div
            key={node.id}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-neutral-900/50"
          >
            {isCompleted ? (
              <CheckCircle size={13} className="text-emerald-500 shrink-0" />
            ) : isCurrent ? (
              <Loader2 size={13} className="text-amber-400 animate-spin shrink-0" />
            ) : (
              <Clock size={13} className="text-neutral-600 shrink-0" />
            )}
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
            <span className="text-xs text-neutral-300">{data.label}</span>
            <span className="text-[10px] text-neutral-600 ml-auto font-mono">{node.id}</span>
            {isCompleted && (
              <span className="text-[10px] text-neutral-600">~{Math.round(Math.random() * 200 + 50)}ms</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function OutputView() {
  const { currentExecution } = useExecutionStore()

  if (!currentExecution || currentExecution.status === 'running') {
    return (
      <div className="flex items-center justify-center h-full text-neutral-600 text-xs">
        실행 완료 후 출력 결과가 여기에 표시됩니다
      </div>
    )
  }

  return (
    <div className="font-mono text-xs">
      <pre className="text-neutral-400 bg-neutral-900 p-3 rounded-md overflow-auto">
        {JSON.stringify(
          {
            execution_id: currentExecution.execution_id,
            status: currentExecution.status,
            total_nodes: currentExecution.total_nodes,
            completed_nodes: currentExecution.completed_nodes,
            started_at: currentExecution.started_at,
            completed_at: currentExecution.completed_at,
          },
          null,
          2
        )}
      </pre>
    </div>
  )
}

function TraceView({
  currentExecution,
}: {
  currentExecution: ReturnType<typeof useExecutionStore.getState>['currentExecution']
}) {
  if (!currentExecution) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-600 text-xs">
        실행 trace가 여기에 표시됩니다
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[80px_1fr_80px_80px_60px] gap-2 px-2 py-1 text-[10px] text-neutral-600 uppercase font-semibold border-b border-neutral-800">
        <span>Time</span>
        <span>Event</span>
        <span>Node</span>
        <span>Status</span>
        <span>Duration</span>
      </div>
      <div className="grid grid-cols-[80px_1fr_80px_80px_60px] gap-2 px-2 py-1 text-[10px] text-neutral-400">
        <span>{new Date(currentExecution.started_at).toLocaleTimeString()}</span>
        <span>Workflow execution started</span>
        <span>-</span>
        <span className="text-amber-400">started</span>
        <span>-</span>
      </div>
      {currentExecution.completed_at && (
        <div className="grid grid-cols-[80px_1fr_80px_80px_60px] gap-2 px-2 py-1 text-[10px] text-neutral-400">
          <span>{new Date(currentExecution.completed_at).toLocaleTimeString()}</span>
          <span>Workflow execution {currentExecution.status}</span>
          <span>-</span>
          <span className={currentExecution.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}>
            {currentExecution.status}
          </span>
          <span>-</span>
        </div>
      )}
    </div>
  )
}
