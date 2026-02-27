/**
 * JSON Tools - JSON 처리/변환
 *
 * 원자화된 JSON 도구 10개:
 * - json.parse      : JSON 파싱
 * - json.stringify  : JSON 문자열화
 * - json.query      : JSONPath 쿼리
 * - json.get        : 값 가져오기
 * - json.set        : 값 설정하기
 * - json.delete     : 키 삭제하기
 * - json.merge      : 객체 병합
 * - json.flatten    : 평탄화
 * - json.unflatten  : 평탄화 해제
 * - json.validate   : JSON 검증
 */

import type {
  UnifiedToolDefinition,
  ToolExecutor,
  ToolResult,
  ToolExecutionContext,
} from '../registry/UnifiedToolDefinition'

// ============================================================
// Helper: JSONPath 간단 구현
// ============================================================

function getByPath(obj: unknown, path: string): unknown {
  if (!path || path === '$') return obj

  const parts = path.replace(/^\$\.?/, '').split(/[\.\[\]]/).filter(Boolean)
  let current: unknown = obj

  for (const part of parts) {
    if (current == null) return undefined
    if (Array.isArray(current)) {
      const index = parseInt(part, 10)
      current = current[index]
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }

  return current
}

function setByPath(obj: unknown, path: string, value: unknown): unknown {
  if (!path || path === '$') return value

  const result = JSON.parse(JSON.stringify(obj || {}))
  const parts = path.replace(/^\$\.?/, '').split(/[\.\[\]]/).filter(Boolean)
  let current: any = result

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    const nextPart = parts[i + 1]
    const isNextArray = !isNaN(parseInt(nextPart, 10))

    if (!(part in current)) {
      current[part] = isNextArray ? [] : {}
    }
    current = current[part]
  }

  const lastPart = parts[parts.length - 1]
  current[lastPart] = value

  return result
}

function deleteByPath(obj: unknown, path: string): unknown {
  if (!path || path === '$') return undefined

  const result = JSON.parse(JSON.stringify(obj || {}))
  const parts = path.replace(/^\$\.?/, '').split(/[\.\[\]]/).filter(Boolean)
  let current: any = result

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!(part in current)) return result
    current = current[part]
  }

  const lastPart = parts[parts.length - 1]
  if (Array.isArray(current)) {
    current.splice(parseInt(lastPart, 10), 1)
  } else {
    delete current[lastPart]
  }

  return result
}

// ============================================================
// json.parse - JSON 파싱
// ============================================================

const jsonParseExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || inputs.json || config.text || '') as string
    const strict = config.strict !== false

    if (!text) {
      return { success: false, outputs: {}, error: 'JSON 텍스트가 필요합니다' }
    }

    try {
      let jsonText = text.trim()

      // Non-strict mode: try to fix common issues
      if (!strict) {
        // Remove trailing commas
        jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1')
        // Fix single quotes to double quotes
        jsonText = jsonText.replace(/'/g, '"')
      }

      const data = JSON.parse(jsonText)

      return {
        success: true,
        outputs: {
          data,
          type: Array.isArray(data) ? 'array' : typeof data,
          keys: typeof data === 'object' && data !== null ? Object.keys(data) : [],
          length: Array.isArray(data) ? data.length : Object.keys(data || {}).length,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return {
        success: false,
        outputs: { valid: false },
        error: `JSON 파싱 실패: ${error}`,
      }
    }
  },
}

export const jsonParse: UnifiedToolDefinition = {
  name: 'json.parse',
  version: '1.0.0',
  description: 'JSON 문자열을 JavaScript 객체로 파싱합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'JSON 문자열' },
      strict: { type: 'boolean', description: '엄격 모드 (기본: true)', default: true },
    },
    required: ['text'],
  },
  meta: {
    label: 'JSON 파싱',
    description: 'JSON 문자열을 객체로 변환합니다',
    icon: 'Code',
    color: '#f59e0b',
    category: 'json',
    tags: ['json', 'parse', 'decode', '파싱'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: 'JSON 문자열' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '파싱된 객체' },
      { name: 'type', type: 'text', required: false, description: '데이터 타입' },
      { name: 'keys', type: 'json', required: false, description: '최상위 키 배열' },
      { name: 'length', type: 'number', required: false, description: '요소 수' },
    ],
  },
  configSchema: [
    { key: 'strict', label: '엄격 모드', type: 'toggle', default: true, description: '비활성화 시 일반적인 오류 자동 수정' },
  ],
  runtime: 'internal',
  executor: jsonParseExecutor,
}

