/**
 * Storage 도구 정의 — storage.* (12개 도구)
 * KV 저장소, 벡터 DB, SQLite, S3 등
 */
import type { UnifiedToolDefinition } from '../registry/UnifiedToolDefinition'

// ============================================================================
// storage.kv-get - KV 저장소 읽기
// ============================================================================
const storageKvGet: UnifiedToolDefinition = {
  name: 'storage.kv-get',
  version: '1.0.0',
  description: '키-값 저장소에서 값을 가져옵니다.',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: '키' },
      namespace: { type: 'string', description: '네임스페이스' },
    },
    required: ['key'],
  },
  meta: {
    label: 'KV 읽기',
    icon: 'Storage',
    color: '#f59e0b',
    category: 'storage',
    tags: ['kv', 'get', 'storage', 'key', 'value', '키값', '읽기'],
  },
  ports: {
    inputs: [{ name: 'key', type: 'text', required: false, description: '키' }],
    outputs: [
      { name: 'value', type: 'any', required: true, description: '저장된 값' },
      { name: 'exists', type: 'boolean', required: false, description: '존재 여부' },
    ],
  },
  configSchema: [
    { key: 'namespace', label: '네임스페이스', type: 'text', default: 'default' },
    { key: 'key', label: '키', type: 'text', required: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const key = input.key || config.key
      const result = await invoke('tool_kv_get', { namespace: config.namespace || 'default', key }) as any
      return { value: result.value, exists: result.exists }
    },
  },
}

// ============================================================================
// storage.kv-set - KV 저장소 쓰기
// ============================================================================
const storageKvSet: UnifiedToolDefinition = {
  name: 'storage.kv-set',
  version: '1.0.0',
  description: '키-값 저장소에 값을 저장합니다. TTL(만료 시간) 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: '키' },
      value: { description: '저장할 값' },
      ttl_seconds: { type: 'number', description: 'TTL (초)' },
    },
    required: ['key', 'value'],
  },
  meta: {
    label: 'KV 쓰기',
    icon: 'Save',
    color: '#f59e0b',
    category: 'storage',
    tags: ['kv', 'set', 'storage', 'save', '키값', '저장'],
  },
  ports: {
    inputs: [
      { name: 'key', type: 'text', required: false, description: '키' },
      { name: 'value', type: 'any', required: true, description: '저장할 값' },
    ],
    outputs: [{ name: 'result', type: 'json', required: true, description: '저장 결과' }],
  },
  configSchema: [
    { key: 'namespace', label: '네임스페이스', type: 'text', default: 'default' },
    { key: 'key', label: '키', type: 'text', required: true },
    { key: 'ttl_seconds', label: 'TTL (초)', type: 'number', default: 0, description: '0이면 영구' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const key = input.key || config.key
      const result = await invoke('tool_kv_set', {
        namespace: config.namespace || 'default',
        key,
        value: input.value,
        ttlSeconds: config.ttl_seconds || null,
      }) as any
      return { result }
    },
  },
}

// ============================================================================
// storage.kv-delete - KV 저장소 삭제
// ============================================================================
const storageKvDelete: UnifiedToolDefinition = {
  name: 'storage.kv-delete',
  version: '1.0.0',
  description: '키-값 저장소에서 항목을 삭제합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: '삭제할 키' },
    },
    required: ['key'],
  },
  meta: {
    label: 'KV 삭제',
    icon: 'Delete',
    color: '#f59e0b',
    category: 'storage',
    tags: ['kv', 'delete', 'remove', '삭제'],
  },
  ports: {
    inputs: [{ name: 'key', type: 'text', required: false }],
    outputs: [{ name: 'deleted', type: 'boolean', required: true }],
  },
  configSchema: [
    { key: 'namespace', label: '네임스페이스', type: 'text', default: 'default' },
    { key: 'key', label: '키', type: 'text', required: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const key = input.key || config.key
      const result = await invoke('tool_kv_delete', { namespace: config.namespace || 'default', key }) as any
      return { deleted: result.deleted }
    },
  },
}

