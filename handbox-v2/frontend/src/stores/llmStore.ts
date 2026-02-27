/**
 * LLM Provider store — manages LLM connections and invocations.
 *
 * Features:
 * - Multi-provider support (Bedrock, OpenAI, Anthropic, Local)
 * - Per-node model override
 * - Automatic trace capture for debugging
 * - Fallback chain support
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isTauri, safeInvoke } from '@/utils/tauri'
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ModelInfo,
  ConnectionResult,
  EmbeddingRequest,
  EmbeddingResponse,
  NodeModelOverride,
  WorkflowModelConfig,
} from '@/types'
import { useTraceStore } from './traceStore'

/** Credential status from backend */
interface CredentialStatus {
  has_bedrock: boolean
  bedrock_region: string | null
  has_openai: boolean
  has_anthropic: boolean
  local_endpoint: string | null
}

/** Extended LLM request with node context */
interface LLMRequestWithContext extends LLMRequest {
  /** Node ID for per-node model override */
  nodeId?: string
  /** Execution ID for trace correlation */
  executionId?: string
  /** Enable trace capture (default: true) */
  enableTrace?: boolean
}

interface LLMState {
  /** Current active provider */
  activeProvider: LLMProvider

  /** Connection status per provider */
  connectionStatus: Record<LLMProvider, ConnectionResult | null>

  /** Available models per provider */
  models: Record<LLMProvider, ModelInfo[]>

  /** Selected model per provider */
  selectedModel: Record<LLMProvider, string>

  /** Saved credential status (from backend) */
  credentialStatus: CredentialStatus | null

  /** Provider configurations (persisted) */
  config: {
    bedrock: { region: string }
    openai: {}
    anthropic: {}
    local: { endpoint: string }
  }

  /** Workflow-level model configuration */
  workflowModelConfig: WorkflowModelConfig | null

  /** Per-node model overrides (for current workflow) */
  nodeOverrides: NodeModelOverride[]

  /** Fallback chain configuration */
  fallbackEnabled: boolean

  /** Loading states */
  isConnecting: boolean
  isInvoking: boolean

  /** Actions */
  setActiveProvider: (provider: LLMProvider) => void
  setSelectedModel: (provider: LLMProvider, modelId: string) => void
  setConfig: <T extends LLMProvider>(provider: T, config: LLMState['config'][T]) => void

  /** Per-node model override actions */
  setNodeOverride: (nodeId: string, provider: LLMProvider, modelId: string, reason?: string) => void
  removeNodeOverride: (nodeId: string) => void
  clearNodeOverrides: () => void
  getModelForNode: (nodeId: string) => { provider: LLMProvider; modelId: string }

  /** Workflow model config actions */
  setWorkflowModelConfig: (config: WorkflowModelConfig | null) => void
  setFallbackEnabled: (enabled: boolean) => void

  /** API calls */
  loadCredentialStatus: () => Promise<CredentialStatus>
  setBedrockCredentials: (accessKeyId: string, secretAccessKey: string, region?: string) => Promise<boolean>
  setBedrockRegion: (region: string) => Promise<boolean>
  setAnthropicApiKey: (apiKey: string) => Promise<boolean>
  clearLLMCredentials: () => Promise<boolean>
  setOpenAIApiKey: (apiKey: string) => Promise<boolean>
  setLocalEndpoint: (endpoint: string) => Promise<boolean>
  testConnection: (provider: LLMProvider) => Promise<ConnectionResult>
  loadModels: (provider: LLMProvider) => Promise<ModelInfo[]>
  invokeLLM: (request: LLMRequestWithContext) => Promise<LLMResponse>
  invokeLLMWithFallback: (request: LLMRequestWithContext) => Promise<LLMResponse>
  createEmbedding: (request: EmbeddingRequest) => Promise<EmbeddingResponse>
}

