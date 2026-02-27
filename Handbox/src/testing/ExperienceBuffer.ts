/**
 * Experience Buffer - RL 경험 리플레이 버퍼
 *
 * 강화학습의 경험 저장 및 샘플링을 담당
 * 우선순위 기반 리플레이, TD-error 기반 샘플링 지원
 */

// UUID 생성 함수 (crypto API 사용)
function uuidv4(): string {
  return crypto.randomUUID()
}
import { RLLogger, rlLogger } from './RLLogger'
import type {
  Experience,
  State,
  Action,
  Strategy,
  ExperienceMetadata,
  SuccessChecklist,
} from '../types/RLTypes'

// ============================================================
// Types
// ============================================================

interface ExperienceBufferConfig {
  maxSize: number              // 최대 버퍼 크기
  priorityAlpha: number        // 우선순위 지수 (0 = uniform, 1 = full priority)
  priorityBeta: number         // 중요도 샘플링 보정
  minPriority: number          // 최소 우선순위
}

interface PrioritizedExperience extends Experience {
  priority: number
  tdError?: number
}

const DEFAULT_CONFIG: ExperienceBufferConfig = {
  maxSize: 100000,
  priorityAlpha: 0.6,
  priorityBeta: 0.4,
  minPriority: 0.01,
}

// ============================================================
// Experience Buffer Class
// ============================================================

export class ExperienceBuffer {
  private config: ExperienceBufferConfig
  private buffer: PrioritizedExperience[] = []
  private logger: RLLogger
  private sumTree: SumTree
  private maxPriority: number = 1.0

