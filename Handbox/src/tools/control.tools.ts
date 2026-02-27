/**
 * Control Tools - 흐름 제어
 *
 * 원자화된 제어 도구 12개:
 * - control.if       : 조건 분기
 * - control.switch   : 다중 분기
 * - control.loop     : 반복
 * - control.forEach  : 배열 순회
 * - control.while    : 조건 반복
 * - control.parallel : 병렬 실행
 * - control.merge    : 데이터 병합
 * - control.split    : 데이터 분할
 * - control.gate     : 게이트
 * - control.delay    : 지연
 * - control.retry    : 재시도
 * - control.error    : 에러 핸들링
 */

import type {
  UnifiedToolDefinition,
  ToolExecutor,
  ToolResult,
  ToolExecutionContext,
} from '../registry/UnifiedToolDefinition'

// ============================================================
// control.if - 조건 분기
// ============================================================

const controlIfExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const value = inputs.value
    const condition = (config.condition || 'truthy') as string
    const compareValue = config.compare_value

    let result = false

    switch (condition) {
      case 'truthy':
        result = !!value && value !== '' && value !== '0' && value !== 0
        break
      case 'falsy':
        result = !value || value === '' || value === '0' || value === 0
        break
      case 'equals':
        result = String(value) === String(compareValue)
        break
      case 'not_equals':
        result = String(value) !== String(compareValue)
        break
      case 'contains':
        result = String(value).includes(String(compareValue || ''))
        break
      case 'greater':
        result = Number(value) > Number(compareValue || 0)
        break
      case 'less':
        result = Number(value) < Number(compareValue || 0)
        break
      case 'regex':
        try {
          result = new RegExp(String(compareValue || '')).test(String(value))
        } catch {
          result = false
        }
        break
      case 'empty':
        result = value === null || value === undefined || value === '' ||
          (Array.isArray(value) && value.length === 0) ||
          (typeof value === 'object' && Object.keys(value as object).length === 0)
        break
      case 'not_empty':
        result = !(value === null || value === undefined || value === '' ||
          (Array.isArray(value) && value.length === 0) ||
          (typeof value === 'object' && Object.keys(value as object).length === 0))
        break
    }

    return {
      success: true,
      outputs: result ? { true_out: value, result: value } : { false_out: value, result: value },
      metadata: { executionTime: Date.now() - startTime },
    }
  },
}

export const controlIf: UnifiedToolDefinition = {
  name: 'control.if',
  version: '1.0.0',
  description: '조건에 따라 데이터를 true 또는 false 경로로 분기합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      value: { description: '평가할 값' },
      condition: { type: 'string', enum: ['truthy', 'falsy', 'equals', 'not_equals', 'contains', 'greater', 'less', 'regex', 'empty', 'not_empty'] },
      compare_value: { description: '비교할 값' },
    },
    required: ['value'],
  },
  meta: {
    label: '조건 분기',
    description: '조건에 따라 분기합니다',
    icon: 'CallSplit',
    color: '#64748b',
    category: 'control',
    tags: ['if', 'condition', 'branch', '조건', '분기'],
  },
  ports: {
    inputs: [
      { name: 'value', type: 'any', required: true, description: '평가할 값' },
    ],
    outputs: [
      { name: 'true_out', type: 'any', required: false, description: '조건이 참일 때' },
      { name: 'false_out', type: 'any', required: false, description: '조건이 거짓일 때' },
      { name: 'result', type: 'any', required: false, description: '입력값 통과' },
    ],
  },
  configSchema: [
    {
      key: 'condition', label: '조건', type: 'select', default: 'truthy',
      options: [
        { value: 'truthy', label: 'Truthy (참)' },
        { value: 'falsy', label: 'Falsy (거짓)' },
        { value: 'equals', label: '같음 (==)' },
        { value: 'not_equals', label: '다름 (!=)' },
        { value: 'contains', label: '포함' },
        { value: 'greater', label: '보다 큼 (>)' },
        { value: 'less', label: '보다 작음 (<)' },
        { value: 'regex', label: '정규식 매치' },
        { value: 'empty', label: '비어있음' },
        { value: 'not_empty', label: '비어있지 않음' },
      ],
    },
    { key: 'compare_value', label: '비교 값', type: 'text' },
  ],
  runtime: 'internal',
  executor: controlIfExecutor,
}

