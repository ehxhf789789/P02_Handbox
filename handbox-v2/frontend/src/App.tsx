import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useState, useRef, useCallback, useEffect } from 'react'
import { GraphCanvas } from './components/editor/GraphCanvas'
import { NodePalette } from './components/editor/NodePalette'
import { PropertyPanel } from './components/editor/PropertyPanel'
import { RibbonMenu } from './components/editor/RibbonMenu'
import { ExecutionPanel } from './components/execution/ExecutionPanel'
import { LLMSettings } from './components/settings/LLMSettings'
import { PackManager } from './components/settings/PackManager'
import { MCPConnections } from './components/settings/MCPConnections'
import { TraceViewer } from './components/trace/TraceViewer'
import { ModelComparison } from './components/comparison/ModelComparison'
import { WorkflowLibrary } from './components/library/WorkflowLibrary'
import { isTauri, safeInvoke } from './utils/tauri'
import { setupAgentCanvasListener } from './services/AgentCanvasBridge'
import { FolderOpen, AlertCircle, Loader2 } from 'lucide-react'

// Dynamic import for dialog plugin (only available in Tauri)
const openFileDialog = async (filters: { name: string; extensions: string[] }[]) => {
  if (!isTauri()) {
    console.warn('[openFileDialog] Not in Tauri environment')
    return null
  }
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    return open({ multiple: false, filters })
  } catch {
    return null
  }
}

// GIS/IFC/Fusion components
import { GisMapViewer } from './components/gis/GisMapViewer'
import { IfcViewer3D } from './components/ifc/IfcViewer3D'
import { IfcHierarchyTree } from './components/ifc/IfcHierarchyTree'
import { UnifiedViewer } from './components/fusion/UnifiedViewer'

// Additional panels
import { DebugPanel } from './components/debug/DebugPanel'
import { AgentChatPanel } from './components/agent'
import { CollaborationPanel } from './components/collaboration'
import { WorkflowMarketplace } from './components/marketplace'

// Types for GIS/IFC data
import type { GeoJsonFeatureCollection } from './types/gis'
import type { IfcModel } from './types/ifc'

