/**
 * Prompt Strategy Registry - 전략 등록 및 선택 시스템
 *
 * 기능:
 * - 전략 등록/조회
 * - 가중치 기반 자동 전략 선택
 * - 도메인/복잡도별 최적 전략 추천
 * - 강화학습 기반 가중치 업데이트
 */

import type {
  PromptStrategy,
  PromptStrategyType,
  StrategyContext,
  StrategyResult,
  StrategyWeight,
  StrategyPerformanceMetrics,
  StrategySelection,
  StrategyStorageData,
  DEFAULT_STRATEGY_WEIGHTS,
} from '../types/PromptStrategyTypes'

import {
  BUILTIN_STRATEGIES,
  getBuiltinStrategy,
  getStrategiesForComplexity,
} from '../data/builtinStrategies'

// ============================================================
// 도메인 키워드 매핑
// ============================================================

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  coding: ['코드', '프로그래밍', '함수', '클래스', '버그', '에러', '개발', '구현', 'API', 'REST', 'SQL', 'javascript', 'python', 'typescript'],
  data: ['데이터', '분석', '통계', '차트', '그래프', 'CSV', 'JSON', 'ETL', '시각화', '머신러닝', 'ML'],
  writing: ['글', '작성', '문서', '보고서', '이메일', '번역', '요약', '블로그', '에세이'],
  rag: ['검색', 'RAG', '지식베이스', 'KB', '임베딩', '벡터', '문서', '인덱스'],
  workflow: ['워크플로우', '자동화', '파이프라인', '프로세스', '작업', '배치'],
  agent: ['에이전트', '페르소나', '역할', '전문가', '평가', '투표'],
  math: ['계산', '수학', '방정식', '확률', '통계', '미적분', '행렬'],
  creative: ['창작', '아이디어', '브레인스토밍', '디자인', '예술', '스토리'],
}

// ============================================================
// Strategy Registry Implementation
// ============================================================

class PromptStrategyRegistryImpl {
  private strategies: Map<PromptStrategyType, PromptStrategy> = new Map()
  private weights: Map<PromptStrategyType, StrategyWeight> = new Map()
  private metrics: Map<PromptStrategyType, StrategyPerformanceMetrics> = new Map()
  private storageKey = 'handbox_prompt_strategy_data'

  constructor() {
    this.initialize()
  }

  // ── 초기화 ──

  private initialize(): void {
    // 내장 전략 등록
    for (const strategy of BUILTIN_STRATEGIES) {
      this.registerStrategy(strategy)
    }

    // 저장된 데이터 로드
    this.loadFromStorage()

    console.log(`[PromptStrategyRegistry] ${this.strategies.size}개 전략 등록 완료`)
  }

  // ── 전략 등록/조회 ──

  /**
   * 전략 등록
   */
  registerStrategy(strategy: PromptStrategy): void {
    this.strategies.set(strategy.id, strategy)

    // 가중치 초기화 (없는 경우)
    if (!this.weights.has(strategy.id)) {
      this.weights.set(strategy.id, this.createDefaultWeight(strategy.id))
    }

    // 메트릭 초기화 (없는 경우)
    if (!this.metrics.has(strategy.id)) {
      this.metrics.set(strategy.id, this.createDefaultMetrics(strategy.id))
    }
  }

  /**
   * 전략 조회
   */
  getStrategy(id: PromptStrategyType): PromptStrategy | undefined {
    return this.strategies.get(id)
  }

  /**
   * 모든 전략 조회
   */
  getAllStrategies(): PromptStrategy[] {
    return Array.from(this.strategies.values())
  }

  /**
   * 전략 가중치 조회
   */
  getWeight(id: PromptStrategyType): StrategyWeight | undefined {
    return this.weights.get(id)
  }

  /**
   * 전략 메트릭 조회
   */
  getMetrics(id: PromptStrategyType): StrategyPerformanceMetrics | undefined {
    return this.metrics.get(id)
  }

