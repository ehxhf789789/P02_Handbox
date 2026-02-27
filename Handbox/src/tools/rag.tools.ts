/**
 * RAG 도구 정의 — rag.* (8개 도구)
 * 문서 수집, 청킹, 임베딩, 검색, 생성 등 RAG 파이프라인
 */
import type { UnifiedToolDefinition } from '../registry/UnifiedToolDefinition'

// ============================================================================
// rag.ingest - 문서 수집/인제스트
// ============================================================================
const ragIngest: UnifiedToolDefinition = {
  name: 'rag.ingest',
  version: '1.0.0',
  description: '문서를 RAG 파이프라인으로 수집합니다. 자동 청킹 및 임베딩 생성.',
  inputSchema: {
    type: 'object',
    properties: {
      documents: { type: 'array', description: '문서 배열 [{text, metadata}] 또는 텍스트 배열' },
      source: { type: 'string', description: '파일/폴더 경로' },
    },
  },
  meta: {
    label: '문서 인제스트',
    icon: 'CloudUpload',
    color: '#06b6d4',
    category: 'rag',
    tags: ['rag', 'ingest', 'document', 'upload', '문서', '수집'],
  },
  ports: {
    inputs: [
      { name: 'documents', type: 'json', required: false },
      { name: 'source', type: 'file-ref', required: false },
    ],
    outputs: [
      { name: 'result', type: 'json', required: true, description: '인제스트 결과' },
      { name: 'doc_count', type: 'number', required: false, description: '처리된 문서 수' },
      { name: 'chunk_count', type: 'number', required: false, description: '생성된 청크 수' },
    ],
  },
  configSchema: [
    { key: 'collection', label: '컬렉션', type: 'text', required: true, default: 'default' },
    { key: 'chunk_size', label: '청크 크기', type: 'number', default: 500 },
    { key: 'chunk_overlap', label: '청크 오버랩', type: 'number', default: 50 },
    { key: 'embed_provider', label: '임베딩 프로바이더', type: 'provider' },
    { key: 'embed_model', label: '임베딩 모델', type: 'model' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')

      const result = await invoke('tool_rag_ingest', {
        documents: input.documents,
        source: input.source,
        collection: config.collection,
        chunkSize: config.chunk_size,
        chunkOverlap: config.chunk_overlap,
        embedProvider: config.embed_provider,
        embedModel: config.embed_model,
      }) as any

      return {
        result,
        doc_count: result.docCount,
        chunk_count: result.chunkCount,
      }
    },
  },
}

