/**
 * Handbox MCP 서버 서비스
 *
 * Handbox를 MCP 서버로 동작하게 하여
 * 외부 MCP 클라이언트(Claude Code 등)에서 Handbox 기능을 호출할 수 있게 합니다.
 *
 * 두 가지 모드 지원:
 * 1. 내장 도구 모드: 프론트엔드에서 직접 도구 호출
 * 2. MCP 프로토콜 모드: JSON-RPC over HTTP로 외부 클라이언트에 서비스 제공
 */

import { invoke } from '@tauri-apps/api/tauri'
import {
  HANDBOX_MCP_TOOLS,
  executeHandboxMCPTool,
  getToolsForMCPProtocol,
  type MCPToolSchema,
  type MCPToolResult,
} from './HandboxMCPTools'

// ============================================================
// 타입 정의
// ============================================================

export interface HandboxMCPServerConfig {
  /** 서버 활성화 여부 */
  enabled: boolean
  /** HTTP 서버 포트 (0이면 비활성화) */
  httpPort: number
  /** 허용된 도구 카테고리 */
  allowedCategories: string[]
  /** 인증 토큰 (빈 문자열이면 인증 없음) */
  authToken: string
  /** 로깅 활성화 */
  enableLogging: boolean
}

export interface MCPServerStatus {
  running: boolean
  port: number
  toolCount: number
  activeConnections: number
  lastRequest?: {
    tool: string
    timestamp: string
    success: boolean
  }
}

interface MCPRequest {
  jsonrpc: string
  id: number | string
  method: string
  params?: Record<string, any>
}

interface MCPResponse {
  jsonrpc: string
  id: number | string | null
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

// ============================================================
// 상태 관리
// ============================================================

let serverConfig: HandboxMCPServerConfig = {
  enabled: false,
  httpPort: 0,
  allowedCategories: ['workflow', 'persona', 'kb', 'storage', 'llm'],
  authToken: '',
  enableLogging: true,
}

let serverStatus: MCPServerStatus = {
  running: false,
  port: 0,
  toolCount: HANDBOX_MCP_TOOLS.length,
  activeConnections: 0,
}

const requestLog: Array<{
  tool: string
  timestamp: string
  success: boolean
  duration: number
}> = []

// ============================================================
// MCP 프로토콜 핸들러
// ============================================================

/**
 * MCP 요청 처리
 */
export async function handleMCPRequest(request: MCPRequest): Promise<MCPResponse> {
  const startTime = Date.now()

  try {
    switch (request.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
              resources: { listChanged: false },
            },
            serverInfo: {
              name: 'handbox',
              version: '2.0.0',
            },
          },
        }

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: getFilteredTools(),
          },
        }

      case 'tools/call': {
        const { name, arguments: args } = request.params || {}

        if (!name) {
          return errorResponse(request.id, -32602, 'Missing tool name')
        }

        // 도구가 허용된 카테고리인지 확인
        const category = name.split('_')[1] // handbox_workflow_xxx -> workflow
        if (!serverConfig.allowedCategories.includes(category)) {
          return errorResponse(request.id, -32602, `Tool category '${category}' is not allowed`)
        }

        // 도구 실행
        const result = await executeHandboxMCPTool(name, args || {})

        // 로깅
        if (serverConfig.enableLogging) {
          const entry = {
            tool: name,
            timestamp: new Date().toISOString(),
            success: result.success,
            duration: Date.now() - startTime,
          }
          requestLog.push(entry)
          serverStatus.lastRequest = {
            tool: name,
            timestamp: entry.timestamp,
            success: result.success,
          }

          // 최대 100개 로그 유지
          if (requestLog.length > 100) {
            requestLog.shift()
          }
        }

        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: result.content,
            isError: result.isError,
          },
        }
      }

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            resources: getHandboxResources(),
          },
        }

      case 'resources/read': {
        const { uri } = request.params || {}
        if (!uri) {
          return errorResponse(request.id, -32602, 'Missing resource URI')
        }

        const content = await readHandboxResource(uri)
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            contents: [content],
          },
        }
      }

      default:
        return errorResponse(request.id, -32601, `Method not found: ${request.method}`)
    }
  } catch (err) {
    console.error('[HandboxMCPServer] Request error:', err)
    return errorResponse(request.id, -32603, `Internal error: ${err}`)
  }
}