// ============================================================
// control.switch - 다중 분기
// ============================================================

const controlSwitchExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const raw = inputs.value
    const field = config.field as string | undefined
    const val = field && typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)[field] : raw
    const strVal = String(val)

    const cases = [
      { value: config.case_1_value, output: 'case_1' },
      { value: config.case_2_value, output: 'case_2' },
      { value: config.case_3_value, output: 'case_3' },
      { value: config.case_4_value, output: 'case_4' },
    ]

    for (const c of cases) {
      if (c.value !== undefined && c.value !== '' && strVal === String(c.value)) {
        return {
          success: true,
          outputs: { [c.output]: raw, matched: c.output },
          metadata: { executionTime: Date.now() - startTime },
        }
      }
    }

    return {
      success: true,
      outputs: { default: raw, matched: 'default' },
      metadata: { executionTime: Date.now() - startTime },
    }
  },
}

export const controlSwitch: UnifiedToolDefinition = {
  name: 'control.switch',
  version: '1.0.0',
  description: '값에 따라 여러 경로 중 하나로 라우팅합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      value: { description: '평가할 값' },
      field: { type: 'string', description: '객체의 비교 필드' },
      case_1_value: { type: 'string', description: 'Case 1 값' },
      case_2_value: { type: 'string', description: 'Case 2 값' },
      case_3_value: { type: 'string', description: 'Case 3 값' },
      case_4_value: { type: 'string', description: 'Case 4 값' },
    },
    required: ['value'],
  },
  meta: {
    label: '다중 분기',
    description: '값에 따라 여러 경로로 라우팅합니다',
    icon: 'AltRoute',
    color: '#64748b',
    category: 'control',
    tags: ['switch', 'case', 'route', '분기', '라우팅'],
  },
  ports: {
    inputs: [
      { name: 'value', type: 'any', required: true, description: '평가할 값' },
    ],
    outputs: [
      { name: 'case_1', type: 'any', required: false, description: 'Case 1' },
      { name: 'case_2', type: 'any', required: false, description: 'Case 2' },
      { name: 'case_3', type: 'any', required: false, description: 'Case 3' },
      { name: 'case_4', type: 'any', required: false, description: 'Case 4' },
      { name: 'default', type: 'any', required: false, description: '기본' },
      { name: 'matched', type: 'text', required: false, description: '매치된 케이스' },
    ],
  },
  configSchema: [
    { key: 'field', label: '비교 필드', type: 'text', description: '객체의 키 (비워두면 값 자체)' },
    { key: 'case_1_value', label: 'Case 1 값', type: 'text' },
    { key: 'case_2_value', label: 'Case 2 값', type: 'text' },
    { key: 'case_3_value', label: 'Case 3 값', type: 'text' },
    { key: 'case_4_value', label: 'Case 4 값', type: 'text' },
  ],
  runtime: 'internal',
  executor: controlSwitchExecutor,
}

// ============================================================
// control.loop - 반복
// ============================================================

const controlLoopExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const count = (config.count || 5) as number
    const results: Array<{ index: number; input: unknown }> = []

    for (let i = 0; i < count; i++) {
      context.variables.set('__loop_index', i)
      context.variables.set('__loop_count', count)
      results.push({ index: i, input: inputs.input })
    }

    return {
      success: true,
      outputs: {
        item: inputs.input,
        index: count - 1,
        results,
        count,
      },
      metadata: { executionTime: Date.now() - startTime },
    }
  },
}

export const controlLoop: UnifiedToolDefinition = {
  name: 'control.loop',
  version: '1.0.0',
  description: '지정된 횟수만큼 반복합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      input: { description: '반복할 입력' },
      count: { type: 'number', description: '반복 횟수', default: 5 },
    },
  },
  meta: {
    label: '반복',
    description: '고정 횟수만큼 반복합니다',
    icon: 'Loop',
    color: '#64748b',
    category: 'control',
    tags: ['loop', 'repeat', 'iterate', '반복', '루프'],
  },
  ports: {
    inputs: [
      { name: 'input', type: 'any', required: false, description: '입력 데이터' },
    ],
    outputs: [
      { name: 'item', type: 'any', required: true, description: '현재 항목' },
      { name: 'index', type: 'number', required: false, description: '현재 인덱스' },
      { name: 'results', type: 'json', required: false, description: '전체 결과' },
      { name: 'count', type: 'number', required: false, description: '반복 횟수' },
    ],
  },
  configSchema: [
    { key: 'count', label: '반복 횟수', type: 'number', default: 5, required: true },
  ],
  runtime: 'internal',
  executor: controlLoopExecutor,
}

