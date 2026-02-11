/**
 * Conditional Executor — 조건 분기
 *
 * 입력 데이터에 조건식을 적용하여 true/false 경로로 분기.
 * 현재는 기본 비교 연산만 지원 (향후 JavaScript 표현식 지원 예정).
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

const executor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    _context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const predecessors: Record<string, any>[] = input._predecessors || []
    const inputData = predecessors[0] || input

    const field = config.field || ''
    const operator = config.operator || 'exists'
    const compareValue = config.value

    // 비교 대상 값 추출
    const actualValue = field ? inputData[field] : inputData

    let result = false

    switch (operator) {
      case 'exists':
        result = actualValue !== undefined && actualValue !== null && actualValue !== ''
        break
      case 'equals':
        result = String(actualValue) === String(compareValue)
        break
      case 'not_equals':
        result = String(actualValue) !== String(compareValue)
        break
      case 'contains':
        result = String(actualValue).includes(String(compareValue))
        break
      case 'greater_than':
        result = Number(actualValue) > Number(compareValue)
        break
      case 'less_than':
        result = Number(actualValue) < Number(compareValue)
        break
      case 'is_true':
        result = Boolean(actualValue) === true
        break
      case 'is_false':
        result = Boolean(actualValue) === false
        break
      default:
        result = Boolean(actualValue)
    }

    return {
      ...inputData,
      _condition_result: result,
      _condition_branch: result ? 'true' : 'false',
      status: `조건 분기: ${result ? 'True 경로' : 'False 경로'}`,
    }
  },
}

export const ConditionalDefinition: NodeDefinition = {
  type: 'control.conditional',
  category: 'control',
  meta: {
    label: '조건 분기',
    description: '조건에 따라 데이터 흐름을 분기합니다',
    icon: 'CallSplit',
    color: '#795548',
    tags: ['조건', '분기', 'if', 'condition', 'branch', 'switch'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: true, description: '조건 판별할 입력 데이터' },
    ],
    outputs: [
      { name: 'true', type: 'any', required: true, description: '조건이 참일 때 출력' },
      { name: 'false', type: 'any', required: true, description: '조건이 거짓일 때 출력' },
    ],
  },
  configSchema: [
    { key: 'field', label: '필드명', type: 'text', placeholder: 'verdict', description: '비워두면 전체 입력 데이터를 비교' },
    {
      key: 'operator',
      label: '연산자',
      type: 'select',
      default: 'exists',
      options: [
        { label: '값 존재', value: 'exists' },
        { label: '같음 (==)', value: 'equals' },
        { label: '다름 (!=)', value: 'not_equals' },
        { label: '포함', value: 'contains' },
        { label: '초과 (>)', value: 'greater_than' },
        { label: '미만 (<)', value: 'less_than' },
        { label: 'True', value: 'is_true' },
        { label: 'False', value: 'is_false' },
      ],
    },
    { key: 'value', label: '비교값', type: 'text', placeholder: 'Approved' },
  ],
  runtime: 'internal',
  executor,
}
