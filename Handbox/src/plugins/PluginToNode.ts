/**
 * Tier 2 플러그인 → 노드 자동 변환
 *
 * 플러그인의 MCP 도구를 NodeDefinition으로 변환하여
 * NodeRegistry에 등록합니다.
 *
 * 패턴: MCPToolToNode.ts와 동일한 구조를 따름
 */

import { NodeRegistry } from '../registry/NodeRegistry'
import type { NodeDefinition, NodeExecutor } from '../registry/NodeDefinition'
import type { ConfigField } from '../engine/types'
import { usePluginStore, setPluginNodeRegistryCallback } from './PluginStore'
import type { PluginMCPTool, PluginMCPSchemaProperty } from './types'
import { invoke } from '@tauri-apps/api/tauri'

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

const PLUGIN_CATEGORY = 'plugin'

// ─────────────────────────────────────────────
// MCP 도구 → ConfigField 변환
// ─────────────────────────────────────────────

function mapMCPTypeToConfigType(prop: PluginMCPSchemaProperty): ConfigField['type'] {
  switch (prop.type) {
    case 'string':
      if (prop.enum && prop.enum.length > 0) return 'select'
      return 'text'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'toggle'
    case 'array':
    case 'object':
      return 'code'
    default:
      return 'text'
  }
}

function convertSchemaToConfigFields(tool: PluginMCPTool): ConfigField[] {
  const fields: ConfigField[] = []
  const props = tool.inputSchema?.properties || {}
  const required = tool.inputSchema?.required || []

  for (const [key, prop] of Object.entries(props)) {
    const field: ConfigField = {
      key,
      label: formatLabel(key),
      type: mapMCPTypeToConfigType(prop),
      required: required.includes(key),
      description: prop.description || '',
    }

    if (prop.default !== undefined) {
      field.default = prop.default
    }

    if (prop.enum) {
      field.options = prop.enum.map(v => ({ label: v, value: v }))
    }

    fields.push(field)
  }

  return fields
}

// ─────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────

/** snake_case/kebab-case → Title Case */
function formatLabel(name: string): string {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/** 도구 이름에서 아이콘 추론 */
function getToolIcon(toolName: string): string {
  const lower = toolName.toLowerCase()
  if (lower.includes('search') || lower.includes('find') || lower.includes('query')) return 'Search'
  if (lower.includes('read') || lower.includes('get') || lower.includes('fetch')) return 'Download'
  if (lower.includes('write') || lower.includes('create') || lower.includes('put') || lower.includes('post')) return 'Upload'
  if (lower.includes('delete') || lower.includes('remove')) return 'Delete'
  if (lower.includes('list') || lower.includes('browse')) return 'List'
  if (lower.includes('convert') || lower.includes('transform')) return 'Transform'
  if (lower.includes('navigate') || lower.includes('click')) return 'Mouse'
  if (lower.includes('screenshot') || lower.includes('capture')) return 'Screenshot'
  return 'Extension'
}

/** 카테고리에서 색상 추론 */
function getPluginColor(category: string): string {
  const colorMap: Record<string, string> = {
    io: '#3b82f6',
    search: '#f59e0b',
    devtools: '#8b5cf6',
    storage: '#10b981',
    automation: '#ef4444',
    browser: '#06b6d4',
    communication: '#ec4899',
    architecture: '#6366f1',
    data: '#14b8a6',
  }
  return colorMap[category] || '#6b7280'
}

/** 검색용 키워드 추출 */
function extractKeywords(name: string, description?: string): string[] {
  const text = `${name} ${description || ''}`
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1)
}

// ─────────────────────────────────────────────
// 핵심: 플러그인 도구 → NodeDefinition 변환
// ─────────────────────────────────────────────

