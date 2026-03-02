/**
 * RibbonMenu - Microsoft Office-style ribbon menu with tabs and grouped commands.
 * Cleaned up: removed 21 disabled dummy buttons, merged duplicate AI interfaces.
 */

import { useState } from 'react'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { useExecution } from '@/hooks/useExecution'
import { invoke } from '@tauri-apps/api/core'
import {
  // Home tab icons
  Play, Square, Plus, FolderOpen, Save, Download,
  // AI tab icons
  Sparkles, Settings, GitCompare,
  // Tools tab icons
  Map, Box, Layers, Package, Server, Bug,
  // View tab icons
  Terminal, Activity,
  // Data tab icons
  Upload,
  // Collaboration tab icons
  Users, ShoppingBag,
  // Common
  Zap,
} from 'lucide-react'

// Ribbon Tab types
type RibbonTab = 'home' | 'ai' | 'tools' | 'view' | 'data' | 'collaboration'

interface RibbonMenuProps {
  onToggleExecPanel: () => void
  onOpenLLMSettings?: () => void
  onOpenPackManager?: () => void
  onOpenMCPConnections?: () => void
  onToggleTraceViewer?: () => void
  onOpenModelComparison?: () => void
  onOpenWorkflowLibrary?: () => void
  onSaveWorkflow?: () => void
  // GIS/IFC/Fusion
  onOpenGisViewer?: () => void
  onOpenIfcViewer?: () => void
  onOpenFusionViewer?: () => void
  // Additional panels
  onOpenDebugPanel?: () => void
  onOpenAgentChat?: () => void
  onOpenCollaboration?: () => void
  onOpenMarketplace?: () => void
}

