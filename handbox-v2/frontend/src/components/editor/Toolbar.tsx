/**
 * Toolbar — top bar with workflow controls, run/stop, and file operations.
 */

import { useState } from 'react'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useExecutionStore } from '@/stores/executionStore'
import {
  Play, Square, Plus,
  Download, Terminal, Zap, Sparkles,
} from 'lucide-react'

interface ToolbarProps {
  onToggleExecPanel: () => void
  onOpenCompiler?: () => void
}

export function Toolbar({ onToggleExecPanel, onOpenCompiler }: ToolbarProps) {
  const { nodes, edges, clearAll, getWorkflowJson } = useWorkflowStore()
  const { isRunning } = useExecutionStore()
  const [workflowName, setWorkflowName] = useState('Untitled Workflow')

  const handleRun = () => {
    if (nodes.length === 0) return
    // Phase 1: invoke Tauri execute_workflow command
    useExecutionStore.getState().startExecution({
      execution_id: crypto.randomUUID(),
      workflow_id: crypto.randomUUID(),
      started_at: new Date().toISOString(),
      completed_at: null,
      status: 'running',
      total_nodes: nodes.length,
      completed_nodes: 0,
      failed_nodes: 0,
      cache_hits: 0,
    })

    // Simulate execution for demo
    let completed = 0
    const interval = setInterval(() => {
      completed++
      if (completed >= nodes.length) {
        clearInterval(interval)
        const state = useExecutionStore.getState()
        if (state.currentExecution) {
          useExecutionStore.getState().completeExecution({
            ...state.currentExecution,
            completed_at: new Date().toISOString(),
            status: 'completed',
            completed_nodes: nodes.length,
          })
        }
      }
    }, 500)
  }

  const handleStop = () => {
    const state = useExecutionStore.getState()
    if (state.currentExecution) {
      state.completeExecution({
        ...state.currentExecution,
        completed_at: new Date().toISOString(),
        status: 'cancelled',
      })
    }
  }

  const handleExport = () => {
    const json = getWorkflowJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${workflowName.replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <header className="h-11 border-b border-neutral-800 bg-neutral-950 flex items-center px-3 gap-2 shrink-0">
      {/* App branding */}
      <div className="flex items-center gap-2 mr-3">
        <Zap size={16} className="text-violet-500" />
        <span className="text-xs font-bold text-neutral-200 tracking-wide">HANDBOX</span>
        <span className="text-[10px] text-neutral-600 font-mono">v2</span>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-neutral-800" />

      {/* Workflow name */}
      <input
        type="text"
        value={workflowName}
        onChange={(e) => setWorkflowName(e.target.value)}
        className="px-2 py-1 text-xs bg-transparent border-none text-neutral-300
                   hover:bg-neutral-900 focus:bg-neutral-900 rounded focus:outline-none
                   focus:ring-1 focus:ring-neutral-700 w-48"
      />

      {/* Node/Edge count */}
      <div className="flex items-center gap-2 text-[10px] text-neutral-600">
        <span>{nodes.length} nodes</span>
        <span>{edges.length} edges</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* File operations */}
      <div className="flex items-center gap-1">
        <button
          onClick={clearAll}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                     hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
          title="New workflow"
        >
          <Plus size={13} />
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                     hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
          title="Export JSON"
        >
          <Download size={13} />
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-neutral-800" />

      {/* AI Compiler */}
      <button
        onClick={onOpenCompiler}
        className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium
                   bg-violet-600/80 hover:bg-violet-500 text-white transition-colors"
        title="AI Workflow Compiler"
      >
        <Sparkles size={12} />
        AI Compile
      </button>

      {/* Separator */}
      <div className="w-px h-5 bg-neutral-800" />

      {/* Execution controls */}
      <div className="flex items-center gap-1">
        {!isRunning ? (
          <button
            onClick={handleRun}
            disabled={nodes.length === 0}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium
                       bg-emerald-600 hover:bg-emerald-500 text-white transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={12} />
            Run
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium
                       bg-red-600 hover:bg-red-500 text-white transition-colors"
          >
            <Square size={12} />
            Stop
          </button>
        )}
      </div>

      {/* Toggle execution panel */}
      <button
        onClick={onToggleExecPanel}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
        title="Toggle execution panel"
      >
        <Terminal size={13} />
      </button>
    </header>
  )
}