// ============================================================
// control.forEach - 배열 순회
// ============================================================

const controlForEachExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    _config: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const arr = Array.isArray(inputs.array) ? inputs.array : [inputs.array]

    for (let i = 0; i < arr.length; i++) {
      context.variables.set('__loop_item', arr[i])
      context.variables.set('__loop_index', i)
    }

    return {
      success: true,
      outputs: {
        item: arr[arr.length - 1],
        index: arr.length - 1,
        results: arr,
        count: arr.length,
      },
      metadata: { executionTime: Date.now() - startTime },
    }
  },
}

export const controlForEach: UnifiedToolDefinition = {
  name: 'control.forEach',
  version: '1.0.0',
  description: '배열의 각 항목에 대해 순차 처리합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      array: { type: 'array', description: '순회할 배열' },
    },
    required: ['array'],
  },
  meta: {
    label: '배열 순회',
    description: '배열을 순회합니다',
    icon: 'Replay',
    color: '#64748b',
    category: 'control',
    tags: ['forEach', 'array', 'iterate', 'map', '순회', '배열'],
  },
  ports: {
    inputs: [
      { name: 'array', type: 'json', required: true, description: '순회할 배열' },
    ],
    outputs: [
      { name: 'item', type: 'any', required: true, description: '현재 항목' },
      { name: 'index', type: 'number', required: false, description: '현재 인덱스' },
      { name: 'results', type: 'json', required: false, description: '전체 결과' },
      { name: 'count', type: 'number', required: false, description: '항목 수' },
    ],
  },
  configSchema: [],
  runtime: 'internal',
  executor: controlForEachExecutor,
}

// ============================================================
// control.while - 조건 반복 (Stub)
// ============================================================

const controlWhileExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    // Note: Actual while loop requires runtime support for condition re-evaluation
    return {
      success: true,
      outputs: {
        result: inputs.input,
        iterations: config.max_iterations || 100,
      },
      metadata: { executionTime: Date.now() - startTime },
    }
  },
}

export const controlWhile: UnifiedToolDefinition = {
  name: 'control.while',
  version: '1.0.0',
  description: '조건이 참인 동안 반복합니다. 최대 반복 횟수로 무한 루프를 방지.',
  inputSchema: {
    type: 'object',
    properties: {
      input: { description: '입력 데이터' },
      max_iterations: { type: 'number', description: '최대 반복 횟수', default: 100 },
      condition_field: { type: 'string', description: '조건 필드' },
    },
  },
  meta: {
    label: '조건 반복',
    description: '조건이 참인 동안 반복합니다',
    icon: 'Autorenew',
    color: '#64748b',
    category: 'control',
    tags: ['while', 'loop', 'condition', '조건반복'],
  },
  ports: {
    inputs: [
      { name: 'input', type: 'any', required: false, description: '입력 데이터' },
    ],
    outputs: [
      { name: 'result', type: 'any', required: true, description: '최종 결과' },
      { name: 'iterations', type: 'number', required: false, description: '반복 횟수' },
    ],
  },
  configSchema: [
    { key: 'max_iterations', label: '최대 반복 횟수', type: 'number', default: 100 },
    { key: 'condition_field', label: '조건 필드', type: 'text', description: '이 필드가 truthy인 동안 반복' },
  ],
  runtime: 'internal',
  executor: controlWhileExecutor,
}

// ============================================================
// control.parallel - 병렬 실행 (Stub)
// ============================================================

const controlParallelExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    _config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    // Collects all inputs and passes them through
    const results = Object.entries(inputs).filter(([k]) => !k.startsWith('_')).map(([, v]) => v)

    return {
      success: true,
      outputs: { results, count: results.length },
      metadata: { executionTime: Date.now() - startTime },
    }
  },
}