  // ── 전략 선택 ──

  /**
   * 최적 전략 선택 (가중치 기반)
   */
  selectStrategy(context: StrategyContext): StrategySelection {
    const domain = this.detectDomain(context.originalPrompt)
    const complexity = context.complexity
    const complexityLevel = this.getComplexityLevel(complexity)

    // 모든 전략에 대해 점수 계산
    const scoredStrategies: Array<{
      strategyId: PromptStrategyType
      score: number
      reasons: string[]
    }> = []

    for (const [strategyId, strategy] of this.strategies.entries()) {
      const weight = this.weights.get(strategyId)
      if (!weight) continue

      const { score, reasons } = this.calculateStrategyScore(
        strategy,
        weight,
        domain,
        complexity,
        complexityLevel,
        context
      )

      scoredStrategies.push({ strategyId, score, reasons })
    }

    // 점수순 정렬
    scoredStrategies.sort((a, b) => b.score - a.score)

    const selected = scoredStrategies[0]
    const alternatives = scoredStrategies.slice(1, 4).map(s => ({
      strategyId: s.strategyId,
      score: s.score,
      reason: s.reasons.join(', '),
    }))

    // 확신도 계산 (1위와 2위의 점수 차이)
    const confidence = scoredStrategies.length > 1
      ? Math.min(1, (selected.score - scoredStrategies[1].score) / selected.score + 0.5)
      : 1.0

    return {
      selectedStrategy: selected.strategyId,
      reason: selected.reasons.join(', '),
      alternatives,
      selectionScore: selected.score,
      confidence,
      analysis: {
        detectedDomain: domain,
        complexityLevel,
        promptCharacteristics: this.analyzePromptCharacteristics(context.originalPrompt),
        recommendedFeatures: this.getRecommendedFeatures(domain, complexity),
      },
    }
  }

