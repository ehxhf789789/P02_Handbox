/**
 * Supervisor Agent - 버그 수집 및 학습 관리
 *
 * 강화학습 과정에서 발생하는 버그 패턴을 탐지하고,
 * Few-shot 예제를 생성하여 에이전트 성장을 관리
 */

// UUID 생성 함수 (crypto API 사용)
function uuidv4(): string {
  return crypto.randomUUID()
}
import { RLLogger, rlLogger } from './RLLogger'
import { ExperienceBuffer, experienceBuffer } from './ExperienceBuffer'
import type {
  BugPattern,
  BugSeverity,
  FailureExample,
  LearningEntry,
  LearningEventType,
  LearningMetrics,
  GrowthMetrics,
  LoopResult,
  FewShotExample,
  WorkflowSnapshot,
  Strategy,
} from '../types/RLTypes'

// ============================================================
// Types
// ============================================================

interface SupervisorConfig {
  bugPatternThreshold: number      // 버그로 인정하는 최소 빈도
  maxFewShotExamples: number       // 카테고리별 최대 예제 수
  severityThresholds: {
    critical: number               // 실패율 임계값
    high: number
    medium: number
  }
  learningWindowSize: number       // 최근 N개 경험 기반 학습
}

const DEFAULT_CONFIG: SupervisorConfig = {
  bugPatternThreshold: 3,
  maxFewShotExamples: 20,
  severityThresholds: {
    critical: 0.8,
    high: 0.5,
    medium: 0.3,
  },
  learningWindowSize: 500,
}

// ============================================================
// Supervisor Agent Class
// ============================================================

export class SupervisorAgent {
  private config: SupervisorConfig
  private bugPatterns: Map<string, BugPattern> = new Map()
  private fewShotExamples: Map<string, FewShotExample[]> = new Map()
  private learningHistory: LearningEntry[] = []
  private logger: RLLogger
  private buffer: ExperienceBuffer
  private resolvedBugs: Set<string> = new Set()

  constructor(
    config: Partial<SupervisorConfig> = {},
    logger?: RLLogger,
    buffer?: ExperienceBuffer
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.logger = logger || rlLogger
    this.buffer = buffer || experienceBuffer
  }

  // ============================================================
  // Bug Detection & Collection
  // ============================================================

  /**
   * 실패 결과에서 버그 패턴 탐지
   */
  async detectBugPattern(result: LoopResult): Promise<BugPattern | null> {
    if (result.success) return null

    const errorMessage = result.errorMessage || 'unknown_error'
    const patternKey = this.normalizeErrorPattern(errorMessage)

    // 기존 패턴 확인
    const existing = this.bugPatterns.get(patternKey)

    if (existing) {
      // 빈도 증가
      existing.frequency++
      existing.lastSeen = new Date()
      existing.examples.push({
        prompt: result.prompt,
        workflowId: result.workflow?.id || '',
        errorMessage,
        timestamp: new Date(),
      })

      // 최대 10개 예제만 유지
      if (existing.examples.length > 10) {
        existing.examples = existing.examples.slice(-10)
      }

      // 심각도 재평가
      existing.severity = this.evaluateSeverity(existing)

      this.bugPatterns.set(patternKey, existing)
      await this.logger.logBugPattern(existing)

      return existing
    }

    // 새 버그 패턴
    if (this.shouldRecordNewBug(errorMessage)) {
      const bug: BugPattern = {
        id: uuidv4(),
        pattern: patternKey,
        description: this.extractBugDescription(errorMessage),
        frequency: 1,
        severity: 'low',
        examples: [{
          prompt: result.prompt,
          workflowId: result.workflow?.id || '',
          errorMessage,
          timestamp: new Date(),
        }],
        firstSeen: new Date(),
        lastSeen: new Date(),
      }

      this.bugPatterns.set(patternKey, bug)
      await this.logger.logBugPattern(bug)

      // 학습 이력 기록
      await this.recordLearningEvent('bug_detected', { bugId: bug.id, pattern: patternKey })

      return bug
    }

    return null
  }

  /**
   * 동기적 버그 패턴 탐지 (테스트용)
   * 영속성 로깅 없이 패턴만 분석
   */
  detectBugPatternSync(result: { success: boolean; error?: string }): BugPattern | null {
    if (result.success || !result.error) return null

    const errorMessage = result.error
    const patternKey = this.normalizeErrorPattern(errorMessage)

    // 기존 패턴 확인
    const existing = this.bugPatterns.get(patternKey)
    if (existing) {
      existing.frequency++
      existing.lastSeen = new Date()
      existing.severity = this.evaluateSeverity(existing)
      return existing
    }

    // 새 버그 패턴 (로깅 없이)
    const bug: BugPattern = {
      id: crypto.randomUUID(),
      pattern: patternKey,
      description: this.extractBugDescription(errorMessage),
      frequency: 1,
      severity: 'low',
      examples: [],
      firstSeen: new Date(),
      lastSeen: new Date(),
    }

    this.bugPatterns.set(patternKey, bug)
    return bug
  }

