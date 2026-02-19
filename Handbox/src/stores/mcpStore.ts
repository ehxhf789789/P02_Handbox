// MCP Server Manager Store
// MCP 서버 프로세스 관리 및 도구 호출

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/tauri'

// ========================================
// 타입 정의
// ========================================

/** MCP 서버 상태 */
export type MCPServerStatus = 'stopped' | 'starting' | 'connected' | 'reconnecting' | 'error'

/** MCP 도구 정의 */
export interface MCPTool {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<
      string,
      {
        type: string
        description?: string
        enum?: string[]
        required?: boolean
      }
    >
    required?: string[]
  }
}

/** MCP 리소스 정의 */
export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

/** MCP 콘텐츠 */
export interface MCPContent {
  type: 'text' | 'image' | 'resource'
  text?: string
  data?: string // base64
  mimeType?: string
}

/** MCP 도구 호출 결과 */
export interface MCPToolCallResult {
  success: boolean
  content: MCPContent[]
  isError?: boolean
  error?: string
}

/** MCP 서버 설정 */
export interface MCPServerConfig {
  id: string
  name: string
  description?: string

  // 실행 설정
  command: string
  args: string[]
  env?: Record<string, string>
  cwd?: string

  // 상태
  enabled: boolean
  status: MCPServerStatus
  error?: string
  pid?: number

  // 발견된 기능
  tools: MCPTool[]
  resources: MCPResource[]
  protocolVersion?: string

  // 자동 시작 설정
  autoStart: boolean
  restartOnCrash: boolean
  maxRestarts?: number

  // 카테고리 (UI 표시용)
  category?: string
}

/** MCP 서버 시작 요청 */
interface MCPServerStartRequest {
  id: string
  command: string
  args: string[]
  env?: Record<string, string>
  cwd?: string
}

/** MCP 서버 시작 결과 */
interface MCPServerStartResult {
  success: boolean
  pid?: number
  error?: string
}

/** MCP 서버 기능 */
interface MCPServerCapabilities {
  tools: MCPTool[]
  resources: MCPResource[]
  protocol_version?: string
}

// ========================================
// MCP 서버 프리셋
// ========================================

export const MCP_SERVER_PRESETS: Omit<MCPServerConfig, 'status' | 'tools' | 'resources' | 'pid'>[] = [
  // AWS MCP 서버 (awslabs/mcp)
  {
    id: 'aws-knowledge',
    name: 'AWS Knowledge',
    description: 'AWS 문서 및 모범 사례 검색',
    command: 'npx',
    args: ['-y', '@anthropic-ai/aws-knowledge-mcp-server@latest'],
    category: 'AWS',
    enabled: false,
    autoStart: false,
    restartOnCrash: true,
  },
  {
    id: 'aws-api',
    name: 'AWS API',
    description: 'AWS CLI 명령어를 MCP 도구로 호출',
    command: 'npx',
    args: ['-y', '@awslabs/mcp-server-aws-api@latest'],
    env: { AWS_PROFILE: 'default' },
    category: 'AWS',
    enabled: false,
    autoStart: false,
    restartOnCrash: true,
  },

  // 파일 시스템
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: '로컬 파일 시스템 접근',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-filesystem@latest', '.'],
    category: 'Utility',
    enabled: false,
    autoStart: false,
    restartOnCrash: true,
  },

  // 데이터베이스
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'SQLite 데이터베이스 쿼리',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-sqlite@latest', '--db-path', './data.db'],
    category: 'Database',
    enabled: false,
    autoStart: false,
    restartOnCrash: true,
  },

  // 검색
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Brave 검색 엔진 통합',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-brave-search@latest'],
    env: { BRAVE_API_KEY: '' },
    category: 'Search',
    enabled: false,
    autoStart: false,
    restartOnCrash: true,
  },

  // 개발 도구
  {
    id: 'github',
    name: 'GitHub',
    description: 'GitHub API 통합',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-github@latest'],
    env: { GITHUB_TOKEN: '' },
    category: 'Development',
    enabled: false,
    autoStart: false,
    restartOnCrash: true,
  },

  // 메모리/상태
  {
    id: 'memory',
    name: 'Memory',
    description: '대화 메모리 및 상태 관리',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-memory@latest'],
    category: 'Utility',
    enabled: false,
    autoStart: false,
    restartOnCrash: true,
  },

  // 웹 자동화
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: '웹 브라우저 자동화',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-puppeteer@latest'],
    category: 'Automation',
    enabled: false,
    autoStart: false,
    restartOnCrash: true,
  },
]

// ========================================
// 스토어 상태 타입
// ========================================

