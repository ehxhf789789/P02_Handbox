/**
 * MCP Runtime — MCP 도구 호출을 위한 런타임 유틸리티
 *
 * MCP 서버와의 통신을 추상화하고 스트리밍 응답,
 * 에러 핸들링, 재시도 로직 등을 제공한다.
 */

import { useMCPStore, MCPToolCallResult, MCPContent } from '../../stores/mcpStore'

export interface MCPCallOptions {
  serverId: string
  toolName: string
  args: Record<string, unknown>
  /** 타임아웃 (ms) */
  timeout?: number
  /** 스트리밍 콜백 (지원 시) */
  onStream?: (chunk: MCPContent) => void
  /** 중단 시그널 */
  abortSignal?: AbortSignal
}

export interface MCPCallResult {
  success: boolean
  text: string
  json?: unknown
  images?: { data: string; mimeType: string }[]
  raw: MCPContent[]
  error?: string
  duration: number
}

/**
 * MCP 도구 호출 실행
 */
export async function callMCPTool(options: MCPCallOptions): Promise<MCPCallResult> {
  const { serverId, toolName, args, timeout = 30000, abortSignal } = options
  const startTime = Date.now()

  const store = useMCPStore.getState()

  // 서버 상태 확인
  const server = store.servers[serverId]
  if (!server) {
    return {
      success: false,
      text: '',
      raw: [],
      error: `MCP server not found: ${serverId}`,
      duration: Date.now() - startTime,
    }
  }

  if (server.status !== 'connected') {
    return {
      success: false,
      text: '',
      raw: [],
      error: `MCP server not connected: ${server.name} (${server.status})`,
      duration: Date.now() - startTime,
    }
  }

  // 타임아웃 처리
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`MCP call timeout (${timeout}ms)`)), timeout)
  })

  // 중단 처리
  const abortPromise = new Promise<never>((_, reject) => {
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        reject(new Error('MCP call aborted'))
      })
    }
  })

  try {
    // MCP 도구 호출
    const result: MCPToolCallResult = await Promise.race([
      store.callTool(serverId, toolName, args),
      timeoutPromise,
      ...(abortSignal ? [abortPromise] : []),
    ])

    if (!result.success || result.isError) {
      return {
        success: false,
        text: '',
        raw: result.content,
        error: result.error || 'MCP tool call failed',
        duration: Date.now() - startTime,
      }
    }

    // 콘텐츠 추출
    const textContents = result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text || '')
      .join('\n')

    const imageContents = result.content
      .filter((c) => c.type === 'image')
      .map((c) => ({ data: c.data || '', mimeType: c.mimeType || 'image/png' }))

    // JSON 파싱 시도
    let jsonResult: unknown = undefined
    try {
      jsonResult = JSON.parse(textContents)
    } catch {
      // 텍스트로 유지
    }

    return {
      success: true,
      text: textContents,
      json: jsonResult,
      images: imageContents.length > 0 ? imageContents : undefined,
      raw: result.content,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    return {
      success: false,
      text: '',
      raw: [],
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    }
  }
}

/**
 * 서버가 연결되어 있는지 확인
 */
export function isMCPServerConnected(serverId: string): boolean {
  const store = useMCPStore.getState()
  const server = store.servers[serverId]
  return server?.status === 'connected'
}

/**
 * 서버에 특정 도구가 있는지 확인
 */
export function hasMCPTool(serverId: string, toolName: string): boolean {
  const store = useMCPStore.getState()
  const server = store.servers[serverId]
  return server?.tools.some((t) => t.name === toolName) ?? false
}

/**
 * 연결된 모든 MCP 서버의 도구 목록
 */
export function getAllAvailableMCPTools(): { serverId: string; serverName: string; toolName: string; description?: string }[] {
  const store = useMCPStore.getState()
  const tools: { serverId: string; serverName: string; toolName: string; description?: string }[] = []

  for (const server of Object.values(store.servers)) {
    if (server.status === 'connected') {
      for (const tool of server.tools) {
        tools.push({
          serverId: server.id,
          serverName: server.name,
          toolName: tool.name,
          description: tool.description,
        })
      }
    }
  }

  return tools
}
