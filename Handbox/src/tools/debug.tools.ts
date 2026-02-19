/**
 * Debug 도구 노드 정의 — log, inspect, breakpoint
 */
import type { NodeDefinition } from '../registry/NodeDefinition'

export const LogDefinition: NodeDefinition = {
  type: 'debug.log',
  category: 'debug',
  meta: {
    label: '로그',
    description: '데이터를 콘솔에 출력합니다. 디버깅용.',
    icon: 'BugReport',
    color: '#a855f7',
    tags: ['log', 'debug', 'console', 'print', '로그', '디버그'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'any', required: true, description: '로깅할 데이터' }],
    outputs: [{ name: 'data', type: 'any', required: true, description: '입력 데이터 (패스스루)' }],
  },
  configSchema: [
    { key: 'label', label: '라벨', type: 'text', default: 'DEBUG', description: '로그 메시지 접두사' },
    { key: 'format', label: '형식', type: 'select', default: 'auto',
      options: [
        { label: '자동', value: 'auto' },
        { label: 'JSON (정렬)', value: 'json' },
        { label: '텍스트', value: 'text' },
      ] },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const label = config.label || 'DEBUG'
      const data = input.data
      let display: string
      if (config.format === 'json') {
        display = JSON.stringify(data, null, 2)
      } else if (config.format === 'text') {
        display = String(data)
      } else {
        display = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)
      }
      console.log(`[${label}]`, display)
      return { data }
    },
  },
}

export const InspectDefinition: NodeDefinition = {
  type: 'debug.inspect',
  category: 'debug',
  meta: {
    label: '데이터 검사',
    description: '데이터의 타입, 크기, 구조를 분석합니다.',
    icon: 'Visibility',
    color: '#a855f7',
    tags: ['inspect', 'debug', 'type', 'structure', '검사', '분석'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'any', required: true }],
    outputs: [
      { name: 'data', type: 'any', required: true, description: '원본 데이터 (패스스루)' },
      { name: 'info', type: 'json', required: true, description: '분석 정보' },
    ],
  },
  configSchema: [],
  runtime: 'internal',
  executor: {
    async execute(input) {
      const data = input.data
      const info: Record<string, any> = {
        type: typeof data,
        isNull: data === null || data === undefined,
        isArray: Array.isArray(data),
      }
      if (typeof data === 'string') {
        info.length = data.length
        info.lines = data.split('\n').length
        info.words = data.split(/\s+/).filter(Boolean).length
      } else if (Array.isArray(data)) {
        info.length = data.length
        info.firstItemType = data.length > 0 ? typeof data[0] : 'empty'
      } else if (typeof data === 'object' && data !== null) {
        info.keys = Object.keys(data)
        info.keyCount = Object.keys(data).length
      }
      info.sizeBytes = new TextEncoder().encode(JSON.stringify(data)).length
      return { data, info }
    },
  },
}

export const BreakpointDefinition: NodeDefinition = {
  type: 'debug.breakpoint',
  category: 'debug',
  meta: {
    label: '브레이크포인트',
    description: '실행을 일시 중지합니다. 디버거에서 변수를 검사할 수 있습니다.',
    icon: 'PauseCircle',
    color: '#a855f7',
    tags: ['breakpoint', 'pause', 'debug', '브레이크포인트', '중지'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'any', required: true }],
    outputs: [{ name: 'data', type: 'any', required: true }],
  },
  configSchema: [
    { key: 'enabled', label: '활성화', type: 'toggle', default: true },
    { key: 'message', label: '메시지', type: 'text', description: '중지 시 표시할 메시지' },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      if (config.enabled) {
        console.log(`[BREAKPOINT] ${config.message || '실행 중지'}`, input.data)
      }
      return { data: input.data }
    },
  },
}

export const DEBUG_DEFINITIONS: NodeDefinition[] = [LogDefinition, InspectDefinition, BreakpointDefinition]
