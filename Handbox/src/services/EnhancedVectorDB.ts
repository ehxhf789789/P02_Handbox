/**
 * Enhanced Vector Database
 *
 * AWS Bedrock Knowledge Base 수준의 고성능 로컬 벡터 DB
 *
 * 개선 사항:
 * 1. IndexedDB 기반 저장 (수백 MB 지원)
 * 2. BM25 + 벡터 하이브리드 검색
 * 3. 리랭킹 지원
 * 4. 배치 처리 최적화
 */

// ============================================================
// Types
// ============================================================

export interface VectorDocument {
  id: string
  content: string
  embedding: number[]
  metadata: Record<string, any>
  source: string
  createdAt: string
  // BM25용 토큰화된 내용
  tokens?: string[]
  tokenFreq?: Record<string, number>
}

export interface KnowledgeBase {
  id: string
  name: string
  description: string
  status: 'active' | 'inactive' | 'syncing'
  documentCount: number
  embeddingModel: string
  chunkingStrategy: string
  chunkSize: number
  createdAt: string
  lastSync: string
  // BM25 통계
  avgDocLength?: number
  totalTokens?: number
}

export interface SearchResult {
  document: VectorDocument
  score: number
  vectorScore?: number
  bm25Score?: number
}

export interface HybridSearchOptions {
  topK?: number
  similarityThreshold?: number
  filters?: Record<string, any>
  // 하이브리드 검색 옵션
  useHybrid?: boolean
  vectorWeight?: number  // 0-1, 벡터 점수 가중치
  bm25Weight?: number    // 0-1, BM25 점수 가중치
  rerank?: boolean
}

// ============================================================
// BM25 Implementation
// ============================================================

class BM25 {
  private k1: number = 1.5  // 용어 빈도 포화 파라미터
  private b: number = 0.75  // 문서 길이 정규화 파라미터

  /**
   * 텍스트 토큰화
   */
  tokenize(text: string): string[] {
    // 한글, 영문, 숫자 처리
    const normalized = text.toLowerCase()
      .replace(/[^\w\s\uAC00-\uD7AF]/g, ' ')  // 특수문자 제거 (한글 유지)
      .replace(/\s+/g, ' ')
      .trim()

    // 단어 분리 + 한글 2-gram
    const words = normalized.split(' ').filter(w => w.length > 1)
    const tokens: string[] = [...words]

    // 한글 바이그램 추가
    for (const word of words) {
      if (/[\uAC00-\uD7AF]/.test(word) && word.length >= 2) {
        for (let i = 0; i < word.length - 1; i++) {
          tokens.push(word.slice(i, i + 2))
        }
      }
    }

    return tokens
  }

  /**
   * 용어 빈도 계산
   */
  computeTermFrequency(tokens: string[]): Record<string, number> {
    const freq: Record<string, number> = {}
    for (const token of tokens) {
      freq[token] = (freq[token] || 0) + 1
    }
    return freq
  }

  /**
   * IDF 계산
   */
  computeIDF(
    term: string,
    documents: VectorDocument[],
  ): number {
    const docsWithTerm = documents.filter(
      doc => doc.tokenFreq && doc.tokenFreq[term]
    ).length
    const N = documents.length

    if (docsWithTerm === 0) return 0
    return Math.log((N - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1)
  }

  /**
   * BM25 점수 계산
   */
  score(
    queryTokens: string[],
    document: VectorDocument,
    documents: VectorDocument[],
    avgDocLength: number,
  ): number {
    if (!document.tokens || !document.tokenFreq) return 0

    const docLength = document.tokens.length
    let score = 0

    for (const term of queryTokens) {
      const tf = document.tokenFreq[term] || 0
      if (tf === 0) continue

      const idf = this.computeIDF(term, documents)
      const tfNorm = (tf * (this.k1 + 1)) /
        (tf + this.k1 * (1 - this.b + this.b * (docLength / avgDocLength)))

      score += idf * tfNorm
    }

    return score
  }
}

// ============================================================
// IndexedDB Wrapper
// ============================================================

const DB_NAME = 'handbox_vectordb'
const DB_VERSION = 2
const STORE_KB = 'knowledge_bases'
const STORE_DOCS = 'documents'

class IndexedDBStore {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  async init(): Promise<void> {
    if (this.db) return
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('[IndexedDB] Failed to open:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('[IndexedDB] Opened successfully')
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Knowledge Bases 스토어
        if (!db.objectStoreNames.contains(STORE_KB)) {
          const kbStore = db.createObjectStore(STORE_KB, { keyPath: 'id' })
          kbStore.createIndex('name', 'name', { unique: true })
          kbStore.createIndex('status', 'status', { unique: false })
        }

        // Documents 스토어
        if (!db.objectStoreNames.contains(STORE_DOCS)) {
          const docStore = db.createObjectStore(STORE_DOCS, { keyPath: 'id' })
          docStore.createIndex('kbId', 'kbId', { unique: false })
          docStore.createIndex('source', 'source', { unique: false })
        }

        console.log('[IndexedDB] Schema upgraded')
      }
    })