// ============================================================================
// storage.kv-list - KV 키 목록
// ============================================================================
const storageKvList: UnifiedToolDefinition = {
  name: 'storage.kv-list',
  version: '1.0.0',
  description: '키-값 저장소의 키 목록을 조회합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      prefix: { type: 'string', description: '접두사 필터' },
      limit: { type: 'number', description: '최대 개수' },
    },
  },
  meta: {
    label: 'KV 목록',
    icon: 'List',
    color: '#f59e0b',
    category: 'storage',
    tags: ['kv', 'list', 'keys', '목록'],
  },
  ports: {
    inputs: [],
    outputs: [
      { name: 'keys', type: 'json', required: true, description: '키 목록' },
      { name: 'count', type: 'number', required: false, description: '개수' },
    ],
  },
  configSchema: [
    { key: 'namespace', label: '네임스페이스', type: 'text', default: 'default' },
    { key: 'prefix', label: '접두사 필터', type: 'text' },
    { key: 'limit', label: '최대 개수', type: 'number', default: 100 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(_input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_kv_list', {
        namespace: config.namespace || 'default',
        prefix: config.prefix || null,
        limit: config.limit,
      }) as any
      return { keys: result.keys, count: result.count }
    },
  },
}

// ============================================================================
// storage.vector-store - 벡터 저장
// ============================================================================
const storageVectorStore: UnifiedToolDefinition = {
  name: 'storage.vector-store',
  version: '1.0.0',
  description: '임베딩 벡터와 텍스트를 벡터 저장소에 저장합니다. RAG 파이프라인 핵심.',
  inputSchema: {
    type: 'object',
    properties: {
      documents: { type: 'array', description: '[{text, embedding, metadata}] 배열' },
      collection: { type: 'string', description: '컬렉션명' },
    },
    required: ['documents'],
  },
  meta: {
    label: '벡터 저장',
    icon: 'Hub',
    color: '#f59e0b',
    category: 'storage',
    tags: ['vector', 'store', 'embedding', 'rag', '벡터', '저장', '임베딩'],
  },
  ports: {
    inputs: [{ name: 'documents', type: 'json', required: true, description: '문서 배열' }],
    outputs: [{ name: 'result', type: 'json', required: true, description: '저장 결과' }],
  },
  configSchema: [
    { key: 'collection', label: '컬렉션명', type: 'text', required: true, default: 'default' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_vector_store', {
        collection: config.collection,
        documents: input.documents,
      }) as any
      return { result }
    },
  },
}

// ============================================================================
// storage.vector-search - 벡터 검색
// ============================================================================
const storageVectorSearch: UnifiedToolDefinition = {
  name: 'storage.vector-search',
  version: '1.0.0',
  description: '코사인 유사도 기반 벡터 검색. 임베딩 벡터로 유사 문서 검색.',
  inputSchema: {
    type: 'object',
    properties: {
      query_embedding: { type: 'array', description: '쿼리 임베딩 벡터' },
      top_k: { type: 'number', description: '결과 수' },
    },
    required: ['query_embedding'],
  },
  meta: {
    label: '벡터 검색',
    icon: 'Search',
    color: '#f59e0b',
    category: 'storage',
    tags: ['vector', 'search', 'similarity', 'cosine', 'rag', '벡터', '검색'],
  },
  ports: {
    inputs: [{ name: 'query_embedding', type: 'vector', required: true, description: '쿼리 임베딩' }],
    outputs: [{ name: 'results', type: 'json', required: true, description: '검색 결과' }],
  },
  configSchema: [
    { key: 'collection', label: '컬렉션명', type: 'text', required: true, default: 'default' },
    { key: 'top_k', label: '결과 수', type: 'number', default: 5 },
    { key: 'threshold', label: '최소 유사도', type: 'slider', min: 0, max: 1, step: 0.05, default: 0 },
    { key: 'filter', label: '메타데이터 필터', type: 'text' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_vector_search', {
        collection: config.collection,
        queryEmbedding: input.query_embedding,
        topK: config.top_k,
        threshold: config.threshold || null,
        filter: config.filter || null,
      }) as any
      return { results: result.results }
    },
  },
}