export function createNodeDefinitionFromPluginTool(
  pluginId: string,
  pluginName: string,
  pluginCategory: string,
  tool: PluginMCPTool,
): NodeDefinition {
  const nodeType = `plugin.${pluginId}.${tool.name}`
  const pluginIdentifier = `plugin:${pluginId}`

  const configFields = convertSchemaToConfigFields(tool)

  const executor: NodeExecutor = {
    async execute(input, config, _context) {
      // config 필드와 input 포트를 병합하여 인수 구성
      const args: Record<string, unknown> = {}

      // config 필드 → args
      for (const field of configFields) {
        if (config[field.key] !== undefined && config[field.key] !== '') {
          args[field.key] = config[field.key]
        }
      }

      // input 포트 → args 오버라이드
      if (input.text) {
        // 첫 번째 required string 필드에 매핑
        const firstStringField = configFields.find(f => f.type === 'text' && f.required)
          || configFields.find(f => f.type === 'text')
        if (firstStringField) {
          args[firstStringField.key] = input.text
        }
      }
      if (input.json) {
        // JSON 입력이면 병합
        if (typeof input.json === 'object') {
          Object.assign(args, input.json)
        }
      }

      // MCP 도구 호출 (기존 MCP 인프라 재활용)
      const serverId = `plugin-${pluginId}`
      const result = await invoke<{ success: boolean; content: Array<{ type: string; text?: string }>; error?: string }>(
        'mcp_call_tool',
        { serverId, toolName: tool.name, arguments: args }
      )

      if (!result.success) {
        throw new Error(result.error || `Plugin tool call failed: ${tool.name}`)
      }

      // 결과 파싱
      const textParts: string[] = []
      let jsonResult: unknown = null

      for (const content of result.content || []) {
        if (content.type === 'text' && content.text) {
          textParts.push(content.text)
          // JSON 자동 파싱 시도
          if (!jsonResult) {
            try {
              jsonResult = JSON.parse(content.text)
            } catch {
              // 텍스트로 유지
            }
          }
        }
      }

      return {
        text: textParts.join('\n'),
        json: jsonResult || (textParts.length > 0 ? textParts.join('\n') : null),
        raw: result,
      }
    },
  }

  return {
    type: nodeType,
    category: PLUGIN_CATEGORY,
    subcategory: pluginId,
    meta: {
      label: `${formatLabel(tool.name)}`,
      description: tool.description || `${pluginName} — ${tool.name}`,
      icon: getToolIcon(tool.name),
      color: getPluginColor(pluginCategory),
      tags: [
        'plugin',
        pluginId,
        pluginName.toLowerCase(),
        ...extractKeywords(tool.name, tool.description),
      ],
    },
    ports: {
      inputs: [
        { name: 'text', type: 'text', required: false, description: '텍스트 입력 (첫 번째 필드에 자동 매핑)' },
        { name: 'json', type: 'json', required: false, description: 'JSON 입력 (필드별 오버라이드)' },
      ],
      outputs: [
        { name: 'text', type: 'text', required: true, description: '텍스트 결과' },
        { name: 'json', type: 'json', required: false, description: 'JSON 결과 (자동 파싱)' },
        { name: 'raw', type: 'json', required: false, description: 'MCP 원본 응답' },
      ],
    },
    configSchema: configFields,
    runtime: 'mcp',
    executor,
    pluginId: pluginIdentifier,
  }
}

// ─────────────────────────────────────────────
// 배치 등록/해제
// ─────────────────────────────────────────────

/** 플러그인의 모든 도구를 NodeRegistry에 등록 */
export function registerPluginTools(
  pluginId: string,
  pluginName: string,
  pluginCategory: string,
  tools: PluginMCPTool[],
): void {
  const pluginIdentifier = `plugin:${pluginId}`

  // 기존 노드 먼저 정리
  NodeRegistry.unregisterPlugin(pluginIdentifier)

  // 플러그인 카테고리 등록 (아직 없으면)
  const existingCategories = NodeRegistry.getCategories()
  if (!existingCategories.find(c => c.id === PLUGIN_CATEGORY)) {
    NodeRegistry.registerCategory({
      id: PLUGIN_CATEGORY,
      label: 'Plugins',
      icon: 'Extension',
      order: 50,
      defaultExpanded: true,
    })
  }

  // 각 도구를 노드로 변환 및 등록
  const definitions = tools.map(tool =>
    createNodeDefinitionFromPluginTool(pluginId, pluginName, pluginCategory, tool)
  )

  if (definitions.length > 0) {
    NodeRegistry.registerAll(definitions)
    console.log(`[PluginToNode] ${pluginName} — ${definitions.length}개 도구 등록`)
  }
}

/** 플러그인의 모든 노드를 NodeRegistry에서 제거 */
export function unregisterPluginTools(pluginId: string): void {
  const pluginIdentifier = `plugin:${pluginId}`
  NodeRegistry.unregisterPlugin(pluginIdentifier)
  console.log(`[PluginToNode] 플러그인 ${pluginId} 노드 해제`)
}

// ─────────────────────────────────────────────
// 자동 동기화 초기화
// ─────────────────────────────────────────────

/**
 * 플러그인 스토어 ↔ NodeRegistry 자동 동기화를 설정합니다.
 * main.tsx에서 한 번 호출하세요.
 */
export function initializePluginNodeSync(): () => void {
  const unsubscribe = setPluginNodeRegistryCallback({
    onPluginStarted(pluginId, tools) {
      const store = usePluginStore.getState()
      const plugin = store.plugins[pluginId]
      if (plugin) {
        registerPluginTools(pluginId, plugin.name, plugin.category, tools)
      }
    },
    onPluginStopped(pluginId) {
      unregisterPluginTools(pluginId)
    },
  })

  // 이미 실행 중인 플러그인이 있으면 복원
  const store = usePluginStore.getState()
  for (const [pluginId, tools] of Object.entries(store.pluginTools)) {
    const plugin = store.plugins[pluginId]
    if (plugin && plugin.status === 'running' && tools.length > 0) {
      registerPluginTools(pluginId, plugin.name, plugin.category, tools)
    }
  }

  return unsubscribe
}

// ─────────────────────────────────────────────
// 전체 동기화 (수동 트리거)
// ─────────────────────────────────────────────

/** 모든 실행 중인 플러그인의 도구를 NodeRegistry에 동기화 */
export function syncAllPluginTools(): void {
  const store = usePluginStore.getState()
  for (const [pluginId, tools] of Object.entries(store.pluginTools)) {
    const plugin = store.plugins[pluginId]
    if (plugin && tools.length > 0) {
      registerPluginTools(pluginId, plugin.name, plugin.category, tools)
    }
  }
}