export const controlParallel: UnifiedToolDefinition = {
  name: 'control.parallel',
  version: '1.0.0',
  description: '여러 입력을 병렬로 수집합니다. 실제 병렬 실행은 ExecutionEngine에서 처리.',
  inputSchema: {
    type: 'object',
    properties: {
      input_1: { description: '입력 1' },
      input_2: { description: '입력 2' },
      input_3: { description: '입력 3' },
    },
  },
  meta: {
    label: '병렬 수집',
    description: '여러 입력을 병렬로 수집합니다',
    icon: 'ViewStream',
    color: '#64748b',
    category: 'control',
    tags: ['parallel', 'concurrent', 'collect', '병렬'],
  },
  ports: {
    inputs: [
      { name: 'input_1', type: 'any', required: false, description: '입력 1' },
      { name: 'input_2', type: 'any', required: false, description: '입력 2' },
      { name: 'input_3', type: 'any', required: false, description: '입력 3' },
    ],
    outputs: [
      { name: 'results', type: 'json', required: true, description: '수집된 결과' },
      { name: 'count', type: 'number', required: false, description: '입력 수' },
    ],
  },
  configSchema: [],
  runtime: 'internal',
  executor: controlParallelExecutor,
}

// ============================================================
// control.merge - 데이터 병합
// ============================================================

const controlMergeExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const mode = (config.mode || 'object') as string
    const separator = (config.separator || '\n') as string

    const values = [inputs.input_1, inputs.input_2, inputs.input_3, inputs.input_4]
      .filter(v => v !== undefined && v !== null)

    let merged: unknown

    switch (mode) {
      case 'array':
        merged = values
        break
      case 'text':
        merged = values
          .map(v => typeof v === 'string' ? v : JSON.stringify(v))
          .join(separator.replace(/\\n/g, '\n'))
        break
      case 'concat':
        merged = values.flat()
        break
      default: // object
        merged = Object.assign({}, ...values.map(v =>
          typeof v === 'object' && v !== null ? v : { value: v }
        ))
    }

    return {
      success: true,
      outputs: { merged, result: merged, count: values.length },
      metadata: { executionTime: Date.now() - startTime },
    }
  },
}

export const controlMerge: UnifiedToolDefinition = {
  name: 'control.merge',
  version: '1.0.0',
  description: '여러 입력을 하나로 병합합니다. 객체, 배열, 텍스트 모드.',
  inputSchema: {
    type: 'object',
    properties: {
      input_1: { description: '입력 1' },
      input_2: { description: '입력 2' },
      input_3: { description: '입력 3' },
      input_4: { description: '입력 4' },
      mode: { type: 'string', enum: ['object', 'array', 'text', 'concat'], default: 'object' },
      separator: { type: 'string', description: '텍스트 모드 구분자', default: '\\n' },
    },
  },
  meta: {
    label: '데이터 병합',
    description: '여러 입력을 병합합니다',
    icon: 'MergeType',
    color: '#64748b',
    category: 'control',
    tags: ['merge', 'combine', 'join', '병합', '결합'],
  },
  ports: {
    inputs: [
      { name: 'input_1', type: 'any', required: true, description: '입력 1' },
      { name: 'input_2', type: 'any', required: false, description: '입력 2' },
      { name: 'input_3', type: 'any', required: false, description: '입력 3' },
      { name: 'input_4', type: 'any', required: false, description: '입력 4' },
    ],
    outputs: [
      { name: 'merged', type: 'any', required: true, description: '병합된 결과' },
      { name: 'result', type: 'any', required: false, description: '결과 (alias)' },
      { name: 'count', type: 'number', required: false, description: '병합된 입력 수' },
    ],
  },
  configSchema: [
    {
      key: 'mode', label: '병합 방식', type: 'select', default: 'object',
      options: [
        { value: 'object', label: '객체 병합' },
        { value: 'array', label: '배열 생성' },
        { value: 'text', label: '텍스트 결합' },
        { value: 'concat', label: '배열 연결' },
      ],
    },
    { key: 'separator', label: '구분자 (텍스트 모드)', type: 'text', default: '\\n' },
  ],
  runtime: 'internal',
  executor: controlMergeExecutor,
}

// ============================================================
// control.split - 데이터 분할
// ============================================================

const controlSplitExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    _config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const input = inputs.input

    return {
      success: true,
      outputs: {
        output_1: input,
        output_2: input,
        output_3: input,
      },
      metadata: { executionTime: Date.now() - startTime },
    }
  },
}

