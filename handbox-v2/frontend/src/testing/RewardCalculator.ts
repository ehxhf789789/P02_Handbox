// @ts-nocheck
/**
 * Reward Calculator - 다중 요소 보상 계산기
 *
 * 워크플로우 생성 품질을 다양한 관점에서 평가하고
 * -5 ~ +5 범위의 정규화된 보상 점수 계산
 */

import type {
  LoopResult,
  RewardFactors,
  SuccessChecklist,
  WorkflowSnapshot,
} from '../types/RLTypes'

// ============================================================
// Types
// ============================================================

interface RewardConfig {
  // 가중치 설정
  weights: {
    executionSuccess: number       // 실행 성공/실패 (기본: 2.5)
    notebookLMComparison: number   // NotebookLM 비교 (기본: 2.0)
    xaiScore: number               // XAI 직관성 (기본: 1.0)
    nodeEfficiency: number         // 노드 효율성 (기본: 1.0)
    intentAlignment: number        // 의도 정렬 (기본: 1.5)
    toolSelectionAccuracy: number  // 도구 선택 정확도 (기본: 1.0)
  }

  // 임계값 설정
  thresholds: {
    notebookLMPassing: number      // 0.7
    xaiMinimum: number             // 0.5
    intentMinimum: number          // 0.6
    maxExecutionTime: number       // 30000ms
    optimalNodeCount: { min: number; max: number }  // 2-15
  }

  // 패널티 설정
  penalties: {
    timeout: number                // -2
    emptyWorkflow: number          // -3
    invalidStructure: number       // -2
    orphanNodes: number            // -1
  }

  // 보너스 설정
  bonuses: {
    perfectChecklist: number       // +1
    fastExecution: number          // +0.5
    optimalNodeCount: number       // +0.5
    reusedPattern: number          // +0.3
  }
}

const DEFAULT_CONFIG: RewardConfig = {
  weights: {
    executionSuccess: 2.5,
    notebookLMComparison: 2.0,
    xaiScore: 1.0,
    nodeEfficiency: 1.0,
    intentAlignment: 1.5,
    toolSelectionAccuracy: 1.0,
  },
  thresholds: {
    notebookLMPassing: 0.7,
    xaiMinimum: 0.5,
    intentMinimum: 0.6,
    maxExecutionTime: 30000,
    optimalNodeCount: { min: 2, max: 15 },
  },
  penalties: {
    timeout: -2,
    emptyWorkflow: -3,
    invalidStructure: -2,
    orphanNodes: -1,
  },
  bonuses: {
    perfectChecklist: 1,
    fastExecution: 0.5,
    optimalNodeCount: 0.5,
    reusedPattern: 0.3,
  },
}

// ============================================================
// Reward Calculator Class
// ============================================================

export class RewardCalculator {
  private config: RewardConfig
  private recentRewards: number[] = []
  private rewardHistory: Map<string, number> = new Map()  // promptHash -> reward

