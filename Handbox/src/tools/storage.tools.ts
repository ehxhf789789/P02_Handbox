/**
 * Storage 도구 노드 정의 — kv.*, vector.*, sqlite.*
 */
import { invoke } from '@tauri-apps/api/tauri'
import type { NodeDefinition } from '../registry/NodeDefinition'

export const KvGetDefinition: NodeDefinition = {
  type: 'storage.kv-get',
  category: 'storage',
  meta: {
    label: 'KV 읽기',
    description: '키-값 저장소에서 값을 가져옵니다.',
    icon: 'Storage',
    color: '#f59e0b',
    tags: ['kv', 'get', 'storage', 'key', 'value', '키값', '읽기'],
  },
  ports: {
    inputs: [{ name: 'key', type: 'text', required: false, description: '키' }],
    outputs: [
      { name: 'value', type: 'json', required: true, description: '저장된 값' },
      { name: 'exists', type: 'json', required: false, description: '존재 여부' },
    ],
  },
  configSchema: [
    { key: 'namespace', label: '네임스페이스', type: 'text', default: 'default' },
    { key: 'key', label: '키', type: 'text', required: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const key = input.key || config.key
      const result = await invoke('tool_kv_get', { namespace: config.namespace, key }) as any
      return { value: result.value, exists: result.exists }
    },
  },
}

export const KvSetDefinition: NodeDefinition = {
  type: 'storage.kv-set',
  category: 'storage',
  meta: {
    label: 'KV 쓰기',
    description: '키-값 저장소에 값을 저장합니다. TTL(만료 시간) 지원.',
    icon: 'Save',
    color: '#f59e0b',
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
      const key = input.key || config.key
      const value = input.value
      const result = await invoke('tool_kv_set', {
        namespace: config.namespace, key, value, ttlSeconds: config.ttl_seconds || null,
      }) as any
      return { result }
    },
  },
}

export const KvDeleteDefinition: NodeDefinition = {
  type: 'storage.kv-delete',
  category: 'storage',
  meta: {
    label: 'KV 삭제',
    description: '키-값 저장소에서 항목을 삭제합니다.',
    icon: 'Delete',
    color: '#f59e0b',
    tags: ['kv', 'delete', 'remove', '삭제'],
  },
  ports: {
    inputs: [{ name: 'key', type: 'text', required: false }],
    outputs: [{ name: 'deleted', type: 'json', required: true }],
  },
  configSchema: [
    { key: 'namespace', label: '네임스페이스', type: 'text', default: 'default' },
    { key: 'key', label: '키', type: 'text', required: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const key = input.key || config.key
      const result = await invoke('tool_kv_delete', { namespace: config.namespace, key }) as any
      return { deleted: result.deleted }
    },
  },
}

export const KvListDefinition: NodeDefinition = {
  type: 'storage.kv-list',
  category: 'storage',
  meta: {
    label: 'KV 목록',
    description: '키-값 저장소의 키 목록을 조회합니다.',
    icon: 'List',
    color: '#f59e0b',
    tags: ['kv', 'list', 'keys', '목록'],
  },
  ports: {
    inputs: [],
    outputs: [{ name: 'keys', type: 'json', required: true, description: '키 목록' }],
  },
  configSchema: [
    { key: 'namespace', label: '네임스페이스', type: 'text', default: 'default' },
    { key: 'prefix', label: '접두사 필터', type: 'text' },
    { key: 'limit', label: '최대 개수', type: 'number', default: 100 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(_input, config) {
      const result = await invoke('tool_kv_list', {
        namespace: config.namespace, prefix: config.prefix || null, limit: config.limit,
      }) as any
      return { keys: result.keys, count: result.count }
    },
  },
}

export const VectorStoreDefinition: NodeDefinition = {
  type: 'storage.vector-store',
  category: 'storage',
  meta: {
    label: '벡터 저장',
    description: '임베딩 벡터와 텍스트를 벡터 저장소에 저장합니다. RAG 파이프라인의 핵심.',
    icon: 'Hub',
    color: '#f59e0b',
    tags: ['vector', 'store', 'embedding', 'rag', '벡터', '저장', '임베딩'],
  },
  ports: {
    inputs: [
      { name: 'documents', type: 'json', required: true, description: '[{text, embedding, metadata}] 배열' },
    ],
    outputs: [{ name: 'result', type: 'json', required: true, description: '저장 결과' }],
  },
  configSchema: [
    { key: 'collection', label: '컬렉션명', type: 'text', required: true, default: 'default' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const result = await invoke('tool_vector_store', {
        collection: config.collection, documents: input.documents,
      }) as any
      return { result }
    },
  },
}

export const VectorSearchDefinition: NodeDefinition = {
  type: 'storage.vector-search',
  category: 'storage',
  meta: {
    label: '벡터 검색',
    description: '코사인 유사도 기반 벡터 검색. 임베딩 벡터로 유사 문서를 찾습니다.',
    icon: 'Search',
    color: '#f59e0b',
    tags: ['vector', 'search', 'similarity', 'cosine', 'rag', '벡터', '검색', '유사도'],
  },
  ports: {
    inputs: [{ name: 'query_embedding', type: 'vector', required: true, description: '쿼리 임베딩' }],
    outputs: [{ name: 'results', type: 'search-result[]', required: true, description: '검색 결과' }],
  },
  configSchema: [
    { key: 'collection', label: '컬렉션명', type: 'text', required: true, default: 'default' },
    { key: 'top_k', label: '결과 수', type: 'number', default: 5 },
    { key: 'threshold', label: '최소 유사도', type: 'slider', min: 0, max: 1, step: 0.05, default: 0 },
    { key: 'filter', label: '메타데이터 필터', type: 'text', description: "category = 'legal' AND year > 2020" },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const result = await invoke('tool_vector_search', {
        collection: config.collection, queryEmbedding: input.query_embedding,
        topK: config.top_k, threshold: config.threshold || null, filter: config.filter || null,
      }) as any
      return { results: result.results }
    },
  },
}

