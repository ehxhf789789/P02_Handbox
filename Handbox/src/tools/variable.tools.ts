/**
 * Variable/Data 도구 노드 정의 — constant, input
 */
import type { NodeDefinition } from '../registry/NodeDefinition'

export const ConstantDefinition: NodeDefinition = {
  type: 'data.constant',
  category: 'data',
  meta: {
    label: '상수',
    description: '고정 값을 출력합니다. 텍스트, 숫자, JSON 지원.',
    icon: 'Pin',
    color: '#64748b',
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
      let value: any = config.value
      switch (config.type) {
        case 'number': value = Number(config.value); break
        case 'json': try { value = JSON.parse(config.value) } catch { /* keep string */ } break
        case 'boolean': value = config.value === 'true' || config.value === '1'; break
      }
      return { value, text: String(value) }
    },
  },
}

export const DataInputDefinition: NodeDefinition = {
  type: 'data.input',
  category: 'data',
  meta: {
    label: '데이터 입력',
    description: '워크플로우의 시작점. 외부에서 데이터를 주입합니다.',
    icon: 'Input',
    color: '#64748b',
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
    { key: 'data', label: '기본 데이터', type: 'textarea', rows: 5, description: 'JSON 또는 텍스트' },
    { key: 'type', label: '데이터 타입', type: 'select', default: 'text',
      options: [
        { label: '텍스트', value: 'text' },
        { label: 'JSON', value: 'json' },
        { label: '파일 경로', value: 'file' },
      ] },
  ],
  runtime: 'internal',
  executor: {
    async execute(_input, config) {
      let data: any = config.data || ''
      if (config.type === 'json') {
        try { data = JSON.parse(data) } catch { /* keep string */ }
      }
      return { data, text: typeof data === 'string' ? data : JSON.stringify(data) }
    },
  },
}

export const VARIABLE_DEFINITIONS: NodeDefinition[] = [ConstantDefinition, DataInputDefinition]