export const useLLMStore = create<LLMState>()(
  persist(
    (set, get) => ({
      activeProvider: 'local',
      connectionStatus: {
        bedrock: null,
        openai: null,
        anthropic: null,
        local: null,
      },
      models: {
        bedrock: [],
        openai: [],
        anthropic: [],
        local: [],
      },
      selectedModel: {
        bedrock: 'anthropic.anthropic-3-5-sonnet-20240620-v1:0',
        openai: 'gpt-4o',
        anthropic: 'anthropic-sonnet-4-20250514',
        local: 'llama3.2',
      },
      credentialStatus: null,
      config: {
        bedrock: { region: 'us-east-1' },
        openai: {},
        anthropic: {},
        local: { endpoint: 'http://localhost:11434' },
      },
      workflowModelConfig: null,
      nodeOverrides: [],
      fallbackEnabled: true,
      isConnecting: false,
      isInvoking: false,

      setActiveProvider: (provider) => set({ activeProvider: provider }),

      setSelectedModel: (provider, modelId) =>
        set((state) => ({
          selectedModel: { ...state.selectedModel, [provider]: modelId },
        })),

      setConfig: (provider, config) =>
        set((state) => ({
          config: { ...state.config, [provider]: config },
        })),

      // Per-node model override methods
      setNodeOverride: (nodeId, provider, modelId, reason) => {
        set((state) => {
          const existing = state.nodeOverrides.filter((o) => o.nodeId !== nodeId)
          return {
            nodeOverrides: [...existing, { nodeId, provider, modelId, reason }],
          }
        })
      },

      removeNodeOverride: (nodeId) => {
        set((state) => ({
          nodeOverrides: state.nodeOverrides.filter((o) => o.nodeId !== nodeId),
        }))
      },

      clearNodeOverrides: () => {
        set({ nodeOverrides: [] })
      },

      getModelForNode: (nodeId) => {
        const state = get()
        const override = state.nodeOverrides.find((o) => o.nodeId === nodeId)
        if (override) {
          return { provider: override.provider, modelId: override.modelId }
        }
        // Fall back to workflow config or active provider
        if (state.workflowModelConfig) {
          const nodeOverride = state.workflowModelConfig.nodeOverrides.find(
            (o) => o.nodeId === nodeId
          )
          if (nodeOverride) {
            return { provider: nodeOverride.provider, modelId: nodeOverride.modelId }
          }
          return {
            provider: state.workflowModelConfig.defaultProvider,
            modelId: state.workflowModelConfig.defaultModelId,
          }
        }
        return {
          provider: state.activeProvider,
          modelId: state.selectedModel[state.activeProvider],
        }
      },

      setWorkflowModelConfig: (config) => {
        set({ workflowModelConfig: config })
      },

      setFallbackEnabled: (enabled) => {
        set({ fallbackEnabled: enabled })
      },

      loadCredentialStatus: async () => {
        if (!isTauri()) {
          console.warn('[llmStore] Not in Tauri environment')
          return { has_bedrock: false, bedrock_region: null, has_openai: false, has_anthropic: false, local_endpoint: null }
        }
        try {
          const status = await safeInvoke<CredentialStatus>('get_credential_status')
          if (!status) {
            return { has_bedrock: false, bedrock_region: null, has_openai: false, has_anthropic: false, local_endpoint: null }
          }
          set({ credentialStatus: status })
          // Update local config from saved credentials
          if (status.bedrock_region) {
            set((state) => ({
              config: { ...state.config, bedrock: { region: status.bedrock_region! } },
            }))
          }
          if (status.local_endpoint) {
            set((state) => ({
              config: { ...state.config, local: { endpoint: status.local_endpoint! } },
            }))
          }
          return status
        } catch (error) {
          console.error('Failed to load credential status:', error)
          return { has_bedrock: false, bedrock_region: null, has_openai: false, has_anthropic: false, local_endpoint: null }
        }
      },

      setBedrockCredentials: async (accessKeyId, secretAccessKey, region) => {
        if (!isTauri()) {
          console.warn('[llmStore] Not in Tauri environment')
          return false
        }
        try {
          const result = await safeInvoke<boolean>('set_bedrock_credentials', { accessKeyId, secretAccessKey, region })
          if (result && region) {
            set((state) => ({
              config: { ...state.config, bedrock: { region } },
            }))
          }
          return result ?? false
        } catch (error) {
          console.error('Failed to set Bedrock credentials:', error)
          return false
        }
      },

      setBedrockRegion: async (region) => {
        if (!isTauri()) return false
        try {
          const result = await safeInvoke<boolean>('set_bedrock_region', { region })
          if (result) {
            set((state) => ({
              config: { ...state.config, bedrock: { region } },
            }))
          }
          return result ?? false
        } catch (error) {
          console.error('Failed to set Bedrock region:', error)
          return false
        }
      },

      clearLLMCredentials: async () => {
        if (!isTauri()) return false
        try {
          return (await safeInvoke<boolean>('clear_llm_credentials')) ?? false
        } catch (error) {
          console.error('Failed to clear LLM credentials:', error)
          return false
        }
      },

      setOpenAIApiKey: async (apiKey) => {
        if (!isTauri()) return false
        try {
          return (await safeInvoke<boolean>('set_openai_api_key', { apiKey })) ?? false
        } catch (error) {
          console.error('Failed to set OpenAI API key:', error)
          return false
        }
      },

      setAnthropicApiKey: async (apiKey) => {
        if (!isTauri()) return false
        try {
          return (await safeInvoke<boolean>('set_anthropic_api_key', { apiKey })) ?? false
        } catch (error) {
          console.error('Failed to set Anthropic API key:', error)
          return false
        }
      },

      setLocalEndpoint: async (endpoint) => {
        if (!isTauri()) return false
        try {
          const result = await safeInvoke<boolean>('set_local_llm_endpoint', { endpoint })
          if (result) {
            set((state) => ({
              config: { ...state.config, local: { endpoint } },
            }))
          }
          return result ?? false
        } catch (error) {
          console.error('Failed to set local LLM endpoint:', error)
          return false
        }
      },

      testConnection: async (provider) => {
        set({ isConnecting: true })
        if (!isTauri()) {
          const errorResult: ConnectionResult = {
            connected: false,
            provider,
            error: 'Not in Tauri environment',
          }
          set((state) => ({
            connectionStatus: { ...state.connectionStatus, [provider]: errorResult },
            isConnecting: false,
          }))
          return errorResult
        }
        try {
          const result = await safeInvoke<ConnectionResult>('test_llm_connection', { provider })
          if (result) {
            set((state) => ({
              connectionStatus: { ...state.connectionStatus, [provider]: result },
              isConnecting: false,
            }))
            return result
          }
          throw new Error('No result from backend')
        } catch (error) {
          const errorResult: ConnectionResult = {
            connected: false,
            provider,
            error: String(error),
          }
          set((state) => ({
            connectionStatus: { ...state.connectionStatus, [provider]: errorResult },
            isConnecting: false,
          }))
          return errorResult
        }
      },

      loadModels: async (provider) => {
        if (!isTauri()) return []
        try {
          const models = await safeInvoke<ModelInfo[]>('list_llm_models', { provider })
          if (models) {
            set((state) => ({
              models: { ...state.models, [provider]: models },
            }))
            return models
          }
          return []
        } catch (error) {
          console.error('Failed to load models:', error)
          return []
        }
      },

      invokeLLM: async (request) => {
        set({ isInvoking: true })
        const traceStore = useTraceStore.getState()

        if (!isTauri()) {
          set({ isInvoking: false })
          throw new Error('Not in Tauri environment - LLM invocation requires native app')
        }

        // Determine model based on node override if nodeId provided
        let provider = request.provider
        let modelId = request.modelId

        if (request.nodeId) {
          const nodeModel = get().getModelForNode(request.nodeId)
          provider = provider || nodeModel.provider
          modelId = modelId || nodeModel.modelId
        }

        const { activeProvider, selectedModel } = get()
        provider = provider || activeProvider
        modelId = modelId || selectedModel[provider]

        // Start trace if enabled (default: true)
        const enableTrace = request.enableTrace !== false
        const traceId = enableTrace
          ? traceStore.startLLMTrace(
              provider,
              modelId,
              request.prompt,
              request.systemPrompt,
              request.nodeId,
              request.executionId
            )
          : ''

        try {
          const fullRequest = {
            prompt: request.prompt,
            system_prompt: request.systemPrompt,
            model_id: modelId,
            max_tokens: request.maxTokens || 4096,
            temperature: request.temperature || 0.7,
            provider: provider,
          }
          const result = await safeInvoke<LLMResponse>('invoke_llm', { request: fullRequest })

          if (!result) {
            throw new Error('No response from LLM backend')
          }

          // End trace with success
          if (enableTrace && traceId) {
            traceStore.endLLMTrace(traceId, result)
          }

          set({ isInvoking: false })
          return result
        } catch (error) {
          // End trace with error
          if (enableTrace && traceId) {
            traceStore.endLLMTrace(traceId, undefined, String(error))
          }

          set({ isInvoking: false })
          throw error
        }
      },

      invokeLLMWithFallback: async (request) => {
        const { fallbackEnabled, workflowModelConfig, activeProvider, selectedModel } = get()

        // Build fallback chain
        const fallbackChain = workflowModelConfig?.fallbackChain || [
          // Default fallback chain: try local first, then cloud
          { provider: 'local' as LLMProvider, modelId: 'llama3.2' },
          { provider: 'openai' as LLMProvider, modelId: 'gpt-4o-mini' },
          { provider: 'anthropic' as LLMProvider, modelId: 'anthropic-sonnet-4-20250514' },
        ]

        // Primary model
        const primary = request.nodeId
          ? get().getModelForNode(request.nodeId)
          : {
              provider: request.provider || activeProvider,
              modelId: request.modelId || selectedModel[request.provider || activeProvider],
            }

        const modelsToTry = [
          primary,
          ...(fallbackEnabled ? fallbackChain : []),
        ]

        let lastError: Error | null = null

        for (const model of modelsToTry) {
          try {
            const result = await get().invokeLLM({
              ...request,
              provider: model.provider,
              modelId: model.modelId,
            })
            return result
          } catch (error) {
            console.warn(
              `[LLM Fallback] ${model.provider}/${model.modelId} failed:`,
              error
            )
            lastError = error instanceof Error ? error : new Error(String(error))
          }
        }

        throw lastError || new Error('All models in fallback chain failed')
      },

      createEmbedding: async (request) => {
        if (!isTauri()) {
          throw new Error('Not in Tauri environment - Embedding creation requires native app')
        }
        try {
          const result = await safeInvoke<EmbeddingResponse>('create_embedding', { request })
          if (!result) {
            throw new Error('No response from embedding backend')
          }
          return result
        } catch (error) {
          throw error
        }
      },
    }),
    {
      name: 'handbox-llm-config',
      partialize: (state) => ({
        activeProvider: state.activeProvider,
        selectedModel: state.selectedModel,
        config: state.config,
        fallbackEnabled: state.fallbackEnabled,
        // Note: nodeOverrides are workflow-specific, not persisted globally
      }),
    }
  )
)