// ============================================================================
// rag.chunk - 텍스트 청킹
// ============================================================================
const ragChunk: UnifiedToolDefinition = {
  name: 'rag.chunk',
  version: '1.0.0',
  description: '텍스트를 검색에 적합한 청크로 분할합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '분할할 텍스트' },
      chunk_size: { type: 'number', description: '청크 크기' },
    },
    required: ['text'],
  },
  meta: {
    label: '텍스트 청킹',
    icon: 'ContentCut',
    color: '#06b6d4',
    category: 'rag',
    tags: ['rag', 'chunk', 'split', 'text', '청킹', '분할'],
  },
  ports: {
    inputs: [{ name: 'text', type: 'text', required: true }],
    outputs: [
      { name: 'chunks', type: 'json', required: true, description: '청크 배열' },
      { name: 'count', type: 'number', required: false, description: '청크 수' },
    ],
  },
  configSchema: [
    { key: 'chunk_size', label: '청크 크기 (문자)', type: 'number', default: 500 },
    { key: 'chunk_overlap', label: '오버랩 (문자)', type: 'number', default: 50 },
    { key: 'strategy', label: '분할 전략', type: 'select', default: 'recursive',
      options: [
        { label: '재귀적 (권장)', value: 'recursive' },
        { label: '문장 단위', value: 'sentence' },
        { label: '단락 단위', value: 'paragraph' },
        { label: '고정 크기', value: 'fixed' },
        { label: '의미적', value: 'semantic' },
      ] },
    { key: 'separators', label: '구분자', type: 'text', default: '\\n\\n,\\n,. ' },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const text = (inp.text || '') as string
      const chunkSize = (cfg.chunk_size as number) || 500
      const overlap = (cfg.chunk_overlap as number) || 50

      const chunks: { text: string; index: number; start: number; end: number }[] = []

      if (cfg.strategy === 'sentence') {
        // 문장 단위 분할
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
        let currentChunk = ''
        let startIdx = 0

        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > chunkSize && currentChunk) {
            chunks.push({
              text: currentChunk.trim(),
              index: chunks.length,
              start: startIdx,
              end: startIdx + currentChunk.length,
            })
            startIdx += currentChunk.length - overlap
            currentChunk = currentChunk.slice(-overlap) + sentence
          } else {
            currentChunk += sentence
          }
        }
        if (currentChunk.trim()) {
          chunks.push({
            text: currentChunk.trim(),
            index: chunks.length,
            start: startIdx,
            end: startIdx + currentChunk.length,
          })
        }
      } else if (cfg.strategy === 'paragraph') {
        // 단락 단위 분할
        const paragraphs = text.split(/\n\s*\n/)
        let currentChunk = ''
        let startIdx = 0

        for (const para of paragraphs) {
          if (currentChunk.length + para.length > chunkSize && currentChunk) {
            chunks.push({
              text: currentChunk.trim(),
              index: chunks.length,
              start: startIdx,
              end: startIdx + currentChunk.length,
            })
            startIdx += currentChunk.length
            currentChunk = para
          } else {
            currentChunk += (currentChunk ? '\n\n' : '') + para
          }
        }
        if (currentChunk.trim()) {
          chunks.push({
            text: currentChunk.trim(),
            index: chunks.length,
            start: startIdx,
            end: startIdx + currentChunk.length,
          })
        }
      } else {
        // 고정 크기 또는 재귀적 분할
        for (let i = 0; i < text.length; i += chunkSize - overlap) {
          const chunk = text.slice(i, i + chunkSize)
          if (chunk.trim()) {
            chunks.push({
              text: chunk.trim(),
              index: chunks.length,
              start: i,
              end: Math.min(i + chunkSize, text.length),
            })
          }
        }
      }

      return { chunks, count: chunks.length }
    },
  },
}

// ============================================================================
// rag.embed - 텍스트 임베딩 생성
// ============================================================================
const ragEmbed: UnifiedToolDefinition = {
  name: 'rag.embed',
  version: '1.0.0',
  description: '텍스트의 임베딩 벡터를 생성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '임베딩할 텍스트' },
      texts: { type: 'array', description: '텍스트 배열 (배치)' },
    },
  },
  meta: {
    label: '임베딩 생성',
    icon: 'Translate',
    color: '#06b6d4',
    category: 'rag',
    tags: ['rag', 'embed', 'embedding', 'vector', '임베딩', '벡터'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: false },
      { name: 'texts', type: 'json', required: false },
    ],
    outputs: [
      { name: 'embedding', type: 'vector', required: false, description: '단일 임베딩' },
      { name: 'embeddings', type: 'json', required: false, description: '임베딩 배열' },
      { name: 'dimensions', type: 'number', required: false, description: '벡터 차원' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'batch_size', label: '배치 크기', type: 'number', default: 100 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const { invoke } = await import('@tauri-apps/api/tauri')

      const texts: string[] = inp.texts || (inp.text ? [inp.text] : [])

      const result = await invoke('tool_embedding', {
        texts,
        provider: cfg.provider,
        model: cfg.model,
        batchSize: cfg.batch_size,
      }) as any

      return {
        embedding: texts.length === 1 ? result.embeddings[0] : undefined,
        embeddings: result.embeddings,
        dimensions: result.embeddings[0]?.length || 0,
      }
    },
  },
}

