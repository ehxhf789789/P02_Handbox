/**
 * PrimitiveNode — custom XYFlow node with input/output ports.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { NodeData } from '@/stores/workflowStore'
import { getCategoryColor, allTools } from '@/data/toolCatalog'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useExecutionStore } from '@/stores/executionStore'
import type { ExecutionStatus } from '@/types/trace'
import {
  FileText, Save, MessageSquare, Monitor,
  Bot, AlignLeft, Waypoints,
  Scissors, Merge, FileCode, Regex,
  Braces, GitBranch, Table, Filter,
  GitFork, Repeat, GitMerge, Timer,
  HardDrive, SearchCode, ArrowUpDown,
  FileDown, Sheet, CircleDot,
  Brain, Search, Type, Database, Download, FileInput,
  CheckCircle2, XCircle, Loader2, Clock,
} from 'lucide-react'

const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  FileText, Save, MessageSquare, Monitor,
  Bot, AlignLeft, Waypoints,
  Scissors, Merge, FileCode, Regex,
  Braces, GitBranch, Table, Filter,
  GitFork, Repeat, GitMerge, Timer,
  HardDrive, SearchCode, ArrowUpDown,
  FileDown, Sheet, CircleDot,
  Brain, Search, Type, Database, Download, FileInput,
}

// Execution status styling
function getStatusStyles(status: ExecutionStatus | undefined): {
  borderColor: string
  glowColor: string
  statusIcon: React.ReactNode
} {
  switch (status) {
    case 'running':
      return {
        borderColor: '#3b82f6', // blue-500
        glowColor: '0 0 12px rgba(59, 130, 246, 0.5)',
        statusIcon: <Loader2 size={14} className="text-blue-500 animate-spin" />,
      }
    case 'completed':
    case 'cache_hit':
      return {
        borderColor: '#22c55e', // green-500
        glowColor: '0 0 12px rgba(34, 197, 94, 0.4)',
        statusIcon: <CheckCircle2 size={14} className="text-green-500" />,
      }
    case 'failed':
      return {
        borderColor: '#ef4444', // red-500
        glowColor: '0 0 12px rgba(239, 68, 68, 0.5)',
        statusIcon: <XCircle size={14} className="text-red-500" />,
      }
    case 'pending':
      return {
        borderColor: '#a855f7', // purple-500 (waiting)
        glowColor: 'none',
        statusIcon: <Clock size={14} className="text-purple-400" />,
      }
    case 'skipped':
    case 'cancelled':
      return {
        borderColor: '#737373', // neutral-500
        glowColor: 'none',
        statusIcon: null,
      }
    default:
      return {
        borderColor: '#333333',
        glowColor: 'none',
        statusIcon: null,
      }
  }
}

// Layout constants for precise handle alignment
const HEADER_HEIGHT = 40 // Header with icon and label
const PORT_ROW_HEIGHT = 18 // Each port row height
const PORTS_PADDING_TOP = 8 // py-2 top
const SEPARATOR_HEIGHT = 12 // Separator between inputs and outputs (border + my-1)

function PrimitiveNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as NodeData
  const color = getCategoryColor(nodeData.category)
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const currentExecution = useExecutionStore((s) => s.currentExecution)
  const rawNodeStatus = useExecutionStore((s) => s.nodeStatuses[id])
  const toolDef = allTools.find((t) => t.id === nodeData.toolRef)
  const IconComp = iconMap[toolDef?.icon ?? ''] ?? CircleDot

  // Only show execution status if there's an active execution
  const nodeStatus = currentExecution ? rawNodeStatus : undefined

  // Get status-based styling
  const statusStyles = getStatusStyles(nodeStatus)
  const effectiveBorderColor = nodeStatus ? statusStyles.borderColor : (selected ? color : '#333333')
  const boxShadow = nodeStatus ? statusStyles.glowColor : 'none'

  // Calculate handle positions
  const getInputHandleTop = (index: number) => {
    // Header + padding + row center
    return HEADER_HEIGHT + PORTS_PADDING_TOP + (index * PORT_ROW_HEIGHT) + (PORT_ROW_HEIGHT / 2)
  }

  const getOutputHandleTop = (index: number) => {
    const inputsHeight = nodeData.inputs.length * PORT_ROW_HEIGHT
    const separatorOffset = nodeData.inputs.length > 0 ? SEPARATOR_HEIGHT : 0
    // Header + padding + inputs + separator + row center
    return HEADER_HEIGHT + PORTS_PADDING_TOP + inputsHeight + separatorOffset + (index * PORT_ROW_HEIGHT) + (PORT_ROW_HEIGHT / 2)
  }

  return (
    <div
      onClick={() => selectNode(id)}
      className="relative group"
      style={{ minWidth: 180 }}
    >
      {/* Input handles - aligned with port labels */}
      {nodeData.inputs.map((inp, i) => (
        <Handle
          key={`in-${inp.name}`}
          type="target"
          position={Position.Left}
          id={inp.name}
          style={{
            top: getInputHandleTop(i),
            width: 10,
            height: 10,
            background: '#3b82f6',
            border: '2px solid #1e40af',
          }}
          title={`${inp.name} (${inp.type})`}
        />
      ))}

      {/* Node body */}
      <div
        className="rounded-lg border-2 transition-all duration-300"
        style={{
          borderColor: effectiveBorderColor,
          background: '#1a1a1a',
          boxShadow,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-t-md"
          style={{ background: `${color}18`, height: HEADER_HEIGHT }}
        >
          <div
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: `${color}30` }}
          >
            <IconComp size={14} style={{ color }} />
          </div>
          <span className="text-xs font-semibold truncate flex-1" style={{ color }}>
            {nodeData.label}
          </span>
          {/* Execution status icon */}
          {statusStyles.statusIcon && (
            <div className="flex-shrink-0">
              {statusStyles.statusIcon}
            </div>
          )}
        </div>

        {/* Ports */}
        <div className="px-3 py-2">
          {nodeData.inputs.map((inp) => (
            <div
              key={inp.name}
              className="flex items-center gap-1.5 text-[10px]"
              style={{ height: PORT_ROW_HEIGHT }}
            >
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-neutral-300 font-medium">{inp.name}</span>
              <span className="text-neutral-600 text-[9px] ml-auto">{inp.type}</span>
            </div>
          ))}
          {nodeData.inputs.length > 0 && nodeData.outputs.length > 0 && (
            <div className="border-t border-neutral-800 my-1.5" style={{ height: 1 }} />
          )}
          {nodeData.outputs.map((out) => (
            <div
              key={out.name}
              className="flex items-center gap-1.5 text-[10px]"
              style={{ height: PORT_ROW_HEIGHT }}
            >
              <span className="text-neutral-600 text-[9px]">{out.type}</span>
              <span className="text-neutral-300 font-medium ml-auto">{out.name}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
          ))}
        </div>
      </div>

      {/* Output handles - aligned with port labels */}
      {nodeData.outputs.map((out, i) => (
        <Handle
          key={`out-${out.name}`}
          type="source"
          position={Position.Right}
          id={out.name}
          style={{
            top: getOutputHandleTop(i),
            width: 10,
            height: 10,
            background: '#22c55e',
            border: '2px solid #15803d',
          }}
          title={`${out.name} (${out.type})`}
        />
      ))}
    </div>
  )
}

export const PrimitiveNode = memo(PrimitiveNodeInner)