interface MCPStoreState {
  // 상태
  servers: Record<string, MCPServerConfig>
  loading: boolean
  error: string | null

  // 서버 관리
  addServer: (config: Omit<MCPServerConfig, 'status' | 'tools' | 'resources' | 'pid'>) => void
  removeServer: (serverId: string) => Promise<void>
  updateServer: (serverId: string, updates: Partial<MCPServerConfig>) => void

  // 서버 제어
  startServer: (serverId: string) => Promise<boolean>
  stopServer: (serverId: string) => Promise<boolean>
  restartServer: (serverId: string) => Promise<boolean>

  // 기능 조회
  refreshCapabilities: (serverId: string) => Promise<void>

  // 도구 호출
  callTool: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<MCPToolCallResult>

  // 리소스 조회
  getResource: (serverId: string, uri: string) => Promise<MCPContent | null>

  // 프리셋에서 추가
  addFromPreset: (presetId: string) => void

  // 모든 활성 서버 시작
  startAllEnabled: () => Promise<void>

  // 유틸리티
  getConnectedServers: () => MCPServerConfig[]
  getAllTools: () => { serverId: string; tool: MCPTool }[]
  clearError: () => void
}

// ========================================
// 스토어 구현
// ========================================

export const useMCPStore = create<MCPStoreState>()(
  persist(
    (set, get) => ({
      servers: {},
      loading: false,
      error: null,

      addServer: (config) => {
        const newServer: MCPServerConfig = {
          ...config,
          status: 'stopped',
          tools: [],
          resources: [],
        }
        set((state) => ({
          servers: { ...state.servers, [config.id]: newServer },
        }))
      },

      removeServer: async (serverId) => {
        // 실행 중이면 먼저 중지
        const server = get().servers[serverId]
        if (server?.status === 'connected') {
          await get().stopServer(serverId)
        }

        set((state) => {
          const { [serverId]: _, ...rest } = state.servers
          return { servers: rest }
        })
      },

      updateServer: (serverId, updates) => {
        set((state) => ({
          servers: {
            ...state.servers,
            [serverId]: { ...state.servers[serverId], ...updates },
          },
        }))
      },

      startServer: async (serverId) => {
        const server = get().servers[serverId]
        if (!server) {
          set({ error: `Server not found: ${serverId}` })
          return false
        }

        set({ loading: true, error: null })
        get().updateServer(serverId, { status: 'starting', error: undefined })

        try {
          // MCP 서버 프로세스 시작
          const result = await invoke<MCPServerStartResult>('mcp_start_server', {
            request: {
              id: serverId,
              command: server.command,
              args: server.args,
              env: server.env,
              cwd: server.cwd,
            } as MCPServerStartRequest,
          })

          if (!result.success) {
            get().updateServer(serverId, { status: 'error', error: result.error })
            set({ loading: false, error: result.error })
            return false
          }

          // 초기화 핸드셰이크
          try {
            const capabilities = await invoke<MCPServerCapabilities>('mcp_initialize', {
              serverId,
            })

            get().updateServer(serverId, {
              status: 'connected',
              pid: result.pid,
              tools: capabilities.tools,
              resources: capabilities.resources,
              protocolVersion: capabilities.protocol_version,
              error: undefined,
            })

            // 노드 레지스트리에 도구 등록
            const updatedServer = get().servers[serverId]
            if (updatedServer) {
              notifyServerConnected(updatedServer)
            }

            set({ loading: false })
            return true
          } catch (initError) {
            // 초기화 실패 시 프로세스 종료
            await invoke('mcp_stop_server', { serverId })
            get().updateServer(serverId, {
              status: 'error',
              error: `Initialization failed: ${initError}`,
            })
            set({ loading: false, error: String(initError) })
            return false
          }
        } catch (error) {
          get().updateServer(serverId, { status: 'error', error: String(error) })
          set({ loading: false, error: String(error) })
          return false
        }
      },

      stopServer: async (serverId) => {
        try {
          // 노드 레지스트리에서 도구 해제
          notifyServerDisconnected(serverId)

          await invoke<boolean>('mcp_stop_server', { serverId })
          get().updateServer(serverId, {
            status: 'stopped',
            pid: undefined,
            tools: [],
            resources: [],
          })
          return true
        } catch (error) {
          set({ error: String(error) })
          return false
        }
      },

      restartServer: async (serverId) => {
        await get().stopServer(serverId)
        // 잠시 대기
        await new Promise((resolve) => setTimeout(resolve, 500))
        return get().startServer(serverId)
      },

      refreshCapabilities: async (serverId) => {
        try {
          const tools = await invoke<MCPTool[]>('mcp_list_tools', { serverId })
          get().updateServer(serverId, { tools })
        } catch (error) {
          set({ error: String(error) })
        }
      },

      callTool: async (serverId, toolName, args) => {
        try {
          const result = await invoke<MCPToolCallResult>('mcp_call_tool', {
            request: {
              server_id: serverId,
              tool_name: toolName,
              arguments: args,
            },
          })
          return result
        } catch (error) {
          return {
            success: false,
            content: [],
            isError: true,
            error: String(error),
          }
        }
      },

      getResource: async (serverId, uri) => {
        try {
          const content = await invoke<MCPContent>('mcp_get_resource', { serverId, uri })
          return content
        } catch {
          return null
        }
      },

      addFromPreset: (presetId) => {
        const preset = MCP_SERVER_PRESETS.find((p) => p.id === presetId)
        if (preset) {
          get().addServer(preset)
        }
      },

      startAllEnabled: async () => {
        const servers = Object.values(get().servers)
        for (const server of servers) {
          if (server.enabled && server.autoStart && server.status === 'stopped') {
            await get().startServer(server.id)
          }
        }
      },

      getConnectedServers: () => {
        return Object.values(get().servers).filter((s) => s.status === 'connected')
      },

      getAllTools: () => {
        const result: { serverId: string; tool: MCPTool }[] = []
        for (const server of Object.values(get().servers)) {
          if (server.status === 'connected') {
            for (const tool of server.tools) {
              result.push({ serverId: server.id, tool })
            }
          }
        }
        return result
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'handbox-mcp-servers',
      partialize: (state) => ({
        servers: Object.fromEntries(
          Object.entries(state.servers).map(([id, server]) => [
            id,
            {
              ...server,
              // 상태는 저장하지 않음 (재시작 시 stopped)
              status: 'stopped' as const,
              pid: undefined,
              tools: [],
              resources: [],
            },
          ])
        ),
      }),
    }
  )
)

// ========================================
// 유틸리티 함수
// ========================================

/** MCP 도구의 inputSchema를 폼 필드로 변환 */
export function mcpSchemaToFormFields(
  inputSchema: MCPTool['inputSchema']
): { key: string; type: string; label: string; required: boolean; description?: string }[] {
  if (!inputSchema.properties) return []

  return Object.entries(inputSchema.properties).map(([key, prop]) => ({
    key,
    type: prop.type === 'number' || prop.type === 'integer' ? 'number' : 'text',
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    required: inputSchema.required?.includes(key) || prop.required || false,
    description: prop.description,
  }))
}

/** 서버 상태에 따른 색상 */
export const MCP_STATUS_COLORS: Record<MCPServerStatus, string> = {
  stopped: '#6b7280',
  starting: '#f59e0b',
  connected: '#10b981',
  reconnecting: '#f59e0b',
  error: '#ef4444',
}

/** 서버 상태 라벨 */
export const MCP_STATUS_LABELS: Record<MCPServerStatus, string> = {
  stopped: 'Stopped',
  starting: 'Starting...',
  connected: 'Connected',
  reconnecting: 'Reconnecting...',
  error: 'Error',
}

// ========================================
// 노드 자동 등록/해제 구독
// ========================================

/**
 * MCP 서버 상태 변경 시 노드 자동 등록/해제 콜백
 */
type MCPNodeRegistryCallback = {
  onConnect: (serverId: string, serverName: string, tools: MCPTool[], category?: string) => void
  onDisconnect: (serverId: string) => void
}

let nodeRegistryCallback: MCPNodeRegistryCallback | null = null

/**
 * 노드 레지스트리 콜백 설정
 * (adapters/mcp/MCPToolToNode.ts에서 호출)
 */
export function setMCPNodeRegistryCallback(callback: MCPNodeRegistryCallback): () => void {
  nodeRegistryCallback = callback

  // 이미 연결된 서버의 노드 등록
  const servers = useMCPStore.getState().servers
  for (const server of Object.values(servers)) {
    if (server.status === 'connected' && server.tools.length > 0) {
      callback.onConnect(server.id, server.name, server.tools, server.category)
    }
  }

  // 구독 해제 함수 반환
  return () => {
    nodeRegistryCallback = null
  }
}

/**
 * 서버 연결 시 노드 등록 트리거
 */
export function notifyServerConnected(server: MCPServerConfig): void {
  if (nodeRegistryCallback && server.tools.length > 0) {
    nodeRegistryCallback.onConnect(server.id, server.name, server.tools, server.category)
  }
}

/**
 * 서버 연결 해제 시 노드 해제 트리거
 */
export function notifyServerDisconnected(serverId: string): void {
  if (nodeRegistryCallback) {
    nodeRegistryCallback.onDisconnect(serverId)
  }
}
