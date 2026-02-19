/**
 * MCP Tool Executor — MCP 도구 직접 호출
 *
 * 서버/도구를 설정으로 선택하여 MCP 도구를 호출하는 범용 노드.
 * 동적으로 생성되는 MCP 노드 외에 직접 MCP 호출이 필요할 때 사용.
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'
import { useMCPStore, MCPToolCallResult } from '../../stores/mcpStore'

const executor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    _context: ExecutionContext
  ): Promise<Record<string, any>> {
    const { serverId, toolName, arguments: toolArgsJson } = config
    const store = useMCPStore.getState()

    // 서버 확인
    if (!serverId) {
      return { error: 'MCP 서버가 선택되지 않았습니다', status: 'Error' }
    }

    const server = store.servers[serverId]
    if (!server) {
      return { error: `MCP 서버를 찾을 수 없습니다: ${serverId}`, status: 'Server not found' }
    }

    if (server.status !== 'connected') {
      return {
        error: `MCP 서버가 연결되지 않았습니다: ${server.name} (${server.status})`,
        status: 'Not connected',
      }
    }

    // 도구 확인
    if (!toolName) {
      return { error: '도구가 선택되지 않았습니다', status: 'Error' }
    }

    const tool = server.tools.find((t) => t.name === toolName)
    if (!tool) {
      return { error: `도구를 찾을 수 없습니다: ${toolName}`, status: 'Tool not found' }
    }

    // 인자 파싱
    let toolArgs: Record<string, unknown> = {}
    if (toolArgsJson) {
      try {
        toolArgs = JSON.parse(toolArgsJson)
      } catch {
        return { error: '인자 JSON 파싱 실패', status: 'Invalid JSON' }
      }
    }

    // 이전 노드 입력이 있으면 병합
    if (input.text) {
      toolArgs.input = input.text
    }
    if (input.json) {
      Object.assign(toolArgs, input.json)
    }

    // MCP 도구 호출
    const result: MCPToolCallResult = await store.callTool(serverId, toolName, toolArgs)

    if (!result.success || result.isError) {
      return {
        error: result.error || 'MCP 도구 호출 실패',
        status: 'Error',
      }
    }

    // 콘텐츠 추출
    const textContents = result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')

    const imageContents = result.content
      .filter((c) => c.type === 'image')
      .map((c) => ({ data: c.data, mimeType: c.mimeType }))

    // JSON 파싱 시도
    let jsonResult: any = undefined
    try {
      jsonResult = JSON.parse(textContents)
    } catch {
      // 텍스트로 유지
    }

    return {
      text: textContents,
      json: jsonResult,
      images: imageContents.length > 0 ? imageContents : undefined,
      raw: result.content,
      status: `Success (${tool.name})`,
    }
  },
}

export const MCPToolDefinition: NodeDefinition = {
  type: 'mcp.tool-call',
  category: 'mcp',
  meta: {
    label: 'MCP 도구 호출',
    description: 'MCP 서버의 도구를 직접 호출합니다',
    icon: 'Extension',
    color: '#6366f1',
    tags: ['MCP', 'tool', 'server', '도구', '외부'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: false, description: '도구에 전달할 텍스트 입력' },
      { name: 'json', type: 'json', required: false, description: '도구에 전달할 JSON 데이터' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '도구 출력 텍스트' },
      { name: 'json', type: 'json', required: false, description: '파싱된 JSON (해당 시)' },
    ],
  },
  configSchema: [
    {
      key: 'serverId',
      label: 'MCP 서버',
      type: 'select',
      required: true,
      description: '연결된 MCP 서버 선택',
      options: [], // 동적으로 채워짐
    },
    {
      key: 'toolName',
      label: '도구',
      type: 'select',
      required: true,
      description: '호출할 도구 선택',
      options: [], // serverId에 따라 동적으로 채워짐
      showWhen: { key: 'serverId', value: '*' }, // serverId 선택 시 표시
    },
    {
      key: 'arguments',
      label: '인자 (JSON)',
      type: 'code',
      language: 'json',
      rows: 6,
      placeholder: '{\n  "key": "value"\n}',
      description: '도구에 전달할 인자 (JSON 형식)',
    },
  ],
  runtime: 'mcp',
  executor,
  requirements: {
    mcpServer: '*', // 하나 이상의 MCP 서버 필요
  },
}

/**
 * MCP 도구 호출 노드의 옵션을 동적으로 업데이트
 * (PropertyPanel에서 호출)
 */
export function getMCPServerOptions(): { label: string; value: string }[] {
  const store = useMCPStore.getState()
  return Object.values(store.servers)
    .filter((s) => s.status === 'connected')
    .map((s) => ({ label: s.name, value: s.id }))
}

export function getMCPToolOptions(serverId: string): { label: string; value: string }[] {
  const store = useMCPStore.getState()
  const server = store.servers[serverId]
  if (!server) return []

  return server.tools.map((t) => ({
    label: t.name + (t.description ? ` - ${t.description}` : ''),
    value: t.name,
  }))
}