  /**
   * 버그 패턴 해결 표시
   */
  async resolveBug(bugId: string, resolution: string): Promise<boolean> {
    for (const [key, bug] of this.bugPatterns) {
      if (bug.id === bugId) {
        bug.resolution = resolution
        this.resolvedBugs.add(bugId)

        await this.logger.updateBugPattern(bugId, { resolution })
        await this.recordLearningEvent('bug_resolved', { bugId, resolution })

        return true
      }
    }
    return false
  }

  /**
   * 패턴 정규화
   */
  private normalizeErrorPattern(errorMsg: string): string {
    return errorMsg
      .replace(/\d+/g, 'N')
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID')
      .replace(/at\s+\S+:\d+:\d+/g, 'at LOCATION')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .slice(0, 100)
  }

  private shouldRecordNewBug(errorMsg: string): boolean {
    // 일시적 오류는 기록하지 않음
    const transientPatterns = [
      'timeout',
      'network',
      'connection',
      'rate limit',
      'retry',
    ]

    const lower = errorMsg.toLowerCase()
    return !transientPatterns.some(p => lower.includes(p))
  }

  private extractBugDescription(errorMsg: string): string {
    // 에러 메시지에서 핵심 설명 추출
    const patterns = [
      { regex: /cannot\s+(\w+)/i, template: 'Cannot $1' },
      { regex: /failed\s+to\s+(\w+)/i, template: 'Failed to $1' },
      { regex: /missing\s+(\w+)/i, template: 'Missing $1' },
      { regex: /invalid\s+(\w+)/i, template: 'Invalid $1' },
      { regex: /unexpected\s+(\w+)/i, template: 'Unexpected $1' },
    ]

    for (const { regex, template } of patterns) {
      const match = errorMsg.match(regex)
      if (match) {
        return template.replace('$1', match[1])
      }
    }

    return errorMsg.slice(0, 50)
  }

  private evaluateSeverity(bug: BugPattern): BugSeverity {
    const { severityThresholds } = this.config

    // 빈도 기반 심각도
    if (bug.frequency >= 20) return 'critical'
    if (bug.frequency >= 10) return 'high'
    if (bug.frequency >= 5) return 'medium'
    return 'low'
  }

  // ============================================================
  // Learning from Results
  // ============================================================

  /**
   * 결과에서 학습
   */
  async learn(result: LoopResult): Promise<void> {
    // 실패 분석
    if (!result.success) {
      await this.detectBugPattern(result)
    }

    // 성공한 경우 Few-shot 예제로 저장
    if (result.success && result.reward >= 2) {
      await this.addFewShotExample(result)
    }

    // 전략 성능 학습
    await this.learnStrategyPerformance(result)

    // 주기적 통합 분석
    if (this.learningHistory.length % 100 === 0) {
      await this.performIntegratedAnalysis()
    }
  }

  /**
   * Few-shot 예제 추가
   */
  private async addFewShotExample(result: LoopResult): Promise<void> {
    if (!result.workflow) return

    const category = this.categorizePrompt(result.prompt)
    const examples = this.fewShotExamples.get(category) || []

    // 중복 확인
    const isDuplicate = examples.some(e =>
      this.similarity(e.prompt, result.prompt) > 0.9
    )

    if (isDuplicate) return

    const example: FewShotExample = {
      prompt: result.prompt,
      workflow: result.workflow,
      score: result.reward,
      category,
    }

    examples.push(example)

    // 최고 점수 순으로 정렬 후 최대 개수만 유지
    examples.sort((a, b) => b.score - a.score)
    if (examples.length > this.config.maxFewShotExamples) {
      examples.pop()
    }

    this.fewShotExamples.set(category, examples)
    await this.recordLearningEvent('fewshot_added', { category, score: result.reward })
  }

  /**
   * 전략 성능 학습
   */
  private async learnStrategyPerformance(result: LoopResult): Promise<void> {
    // 이건 PolicyNetwork에서 처리하므로 여기서는 기록만
    await this.recordLearningEvent('strategy_update', {
      strategy: result.strategy,
      reward: result.reward,
      success: result.success,
    })
  }

  // ============================================================
  // Few-shot Example Generation
  // ============================================================

  /**
   * 카테고리별 Few-shot 예제 생성
   */
  generateFewShotExamples(category: string, count: number = 3): FewShotExample[] {
    const examples = this.fewShotExamples.get(category) || []
    return examples.slice(0, count)
  }