  constructor(config: Partial<RewardConfig> = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config)
  }

  // ============================================================
  // Main Calculation
  // ============================================================

  /**
   * 통합 보상 계산
   * 범위: -5 ~ +5
   */
  calculate(result: LoopResult): number {
    const factors = this.extractFactors(result)
    let reward = 0

    // 1. 실행 성공/실패 (가장 큰 영향)
    if (factors.executionSuccess) {
      reward += this.config.weights.executionSuccess
    } else {
      reward -= this.config.weights.executionSuccess * 1.2  // 실패 시 더 큰 패널티
    }

    // 2. NotebookLM 비교 점수
    const notebookLMScore = this.calculateNotebookLMScore(result.notebookLMScore)
    reward += notebookLMScore * this.config.weights.notebookLMComparison

    // 3. XAI 직관성 점수
    const xaiScore = this.calculateXAIScore(result.xaiScore)
    reward += xaiScore * this.config.weights.xaiScore

    // 4. 노드 효율성
    const nodeEfficiency = this.calculateNodeEfficiency(result.nodeCount, result.executionTime)
    reward += nodeEfficiency * this.config.weights.nodeEfficiency

    // 5. 의도 정렬도
    const intentScore = this.calculateIntentScore(result.intentAlignmentScore)
    reward += intentScore * this.config.weights.intentAlignment

    // 6. 도구 선택 정확도 (체크리스트 기반)
    const toolScore = this.calculateToolSelectionScore(result.checklist)
    reward += toolScore * this.config.weights.toolSelectionAccuracy

    // 7. 패널티 적용
    reward += this.applyPenalties(result)

    // 8. 보너스 적용
    reward += this.applyBonuses(result)

    // 9. 정규화 (-5 ~ +5)
    const normalizedReward = this.normalizeReward(reward)

    // 10. 이력 저장
    this.recordReward(result, normalizedReward)

    return normalizedReward
  }

  /**
   * 요소별 점수 추출
   */
  extractFactors(result: LoopResult): RewardFactors {
    return {
      executionSuccess: result.success,
      notebookLMComparison: result.notebookLMScore,
      xaiScore: result.xaiScore,
      nodeEfficiency: this.calculateNodeEfficiency(result.nodeCount, result.executionTime),
      intentAlignment: result.intentAlignmentScore,
      toolSelectionAccuracy: result.checklist.toolSelectionOptimal ? 1 : 0.5,
    }
  }

  // ============================================================
  // Individual Score Calculations
  // ============================================================

  /**
   * NotebookLM 비교 점수 계산
   * 입력: 0-1 점수 → 출력: -1 ~ +1
   */
  private calculateNotebookLMScore(score: number): number {
    const threshold = this.config.thresholds.notebookLMPassing

    if (score >= threshold) {
      // 임계값 이상: 0 ~ 1
      return (score - threshold) / (1 - threshold)
    } else {
      // 임계값 미만: -1 ~ 0
      return (score - threshold) / threshold
    }
  }

  /**
   * XAI 직관성 점수 계산
   * 입력: 0-1 점수 → 출력: -1 ~ +1
   */
  private calculateXAIScore(score: number): number {
    const minScore = this.config.thresholds.xaiMinimum

    if (score >= minScore) {
      return (score - minScore) / (1 - minScore)
    } else {
      return (score - minScore) / minScore
    }
  }

  /**
   * 노드 효율성 점수 계산
   * 적절한 노드 수와 실행 시간 평가
   * 출력: -1 ~ +1
   */
  private calculateNodeEfficiency(nodeCount: number, executionTime: number): number {
    let score = 0

    // 노드 수 평가
    const { min, max } = this.config.thresholds.optimalNodeCount

    if (nodeCount >= min && nodeCount <= max) {
      // 최적 범위
      score += 0.5
    } else if (nodeCount < min) {
      // 너무 적음 (불완전할 가능성)
      score -= 0.3
    } else {
      // 너무 많음 (비효율)
      const excess = nodeCount - max
      score -= Math.min(0.5, excess * 0.05)
    }

    // 실행 시간 평가
    const maxTime = this.config.thresholds.maxExecutionTime
    const timePerNode = executionTime / Math.max(1, nodeCount)

    if (executionTime <= maxTime * 0.5) {
      // 빠른 실행
      score += 0.5
    } else if (executionTime <= maxTime) {
      // 적절한 시간
      score += 0.2
    } else {
      // 타임아웃에 가까움
      score -= 0.5
    }

    // 노드당 시간 효율
    if (timePerNode < 500) {
      score += 0.2
    } else if (timePerNode > 2000) {
      score -= 0.2
    }

    return Math.max(-1, Math.min(1, score))
  }

  /**
   * 의도 정렬도 점수 계산
   * 입력: 0-1 점수 → 출력: -1 ~ +1
   */
  private calculateIntentScore(score: number): number {
    const minScore = this.config.thresholds.intentMinimum

    if (score >= minScore) {
      // 충분한 정렬
      return (score - minScore) / (1 - minScore)
    } else {
      // 불충분한 정렬 (더 큰 패널티)
      return (score - minScore) / minScore * 1.5
    }
  }

  /**
   * 도구 선택 정확도 계산
   */
  private calculateToolSelectionScore(checklist: SuccessChecklist): number {
    let score = 0

    if (checklist.hasRequiredNodes) score += 0.4
    if (checklist.toolSelectionOptimal) score += 0.4
    if (checklist.hasValidConnections) score += 0.2

    return score - 0.5  // -0.5 ~ +0.5 범위로 조정
  }

  // ============================================================
  // Penalties & Bonuses
  // ============================================================

  private applyPenalties(result: LoopResult): number {
    let penalty = 0

    // 타임아웃
    if (result.executionTime > this.config.thresholds.maxExecutionTime) {
      penalty += this.config.penalties.timeout
    }

    // 빈 워크플로우
    if (!result.workflow || result.workflow.nodes.length === 0) {
      penalty += this.config.penalties.emptyWorkflow
    }

    // 유효하지 않은 구조
    if (!result.checklist.hasValidStructure) {
      penalty += this.config.penalties.invalidStructure
    }

    // 고아 노드
    if (!result.checklist.hasNoOrphanNodes) {
      penalty += this.config.penalties.orphanNodes
    }

    return penalty
  }

  private applyBonuses(result: LoopResult): number {
    let bonus = 0

    // 완벽한 체크리스트 (12/12)
    const checklistScore = Object.values(result.checklist).filter(Boolean).length
    if (checklistScore === 12) {
      bonus += this.config.bonuses.perfectChecklist
    }

    // 빠른 실행 (5초 이내)
    if (result.executionTime < 5000 && result.success) {
      bonus += this.config.bonuses.fastExecution
    }

    // 최적 노드 수
    const { min, max } = this.config.thresholds.optimalNodeCount
    if (result.nodeCount >= min && result.nodeCount <= max) {
      bonus += this.config.bonuses.optimalNodeCount
    }

    return bonus
  }

  // ============================================================
  // Normalization & History
  // ============================================================

  /**
   * 보상 정규화 (-5 ~ +5)
   */
  private normalizeReward(reward: number): number {
    // 클램프
    const clamped = Math.max(-5, Math.min(5, reward))

    // 소수점 2자리로 반올림
    return Math.round(clamped * 100) / 100
  }

  /**
   * 보상 이력 기록
   */
  private recordReward(result: LoopResult, reward: number): void {
    // 최근 보상 기록
    this.recentRewards.push(reward)
    if (this.recentRewards.length > 100) {
      this.recentRewards.shift()
    }

    // 프롬프트 해시별 기록 (유사 프롬프트 참조용)
    const promptHash = this.hashPrompt(result.prompt)
    this.rewardHistory.set(promptHash, reward)
  }

  // ============================================================
  // Analysis Methods
  // ============================================================

  /**
   * 평균 보상 계산
   */
  getAverageReward(): number {
    if (this.recentRewards.length === 0) return 0
    return this.recentRewards.reduce((a, b) => a + b, 0) / this.recentRewards.length
  }

  /**
   * 보상 추이 (개선 여부)
   */
  getRewardTrend(): 'improving' | 'stable' | 'declining' {
    if (this.recentRewards.length < 20) return 'stable'

    const recentHalf = this.recentRewards.slice(-10)
    const olderHalf = this.recentRewards.slice(-20, -10)

    const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length
    const olderAvg = olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length

    const diff = recentAvg - olderAvg

    if (diff > 0.5) return 'improving'
    if (diff < -0.5) return 'declining'
    return 'stable'
  }

  /**
   * 요소별 영향 분석
   */
  analyzeFactorImpact(results: LoopResult[]): Record<string, {
    correlation: number
    avgWhenHigh: number
    avgWhenLow: number
  }> {
    const analysis: Record<string, { correlation: number; avgWhenHigh: number; avgWhenLow: number }> = {}

    const factors = ['notebookLMScore', 'xaiScore', 'intentAlignmentScore', 'nodeCount', 'executionTime'] as const

    for (const factor of factors) {
      const highGroup = results.filter(r => {
        const value = r[factor]
        if (factor === 'nodeCount') return value >= 5 && value <= 10
        if (factor === 'executionTime') return value < 10000
        return value >= 0.7
      })

      const lowGroup = results.filter(r => {
        const value = r[factor]
        if (factor === 'nodeCount') return value < 2 || value > 15
        if (factor === 'executionTime') return value > 20000
        return value < 0.5
      })

      const rewards = results.map(r => this.calculate(r))
      const factorValues = results.map(r => r[factor])

      analysis[factor] = {
        correlation: this.pearsonCorrelation(factorValues, rewards),
        avgWhenHigh: highGroup.length > 0
          ? highGroup.map(r => this.calculate(r)).reduce((a, b) => a + b, 0) / highGroup.length
          : 0,
        avgWhenLow: lowGroup.length > 0
          ? lowGroup.map(r => this.calculate(r)).reduce((a, b) => a + b, 0) / lowGroup.length
          : 0,
      }
    }

    return analysis
  }

  /**
   * 설정 업데이트 (학습 기반 조정)
   */
  updateWeights(factorName: keyof RewardConfig['weights'], newWeight: number): void {
    if (newWeight >= 0 && newWeight <= 5) {
      this.config.weights[factorName] = newWeight
    }
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  private hashPrompt(prompt: string): string {
    let hash = 0
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(16)
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length
    if (n === 0) return 0

    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = y.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0)
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0)
    const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0)

    const numerator = n * sumXY - sumX * sumY
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

    return denominator === 0 ? 0 : numerator / denominator
  }

  private mergeConfig(base: RewardConfig, override: Partial<RewardConfig>): RewardConfig {
    return {
      weights: { ...base.weights, ...override.weights },
      thresholds: { ...base.thresholds, ...override.thresholds },
      penalties: { ...base.penalties, ...override.penalties },
      bonuses: { ...base.bonuses, ...override.bonuses },
    }
  }

  // ============================================================
  // Export Configuration
  // ============================================================

  getConfig(): RewardConfig {
    return { ...this.config }
  }

  setConfig(config: Partial<RewardConfig>): void {
    this.config = this.mergeConfig(this.config, config)
  }
}

// ============================================================
// Singleton Instance
// ============================================================

export const rewardCalculator = new RewardCalculator()
