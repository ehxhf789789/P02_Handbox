/**
 * Toolbar — top bar with workflow controls, run/stop, and file operations.
 */

import { useState } from 'react'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { useExecution } from '@/hooks/useExecution'
import { invoke } from '@tauri-apps/api/core'
import {
  Play, Square, Plus,
  Download, Terminal, Zap, Sparkles, Settings, Package, Server,
  Activity, GitCompare, FolderOpen, Save,
  Map, Box, Layers, Bug, Bot, Users, ShoppingBag,
} from 'lucide-react'

interface ToolbarProps {
  onToggleExecPanel: () => void
  onOpenCompiler?: () => void
  onOpenLLMSettings?: () => void
  onOpenPackManager?: () => void
  onOpenMCPConnections?: () => void
  onToggleTraceViewer?: () => void
  onOpenModelComparison?: () => void
  onOpenWorkflowLibrary?: () => void
  onSaveWorkflow?: () => void
  // GIS/IFC/Fusion
  onOpenMcpPlugins?: () => void
  onOpenGisViewer?: () => void
  onOpenIfcViewer?: () => void
  onOpenFusionViewer?: () => void
  // Additional panels
  onOpenDebugPanel?: () => void
  onOpenAgentPanel?: () => void
  onOpenCollaboration?: () => void
  onOpenMarketplace?: () => void
}

export function Toolbar({
  onToggleExecPanel,
  onOpenCompiler,
  onOpenLLMSettings,
  onOpenPackManager,
  onOpenMCPConnections,
  onToggleTraceViewer,
  onOpenModelComparison,
  onOpenWorkflowLibrary,
  onSaveWorkflow,
  onOpenMcpPlugins,
  onOpenGisViewer,
  onOpenIfcViewer,
  onOpenFusionViewer,
  onOpenDebugPanel,
  onOpenAgentPanel,
  onOpenCollaboration,
  onOpenMarketplace,
}: ToolbarProps) {
  const { nodes, edges, clearAll, getWorkflowJson } = useWorkflowStore()
  const { isRunning, currentExecution } = useExecutionStore()
  const { execute, cancel } = useExecution()
  const [workflowName, setWorkflowName] = useState('Untitled Workflow')

  const handleRun = async () => {
    if (nodes.length === 0) return
    await execute()
  }

  const handleStop = async () => {
    if (currentExecution?.execution_id) {
      await cancel(currentExecution.execution_id)
    }
  }

  const handleExport = async () => {
    const json = getWorkflowJson()
    const filename = `${workflowName.replace(/\s+/g, '_')}.json`

    try {
      // Try Tauri backend export command
      const result = await invoke<{ path: string }>('export_workflow_file', {
        content: json,
        filename,
      })
      console.log('[Toolbar] Workflow exported to:', result.path)
      alert(`워크플로우가 저장되었습니다: ${result.path}`)
    } catch (error) {
      console.warn('[Toolbar] Tauri export failed, using browser fallback:', error)
      // Fallback to browser download
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      // Clean up after a short delay
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 100)
    }
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
          onClick={onOpenWorkflowLibrary}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                     hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
          title="Open workflow"
        >
          <FolderOpen size={13} />
        </button>
        <button
          onClick={onSaveWorkflow}
          disabled={nodes.length === 0}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                     hover:bg-neutral-800 hover:text-neutral-200 transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
          title="Save workflow"
        >
          <Save size={13} />
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

      {/* Trace Viewer */}
      <button
        onClick={onToggleTraceViewer}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
        title="Trace Viewer - LLM calls & execution logs"
      >
        <Activity size={13} />
      </button>

      {/* Model Comparison */}
      <button
        onClick={onOpenModelComparison}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
        title="Model Comparison - A/B test models"
      >
        <GitCompare size={13} />
      </button>

      {/* LLM Settings */}
      <button
        onClick={onOpenLLMSettings}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
        title="LLM Provider Settings"
      >
        <Settings size={13} />
      </button>

      {/* Pack Manager */}
      <button
        onClick={onOpenPackManager}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
        title="Pack Manager"
      >
        <Package size={13} />
      </button>

      {/* MCP Connections */}
      <button
        onClick={onOpenMCPConnections}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
        title="MCP Connections"
      >
        <Server size={13} />
      </button>

      {/* Separator */}
      <div className="w-px h-5 bg-neutral-800" />

      {/* Domain Tools: GIS/IFC/Fusion */}
      <button
        onClick={onOpenMcpPlugins}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-emerald-400 transition-colors"
        title="MCP Plugin Manager - GitHub에서 도구 설치"
      >
        <Package size={13} className="text-emerald-500" />
      </button>

      <button
        onClick={onOpenGisViewer}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-green-400 transition-colors"
        title="GIS Map Viewer - 지도 시각화"
      >
        <Map size={13} className="text-green-500" />
      </button>

      <button
        onClick={onOpenIfcViewer}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-violet-400 transition-colors"
        title="IFC Model Viewer - 3D 건물 모델"
      >
        <Box size={13} className="text-violet-500" />
      </button>

      <button
        onClick={onOpenFusionViewer}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-orange-400 transition-colors"
        title="GIS + IFC Fusion Viewer - 통합 뷰어"
      >
        <Layers size={13} className="text-orange-500" />
      </button>

      {/* Separator */}
      <div className="w-px h-5 bg-neutral-800" />

      {/* Debug / Agent / Collaboration / Marketplace */}
      <button
        onClick={onOpenDebugPanel}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-red-400 transition-colors"
        title="Debug Panel - 디버깅 도구"
      >
        <Bug size={13} className="text-red-500" />
      </button>

      <button
        onClick={onOpenAgentPanel}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-blue-400 transition-colors"
        title="Agent Panel - AI 에이전트"
      >
        <Bot size={13} className="text-blue-500" />
      </button>

      <button
        onClick={onOpenCollaboration}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-yellow-400 transition-colors"
        title="Collaboration - 팀 협업"
      >
        <Users size={13} className="text-yellow-500" />
      </button>

      <button
        onClick={onOpenMarketplace}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400
                   hover:bg-neutral-800 hover:text-pink-400 transition-colors"
        title="Marketplace - 워크플로우 마켓"
      >
        <ShoppingBag size={13} className="text-pink-500" />
      </button>
    </header>
  )
}
