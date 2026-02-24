/**
 * CompositeNode — sub-graph node with expand/collapse functionality.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo, useState } from 'react'
import type { NodeData } from '@/stores/workflowStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { ChevronDown, ChevronRight, Layers } from 'lucide-react'

function CompositeNodeInner({ id, data, selected }: NodeProps) {
  const [expanded, setExpanded] = useState(false)
  const nodeData = data as NodeData
  const selectNode = useWorkflowStore((s) => s.selectNode)

  return (
    <div
      onClick={() => selectNode(id)}
      className="relative"
      style={{ minWidth: 220 }}
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
        />
      ))}

      {/* Node body */}
      <div
        className={`rounded-lg border-2 transition-shadow ${
          selected ? 'shadow-lg shadow-blue-500/10' : ''
        }`}
        style={{
          borderColor: selected ? '#6366f1' : '#334155',
          background: '#0f172a',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-t-md cursor-pointer"
          style={{ background: 'rgba(99, 102, 241, 0.1)' }}
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        >
          {expanded ? (
            <ChevronDown size={12} className="text-indigo-400" />
          ) : (
            <ChevronRight size={12} className="text-indigo-400" />
          )}
          <Layers size={14} className="text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-300">
            {nodeData.label}
          </span>
          <span className="text-[10px] text-indigo-600 ml-auto">composite</span>
        </div>

        {/* Ports */}
        <div className="px-3 py-2 space-y-1">
          {nodeData.inputs.map((inp) => (
            <div key={inp.name} className="flex items-center gap-1.5 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span className="text-slate-400">{inp.name}</span>
              <span className="text-slate-600 ml-auto">{inp.type}</span>
            </div>
          ))}
          {nodeData.inputs.length > 0 && nodeData.outputs.length > 0 && (
            <div className="border-t border-slate-800 my-1" />
          )}
          {nodeData.outputs.map((out) => (
            <div key={out.name} className="flex items-center gap-1.5 text-[10px]">
              <span className="text-slate-400 ml-auto">{out.name}</span>
              <span className="text-slate-600">{out.type}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </div>
          ))}
        </div>

        {/* Expanded sub-graph placeholder */}
        {expanded && (
          <div className="px-3 py-2 border-t border-slate-800">
            <div className="rounded bg-slate-900/50 p-3 text-center">
              <p className="text-[10px] text-slate-500">
                Sub-graph: {nodeData.inputs.length} inputs → {nodeData.outputs.length} outputs
              </p>
            </div>
          </div>
        )}
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
        />
      ))}
    </div>
  )
}

export const CompositeNode = memo(CompositeNodeInner)
