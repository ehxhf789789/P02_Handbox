/**
 * MCP Tool to Node Converter
 *
 * MCP 서버에서 발견된 도구를 NodeDefinition으로 변환하여
 * NodeRegistry에 동적으로 등록할 수 있게 한다.
 *
 * 이를 통해 MCP 서버 연결 시 자동으로 새 노드들이 NodePalette에 표시된다.
 */

import type { NodeDefinition, NodeExecutor } from '../../registry/NodeDefinition'
import type { ConfigField, PortDefinition, ExecutionContext, DataType } from '../../engine/types'
import type { MCPTool, MCPToolCallResult } from '../../stores/mcpStore'
import { useMCPStore, setMCPNodeRegistryCallback } from '../../stores/mcpStore'
import { NodeRegistry } from '../../registry/NodeRegistry'

// ============================================================
// MCP 도구 → NodeDefinition 변환
// ============================================================

/** MCP 스키마 프로퍼티 */
interface MCPSchemaProperty {
  type: string
  description?: string
  enum?: string[]
  required?: boolean
  default?: any
}

/**
 * MCP 도구의 inputSchema를 ConfigField[]로 변환
 */
function convertInputSchemaToConfigFields(
  inputSchema: MCPTool['inputSchema']
): ConfigField[] {
  const fields: ConfigField[] = []

  if (!inputSchema.properties) return fields

  const required = inputSchema.required || []

  for (const [key, prop] of Object.entries(inputSchema.properties) as [string, MCPSchemaProperty][]) {
    const field: ConfigField = {
      key,
      label: formatLabel(key),
      type: mapMCPTypeToConfigType(prop.type, prop.enum),
      required: required.includes(key) || prop.required,
      description: prop.description,
      default: prop.default,
    }

    // enum이 있으면 select로
    if (prop.enum && prop.enum.length > 0) {
      field.type = 'select'
      field.options = prop.enum.map((val) => ({ label: val, value: val }))
    }

    fields.push(field)
  }

  return fields
}

/**
 * 키 이름을 사람이 읽기 좋은 라벨로 변환
 */
function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

/**
 * MCP 타입을 ConfigFieldType으로 매핑
 */
function mapMCPTypeToConfigType(
  mcpType: string,
  hasEnum?: string[]
): ConfigField['type'] {
  if (hasEnum && hasEnum.length > 0) return 'select'

  switch (mcpType) {
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'toggle'
    case 'array':
    case 'object':
      return 'code' // JSON 에디터로
    default:
      return 'text'
  }
}

/**
 * MCP 도구 executor 생성
 */
