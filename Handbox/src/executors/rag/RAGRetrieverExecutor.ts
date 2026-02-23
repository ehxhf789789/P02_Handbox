/**
 * RAGRetrieverExecutor - RAG document retrieval
 *
 * Search for relevant documents using vector similarity
 *
 * 지원 프로바이더:
 * - bedrock: AWS Bedrock Titan Embeddings (우선)
 * - local: Ollama (nomic-embed-text), LM Studio (OpenAI 호환)
 *
 * 우선순위: bedrock → local → simulation
 */

import { invoke } from '@tauri-apps/api/tauri'
import { LocalLLMProvider, configureOllama } from '../../services/LocalLLMProvider'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

interface SearchResult {
  content: string
  score: number
  metadata: Record<string, unknown>
  source?: string
}

// 로컬 임베딩 생성
async function createLocalQueryEmbedding(query: string, modelId: string): Promise<number[]> {
  if (!LocalLLMProvider.getConfig()) {
    configureOllama()
  }
  const response = await LocalLLMProvider.embed({ texts: [query], model: modelId })
  return response.embeddings[0]
}

// Bedrock 임베딩 생성
async function createBedrockQueryEmbedding(query: string, modelId: string): Promise<number[]> {
  // query가 객체일 수 있으므로 문자열로 확실히 변환
  const queryText = typeof query === 'string' ? query : String(query || '')
  // Rust 명령은 request: EmbeddingRequest 래퍼를 기대함
  const result = await invoke<{ embedding: number[]; dimension: number }>('create_embedding', {
    request: {
      text: queryText,
      model_id: modelId,
    }
  })
  return result.embedding
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
    const embeddingProvider = (config.embedding_provider as string) || 'auto'
    const localModel = (config.local_model as string) || 'nomic-embed-text'
    const bedrockModel = (config.bedrock_model as string) || 'amazon.titan-embed-text-v1'

    if (!query) {
      return {
        results: [],
        context: '',
        error: '검색 쿼리를 입력하세요.',
      }
    }

    try {
      let results: SearchResult[] = []
      let usedProvider = embeddingProvider

      if (searchMode === 'vector' || searchMode === 'hybrid') {
        // 임베딩 생성 (Bedrock 우선 폴백 체인)
        let queryEmbedding: number[] = []

        if (embeddingProvider === 'bedrock' || embeddingProvider === 'auto') {
          // Bedrock 우선 시도
          try {
            console.log('[RAGRetriever] Bedrock 임베딩 시도:', bedrockModel)
            queryEmbedding = await createBedrockQueryEmbedding(query, bedrockModel)
            usedProvider = 'bedrock'
          } catch (bedrockError) {
            console.warn('[RAGRetriever] Bedrock 임베딩 실패:', bedrockError)

            if (embeddingProvider === 'auto') {
              // Bedrock 실패 시 로컬 폴백
              try {
                console.log('[RAGRetriever] 로컬 임베딩 폴백 시도:', localModel)
                queryEmbedding = await createLocalQueryEmbedding(query, localModel)
                usedProvider = 'local'

                // 시뮬레이션 응답 감지 (모든 값이 매우 작으면 시뮬레이션)
                if (queryEmbedding.every(v => Math.abs(v) < 0.1)) {
                  throw new Error('시뮬레이션 응답 감지')
                }
              } catch (localError) {
                console.warn('[RAGRetriever] 로컬 임베딩도 실패:', localError)
                throw bedrockError  // 원래 Bedrock 에러 전파
              }
            } else {
              throw bedrockError
            }
          }
        } else if (embeddingProvider === 'local') {
          // 명시적 로컬 지정 시
          console.log('[RAGRetriever] 로컬 임베딩 사용:', localModel)
          queryEmbedding = await createLocalQueryEmbedding(query, localModel)
          usedProvider = 'local'
        }

        // Search in vector store (Rust vector_store.rs의 vector_search 명령 사용)
        // db_path는 앱 데이터 디렉토리에 저장
        const dbPath = (config.db_path as string) || './handbox_vectors.db'
        const indexName = (config.index_name as string) || 'default'

        interface VectorSearchResult {
          id: number
          score: number
          metadata: Record<string, unknown>
          text?: string
        }

        const vectorResults = await invoke<VectorSearchResult[]>('vector_search', {
          dbPath: dbPath,
          indexName: indexName,
          queryVector: queryEmbedding,
          topK: topK,
          threshold,
        })

        // VectorSearchResult → SearchResult 변환
        results = vectorResults.map(vr => ({
          content: vr.text || '',
          score: vr.score,
          metadata: vr.metadata,
          source: vr.metadata?.source as string || `doc_${vr.id}`,
        }))
      }

      if (searchMode === 'keyword' || searchMode === 'hybrid') {
        // Keyword search in local storage (Rust vector_store.rs의 vector_text_search 명령 사용)
        const dbPath = (config.db_path as string) || './handbox_vectors.db'
        const indexName = (config.index_name as string) || 'default'

        interface VectorSearchResult {
          id: number
          score: number
          metadata: Record<string, unknown>
          text?: string
        }

        const keywordResults = await invoke<VectorSearchResult[]>('vector_text_search', {
          dbPath: dbPath,
          indexName: indexName,
          query: query,
          topK: topK,
        }).then(results => results.map(vr => ({
          content: vr.text || '',
          score: vr.score,
          metadata: vr.metadata,
          source: vr.metadata?.source as string || `doc_${vr.id}`,
        })))

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
        embedding_provider: usedProvider,
      }
    } catch (error) {
      // ⚠️ 시뮬레이션 폴백 - 버그로 취급됨
      console.warn('[RAGRetriever] 검색 실패, 시뮬레이션 결과 반환:', error)
      const simulatedResults: SearchResult[] = [
        { content: `[시뮬레이션] "${query}"에 대한 검색 결과`, score: 0.85, metadata: {}, source: 'simulation' },
      ]
      return {
        results: simulatedResults,
        context: `[시뮬레이션] "${query}" 검색 결과입니다.`,
        count: simulatedResults.length,
        query,
        embedding_provider: 'simulation',
        error: error instanceof Error ? error.message : String(error),
        _simulation: true,
        _note: 'RAG 검색 실패. 임베딩 서비스 또는 벡터 DB 연결 필요.',
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
    {
      key: 'embedding_provider',
      label: '임베딩 프로바이더',
      type: 'select',
      default: 'auto',
      options: [
        { label: '자동 (Bedrock 우선)', value: 'auto' },
        { label: 'AWS Bedrock', value: 'bedrock' },
        { label: '로컬 (Ollama/LM Studio)', value: 'local' },
      ],
    },
    {
      key: 'local_model',
      label: '로컬 임베딩 모델',
      type: 'select',
      default: 'nomic-embed-text',
      options: [
        { label: 'Nomic Embed Text', value: 'nomic-embed-text' },
        { label: 'mxbai-embed-large', value: 'mxbai-embed-large' },
        { label: 'all-minilm', value: 'all-minilm' },
      ],
    },
    {
      key: 'bedrock_model',
      label: 'Bedrock 임베딩 모델',
      type: 'select',
      default: 'amazon.titan-embed-text-v1',
      options: [
        { label: 'Amazon Titan Embed V1', value: 'amazon.titan-embed-text-v1' },
        { label: 'Amazon Titan Embed V2', value: 'amazon.titan-embed-text-v2:0' },
        { label: 'Cohere Embed Multilingual', value: 'cohere.embed-multilingual-v3' },
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
