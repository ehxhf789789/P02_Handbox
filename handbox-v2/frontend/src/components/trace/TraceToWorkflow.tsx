/**
 * TraceToWorkflow — Modal for converting execution traces to reusable workflows.
 */

import { useState, useMemo } from 'react'
import type { ExecutionTrace } from '@/stores/traceStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import {
  convertTraceToWorkflow,
  applyWorkflowToEditor,
  type ConversionOptions,
  type ConvertedWorkflow,
} from '@/services/TraceConverter'
import { Wand2, Settings2, Save, X, CheckCircle, AlertCircle } from 'lucide-react'

interface TraceToWorkflowProps {
  trace: ExecutionTrace
  isOpen: boolean
  onClose: () => void
  onSuccess?: (workflow: ConvertedWorkflow) => void
}

export function TraceToWorkflow({
  trace,
  isOpen,
  onClose,
  onSuccess,
}: TraceToWorkflowProps) {
  const { addNode, addEdgeRaw: addEdge, clearAll } = useWorkflowStore()

  const [workflowName, setWorkflowName] = useState(
    trace.workflowName || `Workflow from ${new Date(trace.startedAt).toLocaleDateString()}`
  )
  const [options, setOptions] = useState<ConversionOptions>({
    includeAllSteps: true,
    parameterizeInputs: true,
    addErrorHandling: false,
    optimizeParallel: false,
    preserveModelOverrides: true,
    layoutDirection: 'horizontal',
  })
  const [step, setStep] = useState<'options' | 'preview' | 'success'>('options')
  const [convertedWorkflow, setConvertedWorkflow] = useState<ConvertedWorkflow | null>(null)

  const traceStats = useMemo(() => ({
    llmCalls: trace.llmTraces.length,
    completedCalls: trace.llmTraces.filter(t => t.status === 'completed').length,
    totalTokens: trace.llmTraces.reduce((sum, t) => sum + (t.usage?.inputTokens || 0) + (t.usage?.outputTokens || 0), 0),
    avgLatency: trace.llmTraces.length > 0
      ? Math.round(trace.llmTraces.reduce((sum, t) => sum + t.latencyMs, 0) / trace.llmTraces.length)
      : 0,
  }), [trace])

  const handleConvert = () => {
    const workflow = convertTraceToWorkflow(trace, workflowName, options)
    setConvertedWorkflow(workflow)
    setStep('preview')
  }

  const handleApply = () => {
    if (!convertedWorkflow) return

    applyWorkflowToEditor(convertedWorkflow, addNode, addEdge, clearAll)
    setStep('success')
    onSuccess?.(convertedWorkflow)

    // Auto close after success
    setTimeout(() => {
      onClose()
    }, 1500)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[600px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-violet-400" />
            <h2 className="text-sm font-semibold text-neutral-200">
              Convert Trace to Workflow
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {step === 'options' && (
            <OptionsStep
              workflowName={workflowName}
              setWorkflowName={setWorkflowName}
              options={options}
              setOptions={setOptions}
              traceStats={traceStats}
            />
          )}

          {step === 'preview' && convertedWorkflow && (
            <PreviewStep workflow={convertedWorkflow} />
          )}

          {step === 'success' && (
            <SuccessStep workflowName={workflowName} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-700">
          <div className="text-xs text-neutral-500">
            {traceStats.completedCalls} LLM calls • {traceStats.totalTokens.toLocaleString()} tokens
          </div>

          <div className="flex gap-2">
            {step === 'options' && (
              <>
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConvert}
                  disabled={!workflowName.trim() || traceStats.completedCalls === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                             bg-violet-600 hover:bg-violet-500 text-white rounded
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Wand2 size={12} />
                  Convert
                </button>
              </>
            )}

            {step === 'preview' && (
              <>
                <button
                  onClick={() => setStep('options')}
                  className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
                >
                  Back
                </button>
                <button
                  onClick={handleApply}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                             bg-emerald-600 hover:bg-emerald-500 text-white rounded"
                >
                  <Save size={12} />
                  Apply to Editor
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function OptionsStep({
  workflowName,
  setWorkflowName,
  options,
  setOptions,
  traceStats,
}: {
  workflowName: string
  setWorkflowName: (v: string) => void
  options: ConversionOptions
  setOptions: (v: ConversionOptions) => void
  traceStats: { llmCalls: number; completedCalls: number; totalTokens: number; avgLatency: number }
}) {
  return (
    <div className="space-y-4">
      {/* Trace summary */}
      <div className="p-3 bg-neutral-800/50 rounded-lg">
        <div className="text-xs text-neutral-400 mb-2">Trace Summary</div>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-neutral-200">{traceStats.llmCalls}</div>
            <div className="text-[10px] text-neutral-500">LLM Calls</div>
          </div>
          <div>
            <div className="text-lg font-bold text-emerald-400">{traceStats.completedCalls}</div>
            <div className="text-[10px] text-neutral-500">Completed</div>
          </div>
          <div>
            <div className="text-lg font-bold text-neutral-200">{traceStats.totalTokens.toLocaleString()}</div>
            <div className="text-[10px] text-neutral-500">Tokens</div>
          </div>
          <div>
            <div className="text-lg font-bold text-neutral-200">{traceStats.avgLatency}ms</div>
            <div className="text-[10px] text-neutral-500">Avg Latency</div>
          </div>
        </div>
      </div>

      {/* Workflow name */}
      <div>
        <label className="block text-xs text-neutral-400 mb-1">Workflow Name</label>
        <input
          type="text"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded
                     text-sm text-neutral-200 focus:outline-none focus:border-violet-500"
          placeholder="Enter workflow name..."
        />
      </div>

      {/* Conversion options */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-2">
          <Settings2 size={12} />
          Conversion Options
        </div>

        <div className="space-y-2">
          <OptionCheckbox
            checked={options.includeAllSteps ?? true}
            onChange={(v) => setOptions({ ...options, includeAllSteps: v })}
            label="Include all steps"
            description="Convert every LLM call to a node"
          />

          <OptionCheckbox
            checked={options.parameterizeInputs ?? true}
            onChange={(v) => setOptions({ ...options, parameterizeInputs: v })}
            label="Parameterize inputs"
            description="Detect and extract input parameters"
          />

          <OptionCheckbox
            checked={options.preserveModelOverrides ?? true}
            onChange={(v) => setOptions({ ...options, preserveModelOverrides: v })}
            label="Preserve model settings"
            description="Keep the original LLM provider/model for each node"
          />

          <OptionCheckbox
            checked={options.addErrorHandling ?? false}
            onChange={(v) => setOptions({ ...options, addErrorHandling: v })}
            label="Add error handling"
            description="Insert error handling nodes"
          />

          <OptionCheckbox
            checked={options.optimizeParallel ?? false}
            onChange={(v) => setOptions({ ...options, optimizeParallel: v })}
            label="Optimize for parallel execution"
            description="Detect independent steps that can run in parallel"
          />
        </div>
      </div>

      {/* Layout direction */}
      <div>
        <label className="block text-xs text-neutral-400 mb-1">Layout Direction</label>
        <div className="flex gap-2">
          <button
            onClick={() => setOptions({ ...options, layoutDirection: 'horizontal' })}
            className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${
              options.layoutDirection === 'horizontal'
                ? 'bg-violet-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            Horizontal →
          </button>
          <button
            onClick={() => setOptions({ ...options, layoutDirection: 'vertical' })}
            className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${
              options.layoutDirection === 'vertical'
                ? 'bg-violet-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            Vertical ↓
          </button>
        </div>
      </div>

      {traceStats.completedCalls === 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400">
          <AlertCircle size={14} />
          No completed LLM calls found in this trace
        </div>
      )}
    </div>
  )
}

function OptionCheckbox({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description: string
}) {
  return (
    <label className="flex items-start gap-2 p-2 rounded hover:bg-neutral-800/50 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-neutral-600 bg-neutral-800
                   text-violet-500 focus:ring-violet-500 focus:ring-offset-neutral-900"
      />
      <div>
        <div className="text-xs text-neutral-200">{label}</div>
        <div className="text-[10px] text-neutral-500">{description}</div>
      </div>
    </label>
  )
}

function PreviewStep({ workflow }: { workflow: ConvertedWorkflow }) {
  return (
    <div className="space-y-4">
      {/* Workflow info */}
      <div className="p-3 bg-neutral-800/50 rounded-lg">
        <div className="text-sm font-medium text-neutral-200 mb-1">{workflow.name}</div>
        <div className="text-xs text-neutral-500">{workflow.description}</div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-2 bg-neutral-800/50 rounded text-center">
          <div className="text-lg font-bold text-neutral-200">{workflow.nodes.length}</div>
          <div className="text-[10px] text-neutral-500">Nodes</div>
        </div>
        <div className="p-2 bg-neutral-800/50 rounded text-center">
          <div className="text-lg font-bold text-neutral-200">{workflow.edges.length}</div>
          <div className="text-[10px] text-neutral-500">Edges</div>
        </div>
        <div className="p-2 bg-neutral-800/50 rounded text-center">
          <div className="text-lg font-bold text-neutral-200">{workflow.parameters.length}</div>
          <div className="text-[10px] text-neutral-500">Parameters</div>
        </div>
      </div>

      {/* Parameters */}
      {workflow.parameters.length > 0 && (
        <div>
          <div className="text-xs text-neutral-400 mb-2">Detected Parameters</div>
          <div className="space-y-1">
            {workflow.parameters.map((param) => (
              <div
                key={param.id}
                className="flex items-center justify-between p-2 bg-neutral-800/50 rounded"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-violet-400">{param.name}</span>
                  <span className="text-[10px] text-neutral-600">{param.type}</span>
                </div>
                {param.required && (
                  <span className="text-[10px] text-amber-400">required</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Node preview */}
      <div>
        <div className="text-xs text-neutral-400 mb-2">Nodes</div>
        <div className="space-y-1 max-h-40 overflow-auto">
          {workflow.nodes.map((node) => (
            <div
              key={node.id}
              className="flex items-center gap-2 p-2 bg-neutral-800/50 rounded"
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: node.type === 'llm' ? '#8b5cf6' :
                                   node.type === 'input' ? '#22c55e' :
                                   node.type === 'output' ? '#f59e0b' : '#6b7280'
                }}
              />
              <span className="text-xs text-neutral-200">{node.label}</span>
              <span className="text-[10px] text-neutral-600 font-mono">{node.toolRef}</span>
              {node.modelOverride && (
                <span className="text-[10px] text-neutral-500 ml-auto">
                  {node.modelOverride.provider}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SuccessStep({ workflowName }: { workflowName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
        <CheckCircle size={32} className="text-emerald-400" />
      </div>
      <div className="text-lg font-medium text-neutral-200 mb-1">
        Workflow Created!
      </div>
      <div className="text-sm text-neutral-500">
        "{workflowName}" has been applied to the editor
      </div>
    </div>
  )
}

export default TraceToWorkflow