function createMCPToolExecutor(serverId: string, toolName: string): NodeExecutor {
  return {
    async execute(
      input: Record<string, any>,
      config: Record<string, any>,
      _context: ExecutionContext
    ): Promise<Record<string, any>> {
      const store = useMCPStore.getState()

      // 서버 상태 확인
      const server = store.servers[serverId]
      if (!server) {
        return {
          error: `MCP server not found: ${serverId}`,
          status: 'Server not found',
        }
      }

      if (server.status !== 'connected') {
        return {
          error: `MCP server not connected: ${serverId} (status: ${server.status})`,
          status: 'Server not connected',
        }
      }

      // 이전 노드 입력이 있으면 config에 병합
      const args = { ...config }
      if (input.text) {
        args.input = input.text
      }
      if (input.json) {
        Object.assign(args, input.json)
      }

      // MCP 도구 호출
      const result: MCPToolCallResult = await store.callTool(serverId, toolName, args)

      if (!result.success || result.isError) {
        return {
          error: result.error || 'MCP tool call failed',
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

      return {
        text: textContents,
        json: tryParseJSON(textContents),
        images: imageContents.length > 0 ? imageContents : undefined,
        raw: result.content,
        status: 'Success',
      }
    },
  }
}

/**
 * JSON 파싱 시도
 */
function tryParseJSON(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// ============================================================
// 동적 노드 생성
// ============================================================

/**
 * MCP 도구를 NodeDefinition으로 변환
 */
export function createNodeDefinitionFromMCPTool(
  serverId: string,
  serverName: string,
  tool: MCPTool,
  serverCategory?: string
): NodeDefinition {
  const nodeType = `mcp.${serverId}.${tool.name}`
  const category = serverCategory ? `mcp.${serverCategory.toLowerCase()}` : 'mcp'

  const configFields = convertInputSchemaToConfigFields(tool.inputSchema)

  const definition: NodeDefinition = {
    type: nodeType,
    category,
    subcategory: serverName,

    meta: {
      label: formatLabel(tool.name),
      description: tool.description || `MCP tool: ${tool.name}`,
      icon: getMCPToolIcon(tool.name, serverCategory),
      color: getMCPToolColor(serverCategory),
      tags: [
        'MCP',
        serverName,
        tool.name,
        serverCategory || 'utility',
        ...extractKeywords(tool.description),
      ],
    },

    ports: {
      inputs: [
        { name: 'text', type: 'text' as DataType, required: false, description: 'Input text (optional)' },
        { name: 'json', type: 'json' as DataType, required: false, description: 'Input JSON data (optional)' },
      ] as PortDefinition[],
      outputs: [
        { name: 'text', type: 'text' as DataType, required: true, description: 'Tool output text' },
        { name: 'json', type: 'json' as DataType, required: false, description: 'Parsed JSON (if applicable)' },
      ] as PortDefinition[],
    },

    configSchema: configFields,

    runtime: 'mcp',
    executor: createMCPToolExecutor(serverId, tool.name),

    requirements: {
      mcpServer: serverId,
    },

    // 동적 노드임을 표시
    pluginId: `mcp:${serverId}`,
  }

  return definition
}

/**
 * 카테고리별 아이콘 매핑
 */
function getMCPToolIcon(toolName: string, category?: string): string {
  // 도구 이름 기반
  const nameLower = toolName.toLowerCase()
  if (nameLower.includes('search') || nameLower.includes('find')) return 'Search'
  if (nameLower.includes('read') || nameLower.includes('get')) return 'Download'
  if (nameLower.includes('write') || nameLower.includes('create') || nameLower.includes('put')) return 'Upload'
  if (nameLower.includes('delete') || nameLower.includes('remove')) return 'Delete'
  if (nameLower.includes('list')) return 'List'
  if (nameLower.includes('query')) return 'Storage'

  // 카테고리 기반
  switch (category?.toLowerCase()) {
    case 'aws':
      return 'Cloud'
    case 'database':
      return 'Storage'
    case 'search':
      return 'Search'
    case 'development':
      return 'Code'
    case 'automation':
      return 'SmartToy'
    case 'utility':
      return 'Build'
    default:
      return 'Extension'
  }
}

/**
 * 카테고리별 색상 매핑
 */
function getMCPToolColor(category?: string): string {
  switch (category?.toLowerCase()) {
    case 'aws':
      return '#FF9900'
    case 'database':
      return '#4F46E5'
    case 'search':
      return '#10B981'
    case 'development':
      return '#8B5CF6'
    case 'automation':
      return '#EC4899'
    case 'utility':
      return '#6366F1'
    default:
      return '#64748B'
  }
}

/**
 * 설명에서 키워드 추출
 */
function extractKeywords(description?: string): string[] {
  if (!description) return []
  // 간단한 키워드 추출 (주요 명사/동사)
  const words = description.toLowerCase().split(/\s+/)
  return words
    .filter((w) => w.length > 3)
    .slice(0, 5)
}

// ============================================================
// NodeRegistry 연동
// ============================================================

/**
 * MCP 서버의 모든 도구를 NodeRegistry에 등록
 */
export function registerMCPServerTools(
  serverId: string,
  serverName: string,
  tools: MCPTool[],
  serverCategory?: string
): void {
  const definitions = tools.map((tool) =>
    createNodeDefinitionFromMCPTool(serverId, serverName, tool, serverCategory)
  )

  for (const def of definitions) {
    NodeRegistry.register(def)
  }

  console.log(`[MCP] Registered ${definitions.length} tools from ${serverName}`)
}

/**
 * MCP 서버의 모든 도구를 NodeRegistry에서 해제
 */
export function unregisterMCPServerTools(serverId: string): void {
  NodeRegistry.unregisterPlugin(`mcp:${serverId}`)
  console.log(`[MCP] Unregistered tools from server ${serverId}`)
}

/**
 * 현재 연결된 모든 MCP 서버의 도구를 NodeRegistry에 동기화
 */
export function syncMCPToolsToRegistry(): void {
  const store = useMCPStore.getState()

  for (const server of Object.values(store.servers)) {
    if (server.status === 'connected' && server.tools.length > 0) {
      // 기존 노드 제거 후 재등록
      unregisterMCPServerTools(server.id)
      registerMCPServerTools(server.id, server.name, server.tools, server.category)
    }
  }
}

// ============================================================
// MCP 카테고리 등록 (NodeDefinition.ts의 DEFAULT_CATEGORIES에 추가)
// ============================================================

export const MCP_CATEGORIES = [
  { id: 'mcp', label: 'MCP 도구', icon: 'Extension', order: 14, defaultExpanded: true },
  { id: 'mcp.aws', label: 'AWS (MCP)', icon: 'Cloud', order: 15, defaultExpanded: false },
  { id: 'mcp.database', label: 'Database (MCP)', icon: 'Storage', order: 16, defaultExpanded: false },
  { id: 'mcp.search', label: 'Search (MCP)', icon: 'Search', order: 17, defaultExpanded: false },
  { id: 'mcp.utility', label: 'Utility (MCP)', icon: 'Build', order: 18, defaultExpanded: false },
]

// ============================================================
// MCP Store 구독 설정
// ============================================================

/**
 * MCP 도구 → 노드 자동 동기화 초기화
 * 앱 시작 시 한 번 호출하여 MCP 서버 상태 변경을 감지
 */
export function initializeMCPNodeSync(): () => void {
  return setMCPNodeRegistryCallback({
    onConnect: (serverId, serverName, tools, category) => {
      // 기존 노드 제거 후 새로 등록
      unregisterMCPServerTools(serverId)
      registerMCPServerTools(serverId, serverName, tools, category)
    },
    onDisconnect: (serverId) => {
      unregisterMCPServerTools(serverId)
    },
  })
}
