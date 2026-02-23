/**
 * Memory Agent
 *
 * 사용자 학습 및 기억 관리 에이전트.
 * 모든 사용자 활동, 선호도, 패턴을 로컬 SQLite에 저장하고
 * 관련 기억을 검색하여 컨텍스트로 제공.
 *
 * 특징:
 * - 에피소드 기억: 특정 이벤트/대화 기록
 * - 의미 기억: 학습된 지식/패턴
 * - 절차 기억: 워크플로우 패턴, 작업 방식
 * - 중요도 기반 기억 유지/삭제
 * - 벡터 임베딩 기반 유사 기억 검색
 */

import { invoke } from '@tauri-apps/api/tauri'
import type {
  Memory,
  MemoryQuery,
  MemoryMetadata,
  IMemoryAgent,
  ActivityLog,
  ActivityType,
  UserProfile,
  BehaviorPattern,
  WorkflowPattern,
  FeedbackEntry,
} from './types'

// ============================================================
// Constants
// ============================================================

const MEMORY_DB_NAME = 'handbox_memory'
const IMPORTANCE_DECAY_RATE = 0.01 // 일당 중요도 감소율
const MIN_IMPORTANCE_THRESHOLD = 0.1 // 이 이하면 삭제 후보
const CONSOLIDATION_THRESHOLD = 100 // 이 이상이면 통합 실행

// ============================================================
// Memory Agent Implementation
// ============================================================

