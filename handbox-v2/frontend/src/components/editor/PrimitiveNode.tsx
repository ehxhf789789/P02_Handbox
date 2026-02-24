/**
 * PrimitiveNode — custom XYFlow node with input/output ports.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { NodeData } from '@/stores/workflowStore'
import { getCategoryColor } from '@/data/toolCatalog'
import { useWorkflowStore } from '@/stores/workflowStore'
import {
  FileText, Save, MessageSquare, Monitor,
  Bot, AlignLeft, Waypoints,
  Scissors, Merge, FileCode, Regex,
  Braces, GitBranch, Table, Filter,
  GitFork, Repeat, GitMerge, Timer,
  HardDrive, SearchCode, ArrowUpDown,
  FileDown, Sheet, CircleDot,
  Brain, Search, Type, Database, Download, FileInput,
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

function PrimitiveNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as NodeData
  const color = getCategoryColor(nodeData.category)
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const IconComp = iconMap[nodeData.toolRef] ?? CircleDot

  return (
    <div
      onClick={() => selectNode(id)}
      className="relative group"
      style={{ minWidth: 180 }}
    >
      {/* Input handles */}
      {nodeData.inputs.map((inp, i) => (
        <Handle
          key={`in-${inp.name}`}
          type="target"
          position={Position.Left}
          id={inp.name}
          style={{
            top: `${28 + (i + 1) * 24}px`,
            width: 10,
            height: 10,
            background: '#525252',
            border: '2px solid #737373',
          }}
          title={`${inp.name} (${inp.type})`}
        />
      ))}

      {/* Node body */}
      <div
        className={`rounded-lg border-2 transition-shadow ${
          selected ? 'shadow-lg shadow-white/10' : ''
        }`}
        style={{
          borderColor: selected ? color : '#404040',
          background: '#1a1a1a',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-t-md"
          style={{ background: `${color}18` }}
        >
          <div
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: `${color}30` }}
          >
            <IconComp size={14} style={{ color }} />
          </div>
          <span className="text-xs font-semibold truncate" style={{ color }}>
            {nodeData.label}
          </span>
        </div>

        {/* Ports */}
        <div className="px-3 py-2 space-y-1">
          {nodeData.inputs.map((inp) => (
            <div key={inp.name} className="flex items-center gap-1.5 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span className="text-neutral-400">{inp.name}</span>
              <span className="text-neutral-600 ml-auto">{inp.type}</span>
            </div>
          ))}
          {nodeData.inputs.length > 0 && nodeData.outputs.length > 0 && (
            <div className="border-t border-neutral-800 my-1" />
          )}
          {nodeData.outputs.map((out) => (
            <div key={out.name} className="flex items-center gap-1.5 text-[10px]">
              <span className="text-neutral-400 ml-auto">{out.name}</span>
              <span className="text-neutral-600">{out.type}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </div>
          ))}
        </div>
      </div>

      {/* Output handles */}
      {nodeData.outputs.map((out, i) => (
        <Handle
          key={`out-${out.name}`}
          type="source"
          position={Position.Right}
          id={out.name}
          style={{
            top: `${28 + (nodeData.inputs.length > 0 ? nodeData.inputs.length * 24 + 12 : 0) + (i + 1) * 24}px`,
            width: 10,
            height: 10,
            background: '#525252',
            border: '2px solid #737373',
          }}
          title={`${out.name} (${out.type})`}
        />
      ))}
    </div>
  )
}

export const PrimitiveNode = memo(PrimitiveNodeInner)
