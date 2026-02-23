/**
 * Prompt Strategy Evaluator - 전략 성능 평가 및 강화학습
 *
 * 기능:
 * - 전략 결과 평가 (품질, 시간, 효율성)
 * - 보상/패널티 계산
 * - 가중치 자동 조정
 * - 학습 기록 관리
 */

import type {
  PromptStrategyType,
  StrategyEvaluation,
  StrategyResult,
  StrategyContext,
  REWARD_PENALTY_THRESHOLDS,
} from '../types/PromptStrategyTypes'

import { PromptStrategyRegistry } from './PromptStrategyRegistry'

// ============================================================
// 상수
// ============================================================

/**
 * 보상/패널티 기준
 */
const THRESHOLDS = {
  // 품질 기준
  quality: {
    excellent: 9,    // +2 보너스
    good: 7,         // +1 보너스
    acceptable: 5,   // 0
    poor: 3,         // -1 패널티
    veryPoor: 0,     // -2 패널티
  },

  // 시간 효율성 기준 (예상 대비 실제)
  timeEfficiency: {
    exceptional: 2.0,  // +2 보너스 (예상의 2배 빠름)
    efficient: 1.5,    // +1 보너스
    normal: 1.0,       // 0
    slow: 0.7,         // -1 패널티
    verySlow: 0.5,     // -2 패널티
  },

  // 토큰 효율성 기준
  tokenEfficiency: {
    excellent: 0.8,    // +1 보너스 (예상의 80% 이하)
    normal: 1.0,       // 0
    wasteful: 1.5,     // -1 패널티
  },
}

/**
 * 전략별 예상 처리 시간 (ms)
 */
const EXPECTED_DURATION: Record<PromptStrategyType, number> = {
  'simple': 15000,
  'few-shot': 20000,
  'zero-shot-cot': 25000,
  'few-shot-cot': 30000,
  'tree-of-thought': 45000,
  'self-consistency': 50000,
  'react': 35000,
  'decomposition': 30000,
  'role-play': 20000,
  'structured': 18000,
  'iterative': 40000,
  'meta-prompt': 35000,
}

// ============================================================
// Evaluator Implementation
// ============================================================

class PromptStrategyEvaluatorImpl {
  private evaluationHistory: StrategyEvaluation[] = []
  private maxHistorySize = 1000
  private storageKey = 'handbox_strategy_evaluations'

  constructor() {
    this.loadHistory()
  }

  // ── 평가 수행 ──

  /**
   * 전략 결과 평가
   */
  evaluate(
    strategyId: PromptStrategyType,
    prompt: string,
    result: StrategyResult,
    actualDuration: number,
    success: boolean,
    qualityScore: number,  // 1-10
    domain: string = 'general'
  ): StrategyEvaluation {
    // 복잡도 추정
    const complexity = this.estimateComplexity(prompt)

    // 시간 효율성 계산
    const expectedDuration = EXPECTED_DURATION[strategyId] || 20000
    const timeEfficiency = expectedDuration / actualDuration

    // 토큰 효율성 계산
    const strategy = PromptStrategyRegistry.getStrategy(strategyId)
    const expectedTokenOverhead = strategy?.tokenOverhead || 1.0
    const actualTokenOverhead = result.additionalTokens > 0
      ? (result.additionalTokens / (prompt.length * 0.4))
      : 1.0
    const tokenEfficiency = expectedTokenOverhead / actualTokenOverhead

    // 보상/패널티 계산
    const rewardPenalty = this.calculateRewardPenalty(
      success,
      qualityScore,
      timeEfficiency,
      tokenEfficiency,
      complexity
    )

    // 가중치 업데이트 제안 계산
    const currentWeight = PromptStrategyRegistry.getWeight(strategyId)?.currentWeight || 0.5
    const weightDelta = this.calculateWeightDelta(rewardPenalty.total, success)
    const newWeight = Math.max(0.1, Math.min(1.5, currentWeight + weightDelta))

    // 평가 결과 생성
    const evaluation: StrategyEvaluation = {
      strategyId,
      prompt,
      domain,
      complexity,
      success,
      qualityScore,
      duration: actualDuration,
      timeEfficiency,
      tokenEfficiency,
      rewardPenalty,
      weightUpdate: {
        delta: weightDelta,
        newWeight,
        reason: this.generateWeightUpdateReason(rewardPenalty, success),
      },
      evaluatedAt: Date.now(),
    }

    // 히스토리에 추가
    this.addToHistory(evaluation)

    // Registry에 가중치 업데이트 전달
    const complexityLevel = complexity <= 3 ? 'low' : complexity <= 6 ? 'medium' : 'high'
    PromptStrategyRegistry.updateWeights(
      strategyId,
      success,
      qualityScore,
      domain,
      complexityLevel
    )

    return evaluation
  }