export const controlSplit: UnifiedToolDefinition = {
  name: 'control.split',
  version: '1.0.0',
  description: '하나의 입력을 여러 출력으로 복제하여 분기합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      input: { description: '분할할 입력' },
    },
    required: ['input'],
  },
  meta: {
    label: '데이터 분할',
    description: '입력을 여러 출력으로 분할합니다',
    icon: 'CallSplit',
    color: '#64748b',
    category: 'control',
    tags: ['split', 'fork', 'copy', '분할', '복제'],
  },
  ports: {
    inputs: [
      { name: 'input', type: 'any', required: true, description: '입력 데이터' },
    ],
    outputs: [
      { name: 'output_1', type: 'any', required: true, description: '출력 1' },
      { name: 'output_2', type: 'any', required: true, description: '출력 2' },
      { name: 'output_3', type: 'any', required: false, description: '출력 3' },
    ],
  },
  configSchema: [],
  runtime: 'internal',
  executor: controlSplitExecutor,
}

// ============================================================
// control.gate - 게이트
// ============================================================

const controlGateExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const defaultOpen = config.default_open !== false
    const gateOpen = inputs.gate !== undefined ? !!inputs.gate : defaultOpen

    if (gateOpen) {
      return {
        success: true,
        outputs: { output: inputs.data, passed: true },
        metadata: { executionTime: Date.now() - startTime },
      }
    }

    return {
      success: true,
      outputs: { output: null, passed: false },
      metadata: { executionTime: Date.now() - startTime },
    }
  },
}

export const controlGate: UnifiedToolDefinition = {
  name: 'control.gate',
  version: '1.0.0',
  description: '조건에 따라 데이터 흐름을 허용하거나 차단합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { description: '통과시킬 데이터' },
      gate: { type: 'boolean', description: '게이트 상태 (truthy면 통과)' },
    },
    required: ['data'],
  },
  meta: {
    label: '게이트',
    description: '데이터 흐름을 제어합니다',
    icon: 'Block',
    color: '#64748b',
    category: 'control',
    tags: ['gate', 'filter', 'block', 'pass', '게이트', '필터'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: true, description: '입력 데이터' },
      { name: 'gate', type: 'boolean', required: false, description: '게이트 신호' },
    ],
    outputs: [
      { name: 'output', type: 'any', required: true, description: '출력 데이터' },
      { name: 'passed', type: 'boolean', required: false, description: '통과 여부' },
    ],
  },
  configSchema: [
    { key: 'default_open', label: '기본 열림', type: 'toggle', default: true },
  ],
  runtime: 'internal',
  executor: controlGateExecutor,
}

// ============================================================
// control.delay - 지연
// ============================================================

const controlDelayExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const delayMs = (config.delay_ms || 1000) as number

    await new Promise(resolve => setTimeout(resolve, delayMs))

    return {
      success: true,
      outputs: { output: inputs.input, delayed: delayMs },
      metadata: { executionTime: Date.now() - startTime },
    }
  },
}

export const controlDelay: UnifiedToolDefinition = {
  name: 'control.delay',
  version: '1.0.0',
  description: '지정된 시간만큼 지연 후 데이터를 전달합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      input: { description: '전달할 데이터' },
      delay_ms: { type: 'number', description: '지연 시간 (ms)', default: 1000 },
    },
  },
  meta: {
    label: '지연',
    description: '실행을 지연시킵니다',
    icon: 'Timer',
    color: '#64748b',
    category: 'control',
    tags: ['delay', 'wait', 'sleep', 'timeout', '지연', '대기'],
  },
  ports: {
    inputs: [
      { name: 'input', type: 'any', required: false, description: '입력 데이터' },
    ],
    outputs: [
      { name: 'output', type: 'any', required: true, description: '출력 데이터' },
      { name: 'delayed', type: 'number', required: false, description: '지연 시간' },
    ],
  },
  configSchema: [
    { key: 'delay_ms', label: '지연 시간 (ms)', type: 'number', default: 1000 },
  ],
  runtime: 'internal',
  executor: controlDelayExecutor,
}

// ============================================================
// control.retry - 재시도
// ============================================================

const controlRetryExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    // Note: Actual retry logic requires runtime integration
    // This is a passthrough that records retry configuration
    const maxRetries = (config.max_retries || 3) as number
    const retryDelay = (config.retry_delay_ms || 1000) as number

    return {
      success: true,
      outputs: {
        output: inputs.input,
        retryConfig: { maxRetries, retryDelay },
      },
      metadata: { executionTime: Date.now() - startTime },
    }
  },
}

