/**
 * PropertyPanel — displays and edits the selected node's configuration.
 */

import { useWorkflowStore, type NodeData } from '@/stores/workflowStore'
import { getCategoryColor, allTools } from '@/data/toolCatalog'
import { Settings, Trash2, X } from 'lucide-react'

export function PropertyPanel() {
  const { nodes, selectedNodeId, selectNode, updateNodeConfig, updateNodeLabel, removeNode } =
    useWorkflowStore()

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  if (!selectedNode) {
    return (
      <aside className="w-72 border-l border-neutral-800 bg-neutral-950 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
            Properties
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <Settings size={32} className="text-neutral-800 mx-auto mb-2" />
            <p className="text-xs text-neutral-600">
              노드를 선택하면 설정을 편집할 수 있습니다
            </p>
            <p className="text-[10px] text-neutral-700 mt-1">
              Click a node to edit its properties
            </p>
          </div>
        </div>
      </aside>
    )
  }

  const data = selectedNode.data as NodeData
  const color = getCategoryColor(data.category)
  const toolDef = allTools.find((t) => t.icon === data.toolRef)

  return (
    <aside className="w-72 border-l border-neutral-800 bg-neutral-950 flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
          Properties
        </h2>
        <button
          onClick={() => selectNode(null)}
          className="p-1 rounded hover:bg-neutral-800 text-neutral-500"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Node info */}
        <div className="px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ background: color }}
            />
            <span className="text-xs font-medium text-neutral-200">
              {data.label}
            </span>
          </div>

          {/* Label edit */}
          <label className="block mb-2">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
              Label
            </span>
            <input
              type="text"
              value={data.label}
              onChange={(e) => updateNodeLabel(selectedNode.id, e.target.value)}
              className="mt-1 w-full px-2.5 py-1.5 text-xs rounded-md bg-neutral-900 border border-neutral-800
                         text-neutral-200 focus:outline-none focus:border-neutral-600"
            />
          </label>

          {/* Node ID */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-neutral-600">ID: {selectedNode.id}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>
              {data.category}
            </span>
          </div>
        </div>

        {/* Config fields */}
        <div className="px-4 py-3 border-b border-neutral-800">
          <h3 className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold mb-2">
            Configuration
          </h3>
          {toolDef?.configFields && toolDef.configFields.length > 0 ? (
            <div className="space-y-2">
              {toolDef.configFields.map((field) => (
                <label key={field.name} className="block">
                  <span className="text-[10px] text-neutral-400">{field.label}</span>
                  {field.type === 'select' ? (
                    <select
                      value={String(data.config[field.name] ?? field.default ?? '')}
                      onChange={(e) =>
                        updateNodeConfig(selectedNode.id, {
                          ...data.config,
                          [field.name]: e.target.value,
                        })
                      }
                      className="mt-0.5 w-full px-2.5 py-1.5 text-xs rounded-md bg-neutral-900 border border-neutral-800
                                 text-neutral-200 focus:outline-none focus:border-neutral-600"
                    >
                      <option value={String(field.default)}>{String(field.default)}</option>
                    </select>
                  ) : field.type === 'number' ? (
                    <input
                      type="number"
                      value={Number(data.config[field.name] ?? field.default ?? 0)}
                      onChange={(e) =>
                        updateNodeConfig(selectedNode.id, {
                          ...data.config,
                          [field.name]: parseFloat(e.target.value),
                        })
                      }
                      className="mt-0.5 w-full px-2.5 py-1.5 text-xs rounded-md bg-neutral-900 border border-neutral-800
                                 text-neutral-200 focus:outline-none focus:border-neutral-600"
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(data.config[field.name] ?? field.default ?? '')}
                      onChange={(e) =>
                        updateNodeConfig(selectedNode.id, {
                          ...data.config,
                          [field.name]: e.target.value,
                        })
                      }
                      className="mt-0.5 w-full px-2.5 py-1.5 text-xs rounded-md bg-neutral-900 border border-neutral-800
                                 text-neutral-200 focus:outline-none focus:border-neutral-600"
                    />
                  )}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-neutral-600">No configuration fields</p>
          )}
        </div>

        {/* Ports info */}
        <div className="px-4 py-3 border-b border-neutral-800">
          <h3 className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold mb-2">
            Ports
          </h3>
          {data.inputs.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] text-blue-500 font-medium">Inputs</span>
              {data.inputs.map((inp) => (
                <div key={inp.name} className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-neutral-400">{inp.name}</span>
                  <span className="text-[10px] text-neutral-600 font-mono">{inp.type}</span>
                </div>
              ))}
            </div>
          )}
          {data.outputs.length > 0 && (
            <div>
              <span className="text-[10px] text-emerald-500 font-medium">Outputs</span>
              {data.outputs.map((out) => (
                <div key={out.name} className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-neutral-400">{out.name}</span>
                  <span className="text-[10px] text-neutral-600 font-mono">{out.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Description */}
        {toolDef?.description && (
          <div className="px-4 py-3 border-b border-neutral-800">
            <h3 className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold mb-1">
              Description
            </h3>
            <p className="text-[10px] text-neutral-400">{toolDef.description}</p>
          </div>
        )}
      </div>

      {/* Delete button */}
      <div className="px-4 py-3 border-t border-neutral-800">
        <button
          onClick={() => {
            removeNode(selectedNode.id)
            selectNode(null)
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs
                     text-red-400 hover:bg-red-950/50 transition-colors w-full justify-center"
        >
          <Trash2 size={12} />
          Delete Node
        </button>
      </div>
    </aside>
  )
}
