/**
 * Merge Executor — 다중 입력 병합
 *
 * 여러 선행 노드의 출력을 하나로 합칩니다.
 * 순수 TypeScript 구현.
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
    const mergeMode = config.merge_mode || 'object'

    if (predecessors.length === 0) {
      return { merged_count: 0, status: '병합할 입력 없음' }
    }

    if (mergeMode === 'array') {
      // 배열로 병합
      return {
        items: predecessors,
        merged_count: predecessors.length,
        status: `${predecessors.length}개 입력 배열로 병합 완료`,
      }
    }

    if (mergeMode === 'text') {
      // 텍스트 결합
      const separator = config.separator || '\n\n'
      const texts = predecessors.map(p =>
        p?.text || p?.content || p?.result || (typeof p === 'string' ? p : JSON.stringify(p))
      )
      const combined = texts.join(separator)
      return {
        text: combined,
        merged_count: predecessors.length,
        status: `${predecessors.length}개 텍스트 병합 완료`,
      }
    }

    // 기본: 객체 병합 (Object.assign)
    const merged: Record<string, any> = {}
    for (const pred of predecessors) {
      if (pred && typeof pred === 'object') {
        Object.assign(merged, pred)
      }
    }

    return {
      ...merged,
      merged_count: predecessors.length,
      status: `${predecessors.length}개 입력 병합 완료`,
    }
  },
}

export const MergeDefinition: NodeDefinition = {
  type: 'control.merge',
  category: 'control',
  meta: {
    label: '데이터 병합',
    description: '여러 노드의 출력을 하나로 합칩니다',
    icon: 'MergeType',
    color: '#607D8B',
    tags: ['병합', '합치기', 'merge', 'combine', 'aggregate'],
  },
  ports: {
    inputs: [
      { name: 'input_1', type: 'any', required: true, description: '첫 번째 입력' },
      { name: 'input_2', type: 'any', required: false, description: '두 번째 입력' },
    ],
    outputs: [
      { name: 'merged', type: 'json', required: true, description: '병합된 데이터' },
    ],
  },
  configSchema: [
    {
      key: 'merge_mode',
      label: '병합 방식',
      type: 'select',
      default: 'object',
      options: [
        { label: '객체 병합 (Object)', value: 'object' },
        { label: '배열 병합 (Array)', value: 'array' },
        { label: '텍스트 결합 (Text)', value: 'text' },
      ],
    },
    { key: 'separator', label: '텍스트 구분자', type: 'text', default: '\n\n', showWhen: { key: 'merge_mode', value: 'text' } },
  ],
  runtime: 'internal',
  executor,
}
