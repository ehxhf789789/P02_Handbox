/**
 * Policy Network - 전략 선택 네트워크
 *
 * ε-greedy 정책으로 학습 전략 선택
 * CoT, Few-shot, Chain Reasoning 등 전략 가중치 관리
 */

import type { Strategy, State, PromptFeatures } from '../types/RLTypes'

// ============================================================
// Types
// ============================================================

interface PolicyConfig {
  epsilon: number              // 탐색률 (0.1 = 10% 랜덤)
  epsilonDecay: number         // 탐색률 감소 (0.995)
  epsilonMin: number           // 최소 탐색률 (0.01)
  learningRate: number         // 학습률 (0.01)
  momentumFactor: number       // 모멘텀 (0.9)
}

interface StrategyStats {
  totalUses: number
  successCount: number
  totalReward: number
  averageReward: number
  successRate: number
  lastUsed: Date | null
  momentum: number
}

// Strategy 값 타입 (RLTypes.Strategy 열거형 값)
type StrategyValue =
  | 'chain_of_thought'
  | 'few_shot'
  | 'chain_reasoning'
  | 'template_match'
  | 'hybrid'

const DEFAULT_CONFIG: PolicyConfig = {
  epsilon: 0.15,
  epsilonDecay: 0.9995,
  epsilonMin: 0.02,
  learningRate: 0.01,
  momentumFactor: 0.9,
}

const STRATEGIES: StrategyValue[] = [
  'chain_of_thought',
  'few_shot',
  'chain_reasoning',
  'template_match',
  'hybrid',
]

// ============================================================
// Policy Network Class
// ============================================================

export class PolicyNetwork {
  private config: PolicyConfig
  private strategyWeights: Map<StrategyValue, number> = new Map()
  private strategyStats: Map<StrategyValue, StrategyStats> = new Map()
  private contextPreferences: Map<string, StrategyValue> = new Map()
  private updateCount: number = 0

  constructor(config: Partial<PolicyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.initializeWeights()
  }

  // ============================================================
  // Initialization
  // ============================================================

  private initializeWeights(): void {
    // 초기 가중치 설정 (균등)
    const initialWeight = 1.0 / STRATEGIES.length

    for (const strategy of STRATEGIES) {
      this.strategyWeights.set(strategy, initialWeight)
      this.strategyStats.set(strategy, {
        totalUses: 0,
        successCount: 0,
        totalReward: 0,
        averageReward: 0,
        successRate: 0,
        lastUsed: null,
        momentum: 0,
      })
    }
  }

  // ============================================================
  // Strategy Selection
  // ============================================================

  /**
   * ε-greedy 전략 선택
   */
  selectStrategy(state: State): StrategyValue {
    // 탐색 (exploration) vs 활용 (exploitation)
    if (Math.random() < this.config.epsilon) {
      // 랜덤 탐색
      return this.randomStrategy()
    }

    // 컨텍스트 기반 추천 확인
    const contextKey = this.getContextKey(state.promptFeatures)
    const contextPreferred = this.contextPreferences.get(contextKey)

    if (contextPreferred && Math.random() < 0.7) {
      return contextPreferred
    }

    // 가중치 기반 선택 (softmax)
    return this.weightedSelect()
  }

  /**
   * 컨텍스트 기반 전략 추천 (프롬프트 분석)
   */
  recommendStrategy(promptFeatures: PromptFeatures): StrategyValue {
    // 규칙 기반 추천
    if (promptFeatures.hasMultiTurn) {
      return 'chain_reasoning'
    }

    if (promptFeatures.complexity > 0.8) {
      return 'chain_of_thought'
    }

    if (promptFeatures.hasRAG) {
      return 'template_match'  // RAG는 보통 패턴이 있음
    }

    if (promptFeatures.intentClarity < 0.5) {
      return 'few_shot'  // 불명확한 의도는 예시가 도움됨
    }

    if (promptFeatures.hasConditional) {
      return 'chain_reasoning'
    }

    // 기본: 하이브리드
    return 'hybrid'
  }

  /**
   * 랜덤 전략 선택
   */
  private randomStrategy(): StrategyValue {
    const idx = Math.floor(Math.random() * STRATEGIES.length)
    return STRATEGIES[idx]
  }

