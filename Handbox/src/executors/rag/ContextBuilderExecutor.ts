/**
 * ContextBuilderExecutor - Build LLM context from RAG results
 *
 * Format retrieved documents into structured context for LLM
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

const executor: NodeExecutor = {
  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const predecessors = input._predecessors as unknown[] | undefined
    const results = (input.results || input.context || (predecessors?.[0])) as unknown[]
    const query = (input.query || config.query) as string
    const template = (config.template as string) || DEFAULT_TEMPLATE
    const maxTokens = (config.max_context_tokens as number) || 4000
    const includeMetadata = config.include_metadata as boolean

    if (!results || (Array.isArray(results) && results.length === 0)) {
      return {
        context: '',
        prompt: query || '',
        error: '검색 결과가 없습니다.',
      }
    }

    try {
      // Build context from results
      let contextParts: string[] = []
      let totalLength = 0
      const maxLength = maxTokens * 4 // Approximate chars per token

      const resultArray = Array.isArray(results) ? results : [results]

      for (const result of resultArray) {
        const r = result as Record<string, unknown>
        let part = ''

        if (typeof r === 'string') {
          part = r
        } else if (r.content) {
          part = r.content as string
          if (includeMetadata && r.metadata) {
            const meta = r.metadata as Record<string, unknown>
            const metaStr = Object.entries(meta)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')
            part = `${part}\n[메타데이터: ${metaStr}]`
          }
          if (r.source) {
            part = `${part}\n[출처: ${r.source}]`
          }
        }

        if (totalLength + part.length > maxLength) {
          // Truncate this part to fit
          const remaining = maxLength - totalLength
          if (remaining > 100) {
            part = part.slice(0, remaining) + '...(truncated)'
            contextParts.push(part)
          }
          break
        }

        contextParts.push(part)
        totalLength += part.length
      }

      const formattedContext = contextParts.join('\n\n---\n\n')

      // Apply template
      const finalPrompt = template
        .replace('{{context}}', formattedContext)
        .replace('{{query}}', query || '')
        .replace('{{question}}', query || '')

      return {
        context: formattedContext,
        prompt: finalPrompt,
        result_count: contextParts.length,
        total_chars: totalLength,
      }
    } catch (error) {
      return {
        context: '',
        prompt: '',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

const DEFAULT_TEMPLATE = `다음 참고 자료를 바탕으로 질문에 답변하세요.

## 참고 자료
{{context}}

## 질문
{{query}}

## 답변`

export const ContextBuilderDefinition: NodeDefinition = {
  type: 'rag.context-builder',
  category: 'rag',
  meta: {
    label: '컨텍스트 구성',
    description: 'RAG 검색 결과를 LLM 프롬프트용 컨텍스트로 포맷합니다',
    icon: 'Article',
    color: '#14b8a6',
    tags: ['RAG', '컨텍스트', '프롬프트', 'LLM'],
  },
  ports: {
    inputs: [
      { name: 'results', type: 'any', required: true, description: 'RAG 검색 결과' },
      { name: 'query', type: 'text', required: false, description: '원본 쿼리' },
    ],
    outputs: [
      { name: 'prompt', type: 'text', required: true, description: '완성된 프롬프트' },
      { name: 'context', type: 'text', required: false, description: '컨텍스트 텍스트' },
    ],
  },
  configSchema: [
    { key: 'query', label: '질문 (고정)', type: 'text', required: false },
    {
      key: 'template',
      label: '프롬프트 템플릿',
      type: 'textarea',
      required: false,
      default: DEFAULT_TEMPLATE,
    },
    { key: 'max_context_tokens', label: '최대 컨텍스트 토큰', type: 'number', required: false, default: 4000 },
    { key: 'include_metadata', label: '메타데이터 포함', type: 'toggle', required: false, default: false },
  ],
  runtime: 'internal',
  executor,
}

export default ContextBuilderDefinition