  /**
   * 전략 점수 계산
   */
  private calculateStrategyScore(
    strategy: PromptStrategy,
    weight: StrategyWeight,
    domain: string,
    complexity: number,
    complexityLevel: 'low' | 'medium' | 'high',
    context: StrategyContext
  ): { score: number; reasons: string[] } {
    let score = 0
    const reasons: string[] = []

    // 1. 기본 가중치 (0-1)
    score += weight.currentWeight
    reasons.push(`기본 가중치: ${weight.currentWeight.toFixed(2)}`)

    // 2. 복잡도 적합성 (0-0.5)
    if (complexity >= strategy.complexityThreshold.min &&
        complexity <= strategy.complexityThreshold.max) {
      const complexityFit = 0.5
      score += complexityFit
      reasons.push(`복잡도 적합`)
    } else {
      // 복잡도 범위 벗어남 - 패널티
      const distance = Math.min(
        Math.abs(complexity - strategy.complexityThreshold.min),
        Math.abs(complexity - strategy.complexityThreshold.max)
      )
      score -= distance * 0.1
      reasons.push(`복잡도 부적합 (-${(distance * 0.1).toFixed(2)})`)
    }

    // 3. 도메인 수정자 (0-0.3)
    const domainModifier = weight.domainModifiers[domain] || 0
    score += domainModifier
    if (domainModifier > 0) {
      reasons.push(`도메인 보너스: +${domainModifier.toFixed(2)}`)
    }

    // 4. 복잡도 레벨 수정자 (0-0.3)
    const complexityModifier = weight.complexityModifiers[complexityLevel]
    score += complexityModifier
    if (complexityModifier !== 0) {
      reasons.push(`복잡도 수정자: ${complexityModifier > 0 ? '+' : ''}${complexityModifier.toFixed(2)}`)
    }

    // 5. 작업 유형 적합성 (0-0.3)
    const promptLower = context.originalPrompt.toLowerCase()
    const suitabilityScore = strategy.suitableFor.reduce((acc, keyword) => {
      return acc + (promptLower.includes(keyword.toLowerCase()) ? 0.1 : 0)
    }, 0)
    score += Math.min(0.3, suitabilityScore)
    if (suitabilityScore > 0) {
      reasons.push(`작업 적합성: +${Math.min(0.3, suitabilityScore).toFixed(2)}`)
    }

    // 6. 부적합성 패널티 (-0.3)
    const unsuitabilityScore = strategy.notSuitableFor.reduce((acc, keyword) => {
      return acc + (promptLower.includes(keyword.toLowerCase()) ? 0.15 : 0)
    }, 0)
    score -= Math.min(0.3, unsuitabilityScore)
    if (unsuitabilityScore > 0) {
      reasons.push(`부적합 패널티: -${Math.min(0.3, unsuitabilityScore).toFixed(2)}`)
    }

    // 7. 예시 가용성 (few-shot 계열)
    if (strategy.id.includes('few-shot') && context.examples && context.examples.length > 0) {
      score += 0.2
      reasons.push(`예시 가용: +0.2 (${context.examples.length}개)`)
    }

    // 8. 토큰 제약 고려
    if (context.constraints?.maxTokens) {
      const overhead = strategy.tokenOverhead
      if (overhead > 2.0 && context.constraints.maxTokens < 2000) {
        score -= 0.3
        reasons.push(`토큰 제약 패널티: -0.3`)
      }
    }

    // 9. 시간 제약 고려
    if (context.constraints?.maxTime) {
      const timeMultiplier = strategy.timeMultiplier
      if (timeMultiplier > 2.0 && context.constraints.maxTime < 30000) {
        score -= 0.2
        reasons.push(`시간 제약 패널티: -0.2`)
      }
    }

    // 10. 최근 성공률 반영 (메트릭)
    const metrics = this.metrics.get(strategy.id)
    if (metrics && metrics.totalUses >= 10) {
      const successBonus = (metrics.successRate - 0.5) * 0.4  // -0.2 ~ +0.2
      score += successBonus
      if (successBonus !== 0) {
        reasons.push(`성공률 ${metrics.successRate.toFixed(2)}: ${successBonus > 0 ? '+' : ''}${successBonus.toFixed(2)}`)
      }
    }

    return { score: Math.max(0, score), reasons }
  }

  // ── 전략 적용 ──

  /**
   * 전략 적용
   */
  async applyStrategy(
    strategyId: PromptStrategyType,
    prompt: string,
    context: StrategyContext
  ): Promise<StrategyResult> {
    const strategy = this.strategies.get(strategyId)
    if (!strategy) {
      throw new Error(`전략을 찾을 수 없습니다: ${strategyId}`)
    }

    const result = await strategy.apply(prompt, context)
    return result
  }

  /**
   * 자동 전략 선택 및 적용
   */
  async autoApply(
    prompt: string,
    context: Partial<StrategyContext> = {}
  ): Promise<{ selection: StrategySelection; result: StrategyResult }> {
    // 컨텍스트 완성
    const fullContext: StrategyContext = {
      originalPrompt: prompt,
      complexity: context.complexity || this.estimateComplexity(prompt),
      domain: context.domain || this.detectDomain(prompt),
      examples: context.examples || [],
      previousAttempts: context.previousAttempts || [],
      userPreferences: context.userPreferences || {
        detailLevel: 3,
        language: 'ko',
      },
      constraints: context.constraints,
    }

    // 전략 선택
    const selection = this.selectStrategy(fullContext)

    // 전략 적용
    const result = await this.applyStrategy(
      selection.selectedStrategy,
      prompt,
      fullContext
    )

    return { selection, result }
  }

  // ── 가중치 업데이트 (강화학습) ──

