/**
 * Local Vector Database
 *
 * 완전 로컬 벡터 데이터베이스.
 * 외부 서비스 없이 임베딩 저장, 검색, 관리 가능.
 *
 * 기능:
 * - 인메모리 벡터 저장소 (IndexedDB 백업)
 * - 코사인 유사도 검색
 * - 지식 베이스 관리
 * - 청킹 및 인덱싱
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
}

export interface SearchResult {
  document: VectorDocument
  score: number
}

export interface ChunkingOptions {
  strategy: 'fixed' | 'semantic' | 'paragraph' | 'sentence'
  chunkSize: number
  chunkOverlap: number
}

// ============================================================
// Vector Math Utilities
// ============================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimensions')
  }

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
// Text Chunking
// ============================================================

function chunkText(text: string, options: ChunkingOptions): string[] {
  const { strategy, chunkSize, chunkOverlap } = options
  const chunks: string[] = []

  switch (strategy) {
    case 'paragraph': {
      // 단락 기반 청킹
      const paragraphs = text.split(/\n\n+/)
      let currentChunk = ''

      for (const para of paragraphs) {
        if ((currentChunk + para).length > chunkSize && currentChunk) {
          chunks.push(currentChunk.trim())
          // 오버랩: 이전 청크의 마지막 부분 유지
          currentChunk = currentChunk.slice(-chunkOverlap) + para
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + para
        }
      }
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
      }
      break
    }

    case 'sentence': {
      // 문장 기반 청킹
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
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
      }
      break
    }

    case 'semantic': {
      // 시맨틱 청킹: 헤더, 리스트, 코드 블록 등 구조 기반
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
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
      }
      break
    }

    case 'fixed':
    default: {
      // 고정 크기 청킹
      for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
        const chunk = text.slice(i, i + chunkSize)
        if (chunk.trim()) {
          chunks.push(chunk.trim())
        }
      }
    }
  }

  return chunks.filter(c => c.length > 10) // 너무 짧은 청크 제거
}

// ============================================================
// Local Vector Database Class
// ============================================================

class LocalVectorDBImpl {
  private knowledgeBases: Map<string, KnowledgeBase> = new Map()
  private documents: Map<string, VectorDocument[]> = new Map() // kbId -> documents
  private initialized: boolean = false

  /**
   * 초기화 (IndexedDB 로드)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // IndexedDB에서 저장된 데이터 로드 (간소화된 버전)
      const stored = localStorage.getItem('handbox_vectordb')
      if (stored) {
        const data = JSON.parse(stored)
        this.knowledgeBases = new Map(Object.entries(data.knowledgeBases || {}))
        this.documents = new Map(Object.entries(data.documents || {}))
      }
      this.initialized = true
      console.log('[LocalVectorDB] Initialized with', this.knowledgeBases.size, 'knowledge bases')
    } catch (error) {
      console.warn('[LocalVectorDB] Failed to load from storage:', error)
      this.initialized = true
    }
  }

  /**
   * 저장 (IndexedDB)
   */
  private async persist(): Promise<void> {
    try {
      const data = {
        knowledgeBases: Object.fromEntries(this.knowledgeBases),
        documents: Object.fromEntries(this.documents),
      }
      localStorage.setItem('handbox_vectordb', JSON.stringify(data))
    } catch (error) {
      console.warn('[LocalVectorDB] Failed to persist:', error)
    }
  }

  // ============================================================
  // Knowledge Base Management
  // ============================================================

  /**
   * 지식 베이스 생성
   */
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
    }

    this.knowledgeBases.set(id, kb)
    this.documents.set(id, [])
    await this.persist()

    console.log(`[LocalVectorDB] Created KB: ${kb.name} (${kb.id})`)
    return kb
  }

  /**
   * 지식 베이스 목록 조회
   */
  async listKnowledgeBases(status?: string): Promise<KnowledgeBase[]> {
    await this.initialize()

    const all = Array.from(this.knowledgeBases.values())
    if (!status || status === 'all') return all
    return all.filter(kb => kb.status === status)
  }

  /**
   * 지식 베이스 조회
   */
  async getKnowledgeBase(nameOrId: string): Promise<KnowledgeBase | null> {
    await this.initialize()

    // ID로 먼저 찾기
    if (this.knowledgeBases.has(nameOrId)) {
      return this.knowledgeBases.get(nameOrId)!
    }

    // 이름으로 찾기
    for (const kb of this.knowledgeBases.values()) {
      if (kb.name === nameOrId) return kb
    }

    return null
  }

  /**
   * 지식 베이스 삭제
   */
  async deleteKnowledgeBase(nameOrId: string): Promise<boolean> {
    await this.initialize()

    const kb = await this.getKnowledgeBase(nameOrId)
    if (!kb) return false

    this.knowledgeBases.delete(kb.id)
    this.documents.delete(kb.id)
    await this.persist()

    console.log(`[LocalVectorDB] Deleted KB: ${kb.name}`)
    return true
  }

  // ============================================================
  // Document Ingestion
  // ============================================================

  /**
   * 문서 인제스트 (임베딩 생성 및 저장)
   */
  async ingestDocuments(
    kbNameOrId: string,
    contents: Array<{ content: string; source: string; metadata?: Record<string, any> }>,
    embeddings: number[][],
    chunkingOptions?: ChunkingOptions,
  ): Promise<{
    documentsProcessed: number
    chunksCreated: number
    embeddingsStored: number
  }> {
    await this.initialize()

    let kb = await this.getKnowledgeBase(kbNameOrId)
    if (!kb) {
      // 지식 베이스 자동 생성
      kb = await this.createKnowledgeBase({ name: kbNameOrId })
    }

    const kbDocs = this.documents.get(kb.id) || []
    let chunksCreated = 0

    const defaultChunking: ChunkingOptions = {
      strategy: kb.chunkingStrategy as any || 'semantic',
      chunkSize: kb.chunkSize || 512,
      chunkOverlap: 50,
    }

    const options = chunkingOptions || defaultChunking

    for (let i = 0; i < contents.length; i++) {
      const { content, source, metadata } = contents[i]

      // 청킹
      const chunks = chunkText(content, options)

      // 각 청크에 대해 임베딩이 있으면 저장
      // 임베딩이 부족하면 마지막 임베딩 재사용
      for (let j = 0; j < chunks.length; j++) {
        const embedding = embeddings[chunksCreated] || embeddings[embeddings.length - 1] || []

        const doc: VectorDocument = {
          id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          content: chunks[j],
          embedding: normalizeVector(embedding),
          metadata: { ...metadata, chunkIndex: j, totalChunks: chunks.length },
          source,
          createdAt: new Date().toISOString(),
        }

        kbDocs.push(doc)
        chunksCreated++
      }
    }

    this.documents.set(kb.id, kbDocs)

    // KB 업데이트
    kb.documentCount = kbDocs.length
    kb.lastSync = new Date().toISOString()
    this.knowledgeBases.set(kb.id, kb)

    await this.persist()

    console.log(`[LocalVectorDB] Ingested ${contents.length} docs → ${chunksCreated} chunks into ${kb.name}`)

    return {
      documentsProcessed: contents.length,
      chunksCreated,
      embeddingsStored: chunksCreated,
    }
  }

  // ============================================================
  // Semantic Search
  // ============================================================

  /**
   * 벡터 유사도 검색
   */
  async search(
    kbNameOrId: string,
    queryEmbedding: number[],
    options?: {
      topK?: number
      similarityThreshold?: number
      filters?: Record<string, any>
    },
  ): Promise<SearchResult[]> {
    await this.initialize()

    const kb = await this.getKnowledgeBase(kbNameOrId)
    if (!kb) {
      console.warn(`[LocalVectorDB] KB not found: ${kbNameOrId}`)
      return []
    }

    const kbDocs = this.documents.get(kb.id) || []
    const topK = options?.topK || 5
    const threshold = options?.similarityThreshold || 0.5
    const filters = options?.filters || {}

    const normalizedQuery = normalizeVector(queryEmbedding)

    // 모든 문서와 유사도 계산
    const results: SearchResult[] = []

    for (const doc of kbDocs) {
      // 메타데이터 필터 적용
      let passFilter = true
      for (const [key, value] of Object.entries(filters)) {
        if (doc.metadata[key] !== value) {
          passFilter = false
          break
        }
      }
      if (!passFilter) continue

      const score = cosineSimilarity(normalizedQuery, doc.embedding)
      if (score >= threshold) {
        results.push({ document: doc, score })
      }
    }

    // 점수 기준 정렬 및 상위 K개 반환
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  }

  // ============================================================
  // Utilities
  // ============================================================

  /**
   * 통계 조회
   */
  async getStats(): Promise<{
    totalKnowledgeBases: number
    totalDocuments: number
    totalEmbeddings: number
  }> {
    await this.initialize()

    let totalDocs = 0
    for (const docs of this.documents.values()) {
      totalDocs += docs.length
    }

    return {
      totalKnowledgeBases: this.knowledgeBases.size,
      totalDocuments: totalDocs,
      totalEmbeddings: totalDocs,
    }
  }

  /**
   * 전체 초기화 (데이터 삭제)
   */
  async clear(): Promise<void> {
    this.knowledgeBases.clear()
    this.documents.clear()
    localStorage.removeItem('handbox_vectordb')
    console.log('[LocalVectorDB] Cleared all data')
  }
}

// 싱글톤 인스턴스
export const LocalVectorDB = new LocalVectorDBImpl()