  /**
   * 보상/패널티 계산
   */
  private calculateRewardPenalty(
    success: boolean,
    qualityScore: number,
    timeEfficiency: number,
    tokenEfficiency: number,
    complexity: number
  ): StrategyEvaluation['rewardPenalty'] {
    // 기본 보상/패널티
    const base = success ? 1 : -1

    // 품질 보너스/패널티
    let quality = 0
    if (qualityScore >= THRESHOLDS.quality.excellent) {
      quality = 2
    } else if (qualityScore >= THRESHOLDS.quality.good) {
      quality = 1
    } else if (qualityScore >= THRESHOLDS.quality.acceptable) {
      quality = 0
    } else if (qualityScore >= THRESHOLDS.quality.poor) {
      quality = -1
    } else {
      quality = -2
    }

    // 시간 효율성 보너스/패널티
    let efficiency = 0
    if (timeEfficiency >= THRESHOLDS.timeEfficiency.exceptional) {
      efficiency = 2
    } else if (timeEfficiency >= THRESHOLDS.timeEfficiency.efficient) {
      efficiency = 1
    } else if (timeEfficiency >= THRESHOLDS.timeEfficiency.normal) {
      efficiency = 0
    } else if (timeEfficiency >= THRESHOLDS.timeEfficiency.slow) {
      efficiency = -1
    } else {
      efficiency = -2
    }

    // 복잡도 보너스 (복잡한 문제 성공 시)
    let complexityBonus = 0
    if (success && complexity >= 7) {
      complexityBonus = 1
    } else if (success && complexity >= 5) {
      complexityBonus = 0.5
    }

    // 총합 계산
    const total = base + quality + efficiency + complexityBonus

    return {
      base,
      quality,
      efficiency,
      complexity: complexityBonus,
      total: Math.max(-5, Math.min(5, total)),
    }
  }

  /**
   * 가중치 변화량 계산
   */
  private calculateWeightDelta(totalReward: number, success: boolean): number {
    // 기본 조정량
    const baseAdjustment = 0.01

    // 보상에 비례한 조정
    const rewardAdjustment = totalReward * 0.005

    return baseAdjustment * (success ? 1 : -1.5) + rewardAdjustment
  }

  /**
   * 가중치 업데이트 이유 생성
   */
  private generateWeightUpdateReason(
    rewardPenalty: StrategyEvaluation['rewardPenalty'],
    success: boolean
  ): string {
    const reasons: string[] = []

    if (success) {
      reasons.push('성공')
    } else {
      reasons.push('실패')
    }

    if (rewardPenalty.quality > 0) {
      reasons.push(`품질 우수 (+${rewardPenalty.quality})`)
    } else if (rewardPenalty.quality < 0) {
      reasons.push(`품질 미달 (${rewardPenalty.quality})`)
    }

    if (rewardPenalty.efficiency > 0) {
      reasons.push(`효율적 (+${rewardPenalty.efficiency})`)
    } else if (rewardPenalty.efficiency < 0) {
      reasons.push(`비효율 (${rewardPenalty.efficiency})`)
    }

    if (rewardPenalty.complexity > 0) {
      reasons.push(`복잡도 보너스 (+${rewardPenalty.complexity})`)
    }

    return reasons.join(', ')
  }

