/**
 * Control 도구 노드 정의 — if, switch, loop, forEach, while, merge, split, gate, variable.*
 * 순수 TypeScript 로직 (internal runtime)
 */
import type { NodeDefinition } from '../registry/NodeDefinition'

export const IfDefinition: NodeDefinition = {
  type: 'control.if',
  category: 'control',
  meta: {
    label: '조건 분기 (IF)',
    description: '조건에 따라 true/false 경로로 데이터를 보냅니다.',
    icon: 'CallSplit',
    color: '#6366f1',
    tags: ['if', 'condition', 'branch', '조건', '분기'],
  },
  ports: {
    inputs: [
      { name: 'value', type: 'any', required: true, description: '평가할 값' },
    ],
    outputs: [
      { name: 'true_out', type: 'any', required: false, description: '조건이 참일 때' },
      { name: 'false_out', type: 'any', required: false, description: '조건이 거짓일 때' },
    ],
  },
  configSchema: [
    { key: 'condition', label: '조건', type: 'select', default: 'truthy',
      options: [
        { label: 'Truthy (비어있지 않음)', value: 'truthy' },
        { label: '같음 (==)', value: 'equals' },
        { label: '포함 (contains)', value: 'contains' },
        { label: '보다 큼 (>)', value: 'greater' },
        { label: '보다 작음 (<)', value: 'less' },
        { label: '정규식 매치', value: 'regex' },
      ] },
    { key: 'compare_value', label: '비교 값', type: 'text', showWhen: { key: 'condition', value: 'equals' } },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const value = input.value
      let result = false
      switch (config.condition) {
        case 'truthy': result = !!value && value !== '' && value !== '0'; break
        case 'equals': result = String(value) === String(config.compare_value); break
        case 'contains': result = String(value).includes(String(config.compare_value || '')); break
        case 'greater': result = Number(value) > Number(config.compare_value || 0); break
        case 'less': result = Number(value) < Number(config.compare_value || 0); break
        case 'regex': result = new RegExp(config.compare_value || '').test(String(value)); break
      }
      return result ? { true_out: value } : { false_out: value }
    },
  },
}

export const SwitchDefinition: NodeDefinition = {
  type: 'control.switch',
  category: 'control',
  meta: {
    label: '다중 분기 (Switch)',
    description: '값에 따라 여러 경로 중 하나로 라우팅합니다.',
    icon: 'AltRoute',
    color: '#6366f1',
    tags: ['switch', 'case', 'route', '분기', '라우팅'],
  },
  ports: {
    inputs: [{ name: 'value', type: 'any', required: true }],
    outputs: [
      { name: 'case_1', type: 'any', required: false },
      { name: 'case_2', type: 'any', required: false },
      { name: 'case_3', type: 'any', required: false },
      { name: 'default', type: 'any', required: false },
    ],
  },
  configSchema: [
    { key: 'field', label: '비교 필드', type: 'text', description: 'JSON 객체의 키 (비워두면 값 자체)' },
    { key: 'case_1_value', label: 'Case 1 값', type: 'text' },
    { key: 'case_2_value', label: 'Case 2 값', type: 'text' },
    { key: 'case_3_value', label: 'Case 3 값', type: 'text' },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const raw = input.value
      const val = config.field && typeof raw === 'object' ? raw[config.field] : raw
      const strVal = String(val)
      if (strVal === config.case_1_value) return { case_1: raw }
      if (strVal === config.case_2_value) return { case_2: raw }
      if (strVal === config.case_3_value) return { case_3: raw }
      return { default: raw }
    },
  },
}

export const LoopDefinition: NodeDefinition = {
  type: 'control.loop',
  category: 'control',
  meta: {
    label: '반복 (Loop)',
    description: '고정 횟수만큼 반복합니다.',
    icon: 'Loop',
    color: '#6366f1',
    tags: ['loop', 'repeat', 'iterate', '반복', '루프'],
  },
  ports: {
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [
      { name: 'item', type: 'any', required: true, description: '현재 반복의 입력' },
      { name: 'index', type: 'json', required: false, description: '현재 인덱스' },
      { name: 'results', type: 'json', required: false, description: '전체 결과 배열' },
    ],
  },
  configSchema: [
    { key: 'count', label: '반복 횟수', type: 'number', default: 5, required: true },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config, context) {
      const count = config.count || 5
      const results: any[] = []
      for (let i = 0; i < count; i++) {
        context.variables['__loop_index'] = i
        context.variables['__loop_count'] = count
        results.push({ index: i, input: input.input })
      }
      return { item: input.input, index: count - 1, results }
    },
  },
}

export const ForEachDefinition: NodeDefinition = {
  type: 'control.forEach',
  category: 'control',
  meta: {
    label: '배열 순회 (ForEach)',
    description: '배열의 각 항목에 대해 순차 처리합니다.',
    icon: 'Replay',
    color: '#6366f1',
    tags: ['forEach', 'array', 'iterate', 'map', '순회', '배열'],
  },
  ports: {
    inputs: [{ name: 'array', type: 'json', required: true, description: '순회할 배열' }],
    outputs: [
      { name: 'item', type: 'any', required: true, description: '현재 항목' },
      { name: 'index', type: 'json', required: false },
      { name: 'results', type: 'json', required: false, description: '처리 결과 배열' },
    ],
  },
  configSchema: [],
  runtime: 'internal',
  executor: {
    async execute(input, _config, context) {
      const arr = Array.isArray(input.array) ? input.array : [input.array]
      const results: any[] = []
      for (let i = 0; i < arr.length; i++) {
        context.variables['__loop_item'] = arr[i]
        context.variables['__loop_index'] = i
        results.push(arr[i])
      }
      return { item: arr[arr.length - 1], index: arr.length - 1, results }
    },
  },
}

