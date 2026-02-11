/**
 * ResultViewer Executor — 결과 뷰어 (패스스루)
 *
 * 이전 노드의 출력을 그대로 전달하며 UI에서 시각적으로 표시.
 * 순수 패스스루 노드.
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

const executor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    _config: Record<string, any>,
    _context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const predecessors: Record<string, any>[] = input._predecessors || []
    const inputData = predecessors[0] || input

    return {
      ...inputData,
      status: '결과 표시 완료',
    }
  },
}

export const ResultViewerDefinition: NodeDefinition = {
  type: 'viz.result-viewer',
  category: 'viz',
  meta: {
    label: '결과 뷰어',
    description: '이전 노드의 출력을 시각적으로 표시합니다',
    icon: 'Visibility',
    color: '#00BCD4',
    tags: ['결과', '보기', '뷰어', 'viewer', 'result', 'output', 'display'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: true, description: '표시할 데이터' },
    ],
    outputs: [
      { name: 'data', type: 'any', required: true, description: '입력 데이터 패스스루' },
    ],
  },
  configSchema: [],
  runtime: 'internal',
  executor,
}

/** JSON 뷰어 (별도 타입으로 등록) */
export const JsonViewerDefinition: NodeDefinition = {
  ...ResultViewerDefinition,
  type: 'viz.json-viewer',
  meta: {
    ...ResultViewerDefinition.meta,
    label: 'JSON 뷰어',
    description: 'JSON 데이터를 트리 형태로 표시합니다',
    icon: 'DataObject',
    tags: ['JSON', '뷰어', 'viewer', 'data', 'tree'],
  },
}