// Ribbon button component
function RibbonButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  size = 'normal',
  color,
}: {
  icon: React.ComponentType<{ size: number; className?: string }>
  label: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  size?: 'normal' | 'large'
  color?: string
}) {
  const baseClass = size === 'large'
    ? 'flex flex-col items-center gap-1 px-3 py-2 rounded-md text-xs min-w-[60px]'
    : 'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded text-[10px] min-w-[48px]'

  const colorClass = color || 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${baseClass}
        ${disabled ? 'opacity-40 cursor-not-allowed' : colorClass}
        ${active ? 'bg-neutral-800 text-neutral-200' : ''}
        transition-colors
      `}
      title={label}
    >
      <Icon size={size === 'large' ? 20 : 14} className={color ? color.split(' ')[0] : ''} />
      <span className="truncate max-w-[56px]">{label}</span>
    </button>
  )
}

// Ribbon separator
function RibbonSeparator() {
  return <div className="w-px h-12 bg-neutral-700 mx-1" />
}

// Ribbon group with label
function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-end gap-0.5 flex-1 px-1">
        {children}
      </div>
      <div className="text-[9px] text-neutral-500 text-center mt-0.5 border-t border-neutral-800 pt-0.5">
        {label}
      </div>
    </div>
  )
}

export function RibbonMenu({
  onToggleExecPanel,
  onOpenLLMSettings,
  onOpenPackManager,
  onOpenMCPConnections,
  onToggleTraceViewer,
  onOpenModelComparison,
  onOpenWorkflowLibrary,
  onSaveWorkflow,
  onOpenGisViewer,
  onOpenIfcViewer,
  onOpenFusionViewer,
  onOpenDebugPanel,
  onOpenAgentChat,
  onOpenCollaboration,
  onOpenMarketplace,
}: RibbonMenuProps) {
  const [activeTab, setActiveTab] = useState<RibbonTab>('home')
  const [workflowName, setWorkflowName] = useState('Untitled Workflow')
  const { nodes, edges, clearAll, getWorkflowJson } = useWorkflowStore()
  const { isRunning, currentExecution } = useExecutionStore()
  const { execute, cancel } = useExecution()

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
      const result = await invoke<{ path: string }>('export_workflow_file', {
        content: json,
        filename,
      })
      console.log('[RibbonMenu] Workflow exported to:', result.path)
      alert(`워크플로우가 저장되었습니다: ${result.path}`)
    } catch (error) {
      console.warn('[RibbonMenu] Tauri export failed, using browser fallback:', error)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 100)
    }
  }

  // Tab definitions
  const tabs: { id: RibbonTab; label: string }[] = [
    { id: 'home', label: '홈' },
    { id: 'ai', label: 'AI' },
    { id: 'tools', label: '도구' },
    { id: 'view', label: '보기' },
    { id: 'data', label: '데이터' },
    { id: 'collaboration', label: '협업' },
  ]

  return (
    <div className="flex flex-col bg-neutral-950 border-b border-neutral-800">
      {/* Title bar with app branding and workflow name */}
      <div className="h-8 flex items-center px-3 gap-2 bg-neutral-900 border-b border-neutral-800">
        <Zap size={14} className="text-violet-500" />
        <span className="text-xs font-bold text-neutral-200 tracking-wide">HANDBOX</span>
        <span className="text-[10px] text-neutral-600 font-mono">v2</span>
        <div className="w-px h-4 bg-neutral-700 mx-2" />
        <input
          type="text"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          className="px-2 py-0.5 text-xs bg-transparent border-none text-neutral-300
                     hover:bg-neutral-800 focus:bg-neutral-800 rounded focus:outline-none
                     focus:ring-1 focus:ring-neutral-700 w-48"
        />
        <div className="flex items-center gap-2 text-[10px] text-neutral-600 ml-auto">
          <span>{nodes.length} nodes</span>
          <span>{edges.length} edges</span>
        </div>
      </div>

      {/* Tab strip */}
      <div className="h-7 flex items-end px-2 gap-0.5 bg-neutral-900">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-4 py-1.5 text-xs rounded-t-md transition-colors
              ${activeTab === tab.id
                ? 'bg-neutral-950 text-neutral-200 border-t border-l border-r border-neutral-700'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Ribbon content area */}
      <div className="h-20 flex items-stretch px-2 py-1 gap-2 overflow-x-auto">
        {/* HOME TAB */}
        {activeTab === 'home' && (
          <>
            <RibbonGroup label="실행">
              {!isRunning ? (
                <RibbonButton
                  icon={Play}
                  label="실행"
                  onClick={handleRun}
                  disabled={nodes.length === 0}
                  size="large"
                  color="text-emerald-400 hover:bg-emerald-900/30"
                />
              ) : (
                <RibbonButton
                  icon={Square}
                  label="중지"
                  onClick={handleStop}
                  size="large"
                  color="text-red-400 hover:bg-red-900/30"
                />
              )}
            </RibbonGroup>

            <RibbonSeparator />

            <RibbonGroup label="파일">
              <RibbonButton icon={Plus} label="새로 만들기" onClick={clearAll} />
              <RibbonButton icon={FolderOpen} label="열기" onClick={onOpenWorkflowLibrary} />
              <RibbonButton icon={Save} label="저장" onClick={onSaveWorkflow} disabled={nodes.length === 0} />
              <RibbonButton icon={Download} label="내보내기" onClick={handleExport} />
            </RibbonGroup>
          </>
        )}

        {/* AI TAB */}
        {activeTab === 'ai' && (
          <>
            <RibbonGroup label="AI Agent">
              <RibbonButton
                icon={Sparkles}
                label="AI Agent"
                onClick={onOpenAgentChat}
                size="large"
                color="text-violet-400 hover:bg-violet-900/30"
              />
            </RibbonGroup>

            <RibbonSeparator />

            <RibbonGroup label="LLM 설정">
              <RibbonButton icon={Settings} label="공급자 설정" onClick={onOpenLLMSettings} />
              <RibbonButton icon={GitCompare} label="모델 비교" onClick={onOpenModelComparison} />
            </RibbonGroup>
          </>
        )}

        {/* TOOLS TAB */}
        {activeTab === 'tools' && (
          <>
            <RibbonGroup label="도메인 뷰어">
              <RibbonButton
                icon={Map}
                label="GIS 뷰어"
                onClick={onOpenGisViewer}
                color="text-green-400 hover:bg-green-900/30"
              />
              <RibbonButton
                icon={Box}
                label="IFC 뷰어"
                onClick={onOpenIfcViewer}
                color="text-violet-400 hover:bg-violet-900/30"
              />
              <RibbonButton
                icon={Layers}
                label="통합 뷰어"
                onClick={onOpenFusionViewer}
                color="text-orange-400 hover:bg-orange-900/30"
              />
            </RibbonGroup>

            <RibbonSeparator />

            <RibbonGroup label="확장">
              <RibbonButton icon={Server} label="MCP 연결" onClick={onOpenMCPConnections} />
              <RibbonButton icon={Package} label="팩 관리" onClick={onOpenPackManager} />
            </RibbonGroup>

            <RibbonSeparator />

            <RibbonGroup label="디버그">
              <RibbonButton
                icon={Bug}
                label="디버그 패널"
                onClick={onOpenDebugPanel}
                color="text-red-400 hover:bg-red-900/30"
              />
            </RibbonGroup>
          </>
        )}

        {/* VIEW TAB */}
        {activeTab === 'view' && (
          <>
            <RibbonGroup label="패널">
              <RibbonButton icon={Terminal} label="실행 패널" onClick={onToggleExecPanel} />
              <RibbonButton icon={Activity} label="트레이스" onClick={onToggleTraceViewer} />
            </RibbonGroup>
          </>
        )}

        {/* DATA TAB */}
        {activeTab === 'data' && (
          <>
            <RibbonGroup label="가져오기">
              <RibbonButton icon={Upload} label="워크플로우" onClick={onOpenWorkflowLibrary} />
            </RibbonGroup>

            <RibbonSeparator />

            <RibbonGroup label="내보내기">
              <RibbonButton icon={Download} label="JSON" onClick={handleExport} />
            </RibbonGroup>
          </>
        )}

        {/* COLLABORATION TAB */}
        {activeTab === 'collaboration' && (
          <>
            <RibbonGroup label="팀">
              <RibbonButton
                icon={Users}
                label="협업"
                onClick={onOpenCollaboration}
                size="large"
                color="text-yellow-400 hover:bg-yellow-900/30"
              />
            </RibbonGroup>

            <RibbonSeparator />

            <RibbonGroup label="마켓플레이스">
              <RibbonButton
                icon={ShoppingBag}
                label="마켓"
                onClick={onOpenMarketplace}
                size="large"
                color="text-pink-400 hover:bg-pink-900/30"
              />
            </RibbonGroup>
          </>
        )}
      </div>
    </div>
  )
}