// ============================================================================
// storage.vector-hybrid - 하이브리드 검색
// ============================================================================
const storageVectorHybrid: UnifiedToolDefinition = {
  name: 'storage.vector-hybrid',
  version: '1.0.0',
  description: '벡터 유사도 + 키워드 매칭 결합 검색. 정확도와 재현율 향상.',
  inputSchema: {
    type: 'object',
    properties: {
      query_embedding: { type: 'array', description: '쿼리 임베딩' },
      query_text: { type: 'string', description: '검색 텍스트' },
    },
    required: ['query_embedding', 'query_text'],
  },
  meta: {
    label: '하이브리드 검색',
    icon: 'JoinInner',
    color: '#f59e0b',
    category: 'storage',
    tags: ['vector', 'hybrid', 'search', 'keyword', 'rag', '하이브리드'],
  },
  ports: {
    inputs: [
      { name: 'query_embedding', type: 'vector', required: true },
      { name: 'query_text', type: 'text', required: true },
    ],
    outputs: [{ name: 'results', type: 'json', required: true }],
  },
  configSchema: [
    { key: 'collection', label: '컬렉션명', type: 'text', default: 'default' },
    { key: 'top_k', label: '결과 수', type: 'number', default: 5 },
    { key: 'vector_weight', label: '벡터 가중치', type: 'slider', min: 0, max: 1, step: 0.1, default: 0.7 },
    { key: 'text_weight', label: '키워드 가중치', type: 'slider', min: 0, max: 1, step: 0.1, default: 0.3 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_vector_hybrid_search', {
        collection: config.collection,
        queryEmbedding: input.query_embedding,
        queryText: input.query_text,
        topK: config.top_k,
        vectorWeight: config.vector_weight,
        textWeight: config.text_weight,
      }) as any
      return { results: result.results }
    },
  },
}

// ============================================================================
// storage.vector-delete - 벡터 삭제
// ============================================================================
const storageVectorDelete: UnifiedToolDefinition = {
  name: 'storage.vector-delete',
  version: '1.0.0',
  description: '벡터 저장소에서 문서를 삭제합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      ids: { type: 'array', description: '삭제할 문서 ID 배열' },
      filter: { type: 'string', description: '메타데이터 필터' },
    },
  },
  meta: {
    label: '벡터 삭제',
    icon: 'Delete',
    color: '#f59e0b',
    category: 'storage',
    tags: ['vector', 'delete', '벡터', '삭제'],
  },
  ports: {
    inputs: [{ name: 'ids', type: 'json', required: false, description: '삭제할 ID' }],
    outputs: [{ name: 'deleted', type: 'number', required: true, description: '삭제 수' }],
  },
  configSchema: [
    { key: 'collection', label: '컬렉션명', type: 'text', default: 'default' },
    { key: 'filter', label: '필터', type: 'text' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_vector_delete', {
        collection: config.collection,
        ids: input.ids,
        filter: config.filter,
      }) as any
      return { deleted: result.deleted }
    },
  },
}

// ============================================================================
// storage.sqlite-query - SQLite 쿼리
// ============================================================================
const storageSqliteQuery: UnifiedToolDefinition = {
  name: 'storage.sqlite-query',
  version: '1.0.0',
  description: 'SQLite 데이터베이스에 SQL 쿼리를 실행합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'SQL 쿼리' },
      params: { type: 'array', description: '쿼리 파라미터' },
    },
    required: ['sql'],
  },
  meta: {
    label: 'SQLite 쿼리',
    icon: 'Storage',
    color: '#f59e0b',
    category: 'storage',
    tags: ['sqlite', 'sql', 'query', 'database', '데이터베이스'],
  },
  ports: {
    inputs: [{ name: 'sql', type: 'text', required: false }],
    outputs: [{ name: 'result', type: 'json', required: true }],
  },
  configSchema: [
    { key: 'db_path', label: 'DB 경로', type: 'file', description: '비워두면 기본 DB' },
    { key: 'sql', label: 'SQL 쿼리', type: 'code', language: 'sql', required: true, rows: 5 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const sql = input.sql || config.sql
      const result = await invoke('tool_sqlite_query', {
        dbPath: config.db_path || null,
        sql,
        params: input.params,
      }) as any
      return { result }
    },
  },
}

// ============================================================================
// storage.sqlite-exec - SQLite 실행 (INSERT/UPDATE/DELETE)
// ============================================================================
const storageSqliteExec: UnifiedToolDefinition = {
  name: 'storage.sqlite-exec',
  version: '1.0.0',
  description: 'SQLite에서 INSERT, UPDATE, DELETE 등 변경 쿼리를 실행합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'SQL 문' },
      params: { type: 'array', description: '쿼리 파라미터' },
    },
    required: ['sql'],
  },
  meta: {
    label: 'SQLite 실행',
    icon: 'Edit',
    color: '#f59e0b',
    category: 'storage',
    tags: ['sqlite', 'exec', 'insert', 'update', 'delete'],
  },
  ports: {
    inputs: [{ name: 'sql', type: 'text', required: false }],
    outputs: [
      { name: 'changes', type: 'number', required: true, description: '변경된 행 수' },
      { name: 'last_id', type: 'number', required: false, description: '마지막 삽입 ID' },
    ],
  },
  configSchema: [
    { key: 'db_path', label: 'DB 경로', type: 'file' },
    { key: 'sql', label: 'SQL 문', type: 'code', language: 'sql', required: true, rows: 5 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_sqlite_exec', {
        dbPath: config.db_path || null,
        sql: input.sql || config.sql,
        params: input.params,
      }) as any
      return { changes: result.changes, last_id: result.lastId }
    },
  },
}