export const WhileDefinition: NodeDefinition = {
  type: 'control.while',
  category: 'control',
  meta: {
    label: '조건 반복 (While)',
    description: '조건이 참인 동안 반복합니다. 최대 반복 횟수로 무한 루프를 방지.',
    icon: 'Autorenew',
    color: '#6366f1',
    tags: ['while', 'loop', 'condition', '조건반복'],
  },
  ports: {
    inputs: [{ name: 'input', type: 'any', required: false }],
    outputs: [
      { name: 'result', type: 'any', required: true },
      { name: 'iterations', type: 'json', required: false },
    ],
  },
  configSchema: [
    { key: 'max_iterations', label: '최대 반복 횟수', type: 'number', default: 100 },
    { key: 'condition_field', label: '조건 필드', type: 'text', description: '이 필드가 truthy인 동안 반복' },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      return { result: input.input, iterations: config.max_iterations }
    },
  },
}

export const MergeDefinition: NodeDefinition = {
  type: 'control.merge',
  category: 'control',
  meta: {
    label: '데이터 병합',
    description: '여러 입력을 하나로 병합합니다. 객체, 배열, 텍스트 모드.',
    icon: 'MergeType',
    color: '#6366f1',
    tags: ['merge', 'combine', 'join', '병합', '결합'],
  },
  ports: {
    inputs: [
      { name: 'input_1', type: 'any', required: true },
      { name: 'input_2', type: 'any', required: false },
      { name: 'input_3', type: 'any', required: false },
    ],
    outputs: [{ name: 'merged', type: 'json', required: true }],
  },
  configSchema: [
    { key: 'mode', label: '병합 방식', type: 'select', default: 'object',
      options: [
        { label: '객체 병합', value: 'object' },
        { label: '배열 결합', value: 'array' },
        { label: '텍스트 결합', value: 'text' },
      ] },
    { key: 'separator', label: '구분자 (텍스트)', type: 'text', default: '\\n', showWhen: { key: 'mode', value: 'text' } },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const values = [input.input_1, input.input_2, input.input_3].filter(v => v !== undefined && v !== null)
      switch (config.mode) {
        case 'array': return { merged: values }
        case 'text': return { merged: values.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(config.separator || '\n') }
        default: return { merged: Object.assign({}, ...values.map(v => typeof v === 'object' ? v : { value: v })) }
      }
    },
  },
}

export const SplitDefinition: NodeDefinition = {
  type: 'control.split',
  category: 'control',
  meta: {
    label: '데이터 분할',
    description: '하나의 입력을 여러 출력으로 분할합니다.',
    icon: 'CallSplit',
    color: '#6366f1',
    tags: ['split', 'fork', '분할'],
  },
  ports: {
    inputs: [{ name: 'input', type: 'any', required: true }],
    outputs: [
      { name: 'output_1', type: 'any', required: true },
      { name: 'output_2', type: 'any', required: true },
      { name: 'output_3', type: 'any', required: false },
    ],
  },
  configSchema: [],
  runtime: 'internal',
  executor: {
    async execute(input) {
      return { output_1: input.input, output_2: input.input, output_3: input.input }
    },
  },
}

export const GateDefinition: NodeDefinition = {
  type: 'control.gate',
  category: 'control',
  meta: {
    label: '게이트',
    description: '조건에 따라 데이터 흐름을 허용/차단합니다.',
    icon: 'Block',
    color: '#6366f1',
    tags: ['gate', 'filter', 'block', 'pass', '게이트', '필터'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: true },
      { name: 'gate', type: 'any', required: false, description: 'truthy면 통과' },
    ],
    outputs: [{ name: 'output', type: 'any', required: true }],
  },
  configSchema: [
    { key: 'default_open', label: '기본 열림', type: 'toggle', default: true },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const gateOpen = input.gate !== undefined ? !!input.gate : config.default_open
      if (gateOpen) return { output: input.data }
      return { output: null }
    },
  },
}

export const VariableGetDefinition: NodeDefinition = {
  type: 'control.variable-get',
  category: 'control',
  meta: {
    label: '변수 읽기',
    description: '워크플로우 컨텍스트에서 변수를 읽습니다.',
    icon: 'Input',
    color: '#6366f1',
    tags: ['variable', 'get', 'read', '변수', '읽기'],
  },
  ports: {
    inputs: [],
    outputs: [{ name: 'value', type: 'any', required: true }],
  },
  configSchema: [
    { key: 'name', label: '변수명', type: 'text', required: true },
    { key: 'default_value', label: '기본값', type: 'text' },
  ],
  runtime: 'internal',
  executor: {
    async execute(_input, config, context) {
      const value = context.variables[config.name] ?? config.default_value ?? null
      return { value }
    },
  },
}

export const VariableSetDefinition: NodeDefinition = {
  type: 'control.variable-set',
  category: 'control',
  meta: {
    label: '변수 쓰기',
    description: '워크플로우 컨텍스트에 변수를 설정합니다.',
    icon: 'Output',
    color: '#6366f1',
    tags: ['variable', 'set', 'write', '변수', '쓰기'],
  },
  ports: {
    inputs: [{ name: 'value', type: 'any', required: true }],
    outputs: [{ name: 'value', type: 'any', required: true }],
  },
  configSchema: [
    { key: 'name', label: '변수명', type: 'text', required: true },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config, context) {
      context.variables[config.name] = input.value
      return { value: input.value }
    },
  },
}

export const CONTROL_DEFINITIONS: NodeDefinition[] = [
  IfDefinition, SwitchDefinition, LoopDefinition, ForEachDefinition, WhileDefinition,
  MergeDefinition, SplitDefinition, GateDefinition,
  VariableGetDefinition, VariableSetDefinition,
]