// ============================================================================
// rag.store - 벡터 저장
// ============================================================================
const ragStore: UnifiedToolDefinition = {
  name: 'rag.store',
  version: '1.0.0',
  description: '청크와 임베딩을 벡터 저장소에 저장합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      chunks: { type: 'array', description: '청크 배열' },
      embeddings: { type: 'array', description: '임베딩 배열' },
    },
    required: ['chunks', 'embeddings'],
  },
  meta: {
    label: '벡터 저장',
    icon: 'Save',
    color: '#06b6d4',
    category: 'rag',
    tags: ['rag', 'store', 'vector', 'save', '저장', '벡터'],
  },
  ports: {
    inputs: [
      { name: 'chunks', type: 'json', required: true },
      { name: 'embeddings', type: 'json', required: true },
      { name: 'metadata', type: 'json', required: false },
    ],
    outputs: [
      { name: 'stored', type: 'number', required: true, description: '저장된 수' },
      { name: 'ids', type: 'json', required: false, description: '저장된 ID' },
    ],
  },
  configSchema: [
    { key: 'collection', label: '컬렉션', type: 'text', required: true, default: 'default' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const { invoke } = await import('@tauri-apps/api/tauri')

      const chunksArr: any[] = inp.chunks || []
      const embeddingsArr: any[] = inp.embeddings || []

      // 청크와 임베딩을 문서 형태로 변환
      const documents = chunksArr.map((chunk: any, i: number) => ({
        text: typeof chunk === 'string' ? chunk : chunk.text,
        embedding: embeddingsArr[i],
        metadata: {
          ...(typeof chunk === 'object' ? chunk : {}),
          ...(inp.metadata || {}),
          index: i,
        },
      }))

      const result = await invoke('tool_vector_store', {
        collection: cfg.collection,
        documents,
      }) as any

      return {
        stored: result.count || documents.length,
        ids: result.ids,
      }
    },
  },
}

// ============================================================================
// rag.search - RAG 검색
// ============================================================================
const ragSearch: UnifiedToolDefinition = {
  name: 'rag.search',
  version: '1.0.0',
  description: '쿼리와 관련된 문서를 벡터 검색합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '검색 쿼리' },
      top_k: { type: 'number', description: '결과 수' },
    },
    required: ['query'],
  },
  meta: {
    label: 'RAG 검색',
    icon: 'Search',
    color: '#06b6d4',
    category: 'rag',
    tags: ['rag', 'search', 'retrieve', 'query', '검색', '조회'],
  },
  ports: {
    inputs: [{ name: 'query', type: 'text', required: true }],
    outputs: [
      { name: 'results', type: 'json', required: true, description: '검색 결과' },
      { name: 'context', type: 'text', required: false, description: '결합된 컨텍스트' },
    ],
  },
  configSchema: [
    { key: 'collection', label: '컬렉션', type: 'text', required: true, default: 'default' },
    { key: 'top_k', label: '결과 수', type: 'number', default: 5 },
    { key: 'threshold', label: '최소 유사도', type: 'slider', min: 0, max: 1, step: 0.05, default: 0 },
    { key: 'embed_provider', label: '임베딩 프로바이더', type: 'provider' },
    { key: 'embed_model', label: '임베딩 모델', type: 'model' },
    { key: 'rerank', label: '리랭킹', type: 'toggle', default: false },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')

      // 1. 쿼리 임베딩 생성
      const embedResult = await invoke('tool_embedding', {
        texts: [input.query],
        provider: config.embed_provider,
        model: config.embed_model,
      }) as any

      const queryEmbedding = embedResult.embeddings[0]

      // 2. 벡터 검색
      const searchResult = await invoke('tool_vector_search', {
        collection: config.collection,
        queryEmbedding,
        topK: config.top_k,
        threshold: config.threshold,
      }) as any

      // 3. 컨텍스트 결합
      const context = searchResult.results
        .map((r: any) => r.text || r.document?.text || '')
        .join('\n\n---\n\n')

      return {
        results: searchResult.results,
        context,
      }
    },
  },
}