  /**
   * 전략 결과 기반 가중치 업데이트
   */
  updateWeights(
    strategyId: PromptStrategyType,
    success: boolean,
    qualityScore: number,
    domain: string,
    complexityLevel: 'low' | 'medium' | 'high'
  ): void {
    const weight = this.weights.get(strategyId)
    if (!weight) return

    // 가중치 조정량 계산
    const baseAdjustment = success ? 0.02 : -0.03
    const qualityAdjustment = (qualityScore - 5) * 0.005  // -0.025 ~ +0.025

    const totalAdjustment = baseAdjustment + qualityAdjustment

    // 현재 가중치 업데이트
    weight.currentWeight = Math.max(
      0.1,
      Math.min(1.5, weight.currentWeight + totalAdjustment)
    )

    // 도메인별 수정자 업데이트
    const domainAdjustment = totalAdjustment * 0.5
    weight.domainModifiers[domain] = Math.max(
      -0.3,
      Math.min(0.3, (weight.domainModifiers[domain] || 0) + domainAdjustment)
    )

    // 복잡도별 수정자 업데이트
    const complexityAdjustment = totalAdjustment * 0.3
    weight.complexityModifiers[complexityLevel] = Math.max(
      -0.3,
      Math.min(0.3, weight.complexityModifiers[complexityLevel] + complexityAdjustment)
    )

    weight.lastUpdated = Date.now()

    // 메트릭 업데이트
    this.updateMetrics(strategyId, success, qualityScore, domain, complexityLevel)

    // 저장
    this.saveToStorage()

    console.log(
      `[PromptStrategyRegistry] ${strategyId} 가중치 업데이트: ` +
      `${(weight.currentWeight - totalAdjustment).toFixed(3)} → ${weight.currentWeight.toFixed(3)} ` +
      `(${success ? '성공' : '실패'}, 품질: ${qualityScore}/10)`
    )
  }

  /**
   * 메트릭 업데이트
   */
  private updateMetrics(
    strategyId: PromptStrategyType,
    success: boolean,
    qualityScore: number,
    domain: string,
    complexityLevel: 'low' | 'medium' | 'high'
  ): void {
    const metrics = this.metrics.get(strategyId)
    if (!metrics) return

    // 기본 카운터 업데이트
    metrics.totalUses++
    if (success) {
      metrics.successCount++
    } else {
      metrics.failureCount++
    }

    // 성공률 재계산
    metrics.successRate = metrics.successCount / metrics.totalUses

    // 평균 품질 점수 업데이트 (이동 평균)
    metrics.avgQualityScore = (metrics.avgQualityScore * (metrics.totalUses - 1) + qualityScore) / metrics.totalUses

    // 도메인별 성공률 업데이트
    if (!metrics.domainSuccessRates[domain]) {
      metrics.domainSuccessRates[domain] = success ? 1 : 0
    } else {
      // 지수 이동 평균 (EMA)
      const alpha = 0.1
      metrics.domainSuccessRates[domain] =
        alpha * (success ? 1 : 0) + (1 - alpha) * metrics.domainSuccessRates[domain]
    }

    // 복잡도별 성공률 업데이트
    const alpha = 0.1
    metrics.complexitySuccessRates[complexityLevel] =
      alpha * (success ? 1 : 0) + (1 - alpha) * metrics.complexitySuccessRates[complexityLevel]

    // 트렌드 계산 (최근 20건 기준)
    const recentWindow = 20
    if (metrics.totalUses >= recentWindow) {
      const oldRate = metrics.recentSuccessRate
      metrics.recentSuccessRate = alpha * (success ? 1 : 0) + (1 - alpha) * oldRate

      if (metrics.recentSuccessRate > oldRate + 0.05) {
        metrics.trend = 1  // 상승
      } else if (metrics.recentSuccessRate < oldRate - 0.05) {
        metrics.trend = -1  // 하락
      } else {
        metrics.trend = 0  // 유지
      }
    }
  }

  // ── 헬퍼 함수 ──