// ============================================================================
// storage.s3-get - S3 객체 다운로드
// ============================================================================
const storageS3Get: UnifiedToolDefinition = {
  name: 'storage.s3-get',
  version: '1.0.0',
  description: 'S3 버킷에서 객체를 다운로드합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      bucket: { type: 'string', description: '버킷 이름' },
      key: { type: 'string', description: '객체 키' },
      local_path: { type: 'string', description: '로컬 저장 경로' },
    },
    required: ['bucket', 'key'],
  },
  meta: {
    label: 'S3 다운로드',
    icon: 'CloudDownload',
    color: '#f59e0b',
    category: 'storage',
    tags: ['s3', 'aws', 'cloud', 'download', '다운로드'],
  },
  ports: {
    inputs: [
      { name: 'bucket', type: 'text', required: false },
      { name: 'key', type: 'text', required: false },
    ],
    outputs: [
      { name: 'path', type: 'file-ref', required: true, description: '다운로드된 경로' },
      { name: 'size', type: 'number', required: false, description: '파일 크기' },
    ],
  },
  configSchema: [
    { key: 'bucket', label: '버킷', type: 'text', required: true },
    { key: 'key', label: '객체 키', type: 'text', required: true },
    { key: 'local_path', label: '로컬 경로', type: 'text' },
    { key: 'region', label: '리전', type: 'text', default: 'ap-northeast-2' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_s3_get', {
        bucket: input.bucket || config.bucket,
        key: input.key || config.key,
        localPath: config.local_path,
        region: config.region,
      }) as any
      return { path: result.path, size: result.size }
    },
  },
}

// ============================================================================
// storage.s3-put - S3 객체 업로드
// ============================================================================
const storageS3Put: UnifiedToolDefinition = {
  name: 'storage.s3-put',
  version: '1.0.0',
  description: 'S3 버킷에 객체를 업로드합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      bucket: { type: 'string', description: '버킷 이름' },
      key: { type: 'string', description: '객체 키' },
      local_path: { type: 'string', description: '업로드할 로컬 파일' },
    },
    required: ['bucket', 'key', 'local_path'],
  },
  meta: {
    label: 'S3 업로드',
    icon: 'CloudUpload',
    color: '#f59e0b',
    category: 'storage',
    tags: ['s3', 'aws', 'cloud', 'upload', '업로드'],
  },
  ports: {
    inputs: [
      { name: 'local_path', type: 'file-ref', required: true, description: '업로드할 파일' },
    ],
    outputs: [
      { name: 'url', type: 'text', required: true, description: 'S3 URL' },
      { name: 'etag', type: 'text', required: false, description: 'ETag' },
    ],
  },
  configSchema: [
    { key: 'bucket', label: '버킷', type: 'text', required: true },
    { key: 'key', label: '객체 키', type: 'text', required: true },
    { key: 'region', label: '리전', type: 'text', default: 'ap-northeast-2' },
    { key: 'content_type', label: 'Content-Type', type: 'text' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_s3_put', {
        bucket: config.bucket,
        key: config.key,
        localPath: input.local_path,
        region: config.region,
        contentType: config.content_type,
      }) as any
      return { url: result.url, etag: result.etag }
    },
  },
}

// ============================================================================
// Export
// ============================================================================
export const STORAGE_TOOLS: UnifiedToolDefinition[] = [
  storageKvGet,
  storageKvSet,
  storageKvDelete,
  storageKvList,
  storageVectorStore,
  storageVectorSearch,
  storageVectorHybrid,
  storageVectorDelete,
  storageSqliteQuery,
  storageSqliteExec,
  storageS3Get,
  storageS3Put,
]

// Legacy export for backward compatibility
export const STORAGE_DEFINITIONS = STORAGE_TOOLS