// ============================================================================
// rag.generate - RAG 응답 생성
// ============================================================================
const ragGenerate: UnifiedToolDefinition = {
  name: 'rag.generate',
  version: '1.0.0',
  description: '검색 결과를 컨텍스트로 사용하여 LLM 응답을 생성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '사용자 쿼리' },
      context: { type: 'string', description: '검색된 컨텍스트' },
      results: { type: 'array', description: '검색 결과' },
    },
    required: ['query'],
  },
  meta: {
    label: 'RAG 생성',
    icon: 'AutoAwesome',
    color: '#06b6d4',
    category: 'rag',
    tags: ['rag', 'generate', 'llm', 'response', '생성', '응답'],
  },
  ports: {
    inputs: [
      { name: 'query', type: 'text', required: true },
      { name: 'context', type: 'text', required: false },
      { name: 'results', type: 'json', required: false },
    ],
    outputs: [
      { name: 'response', type: 'llm-response', required: true, description: 'LLM 응답' },
      { name: 'sources', type: 'json', required: false, description: '참조 소스' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'system_prompt', label: '시스템 프롬프트', type: 'textarea', rows: 4,
      default: '당신은 주어진 컨텍스트를 기반으로 질문에 답변하는 도우미입니다. 컨텍스트에 없는 정보는 답변하지 마세요.' },
    { key: 'temperature', label: '온도', type: 'slider', min: 0, max: 1, step: 0.1, default: 0.3 },
    { key: 'max_tokens', label: '최대 토큰', type: 'number', default: 1024 },
    { key: 'include_citations', label: '인용 포함', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const { ProviderRegistry } = await import('../registry/ProviderRegistry')
      const provider = ProviderRegistry.getLLMProvider(cfg.provider || ctx?.defaultLLMProvider)
      if (!provider) throw new Error('프로바이더를 찾을 수 없습니다')

      // 컨텍스트 구성
      const resultsArr: any[] = inp.results || []
      let ragContext = (inp.context || '') as string
      if (!ragContext && resultsArr.length > 0) {
        ragContext = resultsArr
          .map((r: any, i: number) => `[${i + 1}] ${r.text || r.document?.text || ''}`)
          .join('\n\n')
      }

      let prompt = `컨텍스트:\n${ragContext}\n\n질문: ${inp.query}`

      if (cfg.include_citations) {
        prompt += '\n\n답변할 때 관련 컨텍스트 번호를 인용하세요 (예: [1], [2]).'
      }

      const response = await provider.invoke({
        model: cfg.model,
        prompt,
        systemPrompt: cfg.system_prompt,
        temperature: cfg.temperature,
        maxTokens: cfg.max_tokens,
      })

      // 소스 추출
      const sources = resultsArr.map((r: any, i: number) => ({
        index: i + 1,
        text: ((r.text || r.document?.text || '') as string).slice(0, 200),
        score: r.score,
        metadata: r.metadata,
      }))

      return { response: response.text as string, sources }
    },
  },
}

