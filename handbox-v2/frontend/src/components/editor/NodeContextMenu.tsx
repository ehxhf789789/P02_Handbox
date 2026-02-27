/**
 * NodeContextMenu — Context menu for node actions including partial execution.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useWorkflowStore, type NodeData } from '@/stores/workflowStore'
import { useExecutionStore } from '@/stores/executionStore'
import {
  Play,
  PlayCircle,
  RotateCcw,
  ArrowDownRight,
  ArrowUpLeft,
  Copy,
  Trash2,
  Edit3,
  Bug,
  Zap,
  X,
} from 'lucide-react'
import {
  getExecutionPlan,
  type PartialExecutionMode,
} from '@/services/PartialExecution'
import type { Node } from '@xyflow/react'

interface NodeContextMenuProps {
  node: Node<NodeData>
  position: { x: number; y: number }
  onClose: () => void
  onEdit: () => void
  onExecute: (mode: PartialExecutionMode) => void
  onDelete: () => void
  onDuplicate: () => void
  onDebug: () => void
}

export function NodeContextMenu({
  node,
  position,
  onClose,
  onEdit,
  onExecute,
  onDelete,
  onDuplicate,
  onDebug,
}: NodeContextMenuProps) {
  const { nodes, edges } = useWorkflowStore()
  const { nodeStatuses, nodeDetails, isRunning } = useExecutionStore()
  const menuRef = useRef<HTMLDivElement>(null)
  const [showExecutionPreview, setShowExecutionPreview] = useState(false)
  const [previewMode, setPreviewMode] = useState<PartialExecutionMode>('single')

  const nodeData = node.data as NodeData
  const nodeStatus = nodeStatuses[node.id]
  const nodeDetail = nodeDetails[node.id]
  const hasFailed = nodeStatus === 'failed'
  const hasOutput = nodeDetail?.output !== undefined

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Get execution preview
  const executionPlan = showExecutionPreview
    ? getExecutionPlan(
        { mode: previewMode, targetNodeId: node.id },
        nodes as Node<NodeData>[],
        edges,
        nodeStatuses
      )
    : []

  const handleExecute = useCallback((mode: PartialExecutionMode) => {
    onExecute(mode)
    onClose()
  }, [onExecute, onClose])

  const MenuItem = ({
    icon: Icon,
    label,
    onClick,
    disabled,
    danger,
    shortcut,
    onHover,
  }: {
    icon: React.ComponentType<{ size?: number; className?: string }>
    label: string
    onClick?: () => void
    disabled?: boolean
    danger?: boolean
    shortcut?: string
    onHover?: () => void
  }) => (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors
                ${disabled
                  ? 'text-neutral-600 cursor-not-allowed'
                  : danger
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-neutral-300 hover:bg-neutral-800'
                }`}
    >
      <Icon size={13} className={danger ? 'text-red-400' : ''} />
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-[10px] text-neutral-600">{shortcut}</span>
      )}
    </button>
  )

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        minWidth: 200,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
        <span className="text-xs font-medium text-neutral-200 truncate max-w-[150px]">
          {nodeData.label}
        </span>
        {nodeStatus && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            nodeStatus === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
            nodeStatus === 'failed' ? 'bg-red-500/20 text-red-400' :
            nodeStatus === 'running' ? 'bg-blue-500/20 text-blue-400' :
            'bg-neutral-700 text-neutral-400'
          }`}>
            {nodeStatus}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="py-1">
        {/* Edit */}
        <MenuItem
          icon={Edit3}
          label="Quick Edit"
          onClick={onEdit}
          shortcut="⏎"
        />

        <div className="h-px bg-neutral-800 my-1" />

        {/* Execution */}
        <MenuItem
          icon={Play}
          label="Run This Node"
          onClick={() => handleExecute('single')}
          disabled={isRunning}
          onHover={() => {
            setShowExecutionPreview(true)
            setPreviewMode('single')
          }}
        />

        <MenuItem
          icon={ArrowDownRight}
          label="Run From Here"
          onClick={() => handleExecute('downstream')}
          disabled={isRunning}
          onHover={() => {
            setShowExecutionPreview(true)
            setPreviewMode('downstream')
          }}
        />

        <MenuItem
          icon={ArrowUpLeft}
          label="Run Dependencies"
          onClick={() => handleExecute('upstream')}
          disabled={isRunning}
          onHover={() => {
            setShowExecutionPreview(true)
            setPreviewMode('upstream')
          }}
        />

        {hasFailed && (
          <MenuItem
            icon={RotateCcw}
            label="Retry Failed"
            onClick={() => handleExecute('failed')}
            disabled={isRunning}
          />
        )}

        {hasOutput && (
          <MenuItem
            icon={Zap}
            label="Use Cached Inputs"
            onClick={() => handleExecute('from-cache')}
            disabled={isRunning}
          />
        )}

        <div className="h-px bg-neutral-800 my-1" />

        {/* Debug */}
        <MenuItem
          icon={Bug}
          label="Debug Node"
          onClick={onDebug}
        />

        {/* Duplicate */}
        <MenuItem
          icon={Copy}
          label="Duplicate"
          onClick={onDuplicate}
          shortcut="⌘D"
        />

        <div className="h-px bg-neutral-800 my-1" />

        {/* Delete */}
        <MenuItem
          icon={Trash2}
          label="Delete"
          onClick={onDelete}
          danger
          shortcut="⌫"
        />
      </div>

      {/* Execution Preview */}
      {showExecutionPreview && executionPlan.length > 0 && (
        <div className="border-t border-neutral-800 p-2 max-h-48 overflow-auto">
          <div className="text-[10px] text-neutral-500 mb-1.5">
            Execution Plan ({executionPlan.filter(p => p.action === 'execute').length} nodes)
          </div>
          <div className="space-y-0.5">
            {executionPlan.slice(0, 8).map(plan => (
              <div
                key={plan.nodeId}
                className={`flex items-center gap-2 text-[10px] px-1.5 py-0.5 rounded ${
                  plan.action === 'execute' ? 'bg-emerald-500/10 text-emerald-400' :
                  plan.action === 'use-cache' ? 'bg-blue-500/10 text-blue-400' :
                  'text-neutral-600'
                }`}
              >
                {plan.action === 'execute' && <PlayCircle size={10} />}
                {plan.action === 'use-cache' && <Zap size={10} />}
                {plan.action === 'skip' && <X size={10} />}
                <span className="truncate">{plan.label}</span>
              </div>
            ))}
            {executionPlan.length > 8 && (
              <div className="text-[10px] text-neutral-600 pl-1.5">
                +{executionPlan.length - 8} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NodeContextMenu
