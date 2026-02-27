/**
 * PropertyPanel — displays and edits the selected node's configuration.
 *
 * Features:
 * - Node label editing
 * - Config field editing
 * - Per-node model override for LLM nodes
 * - Port information
 */

import { useWorkflowStore, type NodeData } from '@/stores/workflowStore'
import { useLLMStore } from '@/stores/llmStore'
import { getCategoryColor, allTools } from '@/data/toolCatalog'
import { FilePickerInput } from '@/components/inputs/FilePickerInput'
import { Settings, Trash2, X, Cpu } from 'lucide-react'
import type { LLMProvider } from '@/types'

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
  const toolDef = allTools.find((t) => t.id === data.toolRef)

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
                <div key={field.name} className="block">
                  <span className="text-[10px] text-neutral-400 mb-1 block">{field.label}</span>
                  {field.type === 'file' || field.type === 'files' || field.type === 'folder' ? (
                    <FilePickerInput
                      type={field.type}
                      value={
                        field.type === 'files'
                          ? (Array.isArray(data.config[field.name]) ? (data.config[field.name] as string[]) : [])
                          : (typeof data.config[field.name] === 'string' ? (data.config[field.name] as string) : '')
                      }
                      onChange={(value) =>
                        updateNodeConfig(selectedNode.id, {
                          ...data.config,
                          [field.name]: value,
                        })
                      }
                      fileFilters={field.fileFilters}
                      label={field.label}
                    />
                  ) : field.type === 'select' ? (
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
                      {field.options && field.options.length > 0 ? (
                        field.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))
                      ) : (
                        <option value={String(field.default)}>{String(field.default)}</option>
                      )}
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
                  ) : field.type === 'boolean' ? (
                    <label className="flex items-center gap-2 mt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(data.config[field.name] ?? field.default ?? false)}
                        onChange={(e) =>
                          updateNodeConfig(selectedNode.id, {
                            ...data.config,
                            [field.name]: e.target.checked,
                          })
                        }
                        className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-blue-500
                                   focus:ring-blue-500 focus:ring-offset-neutral-900"
                      />
                      <span className="text-xs text-neutral-300">Enabled</span>
                    </label>
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
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-neutral-600">No configuration fields</p>
          )}
        </div>

        {/* Per-node Model Override (for LLM-related nodes) */}
        {(data.category === 'llm' || data.toolRef.includes('llm') || data.toolRef.includes('chat')) && (
          <NodeModelOverrideSection nodeId={selectedNode.id} />
        )}

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

      {/* Delete button - more prominent */}
      <div className="px-4 py-3 border-t border-neutral-800 space-y-2">
        <button
          onClick={() => {
            removeNode(selectedNode.id)
            selectNode(null)
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium
                     bg-red-900/30 text-red-400 border border-red-900/50
                     hover:bg-red-900/50 hover:border-red-800 transition-colors w-full justify-center"
        >
          <Trash2 size={14} />
          노드 삭제
        </button>
        <p className="text-[9px] text-neutral-600 text-center">
          또는 Del 키를 눌러 삭제
        </p>
      </div>
    </aside>
  )
}

/**
 * Per-node model override section — allows overriding the default LLM model for specific nodes.
 */
function NodeModelOverrideSection({ nodeId }: { nodeId: string }) {
  const {
    activeProvider,
    selectedModel,
    models,
    nodeOverrides,
    setNodeOverride,
    removeNodeOverride,
    getModelForNode,
  } = useLLMStore()

  const currentOverride = nodeOverrides.find((o) => o.nodeId === nodeId)
  const currentModel = getModelForNode(nodeId)
  const hasOverride = !!currentOverride

  const providers: LLMProvider[] = ['openai', 'anthropic', 'bedrock', 'local']

  const handleProviderChange = (provider: LLMProvider) => {
    const modelId = selectedModel[provider] || models[provider][0]?.id || ''
    setNodeOverride(nodeId, provider, modelId)
  }

  const handleModelChange = (modelId: string) => {
    const provider = currentOverride?.provider || activeProvider
    setNodeOverride(nodeId, provider, modelId)
  }

  const providerColors: Record<LLMProvider, string> = {
    openai: 'bg-green-500/20 text-green-400 border-green-500/50',
    anthropic: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    bedrock: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
    local: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  }

  return (
    <div className="px-4 py-3 border-b border-neutral-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <Cpu size={10} />
          Model Override
        </h3>
        {hasOverride && (
          <button
            onClick={() => removeNodeOverride(nodeId)}
            className="text-[9px] text-neutral-500 hover:text-neutral-300 px-1.5 py-0.5 rounded bg-neutral-800"
          >
            Reset
          </button>
        )}
      </div>

      {/* Override toggle / status */}
      {!hasOverride ? (
        <div className="mb-2">
          <div className="flex items-center gap-2 text-[10px] text-neutral-500 mb-2">
            <span>Using default:</span>
            <span className={`px-1.5 py-0.5 rounded border text-[9px] ${providerColors[currentModel.provider]}`}>
              {currentModel.provider}
            </span>
            <span className="text-neutral-400 font-mono truncate">
              {currentModel.modelId.split('/').pop()?.split(':')[0]}
            </span>
          </div>
          <button
            onClick={() => setNodeOverride(nodeId, activeProvider, selectedModel[activeProvider])}
            className="w-full px-2 py-1.5 text-[10px] rounded border border-dashed border-neutral-700
                       text-neutral-500 hover:border-neutral-500 hover:text-neutral-300 transition-colors"
          >
            + Override model for this node
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Provider selection */}
          <div>
            <span className="text-[9px] text-neutral-500 block mb-1">Provider</span>
            <div className="flex gap-1">
              {providers.map((provider) => (
                <button
                  key={provider}
                  onClick={() => handleProviderChange(provider)}
                  className={`flex-1 px-2 py-1 text-[9px] rounded transition-colors ${
                    currentOverride.provider === provider
                      ? providerColors[provider] + ' border'
                      : 'bg-neutral-800 text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {provider}
                </button>
              ))}
            </div>
          </div>

          {/* Model selection */}
          <div>
            <span className="text-[9px] text-neutral-500 block mb-1">Model</span>
            <select
              value={currentOverride.modelId}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full px-2 py-1.5 text-[10px] rounded bg-neutral-900 border border-neutral-800
                         text-neutral-200 focus:outline-none focus:border-neutral-600"
            >
              {models[currentOverride.provider]?.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name || model.id}
                </option>
              ))}
              {/* Show current selection even if not in list */}
              {!models[currentOverride.provider]?.find((m) => m.id === currentOverride.modelId) && (
                <option value={currentOverride.modelId}>{currentOverride.modelId}</option>
              )}
            </select>
          </div>

          {/* Reason (optional) */}
          {currentOverride.reason && (
            <div className="text-[9px] text-neutral-600 italic">
              Reason: {currentOverride.reason}
            </div>
          )}
        </div>
      )}

      <p className="text-[9px] text-neutral-600 mt-2">
        이 노드에서 사용할 LLM 모델을 지정합니다
      </p>
    </div>
  )
}