  constructor(config: Partial<ExperienceBufferConfig> = {}, logger?: RLLogger) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = logger || rlLogger
    this.sumTree = new SumTree(this.config.maxSize)
  }

  // ============================================================
  // Core Operations
  // ============================================================

  /**
   * 새 경험 추가
   */
  async add(experience: Omit<Experience, 'id' | 'timestamp'>): Promise<string> {
    const id = uuidv4()
    const timestamp = new Date()

    const exp: PrioritizedExperience = {
      ...experience,
      id,
      timestamp,
      priority: this.maxPriority,
    }

    // 버퍼가 가득 찼으면 가장 오래된 것 제거
    if (this.buffer.length >= this.config.maxSize) {
      this.buffer.shift()
    }

    this.buffer.push(exp)
    this.sumTree.add(this.maxPriority, this.buffer.length - 1)

    // 영속성 로깅
    await this.logger.logExperience(exp)

    return id
  }

  /**
   * 경험 일괄 추가
   */
  async addBatch(experiences: Array<Omit<Experience, 'id' | 'timestamp'>>): Promise<string[]> {
    const ids: string[] = []

    for (const exp of experiences) {
      const id = await this.add(exp)
      ids.push(id)
    }

    return ids
  }

  /**
   * 랜덤 샘플링 (균등 분포)
   */
  sample(batchSize: number): Experience[] {
    if (this.buffer.length === 0) return []

    const sampleSize = Math.min(batchSize, this.buffer.length)
    const shuffled = [...this.buffer].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, sampleSize)
  }

  /**
   * 우선순위 기반 샘플링 (PER - Prioritized Experience Replay)
   */
  samplePrioritized(batchSize: number): {
    experiences: Experience[]
    indices: number[]
    weights: number[]
  } {
    const experiences: Experience[] = []
    const indices: number[] = []
    const weights: number[] = []

    const sampleSize = Math.min(batchSize, this.buffer.length)
    const segmentSize = this.sumTree.total / sampleSize

    for (let i = 0; i < sampleSize; i++) {
      const low = segmentSize * i
      const high = segmentSize * (i + 1)
      const s = Math.random() * (high - low) + low

      const { index, priority } = this.sumTree.get(s)
      if (index < this.buffer.length) {
        experiences.push(this.buffer[index])
        indices.push(index)

        // 중요도 샘플링 가중치
        const prob = priority / this.sumTree.total
        const weight = Math.pow(this.buffer.length * prob, -this.config.priorityBeta)
        weights.push(weight)
      }
    }

    // 가중치 정규화
    const maxWeight = Math.max(...weights)
    const normalizedWeights = weights.map(w => w / maxWeight)

    return { experiences, indices, weights: normalizedWeights }
  }

  /**
   * 특정 보상 이상의 경험만 샘플링
   */
  sampleByReward(minReward: number, maxCount: number = 100): Experience[] {
    const filtered = this.buffer.filter(e => e.reward >= minReward)
    const shuffled = filtered.sort(() => Math.random() - 0.5)
    return shuffled.slice(0, maxCount)
  }

  /**
   * 성공한 경험만 샘플링 (Few-shot 예제용)
   */
  sampleSuccessful(count: number = 10): Experience[] {
    const successful = this.buffer.filter(e => e.metadata.success)
    const sorted = successful.sort((a, b) => b.reward - a.reward)
    return sorted.slice(0, count)
  }

  /**
   * 특정 전략의 경험만 샘플링
   */
  sampleByStrategy(strategy: Strategy, count: number = 50): Experience[] {
    const filtered = this.buffer.filter(e => e.action === strategy)
    const shuffled = filtered.sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count)
  }

  /**
   * 최근 N개 경험 가져오기
   */
  getRecent(count: number): Experience[] {
    return this.buffer.slice(-count)
  }

  // ============================================================
  // Priority Updates
  // ============================================================

  /**
   * TD-error 기반 우선순위 업데이트
   */
  updatePriorities(indices: number[], tdErrors: number[]): void {
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i]
      if (idx < this.buffer.length) {
        const priority = Math.pow(Math.abs(tdErrors[i]) + this.config.minPriority, this.config.priorityAlpha)
        this.buffer[idx].priority = priority
        this.buffer[idx].tdError = tdErrors[i]
        this.sumTree.update(idx, priority)

        if (priority > this.maxPriority) {
          this.maxPriority = priority
        }
      }
    }
  }

  /**
   * 단일 경험 우선순위 업데이트
   */
  updatePriority(id: string, priority: number): void {
    const idx = this.buffer.findIndex(e => e.id === id)
    if (idx !== -1) {
      this.buffer[idx].priority = priority
      this.sumTree.update(idx, priority)

      if (priority > this.maxPriority) {
        this.maxPriority = priority
      }
    }
  }

  // ============================================================
  // Analysis & Statistics
  // ============================================================

  /**
   * 버퍼 통계
   */
  getStats(): {
    size: number
    maxSize: number
    utilizationRate: number
    successRate: number
    averageReward: number
    rewardDistribution: { min: number; max: number; median: number }
    strategyDistribution: Record<Strategy, number>
  } {
    const size = this.buffer.length
    const successCount = this.buffer.filter(e => e.metadata.success).length
    const rewards = this.buffer.map(e => e.reward)

    // 전략 분포
    const strategyDistribution: Record<string, number> = {}
    for (const exp of this.buffer) {
      const strategy = exp.action as string
      strategyDistribution[strategy] = (strategyDistribution[strategy] || 0) + 1
    }

    // 보상 통계
    const sortedRewards = [...rewards].sort((a, b) => a - b)
    const min = sortedRewards[0] || 0
    const max = sortedRewards[sortedRewards.length - 1] || 0
    const median = sortedRewards[Math.floor(sortedRewards.length / 2)] || 0
    const avg = rewards.length > 0 ? rewards.reduce((a, b) => a + b, 0) / rewards.length : 0

    return {
      size,
      maxSize: this.config.maxSize,
      utilizationRate: size / this.config.maxSize,
      successRate: size > 0 ? successCount / size : 0,
      averageReward: avg,
      rewardDistribution: { min, max, median },
      strategyDistribution: strategyDistribution as Record<Strategy, number>,
    }
  }

  /**
   * 학습 곡선 데이터 (시간 순서대로 성공률 추이)
   */
  getLearningCurve(windowSize: number = 100): Array<{
    index: number
    successRate: number
    averageReward: number
  }> {
    const curve: Array<{
      index: number
      successRate: number
      averageReward: number
    }> = []

    for (let i = windowSize; i <= this.buffer.length; i += windowSize) {
      const window = this.buffer.slice(i - windowSize, i)
      const successCount = window.filter(e => e.metadata.success).length
      const avgReward = window.reduce((sum, e) => sum + e.reward, 0) / window.length

      curve.push({
        index: i,
        successRate: successCount / window.length,
        averageReward: avgReward,
      })
    }

    return curve
  }

  /**
   * 오류 패턴 분석
   */
  analyzeErrorPatterns(): Map<string, { count: number; examples: Experience[] }> {
    const patterns = new Map<string, { count: number; examples: Experience[] }>()

    const failures = this.buffer.filter(e => !e.metadata.success)

    for (const exp of failures) {
      const errorMsg = exp.metadata.errorMessage || 'unknown_error'
      const pattern = this.normalizeErrorPattern(errorMsg)

      const existing = patterns.get(pattern) || { count: 0, examples: [] }
      existing.count++
      if (existing.examples.length < 5) {
        existing.examples.push(exp)
      }
      patterns.set(pattern, existing)
    }

    return patterns
  }

  // ============================================================
  // Persistence
  // ============================================================

  /**
   * 버퍼를 영속성 저장소에서 복원
   */
  async restore(): Promise<number> {
    const experiences = await this.logger.getAllExperiences()

    // 최근 maxSize개만 복원
    const recent = experiences
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, this.config.maxSize)
      .reverse()

    this.buffer = recent.map(e => ({
      ...e,
      priority: this.maxPriority,
    }))

    // SumTree 재구성
    this.sumTree = new SumTree(this.config.maxSize)
    for (let i = 0; i < this.buffer.length; i++) {
      this.sumTree.add(this.buffer[i].priority, i)
    }

    console.log(`[ExperienceBuffer] Restored ${this.buffer.length} experiences`)
    return this.buffer.length
  }

  /**
   * 버퍼 내용 내보내기
   */
  export(): Experience[] {
    return [...this.buffer]
  }

  /**
   * 특정 경험 삭제
   */
  async delete(id: string): Promise<boolean> {
    const index = this.buffer.findIndex(e => e.id === id)
    if (index === -1) return false

    this.buffer.splice(index, 1)

    // SumTree 재구축 (간단한 구현)
    this.sumTree = new SumTree(this.config.maxSize)
    for (let i = 0; i < this.buffer.length; i++) {
      this.sumTree.add(this.buffer[i].priority, i)
    }

    return true
  }

  /**
   * 버퍼 초기화
   */
  clear(): void {
    this.buffer = []
    this.sumTree = new SumTree(this.config.maxSize)
    this.maxPriority = 1.0
  }

  // ============================================================
  // Getters
  // ============================================================

  get size(): number {
    return this.buffer.length
  }

  get isEmpty(): boolean {
    return this.buffer.length === 0
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private normalizeErrorPattern(errorMsg: string): string {
    // 에러 메시지에서 패턴 추출 (숫자, ID 등 제거)
    return errorMsg
      .replace(/\d+/g, 'N')
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100)
  }
}