// ============================================================================
// rag.query - 통합 RAG 쿼리 (검색 + 생성)
// ============================================================================
const ragQuery: UnifiedToolDefinition = {
  name: 'rag.query',
  version: '1.0.0',
  description: '검색과 생성을 한 번에 수행하는 통합 RAG 쿼리입니다.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '쿼리' },
    },
    required: ['query'],
  },
  meta: {
    label: 'RAG 쿼리',
    icon: 'QuestionAnswer',
    color: '#06b6d4',
    category: 'rag',
    tags: ['rag', 'query', 'qa', '질의응답'],
  },
  ports: {
    inputs: [{ name: 'query', type: 'text', required: true }],
    outputs: [
      { name: 'answer', type: 'text', required: true, description: '답변' },
      { name: 'sources', type: 'json', required: false, description: '참조 소스' },
      { name: 'confidence', type: 'number', required: false, description: '신뢰도' },
    ],
  },
  configSchema: [
    { key: 'collection', label: '컬렉션', type: 'text', required: true, default: 'default' },
    { key: 'top_k', label: '검색 결과 수', type: 'number', default: 5 },
    { key: 'embed_provider', label: '임베딩 프로바이더', type: 'provider' },
    { key: 'embed_model', label: '임베딩 모델', type: 'model' },
    { key: 'llm_provider', label: 'LLM 프로바이더', type: 'provider' },
    { key: 'llm_model', label: 'LLM 모델', type: 'model' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const { invoke } = await import('@tauri-apps/api/tauri')
      const { ProviderRegistry } = await import('../registry/ProviderRegistry')

      // 1. 임베딩
      const embedResult = await invoke('tool_embedding', {
        texts: [inp.query],
        provider: cfg.embed_provider,
        model: cfg.embed_model,
      }) as any

      // 2. 검색
      const searchResult = await invoke('tool_vector_search', {
        collection: cfg.collection,
        queryEmbedding: embedResult.embeddings[0],
        topK: cfg.top_k,
      }) as any

      // 3. 생성
      const provider = ProviderRegistry.getLLMProvider(cfg.llm_provider || ctx?.defaultLLMProvider)
      if (!provider) throw new Error('LLM 프로바이더를 찾을 수 없습니다')

      const ragContext = (searchResult.results || [])
        .map((r: any, i: number) => `[${i + 1}] ${r.text}`)
        .join('\n\n')

      const response = await provider.invoke({
        model: cfg.llm_model,
        prompt: `컨텍스트:\n${ragContext}\n\n질문: ${inp.query}\n\n컨텍스트를 기반으로 답변하세요.`,
        temperature: 0.3,
        maxTokens: 1024,
      })

      // 신뢰도 계산 (검색 점수 평균)
      const results = (searchResult.results || []) as any[]
      const avgScore = results.reduce((sum: number, r: any) => sum + (r.score || 0), 0) /
        (results.length || 1)

      return {
        answer: response.text as string,
        sources: results.map((r: any, i: number) => ({
          index: i + 1,
          text: r.text?.slice(0, 200),
          score: r.score,
        })),
        confidence: avgScore,
      }
    },
  },
}

// ============================================================================
// rag.delete - 문서 삭제
// ============================================================================
const ragDelete: UnifiedToolDefinition = {
  name: 'rag.delete',
  version: '1.0.0',
  description: '벡터 저장소에서 문서를 삭제합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      ids: { type: 'array', description: '삭제할 문서 ID' },
      filter: { type: 'object', description: '메타데이터 필터' },
    },
  },
  meta: {
    label: 'RAG 삭제',
    icon: 'Delete',
    color: '#06b6d4',
    category: 'rag',
    tags: ['rag', 'delete', 'remove', '삭제'],
  },
  ports: {
    inputs: [
      { name: 'ids', type: 'json', required: false },
      { name: 'filter', type: 'json', required: false },
    ],
    outputs: [{ name: 'deleted', type: 'number', required: true, description: '삭제 수' }],
  },
  configSchema: [
    { key: 'collection', label: '컬렉션', type: 'text', required: true, default: 'default' },
    { key: 'confirm', label: '삭제 확인', type: 'toggle', default: false,
      description: '체크해야 삭제 실행' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      if (!config.confirm) {
        return { deleted: 0, error: '삭제 확인이 필요합니다' }
      }

      const { invoke } = await import('@tauri-apps/api/tauri')

      const result = await invoke('tool_vector_delete', {
        collection: config.collection,
        ids: input.ids,
        filter: input.filter,
      }) as any

      return { deleted: result.deleted }
    },
  },
}

// ============================================================================
// Export
// ============================================================================
export const RAG_TOOLS: UnifiedToolDefinition[] = [
  ragIngest,
  ragChunk,
  ragEmbed,
  ragStore,
  ragSearch,
  ragGenerate,
  ragQuery,
  ragDelete,
]