function errorResponse(id: number | string | null, code: number, message: string): MCPResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  }
}

// ============================================================
// 도구 및 리소스 필터링
// ============================================================

function getFilteredTools(): any[] {
  return getToolsForMCPProtocol().filter(tool => {
    const category = tool.name.split('_')[1]
    return serverConfig.allowedCategories.includes(category)
  })
}

function getHandboxResources(): any[] {
  return [
    {
      uri: 'handbox://workflows',
      name: 'Workflows',
      description: 'Handbox에 저장된 모든 워크플로우 목록',
      mimeType: 'application/json',
    },
    {
      uri: 'handbox://personas',
      name: 'Personas',
      description: '등록된 AI 전문가 페르소나 목록',
      mimeType: 'application/json',
    },
    {
      uri: 'handbox://indices',
      name: 'Vector Indices',
      description: '사용 가능한 벡터 인덱스 목록',
      mimeType: 'application/json',
    },
    {
      uri: 'handbox://config',
      name: 'Server Configuration',
      description: 'Handbox MCP 서버 설정',
      mimeType: 'application/json',
    },
  ]
}

async function readHandboxResource(uri: string): Promise<{
  uri: string
  mimeType: string
  text: string
}> {
  const path = uri.replace('handbox://', '')

  switch (path) {
    case 'workflows': {
      const workflows = await invoke<any[]>('list_workflows')
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(workflows, null, 2),
      }
    }

    case 'personas': {
      const { listPersonas } = await import('../services/PersonaService')
      const personas = await listPersonas()
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(personas, null, 2),
      }
    }

    case 'indices': {
      const indices = await invoke<any>('vector_list_indices')
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(indices, null, 2),
      }
    }

    case 'config': {
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          ...serverConfig,
          authToken: serverConfig.authToken ? '***' : '',
        }, null, 2),
      }
    }

    default:
      throw new Error(`Unknown resource: ${uri}`)
  }
}

// ============================================================
// 서버 관리 API
// ============================================================

/**
 * MCP 서버 설정 업데이트
 */
export function updateServerConfig(config: Partial<HandboxMCPServerConfig>): void {
  serverConfig = { ...serverConfig, ...config }
  serverStatus.toolCount = getFilteredTools().length

  console.log('[HandboxMCPServer] Config updated:', serverConfig)
}

/**
 * 현재 서버 설정 조회
 */
export function getServerConfig(): HandboxMCPServerConfig {
  return { ...serverConfig }
}

/**
 * 서버 상태 조회
 */
export function getServerStatus(): MCPServerStatus {
  return { ...serverStatus }
}

/**
 * 요청 로그 조회
 */
export function getRequestLog(limit: number = 20): typeof requestLog {
  return requestLog.slice(-limit)
}

/**
 * 특정 도구의 스키마 조회
 */
export function getToolSchema(toolName: string): MCPToolSchema | undefined {
  return HANDBOX_MCP_TOOLS.find(t => t.name === toolName)
}

/**
 * 도구 직접 호출 (내부 사용)
 */
export async function callTool(
  toolName: string,
  args: Record<string, any>,
): Promise<MCPToolResult> {
  return executeHandboxMCPTool(toolName, args)
}

// ============================================================
// 초기화
// ============================================================

/**
 * Handbox MCP 서버 초기화
 */
export function initHandboxMCPServer(config?: Partial<HandboxMCPServerConfig>): void {
  if (config) {
    updateServerConfig(config)
  }

  serverStatus.running = true
  serverStatus.toolCount = getFilteredTools().length

  console.log('[HandboxMCPServer] Initialized with', serverStatus.toolCount, 'tools')
}

// ============================================================
// 내보내기
// ============================================================

export {
  HANDBOX_MCP_TOOLS,
  executeHandboxMCPTool,
  getToolsForMCPProtocol,
}