// ============================================================
// Sum Tree (for Prioritized Sampling)
// ============================================================

class SumTree {
  private tree: number[]
  private data: number[]
  private capacity: number
  private write: number = 0

  constructor(capacity: number) {
    this.capacity = capacity
    this.tree = new Array(2 * capacity - 1).fill(0)
    this.data = new Array(capacity).fill(-1)
  }

  get total(): number {
    return this.tree[0]
  }

  add(priority: number, dataIndex: number): void {
    const treeIndex = this.write + this.capacity - 1

    this.data[this.write] = dataIndex
    this.update(this.write, priority)

    this.write = (this.write + 1) % this.capacity
  }

  update(dataIndex: number, priority: number): void {
    const treeIndex = dataIndex + this.capacity - 1
    const change = priority - this.tree[treeIndex]

    this.tree[treeIndex] = priority
    this.propagate(treeIndex, change)
  }

  get(s: number): { index: number; priority: number } {
    const treeIndex = this.retrieve(0, s)
    const dataIndex = treeIndex - this.capacity + 1

    return {
      index: this.data[dataIndex] >= 0 ? this.data[dataIndex] : dataIndex,
      priority: this.tree[treeIndex],
    }
  }

  private propagate(treeIndex: number, change: number): void {
    let idx = treeIndex
    while (idx !== 0) {
      idx = Math.floor((idx - 1) / 2)
      this.tree[idx] += change
    }
  }

  private retrieve(treeIndex: number, s: number): number {
    const left = 2 * treeIndex + 1
    const right = left + 1

    if (left >= this.tree.length) {
      return treeIndex
    }

    if (s <= this.tree[left]) {
      return this.retrieve(left, s)
    } else {
      return this.retrieve(right, s - this.tree[left])
    }
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * 상태 생성 헬퍼
 */
export function createState(
  promptFeatures: Partial<Experience['state']['promptFeatures']> = {},
  agentState: Partial<Experience['state']['agentState']> = {},
  sessionId: string = uuidv4()
): State {
  return {
    promptFeatures: {
      length: 0,
      complexity: 0.5,
      hasMultiStep: false,
      hasConditional: false,
      hasRAG: false,
      hasVision: false,
      hasMultiTurn: false,
      domainCategory: 'general',
      keywordCount: 0,
      intentClarity: 0.5,
      ...promptFeatures,
    },
    agentState: {
      currentSuccessRate: 0,
      recentRewards: [],
      strategyPerformance: new Map(),
      errorPatterns: [],
      ...agentState,
    },
    timestamp: new Date(),
    sessionId,
  }
}

/**
 * 경험 메타데이터 생성 헬퍼
 */
export function createExperienceMetadata(
  prompt: string,
  workflowId: string,
  success: boolean,
  checklist: SuccessChecklist,
  executionTime: number = 0,
  nodeCount: number = 0,
  errorMessage?: string
): ExperienceMetadata {
  return {
    promptHash: simpleHash(prompt),
    prompt,
    workflowId,
    executionTime,
    nodeCount,
    success,
    errorMessage,
    checklist,
  }
}

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

// ============================================================
// Singleton Instance
// ============================================================

export const experienceBuffer = new ExperienceBuffer()
