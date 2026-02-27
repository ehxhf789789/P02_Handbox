/**
 * RL Logger - 영속성 로깅 시스템
 *
 * SQLite WAL 모드를 사용하여 갑작스러운 중단에도 학습 기록 보존
 * Tauri 백엔드의 SQLite 연동 또는 IndexedDB 폴백
 */

import { invoke } from '@tauri-apps/api/tauri'
import type {
  Experience,
  Checkpoint,
  BugPattern,
  LearningEntry,
  SimulationStats,
  Strategy,
} from '../types/RLTypes'

// ============================================================
// Types
// ============================================================

interface RLLoggerConfig {
  mode: 'tauri' | 'indexeddb' | 'memory'
  dbName: string
  autoCommit: boolean
  batchSize: number
}

const DEFAULT_CONFIG: RLLoggerConfig = {
  mode: 'indexeddb',  // 기본값은 IndexedDB (브라우저 호환성)
  dbName: 'handbox_rl',
  autoCommit: true,
  batchSize: 100,
}

// ============================================================
// IndexedDB Helper
// ============================================================

class IndexedDBHelper {
  private db: IDBDatabase | null = null
  private dbName: string
  private readonly stores = ['experiences', 'checkpoints', 'bug_patterns', 'learning_history']

  constructor(dbName: string) {
    this.dbName = dbName
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // experiences store
        if (!db.objectStoreNames.contains('experiences')) {
          const expStore = db.createObjectStore('experiences', { keyPath: 'id' })
          expStore.createIndex('timestamp', 'timestamp', { unique: false })
          expStore.createIndex('reward', 'reward', { unique: false })
          expStore.createIndex('success', ['metadata', 'success'], { unique: false })
        }

        // checkpoints store
        if (!db.objectStoreNames.contains('checkpoints')) {
          const cpStore = db.createObjectStore('checkpoints', { keyPath: 'id' })
          cpStore.createIndex('timestamp', 'timestamp', { unique: false })
          cpStore.createIndex('successCount', 'successCount', { unique: false })
        }

        // bug_patterns store
        if (!db.objectStoreNames.contains('bug_patterns')) {
          const bugStore = db.createObjectStore('bug_patterns', { keyPath: 'id' })
          bugStore.createIndex('severity', 'severity', { unique: false })
          bugStore.createIndex('frequency', 'frequency', { unique: false })
        }

        // learning_history store
        if (!db.objectStoreNames.contains('learning_history')) {
          const lhStore = db.createObjectStore('learning_history', { keyPath: 'id' })
          lhStore.createIndex('timestamp', 'timestamp', { unique: false })
          lhStore.createIndex('eventType', 'eventType', { unique: false })
        }
      }
    })
  }

  async put<T extends { id: string }>(storeName: string, data: T): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const tx = this.db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.put(this.serializeData(data))

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async get<T>(storeName: string, id: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const tx = this.db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.get(id)

      request.onsuccess = () => {
        const result = request.result
        resolve(result ? this.deserializeData(result) : null)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const tx = this.db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        const results = request.result.map(r => this.deserializeData<T>(r))
        resolve(results)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async count(storeName: string): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const tx = this.db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.count()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getLatest<T>(storeName: string, indexName: string = 'timestamp'): Promise<T | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const tx = this.db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const index = store.index(indexName)
      const request = index.openCursor(null, 'prev')

      request.onsuccess = () => {
        const cursor = request.result
        resolve(cursor ? this.deserializeData(cursor.value) : null)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getByRange<T>(
    storeName: string,
    indexName: string,
    lowerBound: IDBValidKey,
    upperBound?: IDBValidKey
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const tx = this.db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const index = store.index(indexName)

      const range = upperBound
        ? IDBKeyRange.bound(lowerBound, upperBound)
        : IDBKeyRange.lowerBound(lowerBound)

      const request = index.getAll(range)

      request.onsuccess = () => {
        const results = request.result.map(r => this.deserializeData<T>(r))
        resolve(results)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async delete(storeName: string, id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const tx = this.db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async clear(storeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const tx = this.db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  private serializeData(data: unknown): unknown {
    return JSON.parse(JSON.stringify(data, (_, value) => {
      if (value instanceof Map) {
        return { __type: 'Map', data: Array.from(value.entries()) }
      }
      if (value instanceof Date) {
        return { __type: 'Date', data: value.toISOString() }
      }
      return value
    }))
  }

  private deserializeData<T>(data: unknown): T {
    return JSON.parse(JSON.stringify(data), (_, value) => {
      if (value && typeof value === 'object') {
        if (value.__type === 'Map') {
          return new Map(value.data)
        }
        if (value.__type === 'Date') {
          return new Date(value.data)
        }
      }
      return value
    })
  }
}

// ============================================================
// Memory Storage (Fallback)
// ============================================================

class MemoryStorage {
  private experiences: Map<string, Experience> = new Map()
  private checkpoints: Map<string, Checkpoint> = new Map()
  private bugPatterns: Map<string, BugPattern> = new Map()
  private learningHistory: Map<string, LearningEntry> = new Map()

  async put<T extends { id: string }>(storeName: string, data: T): Promise<void> {
    const store = this.getStore(storeName) as Map<string, T>
    store.set(data.id, data)
  }

  async get<T>(storeName: string, id: string): Promise<T | null> {
    const store = this.getStore(storeName)
    return (store.get(id) as T) || null
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const store = this.getStore(storeName)
    return Array.from(store.values()) as T[]
  }

  async count(storeName: string): Promise<number> {
    return this.getStore(storeName).size
  }

  async getLatest<T>(storeName: string): Promise<T | null> {
    const all = await this.getAll<T & { timestamp: Date }>(storeName)
    if (all.length === 0) return null
    return all.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0] as T
  }

  async clear(storeName: string): Promise<void> {
    this.getStore(storeName).clear()
  }

  private getStore(storeName: string): Map<string, unknown> {
    switch (storeName) {
      case 'experiences': return this.experiences
      case 'checkpoints': return this.checkpoints
      case 'bug_patterns': return this.bugPatterns
      case 'learning_history': return this.learningHistory
      default: throw new Error(`Unknown store: ${storeName}`)
    }
  }
}

// ============================================================
// RLLogger Main Class
// ============================================================

export class RLLogger {
  private config: RLLoggerConfig
  private idb: IndexedDBHelper | null = null
  private memory: MemoryStorage | null = null
  private initialized = false
  private startTime: Date = new Date()
  private writeQueue: Array<{ store: string; data: unknown }> = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(config: Partial<RLLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ============================================================
  // Initialization
  // ============================================================

  async init(): Promise<void> {
    if (this.initialized) return

    try {
      // Tauri 환경인지 확인
      if (this.config.mode === 'tauri') {
        try {
          await invoke('rl_db_init')
          console.log('[RLLogger] Tauri SQLite initialized')
        } catch {
          console.warn('[RLLogger] Tauri not available, falling back to IndexedDB')
          this.config.mode = 'indexeddb'
        }
      }

      if (this.config.mode === 'indexeddb') {
        this.idb = new IndexedDBHelper(this.config.dbName)
        await this.idb.init()
        console.log('[RLLogger] IndexedDB initialized')
      } else if (this.config.mode === 'memory') {
        this.memory = new MemoryStorage()
        console.log('[RLLogger] Memory storage initialized')
      }

      this.startTime = new Date()
      this.initialized = true
    } catch (error) {
      console.error('[RLLogger] Initialization failed:', error)
      // 최종 폴백: 메모리 스토리지
      this.config.mode = 'memory'
      this.memory = new MemoryStorage()
      this.initialized = true
    }
  }

  // ============================================================
  // Experience Logging
  // ============================================================

  async logExperience(exp: Experience): Promise<void> {
    await this.ensureInit()

    if (this.config.autoCommit) {
      await this.write('experiences', exp)
    } else {
      this.queueWrite('experiences', exp)
    }
  }

  async getExperience(id: string): Promise<Experience | null> {
    await this.ensureInit()
    return this.read<Experience>('experiences', id)
  }

  async getAllExperiences(): Promise<Experience[]> {
    await this.ensureInit()
    return this.readAll<Experience>('experiences')
  }

  async getExperiencesSince(checkpointId: string): Promise<Experience[]> {
    await this.ensureInit()
    const checkpoint = await this.getCheckpoint(checkpointId)
    if (!checkpoint) return []

    const all = await this.getAllExperiences()
    return all.filter(e => new Date(e.timestamp) > new Date(checkpoint.timestamp))
  }

  async sampleExperiences(batchSize: number): Promise<Experience[]> {
    const all = await this.getAllExperiences()
    if (all.length <= batchSize) return all

    // Random sampling
    const shuffled = all.sort(() => Math.random() - 0.5)
    return shuffled.slice(0, batchSize)
  }

  async sampleByReward(minReward: number, maxCount: number = 100): Promise<Experience[]> {
    const all = await this.getAllExperiences()
    const filtered = all.filter(e => e.reward >= minReward)
    return filtered.slice(0, maxCount)
  }

  // ============================================================
  // Checkpoint Logging
  // ============================================================

  async logCheckpoint(cp: Checkpoint): Promise<void> {
    await this.ensureInit()
    await this.write('checkpoints', cp)
    console.log(`[RLLogger] Checkpoint saved: ${cp.id} (${cp.successCount}/${cp.totalAttempts})`)
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    await this.ensureInit()
    return this.read<Checkpoint>('checkpoints', id)
  }

  async getLastCheckpoint(): Promise<Checkpoint | null> {
    await this.ensureInit()

    if (this.config.mode === 'indexeddb' && this.idb) {
      return this.idb.getLatest<Checkpoint>('checkpoints')
    }

    if (this.memory) {
      return this.memory.getLatest<Checkpoint>('checkpoints')
    }

    return null
  }

  async getAllCheckpoints(): Promise<Checkpoint[]> {
    await this.ensureInit()
    return this.readAll<Checkpoint>('checkpoints')
  }

  // ============================================================
  // Bug Pattern Logging
  // ============================================================

  async logBugPattern(bug: BugPattern): Promise<void> {
    await this.ensureInit()
    await this.write('bug_patterns', bug)
  }

  async getBugPattern(id: string): Promise<BugPattern | null> {
    await this.ensureInit()
    return this.read<BugPattern>('bug_patterns', id)
  }

  async getAllBugPatterns(): Promise<BugPattern[]> {
    await this.ensureInit()
    return this.readAll<BugPattern>('bug_patterns')
  }

  async updateBugPattern(id: string, updates: Partial<BugPattern>): Promise<void> {
    const existing = await this.getBugPattern(id)
    if (!existing) return

    const updated = { ...existing, ...updates, lastSeen: new Date() }
    await this.write('bug_patterns', updated)
  }

  // ============================================================
  // Learning History Logging
  // ============================================================

  async logLearningEntry(entry: LearningEntry): Promise<void> {
    await this.ensureInit()

    if (this.config.autoCommit) {
      await this.write('learning_history', entry)
    } else {
      this.queueWrite('learning_history', entry)
    }
  }

  async getLearningHistory(): Promise<LearningEntry[]> {
    await this.ensureInit()
    return this.readAll<LearningEntry>('learning_history')
  }

  // ============================================================
  // Statistics
  // ============================================================

  async getStats(): Promise<SimulationStats> {
    await this.ensureInit()

    const experiences = await this.getAllExperiences()
    const lastCheckpoint = await this.getLastCheckpoint()

    const successCount = experiences.filter(e => e.metadata.success).length
    const totalAttempts = experiences.length

    const now = new Date()
    const runningTime = now.getTime() - this.startTime.getTime()

    // 예상 남은 시간 계산 (20,000 목표 기준)
    const targetSuccesses = 20000
    const successRate = totalAttempts > 0 ? successCount / totalAttempts : 0
    const avgTimePerAttempt = totalAttempts > 0 ? runningTime / totalAttempts : 0
    const remainingSuccesses = Math.max(0, targetSuccesses - successCount)
    const remainingAttempts = successRate > 0 ? remainingSuccesses / successRate : remainingSuccesses
    const estimatedTimeRemaining = remainingAttempts * avgTimePerAttempt

    // 평균 보상 계산
    const totalReward = experiences.reduce((sum, e) => sum + e.reward, 0)
    const averageReward = totalAttempts > 0 ? totalReward / totalAttempts : 0

    return {
      startTime: this.startTime,
      currentTime: now,
      runningTime,
      successCount,
      totalAttempts,
      successRate,
      averageReward,
      currentBatchProgress: totalAttempts % 100,
      estimatedTimeRemaining,
      lastCheckpointId: lastCheckpoint?.id || null,
    }
  }

  async getDetailedMetrics(): Promise<{
    strategyUsage: Record<Strategy, number>
    strategySuccessRate: Record<Strategy, number>
    rewardDistribution: { min: number; max: number; avg: number; stdDev: number }
    hourlyStats: Array<{ hour: number; attempts: number; successes: number }>
  }> {
    const experiences = await this.getAllExperiences()

    // 전략별 사용량 및 성공률
    const strategyUsage: Record<string, number> = {}
    const strategySuccesses: Record<string, number> = {}

    for (const exp of experiences) {
      const strategy = exp.action as string
      strategyUsage[strategy] = (strategyUsage[strategy] || 0) + 1
      if (exp.metadata.success) {
        strategySuccesses[strategy] = (strategySuccesses[strategy] || 0) + 1
      }
    }

    const strategySuccessRate: Record<string, number> = {}
    for (const strategy of Object.keys(strategyUsage)) {
      strategySuccessRate[strategy] = strategyUsage[strategy] > 0
        ? (strategySuccesses[strategy] || 0) / strategyUsage[strategy]
        : 0
    }

    // 보상 분포
    const rewards = experiences.map(e => e.reward)
    const min = Math.min(...rewards, 0)
    const max = Math.max(...rewards, 0)
    const avg = rewards.length > 0 ? rewards.reduce((a, b) => a + b, 0) / rewards.length : 0
    const variance = rewards.length > 0
      ? rewards.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / rewards.length
      : 0
    const stdDev = Math.sqrt(variance)

    // 시간대별 통계
    const hourlyMap = new Map<number, { attempts: number; successes: number }>()
    for (const exp of experiences) {
      const hour = new Date(exp.timestamp).getHours()
      const existing = hourlyMap.get(hour) || { attempts: 0, successes: 0 }
      existing.attempts++
      if (exp.metadata.success) existing.successes++
      hourlyMap.set(hour, existing)
    }

    const hourlyStats = Array.from(hourlyMap.entries())
      .map(([hour, data]) => ({ hour, ...data }))
      .sort((a, b) => a.hour - b.hour)

    return {
      strategyUsage: strategyUsage as Record<Strategy, number>,
      strategySuccessRate: strategySuccessRate as Record<Strategy, number>,
      rewardDistribution: { min, max, avg, stdDev },
      hourlyStats,
    }
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  async flush(): Promise<void> {
    if (this.writeQueue.length === 0) return

    for (const item of this.writeQueue) {
      await this.write(item.store, item.data)
    }

    this.writeQueue = []
  }

  async clear(): Promise<void> {
    await this.ensureInit()

    const stores = ['experiences', 'checkpoints', 'bug_patterns', 'learning_history']

    for (const store of stores) {
      if (this.config.mode === 'indexeddb' && this.idb) {
        await this.idb.clear(store)
      } else if (this.memory) {
        await this.memory.clear(store)
      }
    }

    console.log('[RLLogger] All data cleared')
  }

  async export(): Promise<{
    experiences: Experience[]
    checkpoints: Checkpoint[]
    bugPatterns: BugPattern[]
    learningHistory: LearningEntry[]
  }> {
    return {
      experiences: await this.getAllExperiences(),
      checkpoints: await this.getAllCheckpoints(),
      bugPatterns: await this.getAllBugPatterns(),
      learningHistory: await this.getLearningHistory(),
    }
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }
  }

  private async write(storeName: string, data: unknown): Promise<void> {
    if (this.config.mode === 'indexeddb' && this.idb) {
      await this.idb.put(storeName, data as { id: string })
    } else if (this.memory) {
      await this.memory.put(storeName, data as { id: string })
    }
  }

  private async read<T>(storeName: string, id: string): Promise<T | null> {
    if (this.config.mode === 'indexeddb' && this.idb) {
      return this.idb.get<T>(storeName, id)
    }
    if (this.memory) {
      return this.memory.get<T>(storeName, id)
    }
    return null
  }

  private async readAll<T>(storeName: string): Promise<T[]> {
    if (this.config.mode === 'indexeddb' && this.idb) {
      return this.idb.getAll<T>(storeName)
    }
    if (this.memory) {
      return this.memory.getAll<T>(storeName)
    }
    return []
  }

  private queueWrite(storeName: string, data: unknown): void {
    this.writeQueue.push({ store: storeName, data })

    if (this.writeQueue.length >= this.config.batchSize) {
      void this.flush()
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        void this.flush()
        this.flushTimer = null
      }, 1000)
    }
  }
}

// ============================================================
// Singleton Instance
// ============================================================

export const rlLogger = new RLLogger()
