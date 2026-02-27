/**
 * ModelComparison — A/B testing UI for comparing LLM models.
 *
 * Run the same prompt against multiple models and compare results.
 */

import { useState, useMemo } from 'react'
import { useComparisonStore, type ComparisonPreset } from '@/stores/comparisonStore'
import { useLLMStore } from '@/stores/llmStore'
import type { ComparisonModelConfig, ComparisonResult } from '@/types/comparison'
import type { LLMProvider } from '@/types'

interface ModelComparisonProps {
  className?: string
}

export function ModelComparison({ className = '' }: ModelComparisonProps) {
  const {
    results,
    presets,
    isRunning,
    progress,
    runComparison,
    cancelComparison,
    deleteResult,
    getWinner,
  } = useComparisonStore()

  const { models: availableModels } = useLLMStore()

  const [prompt, setPrompt] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [customModels, setCustomModels] = useState<ComparisonModelConfig[]>([])
  const [runsPerModel, setRunsPerModel] = useState(1)
  const [view, setView] = useState<'setup' | 'results'>('setup')

  const modelsToCompare = useMemo(() => {
    if (selectedPreset) {
      const preset = presets.find(p => p.id === selectedPreset)
      return preset?.models || []
    }
    return customModels
  }, [selectedPreset, customModels, presets])

  const handleRun = async () => {
    if (!prompt.trim() || modelsToCompare.length < 2) return

    await runComparison({
      id: crypto.randomUUID(),
      prompt,
      systemPrompt: systemPrompt || undefined,
      models: modelsToCompare,
      runsPerModel,
    })

    setView('results')
  }

  const addCustomModel = (provider: LLMProvider, modelId: string) => {
    if (customModels.some(m => m.provider === provider && m.modelId === modelId)) {
      return
    }
    setCustomModels([...customModels, { provider, modelId }])
    setSelectedPreset(null)
  }

  const removeCustomModel = (index: number) => {
    setCustomModels(customModels.filter((_, i) => i !== index))
  }

  return (
    <div className={`flex flex-col h-full bg-zinc-900 text-zinc-100 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700">
        <h2 className="text-sm font-semibold">Model Comparison</h2>
        <div className="flex gap-1">
          <TabButton active={view === 'setup'} onClick={() => setView('setup')}>
            Setup
          </TabButton>
          <TabButton active={view === 'results'} onClick={() => setView('results')}>
            Results ({results.length})
          </TabButton>
        </div>
      </div>

      {/* Running indicator */}
      {isRunning && (
        <div className="px-4 py-2 bg-indigo-500/10 border-b border-indigo-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <span className="animate-pulse text-indigo-400">●</span>
              <span className="text-indigo-400">
                Running: {progress.currentModel}
              </span>
              <span className="text-zinc-500">
                {progress.completedRuns}/{progress.totalRuns}
              </span>
            </div>
            <button
              onClick={cancelComparison}
              className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
            >
              Cancel
            </button>
          </div>
          <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{
                width: `${(progress.completedRuns / progress.totalRuns) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {view === 'setup' ? (
          <SetupView
            prompt={prompt}
            setPrompt={setPrompt}
            systemPrompt={systemPrompt}
            setSystemPrompt={setSystemPrompt}
            presets={presets}
            selectedPreset={selectedPreset}
            setSelectedPreset={setSelectedPreset}
            addCustomModel={addCustomModel}
            removeCustomModel={removeCustomModel}
            modelsToCompare={modelsToCompare}
            runsPerModel={runsPerModel}
            setRunsPerModel={setRunsPerModel}
            availableModels={availableModels}
            isRunning={isRunning}
            onRun={handleRun}
          />
        ) : (
          <ResultsView
            results={results}
            onDelete={deleteResult}
            getWinner={getWinner}
          />
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs transition-colors ${
        active
          ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/50'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  )
}

interface SetupViewProps {
  prompt: string
  setPrompt: (v: string) => void
  systemPrompt: string
  setSystemPrompt: (v: string) => void
  presets: ComparisonPreset[]
  selectedPreset: string | null
  setSelectedPreset: (v: string | null) => void
  addCustomModel: (provider: LLMProvider, modelId: string) => void
  removeCustomModel: (index: number) => void
  modelsToCompare: ComparisonModelConfig[]
  runsPerModel: number
  setRunsPerModel: (v: number) => void
  availableModels: Record<LLMProvider, { id: string; name: string }[]>
  isRunning: boolean
  onRun: () => void
}

function SetupView({
  prompt,
  setPrompt,
  systemPrompt,
  setSystemPrompt,
  presets,
  selectedPreset,
  setSelectedPreset,
  addCustomModel,
  removeCustomModel,
  modelsToCompare,
  runsPerModel,
  setRunsPerModel,
  availableModels,
  isRunning,
  onRun,
}: SetupViewProps) {
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [addingModel, setAddingModel] = useState<LLMProvider | null>(null)

  return (
    <div className="space-y-4">
      {/* Prompt input */}
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Test Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a prompt to test across models..."
          className="w-full h-24 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm resize-none focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={() => setShowSystemPrompt(!showSystemPrompt)}
          className="mt-1 text-xs text-zinc-500 hover:text-zinc-300"
        >
          {showSystemPrompt ? '- Hide system prompt' : '+ Add system prompt'}
        </button>
        {showSystemPrompt && (
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="System prompt (optional)"
            className="w-full h-16 mt-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm resize-none focus:outline-none focus:border-indigo-500"
          />
        )}
      </div>

      {/* Preset selection */}
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Quick Presets</label>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setSelectedPreset(selectedPreset === preset.id ? null : preset.id)}
              className={`px-3 py-1.5 rounded text-xs transition-colors ${
                selectedPreset === preset.id
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/50'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Custom model selection */}
      <div>
        <label className="block text-xs text-zinc-500 mb-1">
          Models to Compare ({modelsToCompare.length})
        </label>
        <div className="space-y-2">
          {modelsToCompare.map((model, index) => (
            <div
              key={`${model.provider}-${model.modelId}`}
              className="flex items-center justify-between p-2 bg-zinc-800 rounded"
            >
              <div className="flex items-center gap-2">
                <ProviderBadge provider={model.provider} />
                <span className="text-sm">{model.label || model.modelId}</span>
              </div>
              {!selectedPreset && (
                <button
                  onClick={() => removeCustomModel(index)}
                  className="text-zinc-500 hover:text-red-400"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {/* Add model button */}
          {!selectedPreset && (
            <div className="relative">
              <button
                onClick={() => setAddingModel(addingModel ? null : 'openai')}
                className="w-full p-2 border border-dashed border-zinc-700 rounded text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
              >
                + Add Model
              </button>

              {addingModel && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-10">
                  <div className="flex border-b border-zinc-700">
                    {(['openai', 'anthropic', 'bedrock', 'local'] as LLMProvider[]).map(
                      (provider) => (
                        <button
                          key={provider}
                          onClick={() => setAddingModel(provider)}
                          className={`flex-1 px-2 py-1.5 text-xs ${
                            addingModel === provider
                              ? 'bg-zinc-700 text-zinc-200'
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {provider}
                        </button>
                      )
                    )}
                  </div>
                  <div className="max-h-40 overflow-auto">
                    {(availableModels[addingModel] || []).map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          addCustomModel(addingModel, model.id)
                          setAddingModel(null)
                        }}
                        className="w-full px-3 py-2 text-left text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                      >
                        {model.name || model.id}
                      </button>
                    ))}
                    {(availableModels[addingModel] || []).length === 0 && (
                      <div className="px-3 py-2 text-xs text-zinc-500">
                        No models available
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="flex items-center gap-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Runs per Model</label>
          <select
            value={runsPerModel}
            onChange={(e) => setRunsPerModel(Number(e.target.value))}
            className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm"
          >
            <option value={1}>1 run</option>
            <option value={3}>3 runs</option>
            <option value={5}>5 runs</option>
            <option value={10}>10 runs</option>
          </select>
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={onRun}
        disabled={isRunning || !prompt.trim() || modelsToCompare.length < 2}
        className={`w-full py-2 rounded font-medium transition-colors ${
          isRunning || !prompt.trim() || modelsToCompare.length < 2
            ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            : 'bg-indigo-500 text-white hover:bg-indigo-600'
        }`}
      >
        {isRunning ? 'Running...' : 'Run Comparison'}
      </button>
    </div>
  )
}

interface ResultsViewProps {
  results: ComparisonResult[]
  onDelete: (id: string) => void
  getWinner: (resultId: string) => ComparisonModelConfig | null
}

function ResultsView({ results, onDelete, getWinner }: ResultsViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        No comparison results yet
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {results.map((result) => {
        const winner = getWinner(result.id)
        const expanded = expandedId === result.id

        return (
          <div
            key={result.id}
            className="bg-zinc-800 rounded overflow-hidden"
          >
            {/* Summary header */}
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-zinc-700/50"
              onClick={() => setExpandedId(expanded ? null : result.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500">
                  {new Date(result.metadata.startedAt).toLocaleString()}
                </span>
                <span className="text-sm truncate max-w-[200px]">
                  {result.request.prompt.slice(0, 40)}...
                </span>
              </div>
              <div className="flex items-center gap-2">
                {winner && (
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                    Winner: {winner.label || winner.modelId}
                  </span>
                )}
                <span className="text-xs text-zinc-500">
                  {result.results.length} results
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(result.id)
                  }}
                  className="text-zinc-500 hover:text-red-400 ml-2"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Expanded details */}
            {expanded && (
              <div className="border-t border-zinc-700 p-3 space-y-3">
                {/* Stats comparison */}
                <div className="grid grid-cols-2 gap-2">
                  {result.stats.map((stat) => (
                    <div
                      key={`${stat.model.provider}-${stat.model.modelId}`}
                      className={`p-2 rounded ${
                        winner?.modelId === stat.model.modelId
                          ? 'bg-emerald-500/10 border border-emerald-500/30'
                          : 'bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <ProviderBadge provider={stat.model.provider} />
                        <span className="text-sm font-medium">
                          {stat.model.label || stat.model.modelId}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div className="text-zinc-500">Success Rate:</div>
                        <div>{(stat.successRate * 100).toFixed(0)}%</div>
                        <div className="text-zinc-500">Avg Latency:</div>
                        <div>{stat.avgLatencyMs.toFixed(0)}ms</div>
                        <div className="text-zinc-500">Tokens:</div>
                        <div>{stat.totalInputTokens + stat.totalOutputTokens}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Individual responses */}
                <div>
                  <div className="text-xs text-zinc-500 mb-2">Responses</div>
                  <div className="space-y-2">
                    {result.results.map((r, i) => (
                      <div key={i} className="p-2 bg-zinc-900 rounded">
                        <div className="flex items-center gap-2 mb-1">
                          <ProviderBadge provider={r.model.provider} />
                          <span className="text-xs text-zinc-400">
                            {r.latencyMs}ms
                          </span>
                          {r.status === 'failed' && (
                            <span className="text-xs text-red-400">Failed</span>
                          )}
                        </div>
                        {r.response ? (
                          <pre className="text-xs text-zinc-300 whitespace-pre-wrap max-h-32 overflow-auto">
                            {r.response.text}
                          </pre>
                        ) : r.error ? (
                          <pre className="text-xs text-red-400">{r.error}</pre>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ProviderBadge({ provider }: { provider: LLMProvider }) {
  const colors: Record<LLMProvider, string> = {
    openai: 'bg-green-500/20 text-green-400',
    anthropic: 'bg-orange-500/20 text-orange-400',
    bedrock: 'bg-amber-500/20 text-amber-400',
    local: 'bg-purple-500/20 text-purple-400',
  }

  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[provider]}`}>
      {provider}
    </span>
  )
}

export default ModelComparison