  /**
   * 도메인 감지
   */
  private detectDomain(prompt: string): string {
    const promptLower = prompt.toLowerCase()

    let bestDomain = 'general'
    let maxScore = 0

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      const score = keywords.reduce((acc, keyword) => {
        return acc + (promptLower.includes(keyword.toLowerCase()) ? 1 : 0)
      }, 0)

      if (score > maxScore) {
        maxScore = score
        bestDomain = domain
      }
    }

    return bestDomain
  }

  /**
   * 복잡도 추정
   */
  private estimateComplexity(prompt: string): number {
    let complexity = 1

    // 길이 기반
    if (prompt.length > 500) complexity += 2
    else if (prompt.length > 200) complexity += 1

    // 구조 패턴
    if (prompt.includes('1.') || prompt.includes('첫째')) complexity += 1
    if (prompt.includes('그리고') || prompt.includes('또한')) complexity += 0.5
    if (prompt.includes('단계') || prompt.includes('순서')) complexity += 1
    if (prompt.includes('조건') || prompt.includes('만약')) complexity += 1
    if (prompt.includes('비교') || prompt.includes('분석')) complexity += 1
    if (prompt.includes('여러') || prompt.includes('다양한')) complexity += 0.5

    // 전문 용어
    for (const keywords of Object.values(DOMAIN_KEYWORDS)) {
      const count = keywords.filter(k => prompt.toLowerCase().includes(k.toLowerCase())).length
      complexity += count * 0.2
    }

    return Math.min(10, Math.max(1, Math.round(complexity)))
  }

  /**
   * 복잡도 레벨 변환
   */
  private getComplexityLevel(complexity: number): 'low' | 'medium' | 'high' {
    if (complexity <= 3) return 'low'
    if (complexity <= 6) return 'medium'
    return 'high'
  }

  /**
   * 프롬프트 특성 분석
   */
  private analyzePromptCharacteristics(prompt: string): string[] {
    const characteristics: string[] = []

    if (prompt.length > 300) characteristics.push('장문')
    if (prompt.includes('?')) characteristics.push('질문형')
    if (prompt.includes('해줘') || prompt.includes('해 주세요')) characteristics.push('요청형')
    if (prompt.includes('단계') || prompt.includes('순서')) characteristics.push('순차적')
    if (prompt.includes('비교') || prompt.includes('차이')) characteristics.push('비교형')
    if (prompt.includes('예시') || prompt.includes('예를 들어')) characteristics.push('예시 요청')
    if (prompt.includes('JSON') || prompt.includes('형식')) characteristics.push('구조화 출력')

    return characteristics
  }

  /**
   * 추천 기능
   */
  private getRecommendedFeatures(domain: string, complexity: number): string[] {
    const features: string[] = []

    if (complexity >= 6) {
      features.push('단계별 추론 (CoT)')
    }
    if (domain === 'coding') {
      features.push('코드 예시 포함')
    }
    if (domain === 'data') {
      features.push('구조화된 출력')
    }
    if (complexity >= 8) {
      features.push('문제 분해')
    }

    return features
  }

  /**
   * 기본 가중치 생성
   */
  private createDefaultWeight(strategyId: PromptStrategyType): StrategyWeight {
    const defaultWeights: Record<PromptStrategyType, number> = {
      'simple': 1.0,
      'few-shot': 0.8,
      'zero-shot-cot': 0.7,
      'few-shot-cot': 0.6,
      'tree-of-thought': 0.5,
      'self-consistency': 0.4,
      'react': 0.5,
      'decomposition': 0.6,
      'role-play': 0.7,
      'structured': 0.8,
      'iterative': 0.5,
      'meta-prompt': 0.3,
    }

    return {
      strategyId,
      baseWeight: defaultWeights[strategyId] || 0.5,
      currentWeight: defaultWeights[strategyId] || 0.5,
      domainModifiers: {},
      complexityModifiers: {
        low: 0,
        medium: 0,
        high: 0,
      },
      lastUpdated: Date.now(),
    }
  }

  /**
   * 기본 메트릭 생성
   */
  private createDefaultMetrics(strategyId: PromptStrategyType): StrategyPerformanceMetrics {
    return {
      strategyId,
      totalUses: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0.5,
      avgQualityScore: 5,
      avgDuration: 0,
      domainSuccessRates: {},
      complexitySuccessRates: {
        low: 0.5,
        medium: 0.5,
        high: 0.5,
      },
      recentSuccessRate: 0.5,
      trend: 0,
    }
  }

  // ── 저장/로드 ──

  /**
   * 로컬 스토리지에 저장
   */
  private saveToStorage(): void {
    try {
      const data: StrategyStorageData = {
        version: '1.0.0',
        weights: Object.fromEntries(this.weights) as Record<PromptStrategyType, StrategyWeight>,
        metrics: Object.fromEntries(this.metrics) as Record<PromptStrategyType, StrategyPerformanceMetrics>,
        recentEvaluations: [],  // 평가 기록은 Evaluator에서 관리
        lastUpdated: Date.now(),
        totalLearningIterations: Array.from(this.metrics.values())
          .reduce((sum, m) => sum + m.totalUses, 0),
      }

      localStorage.setItem(this.storageKey, JSON.stringify(data))
    } catch (error) {
      console.warn('[PromptStrategyRegistry] 저장 실패:', error)
    }
  }

  /**
   * 로컬 스토리지에서 로드
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey)
      if (!stored) return

      const data: StrategyStorageData = JSON.parse(stored)

      // 가중치 복원
      for (const [id, weight] of Object.entries(data.weights)) {
        if (this.strategies.has(id as PromptStrategyType)) {
          this.weights.set(id as PromptStrategyType, weight)
        }
      }

      // 메트릭 복원
      for (const [id, metrics] of Object.entries(data.metrics)) {
        if (this.strategies.has(id as PromptStrategyType)) {
          this.metrics.set(id as PromptStrategyType, metrics)
        }
      }

      console.log(
        `[PromptStrategyRegistry] 저장된 데이터 로드 완료 ` +
        `(${data.totalLearningIterations}회 학습 기록)`
      )
    } catch (error) {
      console.warn('[PromptStrategyRegistry] 로드 실패:', error)
    }
  }

  /**
   * 데이터 초기화 (리셋)
   */
  resetData(): void {
    for (const strategy of this.strategies.values()) {
      this.weights.set(strategy.id, this.createDefaultWeight(strategy.id))
      this.metrics.set(strategy.id, this.createDefaultMetrics(strategy.id))
    }
    this.saveToStorage()
    console.log('[PromptStrategyRegistry] 데이터 초기화 완료')
  }

  // ── 디버깅/통계 ──

  /**
   * 전체 통계 출력
   */
  getStatistics(): {
    totalStrategies: number
    totalUsage: number
    topStrategies: Array<{ id: PromptStrategyType; uses: number; successRate: number }>
    weightDistribution: Record<PromptStrategyType, number>
  } {
    const metricsArray = Array.from(this.metrics.values())

    return {
      totalStrategies: this.strategies.size,
      totalUsage: metricsArray.reduce((sum, m) => sum + m.totalUses, 0),
      topStrategies: metricsArray
        .filter(m => m.totalUses > 0)
        .sort((a, b) => b.totalUses - a.totalUses)
        .slice(0, 5)
        .map(m => ({
          id: m.strategyId,
          uses: m.totalUses,
          successRate: m.successRate,
        })),
      weightDistribution: Object.fromEntries(
        Array.from(this.weights.entries())
          .map(([id, w]) => [id, w.currentWeight])
      ) as Record<PromptStrategyType, number>,
    }
  }
}

// ============================================================
// 싱글톤 인스턴스
// ============================================================

export const PromptStrategyRegistry = new PromptStrategyRegistryImpl()