export function App() {
  const [showExecPanel, setShowExecPanel] = useState(false)
  const [showLLMSettings, setShowLLMSettings] = useState(false)
  const [showPackManager, setShowPackManager] = useState(false)
  const [showMCPConnections, setShowMCPConnections] = useState(false)
  const [showTraceViewer, setShowTraceViewer] = useState(false)
  const [showModelComparison, setShowModelComparison] = useState(false)
  const [workflowLibraryMode, setWorkflowLibraryMode] = useState<'open' | 'save' | null>(null)

  // GIS/IFC/Fusion panel states
  const [showGisViewer, setShowGisViewer] = useState(false)
  const [showIfcViewer, setShowIfcViewer] = useState(false)
  const [showFusionViewer, setShowFusionViewer] = useState(false)

  // Additional panel states
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [showAgentChat, setShowAgentChat] = useState(false)
  const [showCollaboration, setShowCollaboration] = useState(false)
  const [showMarketplace, setShowMarketplace] = useState(false)

  // GIS/IFC data states with loading
  const [gisData, setGisData] = useState<GeoJsonFeatureCollection | null>(null)
  const [gisLoading, setGisLoading] = useState(false)
  const [gisError, setGisError] = useState<string | null>(null)
  const [ifcModel, setIfcModel] = useState<IfcModel | null>(null)
  const [ifcLoading, setIfcLoading] = useState(false)
  const [ifcError, setIfcError] = useState<string | null>(null)
  const [fusionProject, _setFusionProject] = useState<any>(null)
  void _setFusionProject // reserved for future fusion project loading
  const [execPanelHeight, setExecPanelHeight] = useState(256)
  const isDraggingPanel = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Vertical resize handler for execution panel
  const handlePanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingPanel.current = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingPanel.current || !containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const newHeight = containerRect.bottom - e.clientY
      setExecPanelHeight(Math.max(120, Math.min(600, newHeight)))
    }

    const handleMouseUp = () => {
      isDraggingPanel.current = false
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

  // GIS file loading handler
  const handleOpenGisFile = async () => {
    try {
      setGisLoading(true)
      setGisError(null)

      const selected = await openFileDialog([{
        name: 'GeoJSON',
        extensions: ['json', 'geojson'],
      }])

      if (!selected) {
        setGisLoading(false)
        return
      }

      const result = await safeInvoke<{
        features: GeoJsonFeatureCollection
        feature_count: number
        bounds: unknown
        crs: string | null
      }>('gis_read_geojson', { filePath: selected })

      if (result) {
        setGisData(result.features)
      } else {
        setGisError('Tauri 환경이 아닙니다')
      }
      setGisLoading(false)
    } catch (error) {
      console.error('Failed to load GIS file:', error)
      setGisError(error instanceof Error ? error.message : String(error))
      setGisLoading(false)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+A → Agent Chat
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault()
        setShowAgentChat(v => !v)
      }
      // Ctrl+Shift+E → Execution Panel
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        setShowExecPanel(v => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Agent → Canvas bridge: listen for workflow-update events from agent
  useEffect(() => {
    let unlisten: (() => void) | null = null
    let cancelled = false
    setupAgentCanvasListener().then(fn => {
      if (cancelled) { fn(); return }
      unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  // IFC file loading handler
  const handleOpenIfcFile = async () => {
    try {
      setIfcLoading(true)
      setIfcError(null)

      const selected = await openFileDialog([{
        name: 'IFC Files',
        extensions: ['ifc'],
      }])

      if (!selected) {
        setIfcLoading(false)
        return
      }

      const result = await safeInvoke<{
        model: IfcModel
        statistics: unknown
      }>('ifc_read_file', { filePath: selected })

      if (result) {
        setIfcModel(result.model)
      } else {
        setIfcError('Tauri 환경이 아닙니다')
      }
      setIfcLoading(false)
    } catch (error) {
      console.error('Failed to load IFC file:', error)
      setIfcError(error instanceof Error ? error.message : String(error))
      setIfcLoading(false)
    }
  }

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen w-screen bg-neutral-950 text-neutral-100 overflow-hidden">
        {/* Ribbon Menu */}
        <RibbonMenu
          onToggleExecPanel={() => setShowExecPanel((v) => !v)}
          onOpenLLMSettings={() => setShowLLMSettings(true)}
          onOpenPackManager={() => setShowPackManager(true)}
          onOpenMCPConnections={() => setShowMCPConnections(true)}
          onToggleTraceViewer={() => setShowTraceViewer((v) => !v)}
          onOpenModelComparison={() => setShowModelComparison(true)}
          onOpenWorkflowLibrary={() => setWorkflowLibraryMode('open')}
          onSaveWorkflow={() => setWorkflowLibraryMode('save')}
          onOpenGisViewer={() => setShowGisViewer(true)}
          onOpenIfcViewer={() => setShowIfcViewer(true)}
          onOpenFusionViewer={() => setShowFusionViewer(true)}
          onOpenDebugPanel={() => setShowDebugPanel(true)}
          onOpenAgentChat={() => setShowAgentChat(true)}
          onOpenCollaboration={() => setShowCollaboration(true)}
          onOpenMarketplace={() => setShowMarketplace(true)}
        />

        {/* Main content area */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Node Palette */}
          <NodePalette />

          {/* Center: Graph Canvas + optional Execution Panel */}
          <div ref={containerRef} className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 min-h-0">
              <GraphCanvas />
            </div>

            {/* Bottom: Execution Panel (resizable) */}
            {showExecPanel && (
              <div
                style={{ height: execPanelHeight }}
                className="flex flex-col border-t border-neutral-800 shrink-0"
              >
                {/* Resize handle */}
                <div
                  onMouseDown={handlePanelResizeStart}
                  className="h-1.5 bg-neutral-800 hover:bg-blue-500 cursor-row-resize transition-colors flex items-center justify-center"
                  title="드래그하여 높이 조절"
                >
                  <div className="w-12 h-0.5 bg-neutral-600 rounded-full" />
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ExecutionPanel />
                </div>
              </div>
            )}
          </div>

          {/* Right: Property Panel */}
          <PropertyPanel />

          {/* Right: Trace Viewer (toggleable side panel) */}
          {showTraceViewer && (
            <div className="w-80 border-l border-neutral-800 shrink-0">
              <TraceViewer className="h-full" />
            </div>
          )}
        </div>

        {/* LLM Settings Modal */}
        <LLMSettings
          isOpen={showLLMSettings}
          onClose={() => setShowLLMSettings(false)}
        />

        {/* Pack Manager Modal */}
        <PackManager
          isOpen={showPackManager}
          onClose={() => setShowPackManager(false)}
        />

        {/* MCP Connections Modal */}
        <MCPConnections
          isOpen={showMCPConnections}
          onClose={() => setShowMCPConnections(false)}
        />

        {/* Model Comparison Modal */}
        {showModelComparison && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[800px] h-[600px] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                <h2 className="text-sm font-semibold text-neutral-200">Model Comparison</h2>
                <button
                  onClick={() => setShowModelComparison(false)}
                  className="text-neutral-400 hover:text-neutral-200 text-lg"
                >
                  ×
                </button>
              </div>
              <ModelComparison className="flex-1 min-h-0" />
            </div>
          </div>
        )}

        {/* Workflow Library Modal */}
        <WorkflowLibrary
          isOpen={workflowLibraryMode !== null}
          onClose={() => setWorkflowLibraryMode(null)}
          mode={workflowLibraryMode || 'open'}
        />

        {/* GIS Viewer Panel */}
        {showGisViewer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[1000px] h-[700px] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-neutral-200">GIS Map Viewer</h2>
                  <button
                    onClick={handleOpenGisFile}
                    disabled={gisLoading}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-green-600 hover:bg-green-500 text-white disabled:opacity-50"
                  >
                    {gisLoading ? <Loader2 size={12} className="animate-spin" /> : <FolderOpen size={12} />}
                    파일 열기
                  </button>
                </div>
                <button
                  onClick={() => setShowGisViewer(false)}
                  className="text-neutral-400 hover:text-neutral-200 text-lg"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {gisError ? (
                  <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2">
                    <AlertCircle size={24} />
                    <span className="text-sm">{gisError}</span>
                    <button onClick={handleOpenGisFile} className="mt-2 px-3 py-1 bg-neutral-700 rounded text-xs hover:bg-neutral-600">
                      다시 시도
                    </button>
                  </div>
                ) : gisData ? (
                  <GisMapViewer data={gisData} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-4">
                    <span>GeoJSON 파일을 열어 지도를 확인하세요</span>
                    <button
                      onClick={handleOpenGisFile}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm"
                    >
                      <FolderOpen size={16} />
                      GeoJSON 파일 열기
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* IFC Viewer Panel */}
        {showIfcViewer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[1200px] h-[800px] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-neutral-200">IFC Model Viewer</h2>
                  <button
                    onClick={handleOpenIfcFile}
                    disabled={ifcLoading}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
                  >
                    {ifcLoading ? <Loader2 size={12} className="animate-spin" /> : <FolderOpen size={12} />}
                    파일 열기
                  </button>
                </div>
                <button
                  onClick={() => setShowIfcViewer(false)}
                  className="text-neutral-400 hover:text-neutral-200 text-lg"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden flex">
                {ifcError ? (
                  <div className="flex flex-col items-center justify-center w-full h-full text-red-400 gap-2">
                    <AlertCircle size={24} />
                    <span className="text-sm">{ifcError}</span>
                    <button onClick={handleOpenIfcFile} className="mt-2 px-3 py-1 bg-neutral-700 rounded text-xs hover:bg-neutral-600">
                      다시 시도
                    </button>
                  </div>
                ) : ifcModel ? (
                  <>
                    <div className="w-64 border-r border-neutral-700 overflow-auto">
                      <IfcHierarchyTree model={ifcModel} />
                    </div>
                    <div className="flex-1">
                      <IfcViewer3D model={ifcModel} />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-full text-neutral-500 gap-4">
                    <span>IFC 파일을 열어 3D 모델을 확인하세요</span>
                    <button
                      onClick={handleOpenIfcFile}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm"
                    >
                      <FolderOpen size={16} />
                      IFC 파일 열기
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Fusion Viewer Panel */}
        {showFusionViewer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[1400px] h-[900px] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                <h2 className="text-sm font-semibold text-neutral-200">GIS + IFC Fusion Viewer</h2>
                <button
                  onClick={() => setShowFusionViewer(false)}
                  className="text-neutral-400 hover:text-neutral-200 text-lg"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {fusionProject ? (
                  <UnifiedViewer project={fusionProject} />
                ) : (
                  <div className="flex items-center justify-center h-full text-neutral-500">
                    Fusion 프로젝트를 생성하려면 워크플로우에서 Fusion 노드를 실행하세요
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Debug Panel */}
        {showDebugPanel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[1000px] h-[700px] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                <h2 className="text-sm font-semibold text-neutral-200">Debug Panel</h2>
                <button
                  onClick={() => setShowDebugPanel(false)}
                  className="text-neutral-400 hover:text-neutral-200 text-lg"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <DebugPanel />
              </div>
            </div>
          </div>
        )}

        {/* Agent Chat Panel (Claude Code level) */}
        {showAgentChat && (
          <AgentChatPanel onClose={() => setShowAgentChat(false)} />
        )}

        {/* Collaboration Panel */}
        {showCollaboration && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[800px] h-[600px] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                <h2 className="text-sm font-semibold text-neutral-200">Team Collaboration</h2>
                <button
                  onClick={() => setShowCollaboration(false)}
                  className="text-neutral-400 hover:text-neutral-200 text-lg"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <CollaborationPanel
                  workflowId="current-workflow"
                  workflowName="Current Workflow"
                  userId="local-user"
                  userName="You"
                />
              </div>
            </div>
          </div>
        )}

        {/* Workflow Marketplace */}
        {showMarketplace && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[1100px] h-[750px] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                <h2 className="text-sm font-semibold text-neutral-200">Workflow Marketplace</h2>
                <button
                  onClick={() => setShowMarketplace(false)}
                  className="text-neutral-400 hover:text-neutral-200 text-lg"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <WorkflowMarketplace />
              </div>
            </div>
          </div>
        )}
      </div>
    </ReactFlowProvider>
  )
}