  /**
   * Softmax 기반 가중치 선택
   */
  private weightedSelect(): StrategyValue {
    const weights = Array.from(this.strategyWeights.entries())

    // Softmax 확률 계산
    const maxWeight = Math.max(...weights.map(([_, w]) => w))
    const expWeights = weights.map(([s, w]) => ({
      strategy: s,
      expWeight: Math.exp((w - maxWeight) * 5),  // 온도 스케일링
    }))

    const sumExp = expWeights.reduce((sum, e) => sum + e.expWeight, 0)
    const probs = expWeights.map(e => ({
      strategy: e.strategy,
      prob: e.expWeight / sumExp,
    }))

    // 확률에 따른 선택
    const r = Math.random()
    let cumProb = 0

    for (const { strategy, prob } of probs) {
      cumProb += prob
      if (r <= cumProb) {
        return strategy
      }
    }

    // 폴백
    return STRATEGIES[0]
  }

  // ============================================================
  // Weight Updates
  // ============================================================

  /**
   * 보상 기반 가중치 업데이트
   */
  updateWeights(strategy: StrategyValue, reward: number, success: boolean): void {
    const stats = this.strategyStats.get(strategy)
    if (!stats) return

    // 통계 업데이트
    stats.totalUses++
    stats.totalReward += reward
    stats.averageReward = stats.totalReward / stats.totalUses
    stats.lastUsed = new Date()

    if (success) {
      stats.successCount++
    }
    stats.successRate = stats.successCount / stats.totalUses

    // 모멘텀 업데이트
    const normalizedReward = (reward + 5) / 10  // 0-1 범위로 정규화
    stats.momentum = this.config.momentumFactor * stats.momentum +
                     (1 - this.config.momentumFactor) * normalizedReward

    // 가중치 업데이트 (모멘텀 기반)
    const currentWeight = this.strategyWeights.get(strategy) || 0.2
    const weightDelta = this.config.learningRate * (stats.momentum - currentWeight)
    const newWeight = Math.max(0.05, Math.min(0.5, currentWeight + weightDelta))

    this.strategyWeights.set(strategy, newWeight)

    // 정규화 (모든 가중치 합 = 1)
    this.normalizeWeights()

    // epsilon 감소
    this.decayEpsilon()

    this.updateCount++
  }

  /**
   * 배치 업데이트 (여러 경험에서)
   */
  batchUpdate(experiences: Array<{
    strategy: StrategyValue
    reward: number
    success: boolean
  }>): void {
    // 전략별 그룹화
    const grouped = new Map<StrategyValue, { rewards: number[]; successes: number }>()

    for (const exp of experiences) {
      const current = grouped.get(exp.strategy) || { rewards: [], successes: 0 }
      current.rewards.push(exp.reward)
      if (exp.success) current.successes++
      grouped.set(exp.strategy, current)
    }

    // 평균 기반 업데이트
    for (const [strategy, data] of grouped) {
      const avgReward = data.rewards.reduce((a, b) => a + b, 0) / data.rewards.length
      const successRate = data.successes / data.rewards.length

      this.updateWeights(strategy, avgReward, successRate > 0.5)
    }
  }

  /**
   * 컨텍스트 선호도 학습
   */
  learnContextPreference(
    promptFeatures: PromptFeatures,
    strategy: StrategyValue,
    reward: number
  ): void {
    if (reward < 0) return  // 실패한 경우 학습 안 함

    const contextKey = this.getContextKey(promptFeatures)
    const existing = this.contextPreferences.get(contextKey)

    if (!existing || reward > 2) {  // 새로 기록하거나 높은 보상일 때
      this.contextPreferences.set(contextKey, strategy)
    }
  }

  // ============================================================
  // Normalization & Decay
  // ============================================================

  private normalizeWeights(): void {
    const total = Array.from(this.strategyWeights.values()).reduce((a, b) => a + b, 0)

    if (total > 0) {
      for (const [strategy, weight] of this.strategyWeights) {
        this.strategyWeights.set(strategy, weight / total)
      }
    }
  }

  private decayEpsilon(): void {
    this.config.epsilon = Math.max(
      this.config.epsilonMin,
      this.config.epsilon * this.config.epsilonDecay
    )
  }

  // ============================================================
  // Analysis & Statistics
  // ============================================================

  /**
   * 전략 통계 조회
   */
  getStats(): Map<StrategyValue, StrategyStats> {
    return new Map(this.strategyStats)
  }

  /**
   * 가중치 조회
   */
  getWeights(): Map<StrategyValue, number> {
    return new Map(this.strategyWeights)
  }

  /**
   * 최고 성능 전략
   */
  getBestStrategy(): StrategyValue {
    let best: StrategyValue = 'hybrid'
    let bestScore = -Infinity

    for (const [strategy, stats] of this.strategyStats) {
      const score = stats.averageReward * 0.6 + stats.successRate * 4 * 0.4

      if (score > bestScore && stats.totalUses >= 10) {  // 최소 10회 사용
        bestScore = score
        best = strategy
      }
    }

    return best
  }