export const controlRetry: UnifiedToolDefinition = {
  name: 'control.retry',
  version: '1.0.0',
  description: '실패 시 지정된 횟수만큼 재시도합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      input: { description: '전달할 데이터' },
      max_retries: { type: 'number', description: '최대 재시도 횟수', default: 3 },
      retry_delay_ms: { type: 'number', description: '재시도 간 지연 (ms)', default: 1000 },
    },
  },
  meta: {
    label: '재시도',
    description: '실패 시 재시도합니다',
    icon: 'Refresh',
    color: '#64748b',
    category: 'control',
    tags: ['retry', 'repeat', 'resilience', '재시도'],
  },
  ports: {
    inputs: [
      { name: 'input', type: 'any', required: false, description: '입력 데이터' },
    ],
    outputs: [
      { name: 'output', type: 'any', required: true, description: '출력 데이터' },
      { name: 'retryConfig', type: 'json', required: false, description: '재시도 설정' },
    ],
  },
  configSchema: [
    { key: 'max_retries', label: '최대 재시도 횟수', type: 'number', default: 3 },
    { key: 'retry_delay_ms', label: '재시도 지연 (ms)', type: 'number', default: 1000 },
  ],
  runtime: 'internal',
  executor: controlRetryExecutor,
}

// ============================================================
// control.error - 에러 핸들링
// ============================================================

const controlErrorExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const action = (config.action || 'catch') as string
    const defaultValue = config.default_value

    // If there's an error in the input, handle it based on action
    if (inputs.error) {
      switch (action) {
        case 'throw':
          return {
            success: false,
            outputs: {},
            error: String(inputs.error),
          }
        case 'ignore':
          return {
            success: true,
            outputs: { output: null, handled: true },
            metadata: { executionTime: Date.now() - startTime },
          }
        case 'default':
          return {
            success: true,
            outputs: { output: defaultValue, handled: true },
            metadata: { executionTime: Date.now() - startTime },
          }
        default: // catch
          return {
            success: true,
            outputs: { output: inputs.input, error: inputs.error, handled: true },
            metadata: { executionTime: Date.now() - startTime },
          }
      }
    }

    // No error, pass through
    return {
      success: true,
      outputs: { output: inputs.input, handled: false },
      metadata: { executionTime: Date.now() - startTime },
    }
  },
}

export const controlError: UnifiedToolDefinition = {
  name: 'control.error',
  version: '1.0.0',
  description: '에러를 처리하고 대체 값을 제공하거나 무시합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      input: { description: '입력 데이터' },
      error: { description: '에러 정보' },
      action: { type: 'string', enum: ['catch', 'throw', 'ignore', 'default'], default: 'catch' },
      default_value: { description: '에러 시 대체 값' },
    },
  },
  meta: {
    label: '에러 핸들링',
    description: '에러를 처리합니다',
    icon: 'ErrorOutline',
    color: '#64748b',
    category: 'control',
    tags: ['error', 'catch', 'handle', 'try', '에러', '예외'],
  },
  ports: {
    inputs: [
      { name: 'input', type: 'any', required: false, description: '입력 데이터' },
      { name: 'error', type: 'any', required: false, description: '에러 정보' },
    ],
    outputs: [
      { name: 'output', type: 'any', required: true, description: '출력 데이터' },
      { name: 'error', type: 'any', required: false, description: '에러 정보' },
      { name: 'handled', type: 'boolean', required: false, description: '에러 처리 여부' },
    ],
  },
  configSchema: [
    {
      key: 'action', label: '에러 처리 방식', type: 'select', default: 'catch',
      options: [
        { value: 'catch', label: '캐치 (에러 정보 전달)' },
        { value: 'throw', label: '다시 던지기' },
        { value: 'ignore', label: '무시 (null 반환)' },
        { value: 'default', label: '기본값 사용' },
      ],
    },
    { key: 'default_value', label: '기본값', type: 'text' },
  ],
  runtime: 'internal',
  executor: controlErrorExecutor,
}

// ============================================================
// Export All Control Tools
// ============================================================

export const CONTROL_TOOLS: UnifiedToolDefinition[] = [
  controlIf,
  controlSwitch,
  controlLoop,
  controlForEach,
  controlWhile,
  controlParallel,
  controlMerge,
  controlSplit,
  controlGate,
  controlDelay,
  controlRetry,
  controlError,
]
