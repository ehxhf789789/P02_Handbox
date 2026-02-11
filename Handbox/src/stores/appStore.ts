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

// KISTI ScienceON 인증 상태 (레거시 - externalAPIs로 통합 예정)
interface KISTIAuthStatus {
  authenticated: boolean
  clientId: string
  authKey: string
  hardwareKey: string
  lastVerified?: string
  error?: string
}

// ========================================
// 외부 API 통합 관리 시스템
// ========================================

// 외부 API 타입 정의
export type ExternalAPIType =
  | 'kisti'      // KISTI ScienceON (논문/특허/보고서/동향)
  | 'kipris'     // 특허정보검색서비스 (특허청)
  | 'kaia'       // 한국건설기술연구원
  | 'ntis'       // 국가과학기술지식정보서비스
  | 'riss'       // 학술연구정보서비스
  | 'data_go_kr' // 공공데이터포털
  | 'kosis'      // 국가통계포털
  | 'custom'     // 사용자 정의 API

// 외부 API 설정 인터페이스
export interface ExternalAPIConfig {
  id: ExternalAPIType
  name: string
  description: string
  baseUrl: string
  docsUrl: string  // API 문서/신청 페이지
  enabled: boolean
  // 인증 정보 (API별로 다름)
  credentials: {
    apiKey?: string
    clientId?: string
    authKey?: string
    hardwareKey?: string  // KISTI 전용
    secretKey?: string
  }
  // 마지막 테스트 결과
  lastTested?: string
  lastTestResult?: 'success' | 'failed'
  testError?: string
}

