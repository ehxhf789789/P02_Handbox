/**
 * LLM Provider store — manages LLM connections and invocations.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ModelInfo,
  ConnectionResult,
  EmbeddingRequest,
  EmbeddingResponse,
} from '@/types'

/** Credential status from backend */
interface CredentialStatus {
  has_bedrock: boolean
  bedrock_region: string | null
  has_openai: boolean
  has_anthropic: boolean
  local_endpoint: string | null
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

  /** Loading states */
  isConnecting: boolean
  isInvoking: boolean

  /** Actions */
  setActiveProvider: (provider: LLMProvider) => void
  setSelectedModel: (provider: LLMProvider, modelId: string) => void
  setConfig: <T extends LLMProvider>(provider: T, config: LLMState['config'][T]) => void

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
  invokeLLM: (request: LLMRequest) => Promise<LLMResponse>
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

      loadCredentialStatus: async () => {
        try {
          const status = await invoke<CredentialStatus>('get_credential_status')
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
        try {
          const result = await invoke<boolean>('set_bedrock_credentials', { accessKeyId, secretAccessKey, region })
          if (region) {
            set((state) => ({
              config: { ...state.config, bedrock: { region } },
            }))
          }
          return result
        } catch (error) {
          console.error('Failed to set Bedrock credentials:', error)
          return false
        }
      },

      setBedrockRegion: async (region) => {
        try {
          const result = await invoke<boolean>('set_bedrock_region', { region })
          set((state) => ({
            config: { ...state.config, bedrock: { region } },
          }))
          return result
        } catch (error) {
          console.error('Failed to set Bedrock region:', error)
          return false
        }
      },

      clearLLMCredentials: async () => {
        try {
          return await invoke<boolean>('clear_llm_credentials')
        } catch (error) {
          console.error('Failed to clear LLM credentials:', error)
          return false
        }
      },

      setOpenAIApiKey: async (apiKey) => {
        try {
          return await invoke<boolean>('set_openai_api_key', { apiKey })
        } catch (error) {
          console.error('Failed to set OpenAI API key:', error)
          return false
        }
      },

      setAnthropicApiKey: async (apiKey) => {
        try {
          return await invoke<boolean>('set_anthropic_api_key', { apiKey })
        } catch (error) {
          console.error('Failed to set Anthropic API key:', error)
          return false
        }
      },

      setLocalEndpoint: async (endpoint) => {
        try {
          const result = await invoke<boolean>('set_local_llm_endpoint', { endpoint })
          set((state) => ({
            config: { ...state.config, local: { endpoint } },
          }))
          return result
        } catch (error) {
          console.error('Failed to set local LLM endpoint:', error)
          return false
        }
      },

      testConnection: async (provider) => {
        set({ isConnecting: true })
        try {
          const result = await invoke<ConnectionResult>('test_llm_connection', { provider })
          set((state) => ({
            connectionStatus: { ...state.connectionStatus, [provider]: result },
            isConnecting: false,
          }))
          return result
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
        try {
          const models = await invoke<ModelInfo[]>('list_llm_models', { provider })
          set((state) => ({
            models: { ...state.models, [provider]: models },
          }))
          return models
        } catch (error) {
          console.error('Failed to load models:', error)
          return []
        }
      },

      invokeLLM: async (request) => {
        set({ isInvoking: true })
        try {
          const { activeProvider, selectedModel } = get()
          const fullRequest = {
            prompt: request.prompt,
            system_prompt: request.systemPrompt,
            model_id: request.modelId || selectedModel[activeProvider],
            max_tokens: request.maxTokens || 4096,
            temperature: request.temperature || 0.7,
            provider: request.provider || activeProvider,
          }
          const result = await invoke<LLMResponse>('invoke_llm', { request: fullRequest })
          set({ isInvoking: false })
          return result
        } catch (error) {
          set({ isInvoking: false })
          throw error
        }
      },

      createEmbedding: async (request) => {
        try {
          const result = await invoke<EmbeddingResponse>('create_embedding', { request })
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
      }),
    }
  )
)
