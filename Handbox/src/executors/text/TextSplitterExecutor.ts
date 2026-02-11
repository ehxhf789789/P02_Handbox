/**
 * TextSplitter Executor — 텍스트 청킹
 *
 * 긴 텍스트를 chunk_size/overlap 기반으로 분할.
 * 순수 TypeScript 구현 (외부 의존성 없음).
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

/** 선행 노드들의 출력에서 텍스트를 추출하는 헬퍼 */
function extractTextFromInputs(input: Record<string, any>): string {
  // 포트 기반 입력
  if (input.text && typeof input.text === 'string') {
    return input.text
  }

  // _predecessors에서 텍스트 수집 (레거시 호환)
  const predecessors: Record<string, any>[] = input._predecessors || []
  const parts: string[] = []

  for (const pred of predecessors) {
    if (pred?.text) {
      parts.push(pred.text)
    } else if (pred?.file_contents && Array.isArray(pred.file_contents)) {
      parts.push(pred.file_contents.map((f: any) => f.content).join('\n\n'))
    } else if (pred?.content) {
      parts.push(pred.content)
    }
  }

  return parts.join('\n').trim()
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    _context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const text = extractTextFromInputs(input)
    const chunkSize = config.chunk_size || 1500
    const chunkOverlap = config.chunk_overlap || config.overlap || 300

    if (!text) {
      return {
        error: '분할할 텍스트가 없습니다. 이전 노드에서 텍스트가 전달되지 않았습니다.',
        chunks: [],
        chunks_created: 0,
        status: '텍스트 없음',
      }
    }

    // 로컬 청킹 수행
    const chunks: Array<{ content: string; index: number; start: number; end: number }> = []
    let start = 0
    let index = 0

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length)
      chunks.push({
        content: text.slice(start, end),
        index,
        start,
        end,
      })
      start += chunkSize - chunkOverlap
      index++
    }

    return {
      chunks,
      chunks_created: chunks.length,
      text: chunks.map(c => c.content).join('\n---\n'),
      status: `${chunks.length}개 청크 생성 완료 (크기: ${chunkSize}, 오버랩: ${chunkOverlap})`,
    }
  },
}

export const TextSplitterDefinition: NodeDefinition = {
  type: 'text.splitter',
  category: 'text',
  meta: {
    label: '텍스트 분할',
    description: '긴 텍스트를 지정된 크기의 청크로 분할합니다',
    icon: 'ContentCut',
    color: '#FF9800',
    tags: ['텍스트', '분할', '청킹', 'chunk', 'split', 'splitter'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '분할할 텍스트' },
    ],
    outputs: [
      { name: 'chunks', type: 'text[]', required: true, description: '분할된 텍스트 청크 배열' },
      { name: 'text', type: 'text', required: false, description: '구분자로 결합된 전체 텍스트' },
    ],
  },
  configSchema: [
    { key: 'chunk_size', label: '청크 크기 (문자)', type: 'number', default: 1500, min: 100, max: 50000 },
    { key: 'chunk_overlap', label: '오버랩 (문자)', type: 'number', default: 300, min: 0, max: 5000 },
  ],
  runtime: 'internal',
  executor,
}