class MemoryAgentImpl implements IMemoryAgent {
  private initialized = false
  private sessionId: string
  private shortTermMemory: Map<string, any> = new Map()

  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  // ── 초기화 ──

  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // SQLite 테이블 생성
      await this.ensureTables()
      this.initialized = true
      console.log('[MemoryAgent] 초기화 완료')
    } catch (error) {
      console.error('[MemoryAgent] 초기화 실패:', error)
      throw error
    }
  }

  private async ensureTables(): Promise<void> {
    const schemas = [
      // 기억 테이블
      `CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        access_count INTEGER DEFAULT 1,
        importance REAL DEFAULT 0.5,
        related_memories TEXT,
        embedding BLOB
      )`,
      // 활동 로그 테이블
      `CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        action TEXT NOT NULL,
        input TEXT,
        output TEXT,
        metadata TEXT,
        explanation TEXT
      )`,
      // 사용자 프로필 테이블
      `CREATE TABLE IF NOT EXISTS user_profile (
        user_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL,
        preferences TEXT NOT NULL,
        behavior_patterns TEXT,
        domain_expertise TEXT,
        frequent_patterns TEXT,
        feedback_history TEXT
      )`,
      // 인덱스
      `CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)`,
      `CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)`,
      `CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance)`,
      `CREATE INDEX IF NOT EXISTS idx_activity_logs_session ON activity_logs(session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(type)`,
    ]

    for (const schema of schemas) {
      await invoke('memory_db_execute', { sql: schema })
    }
  }

  // ── 기억 저장 ──

  async store(memory: Omit<Memory, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'>): Promise<string> {
    await this.initialize()

    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()

    const fullMemory: Memory = {
      ...memory,
      id,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 1,
    }

    // 단기 기억에도 저장
    this.shortTermMemory.set(id, fullMemory)

    // SQLite에 저장
    await invoke('memory_db_execute', {
      sql: `INSERT INTO memories (id, type, category, key, value, metadata, created_at, last_accessed_at, access_count, importance, related_memories, embedding)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        fullMemory.type,
        fullMemory.category,
        fullMemory.key,
        JSON.stringify(fullMemory.value),
        JSON.stringify(fullMemory.metadata),
        fullMemory.createdAt,
        fullMemory.lastAccessedAt,
        fullMemory.accessCount,
        fullMemory.importance,
        JSON.stringify(fullMemory.relatedMemories || []),
        fullMemory.embedding ? new Uint8Array(new Float32Array(fullMemory.embedding).buffer) : null,
      ],
    })

    console.log(`[MemoryAgent] 기억 저장: ${id} (${memory.type}/${memory.category})`)
    return id
  }

  // ── 기억 검색 ──

  async recall(query: MemoryQuery): Promise<Memory[]> {
    await this.initialize()

    let sql = 'SELECT * FROM memories WHERE 1=1'
    const params: any[] = []

    if (query.category) {
      sql += ' AND category = ?'
      params.push(query.category)
    }

    if (query.type) {
      sql += ' AND type = ?'
      params.push(query.type)
    }

    if (query.minImportance !== undefined) {
      sql += ' AND importance >= ?'
      params.push(query.minImportance)
    }

    if (query.timeRange) {
      sql += ' AND created_at >= ? AND created_at <= ?'
      params.push(query.timeRange.start, query.timeRange.end)
    }

    if (query.tags && query.tags.length > 0) {
      // JSON 배열에서 태그 검색
      const tagConditions = query.tags.map(() => "json_extract(metadata, '$.tags') LIKE ?").join(' OR ')
      sql += ` AND (${tagConditions})`
      params.push(...query.tags.map(tag => `%"${tag}"%`))
    }

    // 정렬
    switch (query.sortBy) {
      case 'recency':
        sql += ' ORDER BY last_accessed_at DESC'
        break
      case 'importance':
        sql += ' ORDER BY importance DESC'
        break
      case 'accessCount':
        sql += ' ORDER BY access_count DESC'
        break
      default:
        sql += ' ORDER BY importance DESC, last_accessed_at DESC'
    }

    if (query.limit) {
      sql += ' LIMIT ?'
      params.push(query.limit)
    }

    const rows = await invoke<any[]>('memory_db_query', { sql, params })

    // 접근 시간 업데이트
    const memories = rows.map(row => this.rowToMemory(row))
    for (const memory of memories) {
      await this.updateAccessTime(memory.id)
    }

    return memories
  }

  // ── 텍스트 기반 검색 (키워드 매칭) ──

  async search(queryText: string, limit = 10): Promise<Memory[]> {
    await this.initialize()

    const sql = `
      SELECT * FROM memories
      WHERE key LIKE ? OR value LIKE ? OR json_extract(metadata, '$.context') LIKE ?
      ORDER BY importance DESC, last_accessed_at DESC
      LIMIT ?
    `
    const searchPattern = `%${queryText}%`
    const rows = await invoke<any[]>('memory_db_query', {
      sql,
      params: [searchPattern, searchPattern, searchPattern, limit],
    })

    return rows.map(row => this.rowToMemory(row))
  }

  // ── 기억 업데이트 ──

  async update(id: string, updates: Partial<Memory>): Promise<void> {
    await this.initialize()

    const setClauses: string[] = []
    const params: any[] = []

    if (updates.value !== undefined) {
      setClauses.push('value = ?')
      params.push(JSON.stringify(updates.value))
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?')
      params.push(JSON.stringify(updates.metadata))
    }
    if (updates.importance !== undefined) {
      setClauses.push('importance = ?')
      params.push(updates.importance)
    }
    if (updates.relatedMemories !== undefined) {
      setClauses.push('related_memories = ?')
      params.push(JSON.stringify(updates.relatedMemories))
    }

    if (setClauses.length === 0) return

    params.push(id)
    await invoke('memory_db_execute', {
      sql: `UPDATE memories SET ${setClauses.join(', ')} WHERE id = ?`,
      params,
    })

    // 단기 기억도 업데이트
    if (this.shortTermMemory.has(id)) {
      const current = this.shortTermMemory.get(id)
      this.shortTermMemory.set(id, { ...current, ...updates })
    }
  }

  // ── 기억 삭제 ──

  async forget(id: string): Promise<void> {
    await this.initialize()

    await invoke('memory_db_execute', {
      sql: 'DELETE FROM memories WHERE id = ?',
      params: [id],
    })

    this.shortTermMemory.delete(id)
    console.log(`[MemoryAgent] 기억 삭제: ${id}`)
  }

  // ── 관련 기억 찾기 ──

  async findRelated(memoryId: string, limit = 5): Promise<Memory[]> {
    await this.initialize()

    // 먼저 해당 기억 조회
    const rows = await invoke<any[]>('memory_db_query', {
      sql: 'SELECT * FROM memories WHERE id = ?',
      params: [memoryId],
    })

    if (rows.length === 0) return []

    const memory = this.rowToMemory(rows[0])

    // 같은 카테고리, 비슷한 태그를 가진 기억 검색
    const related = await this.recall({
      category: memory.category,
      limit: limit + 1, // 자기 자신 제외를 위해 +1
      sortBy: 'relevance',
    })

    return related.filter(m => m.id !== memoryId).slice(0, limit)
  }

  // ── 기억 통합 ──

  async consolidate(): Promise<void> {
    await this.initialize()

    // 오래되고 중요도 낮은 기억 삭제
    const threshold = Date.now() - 30 * 24 * 60 * 60 * 1000 // 30일
    await invoke('memory_db_execute', {
      sql: 'DELETE FROM memories WHERE importance < ? AND last_accessed_at < ?',
      params: [MIN_IMPORTANCE_THRESHOLD, threshold],
    })

    // 중복 기억 통합 (같은 key를 가진 기억)
    const duplicates = await invoke<any[]>('memory_db_query', {
      sql: `
        SELECT key, COUNT(*) as cnt FROM memories
        GROUP BY key HAVING cnt > 1
      `,
      params: [],
    })

    for (const dup of duplicates) {
      const memories = await this.recall({ limit: 100 })
      const sameKey = memories.filter(m => m.key === dup.key)

      if (sameKey.length > 1) {
        // 가장 중요한 것 유지, 나머지 삭제
        const sorted = sameKey.sort((a, b) => b.importance - a.importance)
        for (let i = 1; i < sorted.length; i++) {
          await this.forget(sorted[i].id)
        }
      }
    }

    console.log('[MemoryAgent] 기억 통합 완료')
  }

  // ── 중요도 재계산 ──

  async recalculateImportance(): Promise<void> {
    await this.initialize()

    const now = Date.now()

    // 모든 기억 조회
    const memories = await this.recall({ limit: 10000 })

    for (const memory of memories) {
      // 시간 경과에 따른 감소
      const daysSinceAccess = (now - memory.lastAccessedAt) / (24 * 60 * 60 * 1000)
      const decayFactor = Math.exp(-IMPORTANCE_DECAY_RATE * daysSinceAccess)

      // 접근 빈도 보너스
      const accessBonus = Math.min(0.2, memory.accessCount * 0.01)

      // 새 중요도 계산
      const newImportance = Math.min(1, memory.importance * decayFactor + accessBonus)

      await this.update(memory.id, { importance: newImportance })
    }

    console.log('[MemoryAgent] 중요도 재계산 완료')
  }

  // ── 활동 로깅 ──

  async logActivity(log: Omit<ActivityLog, 'id' | 'sessionId'>): Promise<void> {
    await this.initialize()

    const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    await invoke('memory_db_execute', {
      sql: `INSERT INTO activity_logs (id, timestamp, session_id, type, action, input, output, metadata, explanation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        log.timestamp,
        this.sessionId,
        log.type,
        log.action,
        log.input ? JSON.stringify(log.input) : null,
        log.output ? JSON.stringify(log.output) : null,
        log.metadata ? JSON.stringify(log.metadata) : null,
        log.explanation ? JSON.stringify(log.explanation) : null,
      ],
    })
  }

  // ── 활동 로그 조회 ──

  async getActivityLogs(filter: {
    type?: ActivityType
    sessionId?: string
    startTime?: number
    endTime?: number
    limit?: number
  }): Promise<ActivityLog[]> {
    await this.initialize()

    let sql = 'SELECT * FROM activity_logs WHERE 1=1'
    const params: any[] = []

    if (filter.type) {
      sql += ' AND type = ?'
      params.push(filter.type)
    }
    if (filter.sessionId) {
      sql += ' AND session_id = ?'
      params.push(filter.sessionId)
    }
    if (filter.startTime) {
      sql += ' AND timestamp >= ?'
      params.push(filter.startTime)
    }
    if (filter.endTime) {
      sql += ' AND timestamp <= ?'
      params.push(filter.endTime)
    }

    sql += ' ORDER BY timestamp DESC'

    if (filter.limit) {
      sql += ' LIMIT ?'
      params.push(filter.limit)
    }

    const rows = await invoke<any[]>('memory_db_query', { sql, params })
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      sessionId: row.session_id,
      type: row.type,
      action: row.action,
      input: row.input ? JSON.parse(row.input) : undefined,
      output: row.output ? JSON.parse(row.output) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      explanation: row.explanation ? JSON.parse(row.explanation) : undefined,
    }))
  }

  // ── 사용자 프로필 ──

  async getUserProfile(userId = 'default'): Promise<UserProfile> {
    await this.initialize()

    const rows = await invoke<any[]>('memory_db_query', {
      sql: 'SELECT * FROM user_profile WHERE user_id = ?',
      params: [userId],
    })

    if (rows.length > 0) {
      const row = rows[0]
      return {
        userId: row.user_id,
        createdAt: row.created_at,
        lastActiveAt: row.last_active_at,
        preferences: JSON.parse(row.preferences),
        behaviorPatterns: row.behavior_patterns ? JSON.parse(row.behavior_patterns) : [],
        domainExpertise: row.domain_expertise ? JSON.parse(row.domain_expertise) : {},
        frequentPatterns: row.frequent_patterns ? JSON.parse(row.frequent_patterns) : [],
        feedbackHistory: row.feedback_history ? JSON.parse(row.feedback_history) : [],
      }
    }

    // 새 프로필 생성
    const newProfile: UserProfile = {
      userId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      preferences: {
        preferredModel: 'claude-3.5-sonnet',
        preferredTemperature: 0.7,
        detailLevel: 3,
        autoExecuteEnabled: false,
        xaiDetailLevel: 'standard',
        language: 'ko',
      },
      behaviorPatterns: [],
      domainExpertise: {},
      frequentPatterns: [],
      feedbackHistory: [],
    }

    await this.saveUserProfile(newProfile)
    return newProfile
  }

  async saveUserProfile(profile: UserProfile): Promise<void> {
    await this.initialize()

    await invoke('memory_db_execute', {
      sql: `INSERT OR REPLACE INTO user_profile
            (user_id, created_at, last_active_at, preferences, behavior_patterns, domain_expertise, frequent_patterns, feedback_history)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        profile.userId,
        profile.createdAt,
        profile.lastActiveAt,
        JSON.stringify(profile.preferences),
        JSON.stringify(profile.behaviorPatterns),
        JSON.stringify(profile.domainExpertise),
        JSON.stringify(profile.frequentPatterns),
        JSON.stringify(profile.feedbackHistory),
      ],
    })
  }

  // ── 피드백 기록 ──

  async recordFeedback(feedback: Omit<FeedbackEntry, 'id' | 'timestamp'>): Promise<void> {
    const profile = await this.getUserProfile()

    const entry: FeedbackEntry = {
      ...feedback,
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    }

    profile.feedbackHistory.push(entry)
    profile.lastActiveAt = Date.now()

    await this.saveUserProfile(profile)

    // 피드백을 기억으로도 저장
    await this.store({
      type: 'episodic',
      category: 'feedback',
      key: `feedback_${feedback.targetType}_${feedback.targetId}`,
      value: entry,
      metadata: {
        source: 'user_feedback',
        context: feedback.content,
        tags: ['feedback', feedback.type, feedback.targetType],
        verified: true,
      },
      importance: feedback.type === 'correction' ? 0.9 : 0.7,
      relatedMemories: [],
    })

    console.log(`[MemoryAgent] 피드백 기록: ${entry.id} (${feedback.type})`)
  }

  // ── 행동 패턴 학습 ──

  async learnBehaviorPattern(pattern: Omit<BehaviorPattern, 'id' | 'frequency' | 'lastOccurrence'>): Promise<void> {
    const profile = await this.getUserProfile()

    // 기존 패턴 찾기
    const existingIndex = profile.behaviorPatterns.findIndex(
      p => p.type === pattern.type && p.description === pattern.description
    )

    if (existingIndex >= 0) {
      // 기존 패턴 업데이트
      profile.behaviorPatterns[existingIndex].frequency++
      profile.behaviorPatterns[existingIndex].lastOccurrence = Date.now()
      profile.behaviorPatterns[existingIndex].contexts = [
        ...new Set([...profile.behaviorPatterns[existingIndex].contexts, ...pattern.contexts]),
      ].slice(-10) // 최근 10개 컨텍스트만 유지
    } else {
      // 새 패턴 추가
      profile.behaviorPatterns.push({
        ...pattern,
        id: `bp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        frequency: 1,
        lastOccurrence: Date.now(),
      })
    }

    profile.lastActiveAt = Date.now()
    await this.saveUserProfile(profile)
  }

  // ── 워크플로우 패턴 학습 ──

  async learnWorkflowPattern(
    nodeSequence: string[],
    success: boolean,
    executionTime: number
  ): Promise<void> {
    const profile = await this.getUserProfile()

    // 시퀀스 해시 생성
    const sequenceKey = nodeSequence.join('->')

    const existingIndex = profile.frequentPatterns.findIndex(
      p => p.nodeSequence.join('->') === sequenceKey
    )

    if (existingIndex >= 0) {
      const pattern = profile.frequentPatterns[existingIndex]
      pattern.usageCount++
      pattern.successRate = (pattern.successRate * (pattern.usageCount - 1) + (success ? 1 : 0)) / pattern.usageCount
      pattern.avgExecutionTime = (pattern.avgExecutionTime * (pattern.usageCount - 1) + executionTime) / pattern.usageCount
    } else {
      profile.frequentPatterns.push({
        id: `wp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        nodeSequence,
        usageCount: 1,
        successRate: success ? 1 : 0,
        avgExecutionTime: executionTime,
      })
    }

    profile.lastActiveAt = Date.now()
    await this.saveUserProfile(profile)
  }

  // ── 도메인 전문성 업데이트 ──

  async updateDomainExpertise(domain: string, delta: number): Promise<void> {
    const profile = await this.getUserProfile()

    const current = profile.domainExpertise[domain] || 0
    profile.domainExpertise[domain] = Math.min(1, Math.max(0, current + delta))
    profile.lastActiveAt = Date.now()

    await this.saveUserProfile(profile)
  }

  // ── 단기 기억 ──

  setShortTerm(key: string, value: any): void {
    this.shortTermMemory.set(key, value)
  }

  getShortTerm(key: string): any {
    return this.shortTermMemory.get(key)
  }

  clearShortTerm(): void {
    this.shortTermMemory.clear()
  }

  // ── 유틸리티 ──

  private rowToMemory(row: any): Memory {
    return {
      id: row.id,
      type: row.type,
      category: row.category,
      key: row.key,
      value: JSON.parse(row.value),
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
      accessCount: row.access_count,
      importance: row.importance,
      relatedMemories: row.related_memories ? JSON.parse(row.related_memories) : [],
      embedding: row.embedding ? Array.from(new Float32Array(row.embedding)) : undefined,
    }
  }

  private async updateAccessTime(id: string): Promise<void> {
    await invoke('memory_db_execute', {
      sql: 'UPDATE memories SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?',
      params: [Date.now(), id],
    })
  }

  get currentSessionId(): string {
    return this.sessionId
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const MemoryAgent = new MemoryAgentImpl()