    return this.initPromise
  }

  async put<T>(storeName: string, data: T): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.put(data)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getAllByIndex<T>(storeName: string, indexName: string, value: any): Promise<T[]> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const index = store.index(indexName)
      const request = index.getAll(value)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async delete(storeName: string, key: string): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.delete(key)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async deleteByIndex(storeName: string, indexName: string, value: any): Promise<number> {
    await this.init()
    const items = await this.getAllByIndex<{ id: string }>(storeName, indexName, value)
    for (const item of items) {
      await this.delete(storeName, item.id)
    }
    return items.length
  }

  async count(storeName: string): Promise<number> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async clear(storeName: string): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

// ============================================================
// Vector Math
// ============================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  return magnitude === 0 ? 0 : dotProduct / magnitude
}

function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
  return norm === 0 ? vec : vec.map(v => v / norm)
}

// ============================================================
// Enhanced Vector DB Class
// ============================================================

class EnhancedVectorDBImpl {
  private store = new IndexedDBStore()
  private bm25 = new BM25()
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return
    await this.store.init()
    this.initialized = true
    console.log('[EnhancedVectorDB] Initialized with IndexedDB')
  }

  // ============================================================
  // Knowledge Base Management
  // ============================================================

  async createKnowledgeBase(config: {
    name: string
    description?: string
    embeddingModel?: string
    chunkingStrategy?: string
    chunkSize?: number
  }): Promise<KnowledgeBase> {
    await this.initialize()

    const id = `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const kb: KnowledgeBase = {
      id,
      name: config.name,
      description: config.description || '',
      status: 'active',
      documentCount: 0,
      embeddingModel: config.embeddingModel || 'local',
      chunkingStrategy: config.chunkingStrategy || 'semantic',
      chunkSize: config.chunkSize || 512,
      createdAt: new Date().toISOString(),
      lastSync: new Date().toISOString(),
      avgDocLength: 0,
      totalTokens: 0,
    }

    await this.store.put(STORE_KB, kb)
    console.log(`[EnhancedVectorDB] Created KB: ${kb.name}`)
    return kb
  }

  async getKnowledgeBase(nameOrId: string): Promise<KnowledgeBase | null> {
    await this.initialize()

    // ID로 먼저 찾기
    let kb = await this.store.get<KnowledgeBase>(STORE_KB, nameOrId)
    if (kb) return kb

    // 이름으로 찾기
    const all = await this.store.getAll<KnowledgeBase>(STORE_KB)
    return all.find(k => k.name === nameOrId) || null
  }

  async listKnowledgeBases(status?: string): Promise<KnowledgeBase[]> {
    await this.initialize()
    const all = await this.store.getAll<KnowledgeBase>(STORE_KB)
    if (!status || status === 'all') return all
    return all.filter(kb => kb.status === status)
  }

  async deleteKnowledgeBase(nameOrId: string): Promise<boolean> {
    await this.initialize()
    const kb = await this.getKnowledgeBase(nameOrId)
    if (!kb) return false

    // 문서 삭제
    await this.store.deleteByIndex(STORE_DOCS, 'kbId', kb.id)
    // KB 삭제
    await this.store.delete(STORE_KB, kb.id)

    console.log(`[EnhancedVectorDB] Deleted KB: ${kb.name}`)
    return true
  }

  // ============================================================
  // Document Ingestion
  // ============================================================

  async ingestDocuments(
    kbNameOrId: string,
    contents: Array<{ content: string; source: string; metadata?: Record<string, any> }>,
    embeddings: number[][],
    chunkingOptions?: { strategy: string; chunkSize: number; chunkOverlap: number },
  ): Promise<{
    documentsProcessed: number
    chunksCreated: number
    embeddingsStored: number
  }> {
    await this.initialize()

    let kb = await this.getKnowledgeBase(kbNameOrId)
    if (!kb) {
      kb = await this.createKnowledgeBase({ name: kbNameOrId })
    }

    let chunksCreated = 0
    let totalTokens = 0

    for (let i = 0; i < contents.length; i++) {
      const { content, source, metadata } = contents[i]

      // 청킹
      const chunks = this.chunkText(content, chunkingOptions || {
        strategy: kb.chunkingStrategy,
        chunkSize: kb.chunkSize,
        chunkOverlap: 50,
      })

      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j]
        const embedding = embeddings[chunksCreated] || embeddings[embeddings.length - 1] || []

        // BM25용 토큰화
        const tokens = this.bm25.tokenize(chunk)
        const tokenFreq = this.bm25.computeTermFrequency(tokens)

        const doc: VectorDocument & { kbId: string } = {
          id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          kbId: kb.id,
          content: chunk,
          embedding: normalizeVector(embedding),
          metadata: { ...metadata, chunkIndex: j, totalChunks: chunks.length },
          source,
          createdAt: new Date().toISOString(),
          tokens,
          tokenFreq,
        }

        await this.store.put(STORE_DOCS, doc)
        chunksCreated++
        totalTokens += tokens.length
      }
    }

    // KB 통계 업데이트
    const allDocs = await this.store.getAllByIndex<VectorDocument>(STORE_DOCS, 'kbId', kb.id)
    kb.documentCount = allDocs.length
    kb.totalTokens = totalTokens
    kb.avgDocLength = totalTokens / Math.max(allDocs.length, 1)
    kb.lastSync = new Date().toISOString()
    await this.store.put(STORE_KB, kb)

    console.log(`[EnhancedVectorDB] Ingested ${contents.length} docs → ${chunksCreated} chunks`)

    return {
      documentsProcessed: contents.length,
      chunksCreated,
      embeddingsStored: chunksCreated,
    }
  }

  // ============================================================
  // Hybrid Search (Vector + BM25)
  // ============================================================

  async search(
    kbNameOrId: string,
    queryEmbedding: number[],
    options?: HybridSearchOptions,
  ): Promise<SearchResult[]> {
    await this.initialize()

    const kb = await this.getKnowledgeBase(kbNameOrId)
    if (!kb) {
      console.warn(`[EnhancedVectorDB] KB not found: ${kbNameOrId}`)
      return []
    }

    const documents = await this.store.getAllByIndex<VectorDocument & { kbId: string }>(
      STORE_DOCS, 'kbId', kb.id
    )

    if (documents.length === 0) return []

    const topK = options?.topK || 5
    const threshold = options?.similarityThreshold || 0.3
    const useHybrid = options?.useHybrid !== false
    const vectorWeight = options?.vectorWeight ?? 0.7
    const bm25Weight = options?.bm25Weight ?? 0.3
    const filters = options?.filters || {}

    const normalizedQuery = normalizeVector(queryEmbedding)

    // 쿼리 토큰화 (BM25용) - 임베딩에서 원본 텍스트 추출 불가, 옵션으로 전달 필요
    // 현재는 벡터 검색만 사용하고 BM25는 리랭킹에 활용

    const results: SearchResult[] = []

    for (const doc of documents) {
      // 필터 적용
      let passFilter = true
      for (const [key, value] of Object.entries(filters)) {
        if (doc.metadata[key] !== value) {
          passFilter = false
          break
        }
      }
      if (!passFilter) continue

      // 벡터 유사도
      const vectorScore = cosineSimilarity(normalizedQuery, doc.embedding)

      if (vectorScore >= threshold) {
        results.push({
          document: doc,
          score: vectorScore,
          vectorScore,
        })
      }
    }

    // 점수 기준 정렬
    results.sort((a, b) => b.score - a.score)

    return results.slice(0, topK)
  }

  /**
   * 하이브리드 검색 (쿼리 텍스트 포함)
   */
  async hybridSearch(
    kbNameOrId: string,
    queryText: string,
    queryEmbedding: number[],
    options?: HybridSearchOptions,
  ): Promise<SearchResult[]> {
    await this.initialize()

    const kb = await this.getKnowledgeBase(kbNameOrId)
    if (!kb) return []

    const documents = await this.store.getAllByIndex<VectorDocument & { kbId: string }>(
      STORE_DOCS, 'kbId', kb.id
    )

    if (documents.length === 0) return []

    const topK = options?.topK || 5
    const threshold = options?.similarityThreshold || 0.3
    const vectorWeight = options?.vectorWeight ?? 0.6
    const bm25Weight = options?.bm25Weight ?? 0.4
    const filters = options?.filters || {}
    const rerank = options?.rerank ?? true

    const normalizedQuery = normalizeVector(queryEmbedding)
    const queryTokens = this.bm25.tokenize(queryText)

    const results: SearchResult[] = []

    // 최대 BM25 점수 계산용
    let maxBM25 = 0
    const bm25Scores: number[] = []

    for (const doc of documents) {
      const score = this.bm25.score(queryTokens, doc, documents, kb.avgDocLength || 100)
      bm25Scores.push(score)
      if (score > maxBM25) maxBM25 = score
    }

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]

      // 필터 적용
      let passFilter = true
      for (const [key, value] of Object.entries(filters)) {
        if (doc.metadata[key] !== value) {
          passFilter = false
          break
        }
      }
      if (!passFilter) continue

      // 벡터 유사도
      const vectorScore = cosineSimilarity(normalizedQuery, doc.embedding)

      // BM25 점수 (정규화)
      const bm25Score = maxBM25 > 0 ? bm25Scores[i] / maxBM25 : 0

      // 하이브리드 점수
      const hybridScore = (vectorScore * vectorWeight) + (bm25Score * bm25Weight)

      if (hybridScore >= threshold || vectorScore >= threshold) {
        results.push({
          document: doc,
          score: hybridScore,
          vectorScore,
          bm25Score,
        })
      }
    }

    // 점수 기준 정렬
    results.sort((a, b) => b.score - a.score)

    // 리랭킹 (상위 결과 재정렬)
    if (rerank && results.length > 1) {
      // 간단한 리랭킹: 키워드 일치도 보너스
      for (const result of results) {
        const content = result.document.content.toLowerCase()
        let bonus = 0
        for (const token of queryTokens) {
          if (content.includes(token)) {
            bonus += 0.02
          }
        }
        result.score = Math.min(1, result.score + bonus)
      }
      results.sort((a, b) => b.score - a.score)
    }

    return results.slice(0, topK)
  }

  // ============================================================
  // Utilities
  // ============================================================

  private chunkText(
    text: string,
    options: { strategy: string; chunkSize: number; chunkOverlap: number },
  ): string[] {
    const { strategy, chunkSize, chunkOverlap } = options
    const chunks: string[] = []

    switch (strategy) {
      case 'paragraph': {
        const paragraphs = text.split(/\n\n+/)
        let currentChunk = ''
        for (const para of paragraphs) {
          if ((currentChunk + para).length > chunkSize && currentChunk) {
            chunks.push(currentChunk.trim())
            currentChunk = currentChunk.slice(-chunkOverlap) + para
          } else {
            currentChunk += (currentChunk ? '\n\n' : '') + para
          }
        }
        if (currentChunk.trim()) chunks.push(currentChunk.trim())
        break
      }

      case 'sentence': {
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
        let currentChunk = ''
        for (const sentence of sentences) {
          if ((currentChunk + sentence).length > chunkSize && currentChunk) {
            chunks.push(currentChunk.trim())
            currentChunk = currentChunk.slice(-chunkOverlap) + sentence
          } else {
            currentChunk += sentence
          }
        }
        if (currentChunk.trim()) chunks.push(currentChunk.trim())
        break
      }

      case 'semantic': {
        const sections = text.split(/(?=^#{1,6}\s|^[-*]\s|^```)/m)
        let currentChunk = ''
        for (const section of sections) {
          if ((currentChunk + section).length > chunkSize && currentChunk) {
            chunks.push(currentChunk.trim())
            currentChunk = section
          } else {
            currentChunk += section
          }
        }
        if (currentChunk.trim()) chunks.push(currentChunk.trim())
        break
      }

      default: {
        for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
          const chunk = text.slice(i, i + chunkSize)
          if (chunk.trim()) chunks.push(chunk.trim())
        }
      }
    }

    return chunks.filter(c => c.length > 10)
  }

  async getStats(): Promise<{
    totalKnowledgeBases: number
    totalDocuments: number
    totalEmbeddings: number
    storageUsed: string
  }> {
    await this.initialize()

    const kbCount = await this.store.count(STORE_KB)
    const docCount = await this.store.count(STORE_DOCS)

    // 스토리지 추정 (IndexedDB는 정확한 사이즈 측정 어려움)
    const estimatedMB = (docCount * 5) / 1024  // 문서당 약 5KB 추정

    return {
      totalKnowledgeBases: kbCount,
      totalDocuments: docCount,
      totalEmbeddings: docCount,
      storageUsed: `~${estimatedMB.toFixed(2)} MB`,
    }
  }

  async clear(): Promise<void> {
    await this.initialize()
    await this.store.clear(STORE_KB)
    await this.store.clear(STORE_DOCS)
    console.log('[EnhancedVectorDB] Cleared all data')
  }
}

// 싱글톤 인스턴스
export const EnhancedVectorDB = new EnhancedVectorDBImpl()