  /**
   * 모든 카테고리의 상위 예제
   */
  generateTopExamples(count: number = 10): FewShotExample[] {
    const all: FewShotExample[] = []

    for (const examples of this.fewShotExamples.values()) {
      all.push(...examples)
    }

    return all
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
  }

  /**
   * 프롬프트 유사도 기반 예제 검색
   */
  findSimilarExamples(prompt: string, count: number = 3): FewShotExample[] {
    const all: Array<FewShotExample & { similarity: number }> = []

    for (const examples of this.fewShotExamples.values()) {
      for (const example of examples) {
        const sim = this.similarity(prompt, example.prompt)
        all.push({ ...example, similarity: sim })
      }
    }

    return all
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, count)
  }

  // ============================================================
  // Growth Metrics
  // ============================================================

  /**
   * 에이전트 성장 지표
   */
  async getGrowthMetrics(): Promise<GrowthMetrics> {
    const experiences = this.buffer.export()
    const successCount = experiences.filter(e => e.metadata.success).length
    const totalReward = experiences.reduce((sum, e) => sum + e.reward, 0)

    const bugPatterns = Array.from(this.bugPatterns.values())
    const resolvedCount = bugPatterns.filter(b => b.resolution).length

    let totalFewShot = 0
    for (const examples of this.fewShotExamples.values()) {
      totalFewShot += examples.length
    }

    // 학습 속도 계산 (최근 100개 vs 이전 100개)
    const recent = experiences.slice(-100)
    const older = experiences.slice(-200, -100)

    let learningVelocity = 0
    if (recent.length > 0 && older.length > 0) {
      const recentSuccessRate = recent.filter(e => e.metadata.success).length / recent.length
      const olderSuccessRate = older.filter(e => e.metadata.success).length / older.length
      learningVelocity = recentSuccessRate - olderSuccessRate
    }

    return {
      totalExperiences: experiences.length,
      successCount,
      successRate: experiences.length > 0 ? successCount / experiences.length : 0,
      averageReward: experiences.length > 0 ? totalReward / experiences.length : 0,
      bugPatternsDetected: bugPatterns.length,
      bugPatternsResolved: resolvedCount,
      fewShotExamplesGenerated: totalFewShot,
      strategiesOptimized: this.learningHistory.filter(e => e.eventType === 'strategy_update').length,
      learningVelocity,
    }
  }

  // ============================================================
  // Analysis
  // ============================================================

  /**
   * 통합 분석 수행
   */
  private async performIntegratedAnalysis(): Promise<void> {
    const metrics = await this.calculateCurrentMetrics()

    await this.recordLearningEvent('checkpoint_created', {
      metrics,
      bugPatternCount: this.bugPatterns.size,
      fewShotCount: this.getTotalFewShotCount(),
    })
  }

  private async calculateCurrentMetrics(): Promise<LearningMetrics> {
    const experiences = this.buffer.getRecent(this.config.learningWindowSize)

    const successCount = experiences.filter(e => e.metadata.success).length
    const totalReward = experiences.reduce((sum, e) => sum + e.reward, 0)

    // 전략 분포
    const strategyDistribution: Record<string, number> = {}
    for (const exp of experiences) {
      const strategy = exp.action as string
      strategyDistribution[strategy] = (strategyDistribution[strategy] || 0) + 1
    }

    // 에러율
    const errorCount = experiences.filter(e => !e.metadata.success).length

    // 개선율 (최근 50개 vs 이전 50개)
    const recent = experiences.slice(-50)
    const older = experiences.slice(-100, -50)
    let improvementRate = 0

    if (recent.length > 0 && older.length > 0) {
      const recentAvg = recent.reduce((s, e) => s + e.reward, 0) / recent.length
      const olderAvg = older.reduce((s, e) => s + e.reward, 0) / older.length
      improvementRate = recentAvg - olderAvg
    }

    return {
      successRate: experiences.length > 0 ? successCount / experiences.length : 0,
      averageReward: experiences.length > 0 ? totalReward / experiences.length : 0,
      strategyDistribution: strategyDistribution as Record<Strategy, number>,
      errorRate: experiences.length > 0 ? errorCount / experiences.length : 0,
      improvementRate,
    }
  }

  // ============================================================
  // Bug Pattern Analysis
  // ============================================================

  /**
   * 상위 버그 패턴 조회
   */
  getTopBugPatterns(count: number = 10): BugPattern[] {
    return Array.from(this.bugPatterns.values())
      .sort((a, b) => {
        // 심각도 순, 그 다음 빈도 순
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity]
        return severityDiff !== 0 ? severityDiff : b.frequency - a.frequency
      })
      .slice(0, count)
  }

  /**
   * 미해결 버그 패턴
   */
  getUnresolvedBugs(): BugPattern[] {
    return Array.from(this.bugPatterns.values())
      .filter(b => !b.resolution && !this.resolvedBugs.has(b.id))
  }

  /**
   * 버그 추세 분석
   */
  analyzeBugTrend(): {
    totalBugs: number
    resolvedBugs: number
    criticalBugs: number
    recentBugs: BugPattern[]
    frequentPatterns: Array<{ pattern: string; frequency: number }>
  } {
    const bugs = Array.from(this.bugPatterns.values())
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const recentBugs = bugs.filter(b => b.lastSeen > oneDayAgo)
    const frequentPatterns = bugs
      .map(b => ({ pattern: b.pattern, frequency: b.frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5)

    return {
      totalBugs: bugs.length,
      resolvedBugs: bugs.filter(b => b.resolution).length,
      criticalBugs: bugs.filter(b => b.severity === 'critical').length,
      recentBugs,
      frequentPatterns,
    }
  }

  // ============================================================
  // Learning History
  // ============================================================

  private async recordLearningEvent(
    eventType: LearningEventType,
    details: Record<string, unknown>
  ): Promise<void> {
    const entry: LearningEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      eventType,
      details,
      metrics: await this.calculateCurrentMetrics(),
    }

    this.learningHistory.push(entry)

    // 최대 1000개만 유지
    if (this.learningHistory.length > 1000) {
      this.learningHistory = this.learningHistory.slice(-1000)
    }

    await this.logger.logLearningEntry(entry)
  }

  getLearningHistory(): LearningEntry[] {
    return [...this.learningHistory]
  }

  // ============================================================
  // Persistence
  // ============================================================

  /**
   * 상태 내보내기
   */
  export(): {
    bugPatterns: BugPattern[]
    fewShotExamples: Record<string, FewShotExample[]>
    learningHistory: LearningEntry[]
    resolvedBugs: string[]
  } {
    return {
      bugPatterns: Array.from(this.bugPatterns.values()),
      fewShotExamples: Object.fromEntries(this.fewShotExamples),
      learningHistory: this.learningHistory,
      resolvedBugs: Array.from(this.resolvedBugs),
    }
  }

  /**
   * 상태 복원
   */
  import(data: {
    bugPatterns?: BugPattern[]
    fewShotExamples?: Record<string, FewShotExample[]>
    learningHistory?: LearningEntry[]
    resolvedBugs?: string[]
  }): void {
    if (data.bugPatterns) {
      this.bugPatterns = new Map(data.bugPatterns.map(b => [b.pattern, b]))
    }

    if (data.fewShotExamples) {
      this.fewShotExamples = new Map(Object.entries(data.fewShotExamples))
    }

    if (data.learningHistory) {
      this.learningHistory = data.learningHistory
    }

    if (data.resolvedBugs) {
      this.resolvedBugs = new Set(data.resolvedBugs)
    }
  }

  /**
   * 버그 패턴 수동 추가
   */
  addBugPattern(pattern: BugPattern): void {
    const existing = this.bugPatterns.get(pattern.pattern)
    if (existing) {
      // 기존 패턴 업데이트 (빈도 증가)
      existing.frequency += pattern.frequency
      if (pattern.examples) {
        existing.examples.push(...pattern.examples)
      }
    } else {
      this.bugPatterns.set(pattern.pattern, { ...pattern })
    }
  }

  /**
   * 전체 초기화
   */
  clear(): void {
    this.bugPatterns.clear()
    this.fewShotExamples.clear()
    this.learningHistory = []
    this.resolvedBugs.clear()
  }

  // ============================================================
  // Utility
  // ============================================================

  private categorizePrompt(prompt: string): string {
    const lower = prompt.toLowerCase()

    if (lower.includes('pdf') || lower.includes('문서')) return 'document_processing'
    if (lower.includes('csv') || lower.includes('엑셀')) return 'data_transformation'
    if (lower.includes('rag') || lower.includes('검색')) return 'rag_pipeline'
    if (lower.includes('이미지') || lower.includes('사진')) return 'vision'
    if (lower.includes('api') || lower.includes('http')) return 'api_integration'
    if (lower.includes('조건') || lower.includes('분기')) return 'conditional_logic'
    if (lower.includes('반복') || lower.includes('루프')) return 'iteration'
    return 'general'
  }

  private similarity(a: string, b: string): number {
    // 간단한 Jaccard 유사도
    const setA = new Set(a.toLowerCase().split(/\s+/))
    const setB = new Set(b.toLowerCase().split(/\s+/))

    const intersection = new Set([...setA].filter(x => setB.has(x)))
    const union = new Set([...setA, ...setB])

    return intersection.size / union.size
  }

  private getTotalFewShotCount(): number {
    let count = 0
    for (const examples of this.fewShotExamples.values()) {
      count += examples.length
    }
    return count
  }
}

// ============================================================
// Singleton Instance
// ============================================================

export const supervisorAgent = new SupervisorAgent()
