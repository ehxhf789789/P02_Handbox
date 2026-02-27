/**
 * IfcHierarchyTree — Spatial hierarchy tree viewer for IFC models.
 *
 * Features:
 * - Display spatial structure (Project > Site > Building > Storey > Space)
 * - Expandable/collapsible nodes
 * - Element count badges
 * - Search and filter
 * - Click to select
 */

import { useState, useMemo } from 'react'
import type { SpatialHierarchyNode, IfcModel, IfcEntity } from '@/types/ifc'
import { ifcService } from '@/services/IfcService'
import {
  ChevronRight,
  ChevronDown,
  Building,
  Building2,
  Layers,
  Box,
  Square,
  MapPin,
  FolderOpen,
  Search,
  X,
} from 'lucide-react'

interface IfcHierarchyTreeProps {
  model: IfcModel
  onSelect?: (entity: IfcEntity) => void
  selectedId?: number
  className?: string
}

interface TreeNodeProps {
  node: SpatialHierarchyNode
  depth: number
  onSelect?: (entity: IfcEntity) => void
  selectedId?: number
  searchQuery: string
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  IfcProject: <FolderOpen size={14} className="text-violet-400" />,
  IfcSite: <MapPin size={14} className="text-emerald-400" />,
  IfcBuilding: <Building size={14} className="text-blue-400" />,
  IfcBuildingStorey: <Layers size={14} className="text-amber-400" />,
  IfcSpace: <Square size={14} className="text-cyan-400" />,
  IfcFacility: <Building2 size={14} className="text-orange-400" />,
  IfcBridge: <Box size={14} className="text-red-400" />,
}

export function IfcHierarchyTree({
  model,
  onSelect,
  selectedId,
  className = '',
}: IfcHierarchyTreeProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set())

  // Build hierarchy
  const hierarchy = useMemo(() => {
    return ifcService.buildSpatialHierarchy(model)
  }, [model])

  // Expand all by default for first few levels
  useState(() => {
    if (hierarchy) {
      const expanded = new Set<number>()
      const expandToDepth = (node: SpatialHierarchyNode, depth: number) => {
        if (depth < 3) {
          expanded.add(node.entity.id)
          node.children.forEach(child => expandToDepth(child, depth + 1))
        }
      }
      expandToDepth(hierarchy, 0)
      setExpandedNodes(expanded)
    }
  })

  const toggleExpand = (nodeId: number) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  if (!hierarchy) {
    return (
      <div className={`flex items-center justify-center h-full text-neutral-500 ${className}`}>
        <p className="text-sm">No spatial hierarchy found</p>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full bg-neutral-900 ${className}`}>
      {/* Search */}
      <div className="p-2 border-b border-neutral-800">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full pl-7 pr-7 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-xs
                     focus:outline-none focus:border-violet-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto p-2">
        <TreeNode
          node={hierarchy}
          depth={0}
          onSelect={onSelect}
          selectedId={selectedId}
          searchQuery={searchQuery}
          expandedNodes={expandedNodes}
          onToggleExpand={toggleExpand}
        />
      </div>

      {/* Stats */}
      <div className="px-3 py-2 border-t border-neutral-800 text-[10px] text-neutral-500">
        {model.sites.length} sites · {model.buildings.length} buildings ·{' '}
        {model.storeys.length} storeys · {model.elements.length} elements
      </div>
    </div>
  )
}

function TreeNode({
  node,
  depth,
  onSelect,
  selectedId,
  searchQuery,
  expandedNodes,
  onToggleExpand,
}: TreeNodeProps & {
  expandedNodes: Set<number>
  onToggleExpand: (id: number) => void
}) {
  const isExpanded = expandedNodes.has(node.entity.id)
  const isSelected = selectedId === node.entity.id
  const hasChildren = node.children.length > 0 || node.elements.length > 0

  // Filter by search
  const matchesSearch = !searchQuery ||
    (node.entity as any).name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    node.entity.type.toLowerCase().includes(searchQuery.toLowerCase())

  const childMatches = node.children.some(child =>
    (child.entity as any).name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (searchQuery && !matchesSearch && !childMatches) {
    return null
  }

  const icon = TYPE_ICONS[node.entity.type] || <Box size={14} className="text-neutral-400" />

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-colors
                  ${isSelected ? 'bg-violet-500/20 text-violet-300' : 'hover:bg-neutral-800'}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect?.(node.entity)}
      >
        {/* Expand button */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(node.entity.id)
            }}
            className="p-0.5 hover:bg-neutral-700 rounded"
          >
            {isExpanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Icon */}
        {icon}

        {/* Name */}
        <span className="flex-1 text-xs truncate">
          {(node.entity as any).name || node.entity.type}
        </span>

        {/* Badge */}
        {node.elements.length > 0 && (
          <span className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px] text-neutral-400">
            {node.elements.length}
          </span>
        )}
      </div>

      {/* Children */}
      {isExpanded && (
        <>
          {node.children.map(child => (
            <TreeNode
              key={child.entity.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              searchQuery={searchQuery}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
            />
          ))}

          {/* Elements */}
          {node.elements.slice(0, 50).map(element => (
            <div
              key={element.id}
              className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-colors
                        ${selectedId === element.id ? 'bg-violet-500/20 text-violet-300' : 'hover:bg-neutral-800'}`}
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
              onClick={() => onSelect?.(element)}
            >
              <span className="w-4" />
              <Box size={12} className="text-neutral-500" />
              <span className="flex-1 text-[11px] text-neutral-400 truncate">
                {(element as any).name || element.type}
              </span>
              <span className="text-[10px] text-neutral-600">{element.type.replace('Ifc', '')}</span>
            </div>
          ))}

          {node.elements.length > 50 && (
            <div
              className="text-[10px] text-neutral-500 pl-8 py-1"
              style={{ paddingLeft: `${(depth + 1) * 16 + 24}px` }}
            >
              ...and {node.elements.length - 50} more elements
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default IfcHierarchyTree