// 기본 외부 API 설정
export const DEFAULT_EXTERNAL_APIS: Record<ExternalAPIType, Omit<ExternalAPIConfig, 'credentials' | 'enabled'>> = {
  kisti: {
    id: 'kisti',
    name: 'KISTI ScienceON',
    description: '국내외 학술논문, 특허, 보고서, 과학기술동향 검색',
    baseUrl: 'https://scienceon.kisti.re.kr/openApi',
    docsUrl: 'https://scienceon.kisti.re.kr/openApi/openApiInfo.do',
  },
  kipris: {
    id: 'kipris',
    name: 'KIPRIS 특허정보',
    description: '특허, 실용신안, 디자인, 상표 검색 (특허청)',
    baseUrl: 'http://plus.kipris.or.kr/openapi/rest',
    docsUrl: 'http://plus.kipris.or.kr/portal/data/service/DBII_000000000000001/view.do',
  },
  kaia: {
    id: 'kaia',
    name: 'KAIA 건설기술정보',
    description: '건설신기술, 건설연구과제, 건설기준 정보',
    baseUrl: 'https://www.kaia.re.kr/portal/openApi',
    docsUrl: 'https://www.kaia.re.kr/portal/bbs/myList/B0000052.do?menuNo=200024',
  },
  ntis: {
    id: 'ntis',
    name: 'NTIS 국가R&D',
    description: '국가연구개발사업, 연구자, 연구성과 정보',
    baseUrl: 'https://www.ntis.go.kr/openApi',
    docsUrl: 'https://www.ntis.go.kr/rndopen/openApi/openApiInfo.do',
  },
  riss: {
    id: 'riss',
    name: 'RISS 학술연구',
    description: '국내 학위논문, 학술지, 단행본 검색',
    baseUrl: 'http://www.riss.kr/openapi',
    docsUrl: 'https://www.riss.kr/AboutRiss/OpenApi.do',
  },
  data_go_kr: {
    id: 'data_go_kr',
    name: '공공데이터포털',
    description: '정부/공공기관 오픈 데이터',
    baseUrl: 'https://apis.data.go.kr',
    docsUrl: 'https://www.data.go.kr/',
  },
  kosis: {
    id: 'kosis',
    name: 'KOSIS 국가통계',
    description: '국가승인통계, 통계청 데이터',
    baseUrl: 'https://kosis.kr/openapi',
    docsUrl: 'https://kosis.kr/openapi/index.do',
  },
  custom: {
    id: 'custom',
    name: '사용자 정의 API',
    description: '직접 설정한 외부 API',
    baseUrl: '',
    docsUrl: '',
  },
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

// 외부 API 캐시 (AI 분석 결과 저장)
export interface APISchemaCache {
  [apiKey: string]: {
    name: string
    baseUrl: string
    endpoints: Array<{
      path: string
      method: string
      description: string
      parameters: Array<{
        name: string
        type: string
        required: boolean
        description: string
      }>
    }>
    analyzedAt: string
  }
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

interface AppState {
  isAuthenticated: boolean
  awsStatus: AWSStatus | null
  kistiStatus: KISTIAuthStatus | null  // KISTI 인증 상태
  currentWorkflowId: string | null
  sidebarOpen: boolean

  // AWS 연결 사용 여부 (선택적)
  useAWSConnection: boolean
  // KISTI 연결 사용 여부
  useKISTIConnection: boolean

  // AI 모델 설정
  aiModelConfig: AIModelConfig

  // 외부 API 스키마 캐시
  apiSchemaCache: APISchemaCache

  // MCP 서버 설정
  mcpServers: MCPServerConfig[]

  // 저장 경로 설정
  storagePaths: StoragePaths

  // 외부 API 설정 (통합 관리)
  externalAPIs: Record<ExternalAPIType, ExternalAPIConfig>

  // Actions
  setAuthenticated: (value: boolean) => void
  setAWSStatus: (status: AWSStatus) => void
  setKISTIStatus: (status: KISTIAuthStatus | null) => void  // KISTI 상태 설정
  setCurrentWorkflowId: (id: string | null) => void
  toggleSidebar: () => void
  logout: () => void
  setUseAWSConnection: (value: boolean) => void
  setUseKISTIConnection: (value: boolean) => void  // KISTI 연결 설정
  skipAWSLogin: () => void

  // AI 모델 설정 액션
  setAIModelConfig: (config: Partial<AIModelConfig>) => void

  // API 캐시 액션
  setAPISchemaCache: (key: string, schema: APISchemaCache[string]) => void
  clearAPISchemaCache: () => void

  // MCP 서버 액션
  addMCPServer: (server: MCPServerConfig) => void
  removeMCPServer: (id: string) => void
  updateMCPServer: (id: string, updates: Partial<MCPServerConfig>) => void

  // 저장 경로 설정 액션
  setStoragePaths: (paths: Partial<StoragePaths>) => void

  // 외부 API 관리 액션
  setExternalAPIConfig: (apiType: ExternalAPIType, config: Partial<ExternalAPIConfig>) => void
  setExternalAPICredentials: (apiType: ExternalAPIType, credentials: ExternalAPIConfig['credentials']) => void
  enableExternalAPI: (apiType: ExternalAPIType, enabled: boolean) => void
  setExternalAPITestResult: (apiType: ExternalAPIType, result: 'success' | 'failed', error?: string) => void
  getExternalAPIConfig: (apiType: ExternalAPIType) => ExternalAPIConfig
  isExternalAPIEnabled: (apiType: ExternalAPIType) => boolean
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
  maxTokens: 4096,
}

// 기본 저장 경로 설정
const defaultStoragePaths: StoragePaths = {
  workflowsDir: './handbox-data/workflows',
  templatesDir: './handbox-data/templates',
  outputDir: './handbox-data/output',
}

// 기본 외부 API 설정 초기화
const initializeExternalAPIs = (): Record<ExternalAPIType, ExternalAPIConfig> => {
  const apis: Record<ExternalAPIType, ExternalAPIConfig> = {} as Record<ExternalAPIType, ExternalAPIConfig>
  for (const [key, value] of Object.entries(DEFAULT_EXTERNAL_APIS)) {
    apis[key as ExternalAPIType] = {
      ...value,
      enabled: false,
      credentials: {},
    }
  }
  return apis
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      awsStatus: null,
      kistiStatus: null,  // KISTI 초기 상태
      currentWorkflowId: null,
      sidebarOpen: true,
      useAWSConnection: false, // AWS 연결은 선택적
      useKISTIConnection: false, // KISTI 연결은 선택적
      aiModelConfig: defaultAIModelConfig,
      apiSchemaCache: {},
      mcpServers: [],
      storagePaths: defaultStoragePaths,
      externalAPIs: initializeExternalAPIs(),

      setAuthenticated: (value) => set({ isAuthenticated: value }),
      setAWSStatus: (status) => set({ awsStatus: status }),
      setKISTIStatus: (status) => set({ kistiStatus: status }),
      setCurrentWorkflowId: (id) => set({ currentWorkflowId: id }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      logout: () => set({ isAuthenticated: false, awsStatus: null, kistiStatus: null, useAWSConnection: false, useKISTIConnection: false }),
      setUseAWSConnection: (value) => set({ useAWSConnection: value }),
      setUseKISTIConnection: (value) => set({ useKISTIConnection: value }),

      // AWS 로그인 스킵 - 바로 메인 화면으로 진입
      skipAWSLogin: () => set({ isAuthenticated: true, useAWSConnection: false }),

      setAIModelConfig: (config) => set((state) => ({
        aiModelConfig: { ...state.aiModelConfig, ...config }
      })),

      setAPISchemaCache: (key, schema) => set((state) => ({
        apiSchemaCache: { ...state.apiSchemaCache, [key]: schema }
      })),

      clearAPISchemaCache: () => set({ apiSchemaCache: {} }),

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

      // 외부 API 관리 액션
      setExternalAPIConfig: (apiType, config) => set((state) => ({
        externalAPIs: {
          ...state.externalAPIs,
          [apiType]: { ...state.externalAPIs[apiType], ...config }
        }
      })),

      setExternalAPICredentials: (apiType, credentials) => set((state) => ({
        externalAPIs: {
          ...state.externalAPIs,
          [apiType]: {
            ...state.externalAPIs[apiType],
            credentials: { ...state.externalAPIs[apiType].credentials, ...credentials }
          }
        }
      })),

      enableExternalAPI: (apiType, enabled) => set((state) => ({
        externalAPIs: {
          ...state.externalAPIs,
          [apiType]: { ...state.externalAPIs[apiType], enabled }
        }
      })),

      setExternalAPITestResult: (apiType, result, error) => set((state) => ({
        externalAPIs: {
          ...state.externalAPIs,
          [apiType]: {
            ...state.externalAPIs[apiType],
            lastTested: new Date().toISOString(),
            lastTestResult: result,
            testError: error
          }
        }
      })),

      getExternalAPIConfig: (apiType: ExternalAPIType): ExternalAPIConfig => {
        const state: AppState = useAppStore.getState()
        return state.externalAPIs[apiType]
      },

      isExternalAPIEnabled: (apiType: ExternalAPIType): boolean => {
        const state: AppState = useAppStore.getState()
        const api: ExternalAPIConfig = state.externalAPIs[apiType]
        if (!api || !api.enabled) return false
        // API 키가 설정되어 있는지 확인
        const creds: ExternalAPIConfig['credentials'] = api.credentials
        return !!(creds.apiKey || creds.clientId || creds.authKey)
      },
    }),
    {
      name: 'handbox-app', // 앱 이름 변경
      partialize: (state) => ({
        aiModelConfig: state.aiModelConfig,
        apiSchemaCache: state.apiSchemaCache,
        mcpServers: state.mcpServers,
        storagePaths: state.storagePaths,
        useAWSConnection: state.useAWSConnection,
        useKISTIConnection: state.useKISTIConnection,
        kistiStatus: state.kistiStatus,  // KISTI 인증 정보 저장 (레거시)
        externalAPIs: state.externalAPIs,  // 외부 API 설정 저장
      }),
    }
  )
)