  // ── 복잡도 추정 ──

  /**
   * 프롬프트 복잡도 추정
   */
  private estimateComplexity(prompt: string): number {
    let complexity = 1

    // 길이 기반
    if (prompt.length > 500) complexity += 2
    else if (prompt.length > 200) complexity += 1

    // 구조 패턴
    const structurePatterns = [
      { pattern: /\d+\./g, weight: 0.5 },          // 번호 목록
      { pattern: /그리고|또한|더불어/g, weight: 0.3 },  // 연결어
      { pattern: /단계|순서|절차/g, weight: 0.5 },     // 순차 표현
      { pattern: /조건|만약|경우/g, weight: 0.5 },     // 조건문
      { pattern: /비교|분석|평가/g, weight: 0.5 },     // 분석 요청
      { pattern: /여러|다양한|복수/g, weight: 0.3 },   // 복수 처리
    ]

    for (const { pattern, weight } of structurePatterns) {
      const matches = prompt.match(pattern)
      if (matches) {
        complexity += matches.length * weight
      }
    }

    return Math.min(10, Math.max(1, Math.round(complexity)))
  }

  // ── 히스토리 관리 ──

  /**
   * 히스토리에 추가
   */
  private addToHistory(evaluation: StrategyEvaluation): void {
    this.evaluationHistory.push(evaluation)

    // 크기 제한
    if (this.evaluationHistory.length > this.maxHistorySize) {
      this.evaluationHistory = this.evaluationHistory.slice(-this.maxHistorySize)
    }

    this.saveHistory()
  }

  /**
   * 히스토리 저장
   */
  private saveHistory(): void {
    try {
      // 최근 100건만 저장
      const recentHistory = this.evaluationHistory.slice(-100)
      localStorage.setItem(this.storageKey, JSON.stringify(recentHistory))
    } catch (error) {
      console.warn('[PromptStrategyEvaluator] 히스토리 저장 실패:', error)
    }
  }

  /**
   * 히스토리 로드
   */
  private loadHistory(): void {
    try {
      const stored = localStorage.getItem(this.storageKey)
      if (stored) {
        this.evaluationHistory = JSON.parse(stored)
        console.log(`[PromptStrategyEvaluator] ${this.evaluationHistory.length}건 평가 기록 로드`)
      }
    } catch (error) {
      console.warn('[PromptStrategyEvaluator] 히스토리 로드 실패:', error)
    }
  }

  // ── 통계 조회 ──

  /**
   * 전략별 통계 조회
   */
  getStrategyStats(strategyId: PromptStrategyType): {
    totalEvaluations: number
    avgReward: number
    avgQuality: number
    avgDuration: number
    successRate: number
    recentTrend: 'improving' | 'stable' | 'declining'
  } | null {
    const evals = this.evaluationHistory.filter(e => e.strategyId === strategyId)

    if (evals.length === 0) return null

    const totalEvaluations = evals.length
    const avgReward = evals.reduce((sum, e) => sum + e.rewardPenalty.total, 0) / totalEvaluations
    const avgQuality = evals.reduce((sum, e) => sum + e.qualityScore, 0) / totalEvaluations
    const avgDuration = evals.reduce((sum, e) => sum + e.duration, 0) / totalEvaluations
    const successRate = evals.filter(e => e.success).length / totalEvaluations

    // 최근 트렌드 계산
    const recentWindow = Math.min(20, evals.length)
    const recentEvals = evals.slice(-recentWindow)
    const olderEvals = evals.slice(-recentWindow * 2, -recentWindow)

    let recentTrend: 'improving' | 'stable' | 'declining' = 'stable'
    if (olderEvals.length > 0) {
      const recentAvg = recentEvals.reduce((sum, e) => sum + e.rewardPenalty.total, 0) / recentEvals.length
      const olderAvg = olderEvals.reduce((sum, e) => sum + e.rewardPenalty.total, 0) / olderEvals.length

      if (recentAvg > olderAvg + 0.5) recentTrend = 'improving'
      else if (recentAvg < olderAvg - 0.5) recentTrend = 'declining'
    }

    return {
      totalEvaluations,
      avgReward,
      avgQuality,
      avgDuration,
      successRate,
      recentTrend,
    }
  }

