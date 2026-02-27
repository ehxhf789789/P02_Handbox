/**
 * NodePalette — draggable list of available tools organized by category.
 * Supports both drag-and-drop and double-click to add nodes.
 */

import { useState } from 'react'
import { toolCategories, type ToolDef } from '@/data/toolCatalog'
import { useWorkflowStore, type NodeData } from '@/stores/workflowStore'
import type { Node } from '@xyflow/react'
import {
  FileText, Save, MessageSquare, Monitor,
  Bot, AlignLeft, Waypoints,
  Scissors, Merge, FileCode, Regex,
  Braces, GitBranch, Table, Filter,
  GitFork, Repeat, GitMerge, Timer,
  HardDrive, SearchCode, ArrowUpDown,
  FileDown, Sheet, CircleDot,
  Brain, Search, Type, Database, Download, FileInput,
  ChevronDown, ChevronRight, GripVertical, Plus,
} from 'lucide-react'

let nodeIdCounter = 1

const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  FileText, Save, MessageSquare, Monitor,
  Bot, AlignLeft, Waypoints,
  Scissors, Merge, FileCode, Regex,
  Braces, GitBranch, Table, Filter,
  GitFork, Repeat, GitMerge, Timer,
  HardDrive, SearchCode, ArrowUpDown,
  FileDown, Sheet, CircleDot,
  Brain, Search, Type, Database, Download, FileInput,
}

function ToolItem({ tool, color }: { tool: ToolDef; color: string }) {
  const Icon = iconMap[tool.icon] ?? CircleDot
  const { setDraggingTool, addNode, nodes } = useWorkflowStore()

  const onDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    console.log('[NodePalette] onDragStart - toolId:', tool.id)

    // Set drag data via dataTransfer API
    e.dataTransfer.setData('application/handbox-tool', tool.id)
    e.dataTransfer.setData('text/plain', tool.id) // Fallback for compatibility
    e.dataTransfer.effectAllowed = 'move'

    // ALSO set via store for Tauri/WebKit compatibility
    setDraggingTool(tool.id)

    // Create custom drag image for better visual feedback
    const dragImage = e.currentTarget.cloneNode(true) as HTMLElement
    dragImage.style.position = 'absolute'
    dragImage.style.top = '-1000px'
    dragImage.style.opacity = '0.8'
    dragImage.style.background = '#1a1a1a'
    dragImage.style.borderRadius = '6px'
    dragImage.style.padding = '8px'
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, 0, 0)

    // Cleanup drag image after drag ends
    setTimeout(() => {
      document.body.removeChild(dragImage)
    }, 0)
  }

  const onDragEnd = () => {
    // Clear dragging state
    setDraggingTool(null)
  }

  // Double-click to add node at center of canvas (fallback for drag issues)
  const onDoubleClick = () => {
    console.log('[NodePalette] onDoubleClick - adding node:', tool.id)

    // Calculate position based on existing nodes (stagger new nodes)
    const baseX = 300 + (nodes.length % 5) * 50
    const baseY = 150 + Math.floor(nodes.length / 5) * 150 + (nodes.length % 5) * 30

    const newNode: Node<NodeData> = {
      id: `node_${nodeIdCounter++}`,
      type: 'primitive',
      position: { x: baseX, y: baseY },
      data: {
        label: tool.label,
        toolRef: tool.id,
        category: tool.category,
        config: Object.fromEntries(
          tool.configFields.map((f) => [f.name, f.default ?? ''])
        ),
        inputs: tool.inputs,
        outputs: tool.outputs,
      },
    }

    addNode(newNode)
  }

  // Single click with + button to add
  const onClickAdd = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDoubleClick()
  }

  return (
    <div
      draggable="true"
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDoubleClick={onDoubleClick}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer
                 hover:bg-neutral-800/80 active:bg-neutral-700/80 transition-colors group select-none"
      title={`${tool.description} (더블클릭 또는 + 버튼으로 추가)`}
    >
      <GripVertical size={12} className="text-neutral-700 group-hover:text-neutral-500 shrink-0" />
      <div
        className="w-5 h-5 rounded flex items-center justify-center shrink-0"
        style={{ background: `${color}20` }}
      >
        <Icon size={12} style={{ color }} />
      </div>
      <span className="text-xs text-neutral-300 truncate flex-1">{tool.label}</span>
      {/* Quick add button */}
      <button
        onClick={onClickAdd}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-neutral-700 transition-opacity"
        title="캔버스에 추가"
      >
        <Plus size={12} className="text-neutral-400" />
      </button>
    </div>
  )
}

export function NodePalette() {
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    new Set(toolCategories.map((c) => c.id))
  )
  const [searchQuery, setSearchQuery] = useState('')

  const toggleCategory = (catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) {
        next.delete(catId)
      } else {
        next.add(catId)
      }
      return next
    })
  }

  const filteredCategories = toolCategories
    .map((cat) => ({
      ...cat,
      tools: searchQuery
        ? cat.tools.filter(
            (t) =>
              t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
              t.description.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : cat.tools,
    }))
    .filter((cat) => cat.tools.length > 0)

  return (
    <aside className="w-56 border-r border-neutral-800 bg-neutral-950 flex flex-col shrink-0">
      {/* Header */}
      <div className="px-3 py-3 border-b border-neutral-800">
        <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
          Nodes
        </h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search nodes..."
          className="w-full px-2.5 py-1.5 text-xs rounded-md bg-neutral-900 border border-neutral-800
                     text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
        />
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {filteredCategories.map((cat) => {
          const CatIcon = iconMap[cat.icon] ?? CircleDot
          const isExpanded = expandedCats.has(cat.id)

          return (
            <div key={cat.id} className="mb-1">
              <button
                onClick={() => toggleCategory(cat.id)}
                className="flex items-center gap-2 w-full px-1 py-1.5 rounded hover:bg-neutral-800/50 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown size={12} className="text-neutral-500" />
                ) : (
                  <ChevronRight size={12} className="text-neutral-500" />
                )}
                <CatIcon size={13} style={{ color: cat.color }} />
                <span className="text-xs font-medium text-neutral-400">
                  {cat.label}
                </span>
                <span className="text-[10px] text-neutral-600 ml-auto">
                  {cat.tools.length}
                </span>
              </button>

              {isExpanded && (
                <div className="ml-2 mb-1">
                  {cat.tools.map((tool) => (
                    <ToolItem key={tool.id} tool={tool} color={cat.color} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-neutral-800">
        <p className="text-[10px] text-neutral-600 text-center">
          {toolCategories.reduce((a, c) => a + c.tools.length, 0)} tools available
        </p>
        <p className="text-[9px] text-neutral-700 text-center mt-1">
          더블클릭 또는 + 버튼으로 추가
        </p>
      </div>
    </aside>
  )
}
