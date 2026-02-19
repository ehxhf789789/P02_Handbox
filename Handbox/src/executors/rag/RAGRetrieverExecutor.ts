/**
 * RAGRetrieverExecutor - RAG document retrieval
 *
 * Search for relevant documents using vector similarity
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

interface SearchResult {
  content: string
  score: number
  metadata: Record<string, unknown>
  source?: string
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const query = (input.text || input.query || config.query) as string
    const topK = (config.top_k as number) || 5
    const threshold = (config.threshold as number) || 0.7
    const searchMode = (config.search_mode as string) || 'vector'

    if (!query) {
      return {
        results: [],
        context: '',
        error: '검색 쿼리를 입력하세요.',
      }
    }

    try {
      let results: SearchResult[] = []

      if (searchMode === 'vector' || searchMode === 'hybrid') {
        // Create query embedding
        const embeddingResult = await invoke<{ embedding: number[] }>('create_embedding', {
          text: query,
          modelId: 'amazon.titan-embed-text-v1',
        })

        // Search in vector store
        const vectorResults = await invoke<SearchResult[]>('search_vectors', {
          index: config.index_name as string || 'default',
          query: embeddingResult.embedding,
          topK,
        })

        results = vectorResults.filter(r => r.score >= threshold)
      }

      if (searchMode === 'keyword' || searchMode === 'hybrid') {
        // Keyword search in local storage
        const keywordResults = await invoke<SearchResult[]>('search_keyword', {
          collection: config.collection as string || 'default',
          query,
          topK,
        })

        // Merge results for hybrid mode
        if (searchMode === 'hybrid') {
          const existingIds = new Set(results.map(r => r.source))
          for (const kr of keywordResults) {
            if (!existingIds.has(kr.source)) {
              results.push(kr)
            }
          }
          // Re-sort by score
          results.sort((a, b) => b.score - a.score)
          results = results.slice(0, topK)
        } else {
          results = keywordResults
        }
      }

      // Build context string
      const contextParts = results.map((r, i) => {
        const source = r.source ? ` [출처: ${r.source}]` : ''
        return `[${i + 1}] ${r.content}${source}`
      })
      const contextText = contextParts.join('\n\n')

      return {
        results,
        context: contextText,
        count: results.length,
        query,
      }
    } catch (error) {
      return {
        results: [],
        context: '',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

export const RAGRetrieverDefinition: NodeDefinition = {
  type: 'rag.retriever',
  category: 'rag',
  meta: {
    label: 'RAG 검색',
    description: '벡터 유사도 또는 키워드로 관련 문서를 검색합니다',
    icon: 'Search',
    color: '#06b6d4',
    tags: ['RAG', '검색', '벡터', '유사도', '문서'],
  },
  ports: {
    inputs: [
      { name: 'query', type: 'text', required: true, description: '검색 쿼리' },
    ],
    outputs: [
      { name: 'context', type: 'text', required: true, description: 'LLM용 컨텍스트' },
      { name: 'results', type: 'json[]', required: false, description: '검색 결과 목록' },
      { name: 'count', type: 'any', required: false, description: '결과 수' },
    ],
  },
  configSchema: [
    { key: 'query', label: '검색 쿼리 (고정)', type: 'text', required: false },
    {
      key: 'search_mode',
      label: '검색 방식',
      type: 'select',
      required: true,
      default: 'vector',
      options: [
        { label: '벡터 검색', value: 'vector' },
        { label: '키워드 검색', value: 'keyword' },
        { label: '하이브리드', value: 'hybrid' },
      ],
    },
    { key: 'index_name', label: '벡터 인덱스명', type: 'text', required: false, default: 'default' },
    { key: 'collection', label: '컬렉션명', type: 'text', required: false, default: 'default' },
    { key: 'top_k', label: '검색 결과 수', type: 'number', required: false, default: 5 },
    { key: 'threshold', label: '유사도 임계값', type: 'number', required: false, default: 0.7 },
  ],
  runtime: 'tauri',
  executor,
}

export default RAGRetrieverDefinition