export const VectorHybridDefinition: NodeDefinition = {
  type: 'storage.vector-hybrid',
  category: 'storage',
  meta: {
    label: '하이브리드 검색',
    description: '벡터 유사도 + 키워드 매칭을 결합한 검색. 정확도와 재현율 모두 향상.',
    icon: 'JoinInner',
    color: '#f59e0b',
    tags: ['vector', 'hybrid', 'search', 'keyword', 'rag', '하이브리드', '검색'],
  },
  ports: {
    inputs: [
      { name: 'query_embedding', type: 'vector', required: true, description: '쿼리 임베딩' },
      { name: 'query_text', type: 'text', required: true, description: '검색 텍스트' },
    ],
    outputs: [{ name: 'results', type: 'search-result[]', required: true, description: '검색 결과' }],
  },
  configSchema: [
    { key: 'collection', label: '컬렉션명', type: 'text', required: true, default: 'default' },
    { key: 'top_k', label: '결과 수', type: 'number', default: 5 },
    { key: 'vector_weight', label: '벡터 가중치', type: 'slider', min: 0, max: 1, step: 0.1, default: 0.7 },
    { key: 'text_weight', label: '키워드 가중치', type: 'slider', min: 0, max: 1, step: 0.1, default: 0.3 },
    { key: 'filter', label: '메타데이터 필터', type: 'text' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const result = await invoke('tool_vector_hybrid_search', {
        collection: config.collection, queryEmbedding: input.query_embedding,
        queryText: input.query_text, topK: config.top_k,
        vectorWeight: config.vector_weight, textWeight: config.text_weight,
        filter: config.filter || null,
      }) as any
      return { results: result.results }
    },
  },
}

export const SqliteQueryDefinition: NodeDefinition = {
  type: 'storage.sqlite-query',
  category: 'storage',
  meta: {
    label: 'SQLite 쿼리',
    description: 'SQLite 데이터베이스에 SQL 쿼리를 실행합니다.',
    icon: 'Storage',
    color: '#f59e0b',
    tags: ['sqlite', 'sql', 'query', 'database', 'db', '데이터베이스', '쿼리'],
  },
  ports: {
    inputs: [{ name: 'sql', type: 'text', required: false, description: 'SQL 쿼리' }],
    outputs: [{ name: 'result', type: 'json', required: true, description: '쿼리 결과' }],
  },
  configSchema: [
    { key: 'db_path', label: 'DB 경로', type: 'file', description: '비워두면 기본 DB 사용' },
    { key: 'sql', label: 'SQL 쿼리', type: 'code', language: 'sql', required: true, rows: 5 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const sql = input.sql || config.sql
      const result = await invoke('tool_sqlite_query', {
        dbPath: config.db_path || null, sql,
      }) as any
      return { result }
    },
  },
}

export const STORAGE_DEFINITIONS: NodeDefinition[] = [
  KvGetDefinition, KvSetDefinition, KvDeleteDefinition, KvListDefinition,
  VectorStoreDefinition, VectorSearchDefinition, VectorHybridDefinition,
  SqliteQueryDefinition,
]