// ============================================================
// json.stringify - JSON 문자열화
// ============================================================

const jsonStringifyExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const data = inputs.data ?? inputs.json ?? config.data
    const indent = config.indent as number | undefined
    const sortKeys = config.sortKeys as boolean | undefined

    if (data === undefined) {
      return { success: false, outputs: {}, error: '데이터가 필요합니다' }
    }

    try {
      let obj = data

      // Sort keys if requested
      if (sortKeys && typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
        const sorted: Record<string, unknown> = {}
        Object.keys(obj as Record<string, unknown>)
          .sort()
          .forEach(key => {
            sorted[key] = (obj as Record<string, unknown>)[key]
          })
        obj = sorted
      }

      const text = JSON.stringify(obj, null, indent ?? 2)

      return {
        success: true,
        outputs: {
          text,
          json: text,
          length: text.length,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `JSON 문자열화 실패: ${error}` }
    }
  },
}

export const jsonStringify: UnifiedToolDefinition = {
  name: 'json.stringify',
  version: '1.0.0',
  description: 'JavaScript 객체를 JSON 문자열로 변환합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { description: '변환할 객체' },
      indent: { type: 'number', description: '들여쓰기 공백 수', default: 2 },
      sortKeys: { type: 'boolean', description: '키 정렬 여부' },
    },
    required: ['data'],
  },
  meta: {
    label: 'JSON 문자열화',
    description: '객체를 JSON 문자열로 변환합니다',
    icon: 'TextFields',
    color: '#f59e0b',
    category: 'json',
    tags: ['json', 'stringify', 'encode', '문자열화'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '입력 객체' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: 'JSON 문자열' },
      { name: 'json', type: 'text', required: false, description: 'JSON 문자열 (alias)' },
      { name: 'length', type: 'number', required: false, description: '문자열 길이' },
    ],
  },
  configSchema: [
    { key: 'indent', label: '들여쓰기', type: 'number', default: 2 },
    { key: 'sortKeys', label: '키 정렬', type: 'toggle', default: false },
  ],
  runtime: 'internal',
  executor: jsonStringifyExecutor,
}

// ============================================================
// json.query - JSONPath 쿼리
// ============================================================

const jsonQueryExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const data = inputs.data ?? inputs.json
    const path = (inputs.path || config.path || '$') as string

    if (data === undefined) {
      return { success: false, outputs: {}, error: '데이터가 필요합니다' }
    }

    try {
      const result = getByPath(data, path)
      const found = result !== undefined

      return {
        success: true,
        outputs: {
          result,
          value: result,
          found,
          type: found ? (Array.isArray(result) ? 'array' : typeof result) : null,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `쿼리 실패: ${error}` }
    }
  },
}

export const jsonQuery: UnifiedToolDefinition = {
  name: 'json.query',
  version: '1.0.0',
  description: 'JSONPath 표현식으로 객체에서 값을 추출합니다. 예: $.users[0].name',
  inputSchema: {
    type: 'object',
    properties: {
      data: { description: '쿼리할 객체' },
      path: { type: 'string', description: 'JSONPath 경로 (예: $.users[0].name)' },
    },
    required: ['data', 'path'],
  },
  meta: {
    label: 'JSON 쿼리',
    description: 'JSONPath로 값을 추출합니다',
    icon: 'Search',
    color: '#f59e0b',
    category: 'json',
    tags: ['json', 'query', 'jsonpath', 'extract', '쿼리'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '입력 객체' },
      { name: 'path', type: 'text', required: false, description: 'JSONPath 경로' },
    ],
    outputs: [
      { name: 'result', type: 'any', required: true, description: '추출된 값' },
      { name: 'value', type: 'any', required: false, description: '추출된 값 (alias)' },
      { name: 'found', type: 'boolean', required: false, description: '값 존재 여부' },
      { name: 'type', type: 'text', required: false, description: '값의 타입' },
    ],
  },
  configSchema: [
    { key: 'path', label: 'JSONPath 경로', type: 'text', default: '$', description: '예: $.data.items[0]' },
  ],
  runtime: 'internal',
  executor: jsonQueryExecutor,
}

// ============================================================
// json.get - 값 가져오기
// ============================================================

const jsonGetExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const data = inputs.data ?? inputs.json
    const key = (inputs.key || config.key) as string
    const defaultValue = config.default

    if (data === undefined) {
      return { success: false, outputs: {}, error: '데이터가 필요합니다' }
    }

    try {
      let value: unknown

      if (typeof data === 'object' && data !== null) {
        if (key.includes('.') || key.includes('[')) {
          // Treat as path
          value = getByPath(data, key)
        } else {
          value = (data as Record<string, unknown>)[key]
        }
      }

      const result = value !== undefined ? value : defaultValue

      return {
        success: true,
        outputs: {
          value: result,
          found: value !== undefined,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `값 가져오기 실패: ${error}` }
    }
  },
}

export const jsonGet: UnifiedToolDefinition = {
  name: 'json.get',
  version: '1.0.0',
  description: '객체에서 특정 키의 값을 가져옵니다. 점 표기법 지원 (예: user.name).',
  inputSchema: {
    type: 'object',
    properties: {
      data: { description: '대상 객체' },
      key: { type: 'string', description: '키 또는 경로' },
      default: { description: '키가 없을 때 기본값' },
    },
    required: ['data', 'key'],
  },
  meta: {
    label: '값 가져오기',
    description: '객체에서 값을 가져옵니다',
    icon: 'Download',
    color: '#f59e0b',
    category: 'json',
    tags: ['json', 'get', 'extract', 'value', '가져오기'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '입력 객체' },
      { name: 'key', type: 'text', required: true, description: '키 또는 경로' },
    ],
    outputs: [
      { name: 'value', type: 'any', required: true, description: '값' },
      { name: 'found', type: 'boolean', required: false, description: '키 존재 여부' },
    ],
  },
  configSchema: [
    { key: 'key', label: '키', type: 'text', required: true },
    { key: 'default', label: '기본값', type: 'text' },
  ],
  runtime: 'internal',
  executor: jsonGetExecutor,
}

// ============================================================
// json.set - 값 설정하기
// ============================================================

const jsonSetExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const data = inputs.data ?? inputs.json ?? {}
    const key = (inputs.key || config.key) as string
    const value = inputs.value ?? config.value

    if (!key) {
      return { success: false, outputs: {}, error: '키가 필요합니다' }
    }

    try {
      let result: unknown

      if (key.includes('.') || key.includes('[')) {
        result = setByPath(data, key, value)
      } else {
        result = { ...(data as Record<string, unknown>), [key]: value }
      }

      return {
        success: true,
        outputs: { data: result, result },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `값 설정 실패: ${error}` }
    }
  },
}

export const jsonSet: UnifiedToolDefinition = {
  name: 'json.set',
  version: '1.0.0',
  description: '객체에 값을 설정합니다. 점 표기법으로 중첩 경로 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { description: '대상 객체' },
      key: { type: 'string', description: '키 또는 경로' },
      value: { description: '설정할 값' },
    },
    required: ['key', 'value'],
  },
  meta: {
    label: '값 설정하기',
    description: '객체에 값을 설정합니다',
    icon: 'Upload',
    color: '#f59e0b',
    category: 'json',
    tags: ['json', 'set', 'update', 'value', '설정'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: false, description: '입력 객체 (없으면 새로 생성)' },
      { name: 'key', type: 'text', required: true, description: '키 또는 경로' },
      { name: 'value', type: 'any', required: true, description: '설정할 값' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '결과 객체' },
      { name: 'result', type: 'json', required: false, description: '결과 객체 (alias)' },
    ],
  },
  configSchema: [
    { key: 'key', label: '키', type: 'text', required: true },
    { key: 'value', label: '값', type: 'text' },
  ],
  runtime: 'internal',
  executor: jsonSetExecutor,
}

// ============================================================
// json.delete - 키 삭제하기
// ============================================================

const jsonDeleteExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const data = inputs.data ?? inputs.json
    const key = (inputs.key || config.key) as string

    if (data === undefined) {
      return { success: false, outputs: {}, error: '데이터가 필요합니다' }
    }

    if (!key) {
      return { success: false, outputs: {}, error: '키가 필요합니다' }
    }

    try {
      const result = deleteByPath(data, key)

      return {
        success: true,
        outputs: { data: result, result },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `키 삭제 실패: ${error}` }
    }
  },
}

export const jsonDelete: UnifiedToolDefinition = {
  name: 'json.delete',
  version: '1.0.0',
  description: '객체에서 키를 삭제합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { description: '대상 객체' },
      key: { type: 'string', description: '삭제할 키 또는 경로' },
    },
    required: ['data', 'key'],
  },
  meta: {
    label: '키 삭제하기',
    description: '객체에서 키를 삭제합니다',
    icon: 'Delete',
    color: '#f59e0b',
    category: 'json',
    tags: ['json', 'delete', 'remove', '삭제'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '입력 객체' },
      { name: 'key', type: 'text', required: true, description: '삭제할 키' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '결과 객체' },
    ],
  },
  configSchema: [
    { key: 'key', label: '키', type: 'text', required: true },
  ],
  runtime: 'internal',
  executor: jsonDeleteExecutor,
}