  /**
   * 전체 통계 조회
   */
  getOverallStats(): {
    totalEvaluations: number
    avgReward: number
    topStrategies: Array<{ id: PromptStrategyType; avgReward: number; uses: number }>
    rewardDistribution: { positive: number; neutral: number; negative: number }
  } {
    const totalEvaluations = this.evaluationHistory.length
    const avgReward = totalEvaluations > 0
      ? this.evaluationHistory.reduce((sum, e) => sum + e.rewardPenalty.total, 0) / totalEvaluations
      : 0

    // 전략별 통계
    const strategyStats: Map<PromptStrategyType, { totalReward: number; count: number }> = new Map()
    for (const evaluation of this.evaluationHistory) {
      const stats = strategyStats.get(evaluation.strategyId) || { totalReward: 0, count: 0 }
      stats.totalReward += evaluation.rewardPenalty.total
      stats.count++
      strategyStats.set(evaluation.strategyId, stats)
    }

    const topStrategies = Array.from(strategyStats.entries())
      .map(([id, stats]) => ({
        id,
        avgReward: stats.totalReward / stats.count,
        uses: stats.count,
      }))
      .sort((a, b) => b.avgReward - a.avgReward)
      .slice(0, 5)

    // 보상 분포
    const positive = this.evaluationHistory.filter(e => e.rewardPenalty.total > 0).length
    const negative = this.evaluationHistory.filter(e => e.rewardPenalty.total < 0).length
    const neutral = totalEvaluations - positive - negative

    return {
      totalEvaluations,
      avgReward,
      topStrategies,
      rewardDistribution: { positive, neutral, negative },
    }
  }

  /**
   * 최근 평가 기록 조회
   */
  getRecentEvaluations(count: number = 10): StrategyEvaluation[] {
    return this.evaluationHistory.slice(-count)
  }

  /**
   * 도메인별 최적 전략 조회
   */
  getBestStrategyForDomain(domain: string): PromptStrategyType | null {
    const domainEvals = this.evaluationHistory.filter(e => e.domain === domain)

    if (domainEvals.length < 5) return null  // 데이터 부족

    // 전략별 성과 집계
    const strategyPerformance: Map<PromptStrategyType, { reward: number; count: number }> = new Map()
    for (const evaluation of domainEvals) {
      const perf = strategyPerformance.get(evaluation.strategyId) || { reward: 0, count: 0 }
      perf.reward += evaluation.rewardPenalty.total
      perf.count++
      strategyPerformance.set(evaluation.strategyId, perf)
    }

    // 최고 성과 전략 찾기
    let bestStrategy: PromptStrategyType | null = null
    let bestAvgReward = -Infinity

    for (const [strategyId, perf] of strategyPerformance.entries()) {
      if (perf.count >= 3) {  // 최소 3회 사용
        const avgReward = perf.reward / perf.count
        if (avgReward > bestAvgReward) {
          bestAvgReward = avgReward
          bestStrategy = strategyId
        }
      }
    }

    return bestStrategy
  }

  /**
   * 히스토리 초기화
   */
  clearHistory(): void {
    this.evaluationHistory = []
    localStorage.removeItem(this.storageKey)
    console.log('[PromptStrategyEvaluator] 히스토리 초기화 완료')
  }
}

// ============================================================
// 싱글톤 인스턴스
// ============================================================

export const PromptStrategyEvaluator = new PromptStrategyEvaluatorImpl()
