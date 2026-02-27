/**
 * Variable 도구 정의 — variable.* (6개 도구)
 * 변수 관리, 상수, 데이터 입출력
 */
import type { UnifiedToolDefinition } from '../registry/UnifiedToolDefinition'

// ============================================================================
// variable.get - 변수 읽기
// ============================================================================
const variableGet: UnifiedToolDefinition = {
  name: 'variable.get',
  version: '1.0.0',
  description: '워크플로우 변수의 값을 가져옵니다.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '변수 이름' },
      default: { description: '기본값' },
    },
    required: ['name'],
  },
  meta: {
    label: '변수 읽기',
    icon: 'DataObject',
    color: '#64748b',
    category: 'variable',
    tags: ['variable', 'get', 'read', '변수', '읽기'],
  },
  ports: {
    inputs: [{ name: 'name', type: 'text', required: false }],
    outputs: [
      { name: 'value', type: 'any', required: true, description: '변수 값' },
      { name: 'exists', type: 'boolean', required: false },
    ],
  },
  configSchema: [
    { key: 'name', label: '변수 이름', type: 'text', required: true },
    { key: 'default', label: '기본값', type: 'textarea' },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const name = (inp.name || cfg.name) as string
      const variables: Record<string, any> = ctx?.variables || {}
      const exists = name in variables
      const value = exists ? variables[name] : (cfg.default ?? null)
      return { value, exists }
    },
  },
}

// ============================================================================
// variable.set - 변수 설정
// ============================================================================
const variableSet: UnifiedToolDefinition = {
  name: 'variable.set',
  version: '1.0.0',
  description: '워크플로우 변수를 설정합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '변수 이름' },
      value: { description: '설정할 값' },
    },
    required: ['name', 'value'],
  },
  meta: {
    label: '변수 설정',
    icon: 'Edit',
    color: '#64748b',
    category: 'variable',
    tags: ['variable', 'set', 'write', '변수', '설정'],
  },
  ports: {
    inputs: [
      { name: 'name', type: 'text', required: false },
      { name: 'value', type: 'any', required: true },
    ],
    outputs: [
      { name: 'value', type: 'any', required: true, description: '설정된 값' },
      { name: 'success', type: 'boolean', required: true },
    ],
  },
  configSchema: [
    { key: 'name', label: '변수 이름', type: 'text', required: true },
    { key: 'scope', label: '범위', type: 'select', default: 'workflow',
      options: [
        { label: '워크플로우', value: 'workflow' },
        { label: '전역', value: 'global' },
        { label: '세션', value: 'session' },
      ] },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const name = (inp.name || cfg.name) as string
      const value = inp.value
      if (ctx?.variables) {
        ctx.variables[name] = value
      }
      return { value, success: true }
    },
  },
}

// ============================================================================
// variable.delete - 변수 삭제
// ============================================================================
const variableDelete: UnifiedToolDefinition = {
  name: 'variable.delete',
  version: '1.0.0',
  description: '워크플로우 변수를 삭제합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '변수 이름' },
    },
    required: ['name'],
  },
  meta: {
    label: '변수 삭제',
    icon: 'Delete',
    color: '#64748b',
    category: 'variable',
    tags: ['variable', 'delete', 'remove', '변수', '삭제'],
  },
  ports: {
    inputs: [{ name: 'name', type: 'text', required: false }],
    outputs: [{ name: 'deleted', type: 'boolean', required: true }],
  },
  configSchema: [
    { key: 'name', label: '변수 이름', type: 'text', required: true },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const name = (inp.name || cfg.name) as string
      let deleted = false
      if (ctx?.variables && name in ctx.variables) {
        delete ctx.variables[name]
        deleted = true
      }
      return { deleted }
    },
  },
}

