/**
 * MCP Tool → Node Definition 브릿지
 *
 * LocalMCPRegistry의 모든 MCP 도구를 NodeRegistry의 노드로 변환합니다.
 * MCP 도구 = 원자화된 업무 단위 = 워크플로우 노드
 *
 * 이를 통해:
 * 1. 워크플로우 생성기가 MCP 도구를 노드로 사용 가능
 * 2. ExecutionEngine이 MCP 도구를 직접 실행 가능
 * 3. 단일 도구 체계로 통합
 */

import { NodeRegistry } from '../registry/NodeRegistry'
import type { NodeDefinition, NodeExecutor } from '../registry/NodeDefinition'
import type { PortDefinition, DataType } from '../engine/types'
import { LocalMCPRegistry, type MCPTool, type MCPToolResult } from '../services/LocalMCPRegistry'

// ============================================================
// Type Mapping: MCP Schema → Node Port
// ============================================================

const MCP_TYPE_TO_PORT_TYPE: Record<string, string> = {
  'string': 'text',
  'number': 'number',
  'boolean': 'boolean',
  'array': 'json',
  'object': 'json',
}

const MCP_CATEGORY_TO_NODE_CATEGORY: Record<string, string> = {
  'builtin': 'mcp',
  'custom': 'mcp.custom',
  'external': 'mcp.external',
}

const MCP_ICON_MAP: Record<string, string> = {
  'TextFields': 'TextFields',
  'Code': 'Code',
  'Calculate': 'Calculate',
  'Schedule': 'Schedule',
  'BarChart': 'BarChart',
  'Http': 'Http',
  'FindReplace': 'FindReplace',
  'Lock': 'Lock',
  'Transform': 'Transform',
  'Storage': 'Storage',
  'Cloud': 'Cloud',
  'Search': 'Search',
}

// ============================================================
// MCP Tool → NodeDefinition 변환
// ============================================================

/**
 * MCP 도구를 NodeDefinition으로 변환
 */
export function mcpToolToNodeDefinition(tool: MCPTool): NodeDefinition {
  // 입력 포트 생성 (MCP inputSchema에서)
  const inputPorts: PortDefinition[] = Object.entries(tool.inputSchema.properties).map(
    ([name, prop]) => ({
      name,
      type: (MCP_TYPE_TO_PORT_TYPE[prop.type] || 'any') as DataType,
      required: tool.inputSchema.required?.includes(name) ?? false,
      description: prop.description || name,
    })
  )

  // 출력 포트 (MCP는 단일 결과 반환)
  const outputPorts: PortDefinition[] = [
    { name: 'result', type: 'any', required: true, description: '도구 실행 결과' },
    { name: 'success', type: 'boolean', required: true, description: '실행 성공 여부' },
    { name: 'error', type: 'text', required: false, description: '에러 메시지 (실패 시)' },
  ]

  // Executor 생성 (MCP handler 래핑)
  const executor: NodeExecutor = {
    async execute(input, config, context) {
      // MCP 도구 실행
      const result: MCPToolResult = await LocalMCPRegistry.executeTool(
        tool.name,
        { ...input, ...config },
        {
          sessionId: context.executionId || 'workflow',
          workflowId: context.workflowId,
          xaiEnabled: true,
        }
      )

      // 결과 변환
      const outputData = result.content?.[0]?.data ?? result.content?.[0]?.text ?? null

      return {
        result: outputData,
        success: result.success,
        error: result.error || null,
      }
    },
  }

  // NodeDefinition 생성
  return {
    type: `mcp.${tool.name}`,
    category: MCP_CATEGORY_TO_NODE_CATEGORY[tool.category] || 'mcp',
    meta: {
      label: tool.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: tool.description,
      icon: MCP_ICON_MAP[tool.icon || ''] || 'Extension',
      color: '#8b5cf6', // MCP 도구 컬러 (보라색)
      tags: ['mcp', ...(tool.tags || [])],
    },
    ports: {
      inputs: inputPorts,
      outputs: outputPorts,
    },
    configSchema: [], // MCP 도구는 입력으로 모든 설정을 받음
    runtime: 'browser',
    executor,
  }
}

// ============================================================
// 전체 MCP 도구 → NodeRegistry 등록
// ============================================================

/**
 * LocalMCPRegistry의 모든 도구를 NodeRegistry에 등록
 */
export function registerMCPToolsAsNodes(): number {
  const tools = LocalMCPRegistry.listTools()
  let registered = 0

  for (const tool of tools) {
    const nodeType = `mcp.${tool.name}`

    // 이미 등록된 경우 스킵
    if (NodeRegistry.get(nodeType)) {
      continue
    }

    const nodeDef = mcpToolToNodeDefinition(tool)
    NodeRegistry.register(nodeDef)
    registered++
  }

  // 레거시 별칭 등록 (MCP 도구명 → mcp.도구명)
  for (const tool of tools) {
    const legacyType = tool.name // e.g., 'text_transform'
    const newType = `mcp.${tool.name}` // e.g., 'mcp.text_transform'

    if (!NodeRegistry.get(legacyType)) {
      const nodeDef = NodeRegistry.get(newType)
      if (nodeDef) {
        NodeRegistry.register({
          ...nodeDef,
          type: legacyType,
          meta: {
            ...nodeDef.meta,
            tags: [...nodeDef.meta.tags, `alias:${newType}`],
          },
        })
      }
    }
  }

  console.log(`[MCPToNode] ${registered}개 MCP 도구 → 노드 등록 완료`)
  return registered
}

// ============================================================
// MCP 카테고리 등록
// ============================================================

/**
 * MCP 카테고리를 NodeRegistry에 등록
 */
export function registerMCPCategories(): void {
  NodeRegistry.registerCategory({
    id: 'mcp',
    label: 'MCP Tools',
    icon: 'Extension',
    order: 5, // 상위에 배치
    defaultExpanded: true,
  })

  NodeRegistry.registerCategory({
    id: 'mcp.custom',
    label: 'Custom MCP',
    icon: 'Build',
    order: 6,
    defaultExpanded: false,
  })

  NodeRegistry.registerCategory({
    id: 'mcp.external',
    label: 'External MCP',
    icon: 'Cloud',
    order: 7,
    defaultExpanded: false,
  })
}

// ============================================================
// 초기화 함수
// ============================================================

/**
 * MCP → Node 시스템 초기화
 * main.tsx에서 호출
 */
export function initializeMCPNodeBridge(): void {
  registerMCPCategories()
  const count = registerMCPToolsAsNodes()
  console.log(`[MCPToNode] MCP-Node 브릿지 초기화 완료 (${count}개 도구)`)
}

// ============================================================
// 유틸리티
// ============================================================

/**
 * MCP 도구 목록 조회 (노드 형식)
 */
export function getMCPNodesForLLM(): string {
  const tools = LocalMCPRegistry.listTools()

  return tools.map(tool => {
    const inputs = Object.entries(tool.inputSchema.properties)
      .map(([name, prop]) => `    - ${name} (${prop.type}): ${prop.description || ''}`)
      .join('\n')

    return `### mcp.${tool.name}
- 설명: ${tool.description}
- 카테고리: ${tool.category}
- 입력:
${inputs}
- 출력: result (any), success (boolean), error (text)`
  }).join('\n\n')
}
