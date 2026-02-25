/**
 * LLM Settings Dialog — configure LLM providers (Bedrock, OpenAI, Anthropic, Local).
 */

import { useState, useEffect } from 'react'
import { useLLMStore } from '@/stores/llmStore'
import type { LLMProvider } from '@/types'
import {
  Cloud, Key, Server, Check, X, Loader2,
  ChevronDown, RefreshCw, Settings, Sparkles,
} from 'lucide-react'

interface LLMSettingsProps {
  isOpen: boolean
  onClose: () => void
}

export function LLMSettings({ isOpen, onClose }: LLMSettingsProps) {
  const {
    activeProvider,
    connectionStatus,
    models,
    selectedModel,
    config,
    credentialStatus,
    isConnecting,
    setActiveProvider,
    setSelectedModel,
    setBedrockCredentials,
    setBedrockRegion,
    setOpenAIApiKey,
    setAnthropicApiKey,
    setLocalEndpoint,
    testConnection,
    loadModels,
    loadCredentialStatus,
  } = useLLMStore()

  // Local form state
  const [awsAccessKeyId, setAwsAccessKeyId] = useState('')
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('')
  const [bedrockRegion, setBedrockRegionInput] = useState(config.bedrock.region)
  const [openaiApiKey, setOpenaiApiKeyInput] = useState('')
  const [anthropicApiKey, setAnthropicApiKeyInput] = useState('')
  const [localEndpoint, setLocalEndpointInput] = useState(config.local.endpoint)

  // Load models and credential status when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadModels(activeProvider)
      loadCredentialStatus()
    }
  }, [isOpen, activeProvider, loadModels, loadCredentialStatus])

  // Update local state when config changes (from saved credentials)
  useEffect(() => {
    setBedrockRegionInput(config.bedrock.region)
    setLocalEndpointInput(config.local.endpoint)
  }, [config.bedrock.region, config.local.endpoint])

  if (!isOpen) return null

  const handleSaveBedrock = async () => {
    if (awsAccessKeyId && awsSecretAccessKey) {
      await setBedrockCredentials(awsAccessKeyId, awsSecretAccessKey, bedrockRegion)
      setAwsAccessKeyId('') // Clear inputs after save
      setAwsSecretAccessKey('')
    } else {
      // Only update region when testing with saved credentials
      await setBedrockRegion(bedrockRegion)
    }
    await testConnection('bedrock')
    await loadModels('bedrock')
    await loadCredentialStatus()
  }

  const handleSaveOpenAI = async () => {
    if (openaiApiKey) {
      await setOpenAIApiKey(openaiApiKey)
      setOpenaiApiKeyInput('') // Clear input after save
    }
    await testConnection('openai')
    await loadModels('openai')
    await loadCredentialStatus()
  }

  const handleSaveAnthropic = async () => {
    if (anthropicApiKey) {
      await setAnthropicApiKey(anthropicApiKey)
      setAnthropicApiKeyInput('') // Clear input after save
    }
    await testConnection('anthropic')
    await loadModels('anthropic')
    await loadCredentialStatus()
  }

  const handleSaveLocal = async () => {
    await setLocalEndpoint(localEndpoint)
    await testConnection('local')
    await loadModels('local')
    await loadCredentialStatus()
  }

  const providers: { id: LLMProvider; label: string; icon: React.ReactNode }[] = [
    { id: 'bedrock', label: 'AWS Bedrock', icon: <Cloud size={14} /> },
    { id: 'openai', label: 'OpenAI', icon: <Key size={14} /> },
    { id: 'anthropic', label: 'Anthropic', icon: <Sparkles size={14} /> },
    { id: 'local', label: 'Local (Ollama)', icon: <Server size={14} /> },
  ]

  const hasSavedCredential = (provider: LLMProvider) => {
    if (!credentialStatus) return false
    switch (provider) {
      case 'bedrock': return credentialStatus.has_bedrock
      case 'openai': return credentialStatus.has_openai
      case 'anthropic': return credentialStatus.has_anthropic
      case 'local': return !!credentialStatus.local_endpoint
      default: return false
    }
  }

  const renderStatus = (provider: LLMProvider) => {
    const status = connectionStatus[provider]
    const hasSaved = hasSavedCredential(provider)

    if (status?.connected) {
      return <Check size={12} className="text-emerald-500" />
    }
    if (status && !status.connected) {
      return <X size={12} className="text-red-500" />
    }
    if (hasSaved) {
      return <span className="text-[10px] px-1 py-0.5 rounded bg-violet-500/20 text-violet-400">saved</span>
    }
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[600px] max-h-[80vh] bg-neutral-900 rounded-xl border border-neutral-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-violet-500" />
            <span className="text-sm font-semibold text-neutral-200">LLM Provider Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300"
          >
            <X size={16} />
          </button>
        </div>

        {/* Provider tabs */}
        <div className="flex border-b border-neutral-800">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveProvider(p.id)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium transition-colors
                ${
                  activeProvider === p.id
                    ? 'text-violet-400 border-b-2 border-violet-500 bg-neutral-800/50'
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/30'
                }`}
            >
              {p.icon}
              {p.label}
              {renderStatus(p.id)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[50vh]">
          {/* Bedrock Settings */}
          {activeProvider === 'bedrock' && (
            <div className="space-y-4">
              <p className="text-xs text-neutral-500">
                Configure AWS Bedrock using IAM Access Key credentials (Signature V4).
                {credentialStatus?.has_bedrock && (
                  <span className="ml-2 text-emerald-400">(Credentials saved)</span>
                )}
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    AWS Access Key ID
                  </label>
                  <input
                    type="text"
                    value={awsAccessKeyId}
                    onChange={(e) => setAwsAccessKeyId(e.target.value)}
                    placeholder={credentialStatus?.has_bedrock ? '••••••••••••••••' : 'AKIA...'}
                    className="w-full px-3 py-2 text-xs bg-neutral-800 border border-neutral-700
                             rounded-md text-neutral-200 focus:outline-none focus:ring-1
                             focus:ring-violet-500 placeholder-neutral-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    AWS Secret Access Key
                  </label>
                  <input
                    type="password"
                    value={awsSecretAccessKey}
                    onChange={(e) => setAwsSecretAccessKey(e.target.value)}
                    placeholder={credentialStatus?.has_bedrock ? '••••••••••••••••' : 'Enter your Secret Key'}
                    className="w-full px-3 py-2 text-xs bg-neutral-800 border border-neutral-700
                             rounded-md text-neutral-200 focus:outline-none focus:ring-1
                             focus:ring-violet-500 placeholder-neutral-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Region</label>
                  <select
                    value={bedrockRegion}
                    onChange={(e) => setBedrockRegionInput(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-neutral-800 border border-neutral-700
                             rounded-md text-neutral-200 focus:outline-none focus:ring-1
                             focus:ring-violet-500"
                  >
                    <option value="us-east-1">US East (N. Virginia)</option>
                    <option value="us-west-2">US West (Oregon)</option>
                    <option value="eu-west-1">EU (Ireland)</option>
                    <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                    <option value="ap-northeast-2">Asia Pacific (Seoul)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleSaveBedrock}
                disabled={isConnecting || ((!awsAccessKeyId || !awsSecretAccessKey) && !credentialStatus?.has_bedrock)}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 text-xs font-medium
                         bg-violet-600 hover:bg-violet-500 text-white rounded-md transition-colors
                         disabled:opacity-50"
              >
                {isConnecting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {(awsAccessKeyId && awsSecretAccessKey) ? 'Save & Test Connection' : credentialStatus?.has_bedrock ? 'Test Saved Connection' : 'Save & Test Connection'}
              </button>
            </div>
          )}

          {/* OpenAI Settings */}
          {activeProvider === 'openai' && (
            <div className="space-y-4">
              <p className="text-xs text-neutral-500">
                Enter your OpenAI API key to use GPT models.
                {credentialStatus?.has_openai && (
                  <span className="ml-2 text-emerald-400">(Credentials saved)</span>
                )}
              </p>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKeyInput(e.target.value)}
                  placeholder={credentialStatus?.has_openai ? '••••••••••••••••' : 'sk-...'}
                  className="w-full px-3 py-2 text-xs bg-neutral-800 border border-neutral-700
                           rounded-md text-neutral-200 focus:outline-none focus:ring-1
                           focus:ring-violet-500 placeholder-neutral-600"
                />
              </div>

              <button
                onClick={handleSaveOpenAI}
                disabled={isConnecting || (!openaiApiKey && !credentialStatus?.has_openai)}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 text-xs font-medium
                         bg-violet-600 hover:bg-violet-500 text-white rounded-md transition-colors
                         disabled:opacity-50"
              >
                {isConnecting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {openaiApiKey ? 'Save & Test Connection' : credentialStatus?.has_openai ? 'Test Saved Connection' : 'Save & Test Connection'}
              </button>
            </div>
          )}

          {/* Anthropic Settings */}
          {activeProvider === 'anthropic' && (
            <div className="space-y-4">
              <p className="text-xs text-neutral-500">
                Enter your Anthropic API key to use Claude models.
                {credentialStatus?.has_anthropic && (
                  <span className="ml-2 text-emerald-400">(Credentials saved)</span>
                )}
              </p>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Anthropic API Key
                </label>
                <input
                  type="password"
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKeyInput(e.target.value)}
                  placeholder={credentialStatus?.has_anthropic ? '••••••••••••••••' : 'sk-ant-...'}
                  className="w-full px-3 py-2 text-xs bg-neutral-800 border border-neutral-700
                           rounded-md text-neutral-200 focus:outline-none focus:ring-1
                           focus:ring-violet-500 placeholder-neutral-600"
                />
              </div>

              <button
                onClick={handleSaveAnthropic}
                disabled={isConnecting || (!anthropicApiKey && !credentialStatus?.has_anthropic)}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 text-xs font-medium
                         bg-violet-600 hover:bg-violet-500 text-white rounded-md transition-colors
                         disabled:opacity-50"
              >
                {isConnecting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {anthropicApiKey ? 'Save & Test Connection' : credentialStatus?.has_anthropic ? 'Test Saved Connection' : 'Save & Test Connection'}
              </button>
            </div>
          )}

          {/* Local LLM Settings */}
          {activeProvider === 'local' && (
            <div className="space-y-4">
              <p className="text-xs text-neutral-500">
                Connect to a local LLM server (Ollama, LM Studio, etc.).
              </p>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Endpoint URL
                </label>
                <input
                  type="text"
                  value={localEndpoint}
                  onChange={(e) => setLocalEndpointInput(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="w-full px-3 py-2 text-xs bg-neutral-800 border border-neutral-700
                           rounded-md text-neutral-200 focus:outline-none focus:ring-1
                           focus:ring-violet-500 placeholder-neutral-600"
                />
              </div>

              <button
                onClick={handleSaveLocal}
                disabled={isConnecting}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 text-xs font-medium
                         bg-violet-600 hover:bg-violet-500 text-white rounded-md transition-colors
                         disabled:opacity-50"
              >
                {isConnecting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Save & Test Connection
              </button>
            </div>
          )}

          {/* Model Selection */}
          <div className="pt-4 border-t border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-neutral-400">Select Model</label>
              <button
                onClick={() => loadModels(activeProvider)}
                className="flex items-center gap-1 text-xs text-neutral-500 hover:text-violet-400"
              >
                <RefreshCw size={10} />
                Refresh
              </button>
            </div>

            {models[activeProvider].length === 0 ? (
              <p className="text-xs text-neutral-600 italic">
                No models available. Connect to the provider first.
              </p>
            ) : (
              <div className="relative">
                <select
                  value={selectedModel[activeProvider]}
                  onChange={(e) => setSelectedModel(activeProvider, e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-800 border border-neutral-700
                           rounded-md text-neutral-200 focus:outline-none focus:ring-1
                           focus:ring-violet-500 appearance-none pr-8"
                >
                  {models[activeProvider].map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.supportsVision && '(Vision)'}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
                />
              </div>
            )}
          </div>

          {/* Connection Status */}
          {connectionStatus[activeProvider] && (
            <div
              className={`p-3 rounded-md text-xs ${
                connectionStatus[activeProvider]?.connected
                  ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800'
                  : 'bg-red-900/30 text-red-400 border border-red-800'
              }`}
            >
              {connectionStatus[activeProvider]?.connected
                ? `Connected to ${activeProvider}${
                    connectionStatus[activeProvider]?.region
                      ? ` (${connectionStatus[activeProvider]?.region})`
                      : ''
                  }`
                : `Connection failed: ${connectionStatus[activeProvider]?.error}`}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-800 bg-neutral-900/50">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200
                     rounded-md hover:bg-neutral-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
