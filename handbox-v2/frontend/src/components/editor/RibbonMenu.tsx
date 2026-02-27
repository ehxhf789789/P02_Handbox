/**
 * RibbonMenu - Microsoft Office-style ribbon menu with tabs and grouped commands.
 */

import { useState } from 'react'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { useExecution } from '@/hooks/useExecution'
import { invoke } from '@tauri-apps/api/core'
import {
  // Home tab icons
  Play, Square, Plus, FolderOpen, Save, Download, Upload, Copy, Clipboard, Scissors,
  // AI tab icons
  Sparkles, Settings, Brain, GitCompare, Wand2, Bot,
  // Tools tab icons
  Map, Box, Layers, Package, Server, Wrench, Puzzle,
  // View tab icons
  Terminal, Activity, Bug, Eye, Grid3x3, Maximize2, LayoutPanelLeft,
  // Data tab icons
  Database, FileJson, FileSpreadsheet, Table, Filter,
  // Collaboration tab icons
  Users, Share2, MessageSquare, History, Cloud, ShoppingBag,
  // Common
  Zap, Undo2, Redo2,
} from 'lucide-react'

// Ribbon Tab types
type RibbonTab = 'home' | 'ai' | 'tools' | 'view' | 'data' | 'collaboration'

interface RibbonMenuProps {
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
            {/* Execution group */}
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

            {/* File group */}
            <RibbonGroup label="파일">
              <RibbonButton icon={Plus} label="새로 만들기" onClick={clearAll} />
              <RibbonButton icon={FolderOpen} label="열기" onClick={onOpenWorkflowLibrary} />
              <RibbonButton icon={Save} label="저장" onClick={onSaveWorkflow} disabled={nodes.length === 0} />
              <RibbonButton icon={Download} label="내보내기" onClick={handleExport} />
            </RibbonGroup>

            <RibbonSeparator />

            {/* Edit group */}
            <RibbonGroup label="편집">
              <RibbonButton icon={Undo2} label="실행취소" disabled />
              <RibbonButton icon={Redo2} label="다시실행" disabled />
              <RibbonButton icon={Copy} label="복사" disabled />
              <RibbonButton icon={Clipboard} label="붙여넣기" disabled />
              <RibbonButton icon={Scissors} label="잘라내기" disabled />
            </RibbonGroup>
          </>
        )}

        {/* AI TAB */}
        {activeTab === 'ai' && (
          <>
            {/* AI Compiler group */}
            <RibbonGroup label="AI 컴파일러">
              <RibbonButton
                icon={Sparkles}
                label="AI 컴파일"
                onClick={onOpenCompiler}
                size="large"
                color="text-violet-400 hover:bg-violet-900/30"
              />
              <RibbonButton icon={Wand2} label="자동 최적화" disabled />
            </RibbonGroup>

            <RibbonSeparator />

            {/* LLM Settings group */}
            <RibbonGroup label="LLM 설정">
              <RibbonButton icon={Settings} label="공급자 설정" onClick={onOpenLLMSettings} />
              <RibbonButton icon={Brain} label="모델 선택" disabled />
              <RibbonButton icon={GitCompare} label="모델 비교" onClick={onOpenModelComparison} />
            </RibbonGroup>

            <RibbonSeparator />

            {/* Agent group */}
            <RibbonGroup label="에이전트">
              <RibbonButton
                icon={Bot}
                label="AI 에이전트"
                onClick={onOpenAgentPanel}
                size="large"
                color="text-blue-400 hover:bg-blue-900/30"
              />
            </RibbonGroup>
          </>
        )}

        {/* TOOLS TAB */}
        {activeTab === 'tools' && (
          <>
            {/* Domain viewers group */}
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

            {/* Extensions group */}
            <RibbonGroup label="확장">
              <RibbonButton
                icon={Package}
                label="MCP 플러그인"
                onClick={onOpenMcpPlugins}
                color="text-emerald-400 hover:bg-emerald-900/30"
              />
              <RibbonButton icon={Server} label="MCP 연결" onClick={onOpenMCPConnections} />
              <RibbonButton icon={Puzzle} label="팩 관리" onClick={onOpenPackManager} />
            </RibbonGroup>

            <RibbonSeparator />

            {/* Debug group */}
            <RibbonGroup label="디버그">
              <RibbonButton
                icon={Bug}
                label="디버그 패널"
                onClick={onOpenDebugPanel}
                color="text-red-400 hover:bg-red-900/30"
              />
              <RibbonButton icon={Wrench} label="도구 테스트" disabled />
            </RibbonGroup>
          </>
        )}

        {/* VIEW TAB */}
        {activeTab === 'view' && (
          <>
            {/* Panels group */}
            <RibbonGroup label="패널">
              <RibbonButton icon={Terminal} label="실행 패널" onClick={onToggleExecPanel} />
              <RibbonButton icon={Activity} label="트레이스" onClick={onToggleTraceViewer} />
              <RibbonButton icon={LayoutPanelLeft} label="속성 패널" disabled />
            </RibbonGroup>

            <RibbonSeparator />

            {/* Canvas group */}
            <RibbonGroup label="캔버스">
              <RibbonButton icon={Grid3x3} label="그리드 토글" disabled />
              <RibbonButton icon={Maximize2} label="전체화면" disabled />
              <RibbonButton icon={Eye} label="미니맵" disabled />
            </RibbonGroup>
          </>
        )}

        {/* DATA TAB */}
        {activeTab === 'data' && (
          <>
            {/* Import group */}
            <RibbonGroup label="가져오기">
              <RibbonButton icon={Upload} label="워크플로우" onClick={onOpenWorkflowLibrary} />
              <RibbonButton icon={FileJson} label="JSON" disabled />
              <RibbonButton icon={FileSpreadsheet} label="CSV/Excel" disabled />
            </RibbonGroup>

            <RibbonSeparator />

            {/* Export group */}
            <RibbonGroup label="내보내기">
              <RibbonButton icon={Download} label="JSON" onClick={handleExport} />
              <RibbonButton icon={Table} label="결과 테이블" disabled />
            </RibbonGroup>

            <RibbonSeparator />

            {/* Database group */}
            <RibbonGroup label="데이터베이스">
              <RibbonButton icon={Database} label="연결 관리" disabled />
              <RibbonButton icon={Filter} label="쿼리 빌더" disabled />
            </RibbonGroup>
          </>
        )}

        {/* COLLABORATION TAB */}
        {activeTab === 'collaboration' && (
          <>
            {/* Team group */}
            <RibbonGroup label="팀">
              <RibbonButton
                icon={Users}
                label="협업"
                onClick={onOpenCollaboration}
                size="large"
                color="text-yellow-400 hover:bg-yellow-900/30"
              />
              <RibbonButton icon={Share2} label="공유" disabled />
            </RibbonGroup>

            <RibbonSeparator />

            {/* Communication group */}
            <RibbonGroup label="커뮤니케이션">
              <RibbonButton icon={MessageSquare} label="댓글" disabled />
              <RibbonButton icon={History} label="변경 내역" disabled />
            </RibbonGroup>

            <RibbonSeparator />

            {/* Marketplace group */}
            <RibbonGroup label="마켓플레이스">
              <RibbonButton
                icon={ShoppingBag}
                label="마켓"
                onClick={onOpenMarketplace}
                size="large"
                color="text-pink-400 hover:bg-pink-900/30"
              />
              <RibbonButton icon={Cloud} label="템플릿" disabled />
            </RibbonGroup>
          </>
        )}
      </div>
    </div>
  )
}
