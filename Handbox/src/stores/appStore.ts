import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AWSStatus {
  connected: boolean
  region: string
  services: Array<{
    name: string
    available: boolean
    error?: string
  }>
}

// AI 모델 프로바이더 타입
export type AIProvider = 'bedrock' | 'openai' | 'anthropic' | 'azure' | 'google' | 'ollama' | 'custom'

// AI 모델 설정
export interface AIModelConfig {
  provider: AIProvider
  // Bedrock (AWS) 설정 - 선택적
  bedrockModel: string
  // OpenAI 설정
  openaiApiKey: string
  openaiModel: string
  openaiBaseUrl: string
  // Anthropic 직접 연결 설정
  anthropicApiKey: string
  anthropicModel: string
  // Azure OpenAI 설정
  azureApiKey: string
  azureEndpoint: string
  azureDeployment: string
  // Google AI (Gemini) 설정
  googleApiKey: string
  googleModel: string
  // Ollama (로컬 LLM) 설정
  ollamaBaseUrl: string
  ollamaModel: string
  // Custom API 설정
  customApiKey: string
  customBaseUrl: string
  customModel: string
  // 공통 설정
  temperature: number
  maxTokens: number
}

// MCP 서버 설정
export interface MCPServerConfig {
  id: string
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  enabled: boolean
  status: 'connected' | 'disconnected' | 'error'
  error?: string
  tools?: Array<{
    name: string
    description: string
    inputSchema: Record<string, unknown>
  }>
  resources?: Array<{
    uri: string
    name: string
    description: string
  }>
}

// 워크플로우 저장 경로 설정
export interface StoragePaths {
  workflowsDir: string  // 워크플로우 저장 경로
  templatesDir: string  // 템플릿 저장 경로
  outputDir: string     // 출력 파일 경로
}

// 저장소 모드 (로컬/클라우드)
export type StorageMode = 'local-sqlite' | 'local-json' | 'cloud-s3' | 'cloud-vector'

interface AppState {
  isAuthenticated: boolean
  awsStatus: AWSStatus | null
  currentWorkflowId: string | null
  sidebarOpen: boolean

  // AWS 연결 사용 여부 (선택적)
  useAWSConnection: boolean

  // AI 모델 설정
  aiModelConfig: AIModelConfig

  // MCP 서버 설정
  mcpServers: MCPServerConfig[]

  // 저장 경로 설정
  storagePaths: StoragePaths

  // 저장소 모드
  storageMode: StorageMode

  // Actions
  setAuthenticated: (value: boolean) => void
  setAWSStatus: (status: AWSStatus | null) => void
  setCurrentWorkflowId: (id: string | null) => void
  toggleSidebar: () => void
  logout: () => void
  setUseAWSConnection: (value: boolean) => void
  skipAWSLogin: () => void

  // AI 모델 설정 액션
  setAIModelConfig: (config: Partial<AIModelConfig>) => void

  // MCP 서버 액션
  addMCPServer: (server: MCPServerConfig) => void
  removeMCPServer: (id: string) => void
  updateMCPServer: (id: string, updates: Partial<MCPServerConfig>) => void

  // 저장 경로 설정 액션
  setStoragePaths: (paths: Partial<StoragePaths>) => void

  // 저장소 모드 설정
  setStorageMode: (mode: StorageMode) => void
}

// 기본 AI 모델 설정
const defaultAIModelConfig: AIModelConfig = {
  provider: 'anthropic', // 기본값을 Anthropic API로 변경 (AWS 선택적)
  // Bedrock (선택적)
  bedrockModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  // OpenAI
  openaiApiKey: '',
  openaiModel: 'gpt-4o',
  openaiBaseUrl: 'https://api.openai.com/v1',
  // Anthropic
  anthropicApiKey: '',
  anthropicModel: 'claude-3-5-sonnet-20241022',
  // Azure
  azureApiKey: '',
  azureEndpoint: '',
  azureDeployment: '',
  // Google AI (Gemini)
  googleApiKey: '',
  googleModel: 'gemini-1.5-pro',
  // Ollama (로컬)
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3',
  // Custom API
  customApiKey: '',
  customBaseUrl: '',
  customModel: '',
  // 공통
  temperature: 0.7,
  maxTokens: 8192,  // 대규모 워크플로우 (10명+ 전문가) 기본 지원
}

// 기본 저장 경로 설정
const defaultStoragePaths: StoragePaths = {
  workflowsDir: './handbox-data/workflows',
  templatesDir: './handbox-data/templates',
  outputDir: './handbox-data/output',
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      awsStatus: null,
      currentWorkflowId: null,
      sidebarOpen: true,
      useAWSConnection: false, // AWS 연결은 선택적
      aiModelConfig: defaultAIModelConfig,
      mcpServers: [],
      storagePaths: defaultStoragePaths,
      storageMode: 'local-json', // 기본값: 로컬 JSON 저장

      setAuthenticated: (value) => set({ isAuthenticated: value }),
      setAWSStatus: (status) => set({ awsStatus: status }),
      setCurrentWorkflowId: (id) => set({ currentWorkflowId: id }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      logout: () => set({ isAuthenticated: false, awsStatus: null, useAWSConnection: false }),
      setUseAWSConnection: (value) => set({ useAWSConnection: value }),

      // AWS 로그인 스킵 - 바로 메인 화면으로 진입
      skipAWSLogin: () => set({ isAuthenticated: true, useAWSConnection: false }),

      setAIModelConfig: (config) => set((state) => ({
        aiModelConfig: { ...state.aiModelConfig, ...config }
      })),

      // MCP 서버 액션
      addMCPServer: (server) => set((state) => ({
        mcpServers: [...state.mcpServers, server]
      })),

      removeMCPServer: (id) => set((state) => ({
        mcpServers: state.mcpServers.filter((s) => s.id !== id)
      })),

      updateMCPServer: (id, updates) => set((state) => ({
        mcpServers: state.mcpServers.map((s) =>
          s.id === id ? { ...s, ...updates } : s
        )
      })),

      // 저장 경로 설정
      setStoragePaths: (paths) => set((state) => ({
        storagePaths: { ...state.storagePaths, ...paths }
      })),

      // 저장소 모드 설정
      setStorageMode: (mode) => set({ storageMode: mode }),
    }),
    {
      name: 'handbox-app',
      partialize: (state) => ({
        aiModelConfig: state.aiModelConfig,
        mcpServers: state.mcpServers,
        storagePaths: state.storagePaths,
        storageMode: state.storageMode,
        useAWSConnection: state.useAWSConnection,
      }),
    }
  )
)