  /**
   * 전략 성능 순위
   */
  getStrategyRanking(): Array<{
    strategy: StrategyValue
    weight: number
    stats: StrategyStats
    score: number
  }> {
    const ranking: Array<{
      strategy: StrategyValue
      weight: number
      stats: StrategyStats
      score: number
    }> = []

    for (const strategy of STRATEGIES) {
      const weight = this.strategyWeights.get(strategy) || 0
      const stats = this.strategyStats.get(strategy)!

      const score = stats.totalUses > 0
        ? stats.averageReward * 0.5 + stats.successRate * 4 * 0.3 + stats.momentum * 5 * 0.2
        : 0

      ranking.push({ strategy, weight, stats, score })
    }

    return ranking.sort((a, b) => b.score - a.score)
  }

  /**
   * 학습 진행 상황
   */
  getLearningProgress(): {
    totalUpdates: number
    epsilon: number
    explorationRate: number
    convergenceScore: number
    dominantStrategy: StrategyValue
  } {
    const weights = Array.from(this.strategyWeights.values())
    const maxWeight = Math.max(...weights)
    const minWeight = Math.min(...weights)

    // 수렴 점수 (가중치가 균등하면 0, 하나로 수렴하면 1)
    const convergenceScore = weights.length > 1
      ? (maxWeight - minWeight) / (1 - 1 / weights.length)
      : 0

    // 지배적 전략 찾기
    let dominantStrategy: StrategyValue = 'hybrid'
    for (const [strategy, weight] of this.strategyWeights) {
      if (weight === maxWeight) {
        dominantStrategy = strategy
        break
      }
    }

    return {
      totalUpdates: this.updateCount,
      epsilon: this.config.epsilon,
      explorationRate: this.config.epsilon,
      convergenceScore: Math.min(1, convergenceScore),
      dominantStrategy,
    }
  }

  // ============================================================
  // Persistence
  // ============================================================

  /**
   * 상태 내보내기
   */
  export(): {
    weights: Record<string, number>
    stats: Record<string, StrategyStats>
    contextPreferences: Record<string, StrategyValue>
    config: PolicyConfig
    updateCount: number
  } {
    return {
      weights: Object.fromEntries(this.strategyWeights),
      stats: Object.fromEntries(this.strategyStats),
      contextPreferences: Object.fromEntries(this.contextPreferences),
      config: this.config,
      updateCount: this.updateCount,
    }
  }

  /**
   * 상태 복원
   */
  import(data: {
    weights?: Record<string, number>
    stats?: Record<string, StrategyStats>
    contextPreferences?: Record<string, StrategyValue>
    config?: Partial<PolicyConfig>
    updateCount?: number
  }): void {
    if (data.weights) {
      this.strategyWeights = new Map(Object.entries(data.weights) as Array<[StrategyValue, number]>)
    }

    if (data.stats) {
      this.strategyStats = new Map(Object.entries(data.stats) as Array<[StrategyValue, StrategyStats]>)
    }

    if (data.contextPreferences) {
      this.contextPreferences = new Map(Object.entries(data.contextPreferences) as Array<[string, StrategyValue]>)
    }

    if (data.config) {
      this.config = { ...this.config, ...data.config }
    }

    if (data.updateCount !== undefined) {
      this.updateCount = data.updateCount
    }
  }

  /**
   * 초기화
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG }
    this.contextPreferences.clear()
    this.updateCount = 0
    this.initializeWeights()
  }

  // ============================================================
  // Utility
  // ============================================================

  private getContextKey(features: PromptFeatures): string {
    // 특징을 키로 변환
    const parts: string[] = []

    if (features.complexity > 0.7) parts.push('complex')
    else if (features.complexity < 0.3) parts.push('simple')
    else parts.push('medium')

    if (features.hasMultiStep) parts.push('multistep')
    if (features.hasConditional) parts.push('conditional')
    if (features.hasRAG) parts.push('rag')
    if (features.hasVision) parts.push('vision')
    if (features.hasMultiTurn) parts.push('multiturn')

    parts.push(features.domainCategory)

    return parts.join('_')
  }

  /**
   * 현재 epsilon 값
   */
  get epsilon(): number {
    return this.config.epsilon
  }
}

// ============================================================
// Singleton Instance
// ============================================================

export const policyNetwork = new PolicyNetwork()