// ============================================================
// json.merge - 객체 병합
// ============================================================

const jsonMergeExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const objects = inputs.objects as unknown[]
    const deep = config.deep !== false

    if (!Array.isArray(objects) || objects.length === 0) {
      return { success: false, outputs: {}, error: '병합할 객체 배열이 필요합니다' }
    }

    try {
      const deepMerge = (target: any, source: any): any => {
        if (!source) return target
        const output = { ...target }

        for (const key of Object.keys(source)) {
          if (
            deep &&
            typeof source[key] === 'object' &&
            source[key] !== null &&
            !Array.isArray(source[key]) &&
            typeof output[key] === 'object' &&
            output[key] !== null &&
            !Array.isArray(output[key])
          ) {
            output[key] = deepMerge(output[key], source[key])
          } else {
            output[key] = source[key]
          }
        }

        return output
      }

      let result = {}
      for (const obj of objects) {
        if (typeof obj === 'object' && obj !== null) {
          result = deep ? deepMerge(result, obj) : { ...result, ...obj }
        }
      }

      return {
        success: true,
        outputs: {
          data: result,
          result,
          keys: Object.keys(result),
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `병합 실패: ${error}` }
    }
  },
}

export const jsonMerge: UnifiedToolDefinition = {
  name: 'json.merge',
  version: '1.0.0',
  description: '여러 객체를 하나로 병합합니다. 깊은 병합을 지원합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      objects: { type: 'array', items: { type: 'object' }, description: '병합할 객체 배열' },
      deep: { type: 'boolean', description: '깊은 병합 여부', default: true },
    },
    required: ['objects'],
  },
  meta: {
    label: '객체 병합',
    description: '여러 객체를 병합합니다',
    icon: 'MergeType',
    color: '#f59e0b',
    category: 'json',
    tags: ['json', 'merge', 'combine', '병합'],
  },
  ports: {
    inputs: [
      { name: 'objects', type: 'json', required: true, description: '객체 배열' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '병합된 객체' },
      { name: 'result', type: 'json', required: false, description: '병합된 객체 (alias)' },
      { name: 'keys', type: 'json', required: false, description: '키 배열' },
    ],
  },
  configSchema: [
    { key: 'deep', label: '깊은 병합', type: 'toggle', default: true },
  ],
  runtime: 'internal',
  executor: jsonMergeExecutor,
}

// ============================================================
// json.flatten - 평탄화
// ============================================================

const jsonFlattenExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const data = inputs.data ?? inputs.json
    const delimiter = (config.delimiter || '.') as string
    const maxDepth = (config.maxDepth || 10) as number

    if (data === undefined) {
      return { success: false, outputs: {}, error: '데이터가 필요합니다' }
    }

    try {
      const flatten = (obj: unknown, prefix = '', depth = 0): Record<string, unknown> => {
        const result: Record<string, unknown> = {}

        if (depth >= maxDepth || obj === null || typeof obj !== 'object') {
          if (prefix) {
            result[prefix] = obj
          }
          return result
        }

        if (Array.isArray(obj)) {
          obj.forEach((item, index) => {
            const key = prefix ? `${prefix}[${index}]` : `[${index}]`
            Object.assign(result, flatten(item, key, depth + 1))
          })
        } else {
          for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}${delimiter}${key}` : key
            Object.assign(result, flatten(value, newKey, depth + 1))
          }
        }

        return result
      }

      const result = flatten(data)

      return {
        success: true,
        outputs: {
          data: result,
          result,
          keys: Object.keys(result),
          count: Object.keys(result).length,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `평탄화 실패: ${error}` }
    }
  },
}

export const jsonFlatten: UnifiedToolDefinition = {
  name: 'json.flatten',
  version: '1.0.0',
  description: '중첩된 객체를 평탄화합니다. 예: {a: {b: 1}} -> {"a.b": 1}',
  inputSchema: {
    type: 'object',
    properties: {
      data: { description: '평탄화할 객체' },
      delimiter: { type: 'string', description: '키 구분자', default: '.' },
      maxDepth: { type: 'number', description: '최대 깊이', default: 10 },
    },
    required: ['data'],
  },
  meta: {
    label: 'JSON 평탄화',
    description: '중첩 객체를 평탄화합니다',
    icon: 'UnfoldLess',
    color: '#f59e0b',
    category: 'json',
    tags: ['json', 'flatten', 'unnest', '평탄화'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '입력 객체' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '평탄화된 객체' },
      { name: 'keys', type: 'json', required: false, description: '키 배열' },
      { name: 'count', type: 'number', required: false, description: '키 개수' },
    ],
  },
  configSchema: [
    { key: 'delimiter', label: '구분자', type: 'text', default: '.' },
    { key: 'maxDepth', label: '최대 깊이', type: 'number', default: 10 },
  ],
  runtime: 'internal',
  executor: jsonFlattenExecutor,
}

// ============================================================
// json.unflatten - 평탄화 해제
// ============================================================

const jsonUnflattenExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const data = inputs.data ?? inputs.json
    const delimiter = (config.delimiter || '.') as string

    if (data === undefined || typeof data !== 'object' || data === null) {
      return { success: false, outputs: {}, error: '평탄화된 객체가 필요합니다' }
    }

    try {
      const result: Record<string, unknown> = {}

      for (const [flatKey, value] of Object.entries(data as Record<string, unknown>)) {
        const keys = flatKey.split(delimiter)
        let current: any = result

        for (let i = 0; i < keys.length - 1; i++) {
          const key = keys[i]
          const nextKey = keys[i + 1]
          const isNextArray = /^\d+$/.test(nextKey)

          if (!(key in current)) {
            current[key] = isNextArray ? [] : {}
          }
          current = current[key]
        }

        current[keys[keys.length - 1]] = value
      }

      return {
        success: true,
        outputs: { data: result, result },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `평탄화 해제 실패: ${error}` }
    }
  },
}

export const jsonUnflatten: UnifiedToolDefinition = {
  name: 'json.unflatten',
  version: '1.0.0',
  description: '평탄화된 객체를 중첩 구조로 복원합니다. 예: {"a.b": 1} -> {a: {b: 1}}',
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: 'object', description: '평탄화된 객체' },
      delimiter: { type: 'string', description: '키 구분자', default: '.' },
    },
    required: ['data'],
  },
  meta: {
    label: 'JSON 평탄화 해제',
    description: '평탄화된 객체를 복원합니다',
    icon: 'UnfoldMore',
    color: '#f59e0b',
    category: 'json',
    tags: ['json', 'unflatten', 'nest', '평탄화해제'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '평탄화된 객체' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '중첩 객체' },
    ],
  },
  configSchema: [
    { key: 'delimiter', label: '구분자', type: 'text', default: '.' },
  ],
  runtime: 'internal',
  executor: jsonUnflattenExecutor,
}

// ============================================================
// json.validate - JSON 검증
// ============================================================

const jsonValidateExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || inputs.json || config.text || '') as string

    if (!text) {
      return { success: true, outputs: { valid: false, error: 'Empty input' }, metadata: { executionTime: Date.now() - startTime } }
    }

    try {
      const data = JSON.parse(text.trim())

      return {
        success: true,
        outputs: {
          valid: true,
          data,
          type: Array.isArray(data) ? 'array' : typeof data,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      return {
        success: true,
        outputs: {
          valid: false,
          error: errorMessage,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    }
  },
}

export const jsonValidate: UnifiedToolDefinition = {
  name: 'json.validate',
  version: '1.0.0',
  description: 'JSON 문자열이 유효한지 검증합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '검증할 JSON 문자열' },
    },
    required: ['text'],
  },
  meta: {
    label: 'JSON 검증',
    description: 'JSON 유효성을 검증합니다',
    icon: 'CheckCircle',
    color: '#f59e0b',
    category: 'json',
    tags: ['json', 'validate', 'check', '검증'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: 'JSON 문자열' },
    ],
    outputs: [
      { name: 'valid', type: 'boolean', required: true, description: '유효 여부' },
      { name: 'data', type: 'json', required: false, description: '파싱된 데이터 (유효할 경우)' },
      { name: 'error', type: 'text', required: false, description: '에러 메시지 (무효할 경우)' },
    ],
  },
  configSchema: [],
  runtime: 'internal',
  executor: jsonValidateExecutor,
}

// ============================================================
// Export All JSON Tools
// ============================================================

export const JSON_TOOLS: UnifiedToolDefinition[] = [
  jsonParse,
  jsonStringify,
  jsonQuery,
  jsonGet,
  jsonSet,
  jsonDelete,
  jsonMerge,
  jsonFlatten,
  jsonUnflatten,
  jsonValidate,
]