// ============================================================================
// variable.list - 변수 목록
// ============================================================================
const variableList: UnifiedToolDefinition = {
  name: 'variable.list',
  version: '1.0.0',
  description: '현재 워크플로우의 모든 변수를 나열합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      prefix: { type: 'string', description: '필터 접두사' },
    },
  },
  meta: {
    label: '변수 목록',
    icon: 'List',
    color: '#64748b',
    category: 'variable',
    tags: ['variable', 'list', 'all', '변수', '목록'],
  },
  ports: {
    inputs: [],
    outputs: [
      { name: 'variables', type: 'json', required: true, description: '변수 목록' },
      { name: 'count', type: 'number', required: false },
    ],
  },
  configSchema: [
    { key: 'prefix', label: '접두사 필터', type: 'text' },
    { key: 'include_values', label: '값 포함', type: 'toggle', default: true },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const variables: Record<string, any> = ctx?.variables || {}
      const prefix = ((inp.prefix || cfg.prefix || '') as string)

      let result: Record<string, any> = {}
      for (const [key, value] of Object.entries(variables)) {
        if (!prefix || key.startsWith(prefix)) {
          result[key] = cfg.include_values ? value : typeof value
        }
      }

      return { variables: result, count: Object.keys(result).length }
    },
  },
}

// ============================================================================
// data.constant - 상수
// ============================================================================
const dataConstant: UnifiedToolDefinition = {
  name: 'data.constant',
  version: '1.0.0',
  description: '고정 값을 출력합니다. 텍스트, 숫자, JSON, 불리언 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      value: { description: '상수 값' },
      type: { type: 'string', enum: ['text', 'number', 'json', 'boolean'] },
    },
    required: ['value'],
  },
  meta: {
    label: '상수',
    icon: 'Pin',
    color: '#64748b',
    category: 'variable',
    tags: ['constant', 'value', 'static', '상수', '값'],
  },
  ports: {
    inputs: [],
    outputs: [
      { name: 'value', type: 'any', required: true, description: '상수 값' },
      { name: 'text', type: 'text', required: false, description: '텍스트 형태' },
    ],
  },
  configSchema: [
    { key: 'type', label: '타입', type: 'select', default: 'text',
      options: [
        { label: '텍스트', value: 'text' },
        { label: '숫자', value: 'number' },
        { label: 'JSON', value: 'json' },
        { label: '불리언', value: 'boolean' },
      ] },
    { key: 'value', label: '값', type: 'textarea', required: true, rows: 3 },
  ],
  runtime: 'internal',
  executor: {
    async execute(_input, config) {
      const cfg = config as any
      let value: any = cfg.value
      const cfgValue = cfg.value as string
      switch (cfg.type) {
        case 'number':
          value = Number(cfgValue)
          break
        case 'json':
          try { value = JSON.parse(cfgValue) } catch {}
          break
        case 'boolean':
          value = cfgValue === 'true' || cfgValue === '1'
          break
      }
      return { value, text: String(value) }
    },
  },
}

// ============================================================================
// data.input - 데이터 입력
// ============================================================================
const dataInput: UnifiedToolDefinition = {
  name: 'data.input',
  version: '1.0.0',
  description: '워크플로우의 시작점. 외부에서 데이터를 주입합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { description: '입력 데이터' },
    },
  },
  meta: {
    label: '데이터 입력',
    icon: 'Input',
    color: '#64748b',
    category: 'variable',
    tags: ['input', 'start', 'data', 'entry', '입력', '시작'],
  },
  ports: {
    inputs: [],
    outputs: [
      { name: 'data', type: 'any', required: true, description: '입력 데이터' },
      { name: 'text', type: 'text', required: false, description: '텍스트 형태' },
    ],
  },
  configSchema: [
    { key: 'label', label: '입력 이름', type: 'text', default: 'input' },
    { key: 'data', label: '기본 데이터', type: 'textarea', rows: 5 },
    { key: 'type', label: '데이터 타입', type: 'select', default: 'text',
      options: [
        { label: '텍스트', value: 'text' },
        { label: 'JSON', value: 'json' },
        { label: '파일 경로', value: 'file' },
      ] },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      let data: any = input.data ?? config.data ?? ''
      if (config.type === 'json' && typeof data === 'string') {
        try { data = JSON.parse(data) } catch {}
      }
      return {
        data,
        text: typeof data === 'string' ? data : JSON.stringify(data),
      }
    },
  },
}

// ============================================================================
// Export
// ============================================================================
export const VARIABLE_TOOLS: UnifiedToolDefinition[] = [
  variableGet,
  variableSet,
  variableDelete,
  variableList,
  dataConstant,
  dataInput,
]

// Legacy export
export const VARIABLE_DEFINITIONS = VARIABLE_TOOLS
