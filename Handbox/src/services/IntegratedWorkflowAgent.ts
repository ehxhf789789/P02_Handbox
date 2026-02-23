/**
 * Integrated Workflow Generation Agent
 *
 * Handbox의 핵심 차별점 - AWS Bedrock에 없는 "안내데스크" 역할
 *
 * 역할:
 * 1. 사용자 의도 파악 및 구체화 질문
 * 2. 로컬 MCP 도구를 활용한 워크플로우 설계
 * 3. 각 노드 선택 이유 및 구현 방식 설명
 * 4. 프롬프트 기반 워크플로우 수정
 * 5. 사용자 편의에 맞춘 세밀한 조정
 *
 * AWS Bedrock과의 차별점:
 * - Bedrock: 도구 나열만, 사용자가 직접 조합해야 함
 * - Handbox: 에이전트가 도구 조합을 제안하고 이유를 설명
 */

import { invoke } from '@tauri-apps/api/tauri'
import { LocalMCPRegistry } from './LocalMCPRegistry'
import { LocalLLMProvider, configureOllama } from './LocalLLMProvider'
import { ProviderRegistry } from '../registry/ProviderRegistry'
import { Guardrails } from './Guardrails'
import { useAppStore } from '../stores/appStore'
import { InteractiveXAI, startXAISession, recordNodeDecision, type XAISession } from './InteractiveXAI'
import { getConnectionRulesSummary, canConnect, getConnectableTargets } from '../registry/NodeConnectionRules'

// 설정에서 maxTokens 가져오기 (클래스 내부에서 사용 가능)
function getMaxTokensFromSettings(): number {
  const state = useAppStore.getState()
  return state.aiModelConfig.maxTokens || 8192
}

// ============================================================
// Workflow Learning System (강화학습 기반 개선)
// ============================================================

export interface WorkflowFeedback {
  workflowId: string
  sessionId: string
  userRequest: string
  workflow: WorkflowDesign
  rating: 1 | 2 | 3 | 4 | 5  // 1: 매우 불만족, 5: 매우 만족
  feedbackText?: string
  corrections?: {
    field: string  // 수정된 필드 (예: 'expertCount', 'domains', 'votingMethod')
    original: any
    corrected: any
  }[]
  timestamp: string
}

export interface LearningData {
  version: string
  exportedAt: string
  feedbacks: WorkflowFeedback[]
  patterns: LearnedPattern[]
  statistics: {
    totalFeedbacks: number
    averageRating: number
    categoryStats: Record<string, { count: number; avgRating: number }>
  }
}

export interface LearnedPattern {
  id: string
  triggerKeywords: string[]  // 이 키워드가 감지되면 패턴 적용
  category: string
  preferredConfig: {
    expertCount?: number
    domains?: string[]
    votingMethod?: string
    criteria?: string[]
    additionalNodes?: string[]
  }
  confidence: number  // 0-1, 학습 신뢰도
  sampleCount: number  // 이 패턴을 학습한 샘플 수
  lastUpdated: string
}

class WorkflowLearningSystemImpl {
  private feedbacks: WorkflowFeedback[] = []
  private patterns: LearnedPattern[] = []
  private dbInitialized = false

  /**
   * DB 초기화 (memory.db 사용)
   */
  async initialize(): Promise<void> {
    if (this.dbInitialized) return

    try {
      // 테이블 생성
      await invoke('memory_db_execute', {
        sql: `
          CREATE TABLE IF NOT EXISTS workflow_feedbacks (
            id TEXT PRIMARY KEY,
            workflow_id TEXT,
            session_id TEXT,
            user_request TEXT,
            workflow_json TEXT,
            rating INTEGER,
            feedback_text TEXT,
            corrections_json TEXT,
            timestamp TEXT
          )
        `,
        params: [],
      })

      await invoke('memory_db_execute', {
        sql: `
          CREATE TABLE IF NOT EXISTS learned_patterns (
            id TEXT PRIMARY KEY,
            trigger_keywords TEXT,
            category TEXT,
            preferred_config TEXT,
            confidence REAL,
            sample_count INTEGER,
            last_updated TEXT
          )
        `,
        params: [],
      })

      // 기존 데이터 로드
      await this.loadFromDB()

      this.dbInitialized = true
      console.log('[WorkflowLearningSystem] 초기화 완료')
    } catch (error) {
      console.warn('[WorkflowLearningSystem] DB 초기화 실패, 메모리 모드로 동작:', error)
    }
  }

  /**
   * DB에서 데이터 로드
   */
  private async loadFromDB(): Promise<void> {
    try {
      const feedbackRows = await invoke<any[]>('memory_db_query', {
        sql: 'SELECT * FROM workflow_feedbacks ORDER BY timestamp DESC LIMIT 1000',
        params: [],
      })

      this.feedbacks = feedbackRows.map(row => ({
        workflowId: row.workflow_id,
        sessionId: row.session_id,
        userRequest: row.user_request,
        workflow: JSON.parse(row.workflow_json || '{}'),
        rating: row.rating,
        feedbackText: row.feedback_text,
        corrections: JSON.parse(row.corrections_json || '[]'),
        timestamp: row.timestamp,
      }))

      const patternRows = await invoke<any[]>('memory_db_query', {
        sql: 'SELECT * FROM learned_patterns',
        params: [],
      })

      this.patterns = patternRows.map(row => ({
        id: row.id,
        triggerKeywords: JSON.parse(row.trigger_keywords || '[]'),
        category: row.category,
        preferredConfig: JSON.parse(row.preferred_config || '{}'),
        confidence: row.confidence,
        sampleCount: row.sample_count,
        lastUpdated: row.last_updated,
      }))

      console.log(`[WorkflowLearningSystem] ${this.feedbacks.length}개 피드백, ${this.patterns.length}개 패턴 로드`)
    } catch (error) {
      console.warn('[WorkflowLearningSystem] DB 로드 실패:', error)
    }
  }

  /**
   * 피드백 기록
   */
  async recordFeedback(feedback: WorkflowFeedback): Promise<void> {
    await this.initialize()

    this.feedbacks.push(feedback)

    // DB에 저장
    try {
      await invoke('memory_db_execute', {
        sql: `
          INSERT OR REPLACE INTO workflow_feedbacks
          (id, workflow_id, session_id, user_request, workflow_json, rating, feedback_text, corrections_json, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          `feedback_${Date.now()}`,
          feedback.workflowId,
          feedback.sessionId,
          feedback.userRequest,
          JSON.stringify(feedback.workflow),
          feedback.rating,
          feedback.feedbackText || '',
          JSON.stringify(feedback.corrections || []),
          feedback.timestamp,
        ],
      })
    } catch (error) {
      console.warn('[WorkflowLearningSystem] 피드백 저장 실패:', error)
    }

    // 패턴 학습 트리거 (평점 4 이상 or 수정사항 있음)
    if (feedback.rating >= 4 || (feedback.corrections && feedback.corrections.length > 0)) {
      await this.learnFromFeedback(feedback)
    }

    console.log(`[WorkflowLearningSystem] 피드백 기록: rating=${feedback.rating}`)
  }

  /**
   * 피드백에서 패턴 학습
   */
  private async learnFromFeedback(feedback: WorkflowFeedback): Promise<void> {
    // 키워드 추출
    const keywords = this.extractKeywords(feedback.userRequest)
    const category = this.detectCategory(feedback.userRequest)

    // 기존 패턴 찾기 또는 새로 생성
    let pattern = this.patterns.find(p =>
      p.category === category &&
      p.triggerKeywords.some(k => keywords.includes(k))
    )

    if (!pattern) {
      pattern = {
        id: `pattern_${Date.now()}`,
        triggerKeywords: keywords.slice(0, 5),
        category,
        preferredConfig: {},
        confidence: 0.5,
        sampleCount: 0,
        lastUpdated: new Date().toISOString(),
      }
      this.patterns.push(pattern)
    }

    // 수정사항 반영
    if (feedback.corrections) {
      for (const correction of feedback.corrections) {
        if (correction.field === 'expertCount') {
          pattern.preferredConfig.expertCount = correction.corrected
        } else if (correction.field === 'domains') {
          pattern.preferredConfig.domains = correction.corrected
        } else if (correction.field === 'votingMethod') {
          pattern.preferredConfig.votingMethod = correction.corrected
        } else if (correction.field === 'criteria') {
          pattern.preferredConfig.criteria = correction.corrected
        }
      }
    }

    // 워크플로우에서 설정 학습 (rating 4 이상)
    if (feedback.rating >= 4) {
      const workflow = feedback.workflow
      const expertNodes = workflow.nodes.filter(n => n.type === 'agent.persona')

      if (expertNodes.length > 0) {
        // 기존 설정과 병합 (더 최신 데이터 우선)
        if (!pattern.preferredConfig.expertCount || feedback.rating === 5) {
          pattern.preferredConfig.expertCount = expertNodes.length
        }

        const domains = expertNodes.map(n => n.toolConfig?.domain).filter(Boolean)
        if (domains.length > 0) {
          pattern.preferredConfig.domains = domains as string[]
        }

        const votingNode = workflow.nodes.find(n => n.type === 'control.voting-aggregator')
        if (votingNode?.toolConfig?.voting_method) {
          pattern.preferredConfig.votingMethod = votingNode.toolConfig.voting_method
        }
      }
    }

    // 신뢰도/샘플 수 업데이트
    pattern.sampleCount += 1
    pattern.confidence = Math.min(1, 0.5 + (pattern.sampleCount * 0.1))
    pattern.lastUpdated = new Date().toISOString()

    // DB에 저장
    try {
      await invoke('memory_db_execute', {
        sql: `
          INSERT OR REPLACE INTO learned_patterns
          (id, trigger_keywords, category, preferred_config, confidence, sample_count, last_updated)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          pattern.id,
          JSON.stringify(pattern.triggerKeywords),
          pattern.category,
          JSON.stringify(pattern.preferredConfig),
          pattern.confidence,
          pattern.sampleCount,
          pattern.lastUpdated,
        ],
      })
    } catch (error) {
      console.warn('[WorkflowLearningSystem] 패턴 저장 실패:', error)
    }

    console.log(`[WorkflowLearningSystem] 패턴 학습: ${pattern.id}, confidence=${pattern.confidence.toFixed(2)}`)
  }

  /**
   * 학습된 패턴 적용
   */
  applyLearnedPatterns(userRequest: string): Partial<{
    expertCount: number
    domains: string[]
    votingMethod: string
    criteria: string[]
  }> | null {
    const keywords = this.extractKeywords(userRequest)
    const category = this.detectCategory(userRequest)

    // 매칭되는 패턴 찾기 (신뢰도 0.6 이상)
    const matchedPattern = this.patterns.find(p =>
      p.category === category &&
      p.confidence >= 0.6 &&
      p.triggerKeywords.some(k => keywords.includes(k))
    )

    if (matchedPattern) {
      console.log(`[WorkflowLearningSystem] 패턴 적용: ${matchedPattern.id}`)
      return matchedPattern.preferredConfig
    }

    return null
  }

  /**
   * 학습 데이터 내보내기
   */
  async exportLearningData(): Promise<LearningData> {
    await this.initialize()

    // 통계 계산
    const categoryStats: Record<string, { count: number; avgRating: number; totalRating: number }> = {}

    for (const feedback of this.feedbacks) {
      const category = this.detectCategory(feedback.userRequest)
      if (!categoryStats[category]) {
        categoryStats[category] = { count: 0, avgRating: 0, totalRating: 0 }
      }
      categoryStats[category].count += 1
      categoryStats[category].totalRating += feedback.rating
    }

    for (const key of Object.keys(categoryStats)) {
      categoryStats[key].avgRating = categoryStats[key].totalRating / categoryStats[key].count
    }

    const data: LearningData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      feedbacks: this.feedbacks,
      patterns: this.patterns,
      statistics: {
        totalFeedbacks: this.feedbacks.length,
        averageRating: this.feedbacks.length > 0
          ? this.feedbacks.reduce((sum, f) => sum + f.rating, 0) / this.feedbacks.length
          : 0,
        categoryStats: Object.fromEntries(
          Object.entries(categoryStats).map(([k, v]) => [k, { count: v.count, avgRating: v.avgRating }])
        ),
      },
    }

    return data
  }

  /**
   * 학습 데이터 가져오기 (다른 환경에서 내보낸 데이터 적용)
   */
  async importLearningData(data: LearningData): Promise<{ imported: number; skipped: number }> {
    await this.initialize()

    let imported = 0
    let skipped = 0

    // 패턴 가져오기 (병합)
    for (const pattern of data.patterns) {
      const existing = this.patterns.find(p => p.id === pattern.id)

      if (existing) {
        // 더 높은 신뢰도/샘플 수 우선
        if (pattern.confidence > existing.confidence || pattern.sampleCount > existing.sampleCount) {
          Object.assign(existing, pattern)
          imported += 1
        } else {
          skipped += 1
        }
      } else {
        this.patterns.push(pattern)
        imported += 1
      }
    }

    // DB에 저장
    for (const pattern of this.patterns) {
      try {
        await invoke('memory_db_execute', {
          sql: `
            INSERT OR REPLACE INTO learned_patterns
            (id, trigger_keywords, category, preferred_config, confidence, sample_count, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          params: [
            pattern.id,
            JSON.stringify(pattern.triggerKeywords),
            pattern.category,
            JSON.stringify(pattern.preferredConfig),
            pattern.confidence,
            pattern.sampleCount,
            pattern.lastUpdated,
          ],
        })
      } catch (error) {
        console.warn('[WorkflowLearningSystem] 패턴 저장 실패:', error)
      }
    }

    console.log(`[WorkflowLearningSystem] 가져오기 완료: imported=${imported}, skipped=${skipped}`)
    return { imported, skipped }
  }

  /**
   * 학습 데이터 초기화
   */
  async clearLearningData(): Promise<void> {
    this.feedbacks = []
    this.patterns = []

    try {
      await invoke('memory_db_execute', { sql: 'DELETE FROM workflow_feedbacks', params: [] })
      await invoke('memory_db_execute', { sql: 'DELETE FROM learned_patterns', params: [] })
    } catch (error) {
      console.warn('[WorkflowLearningSystem] 데이터 삭제 실패:', error)
    }
  }

  /**
   * 통계 조회
   */
  getStatistics(): {
    totalFeedbacks: number
    totalPatterns: number
    averageRating: number
    highConfidencePatterns: number
  } {
    return {
      totalFeedbacks: this.feedbacks.length,
      totalPatterns: this.patterns.length,
      averageRating: this.feedbacks.length > 0
        ? this.feedbacks.reduce((sum, f) => sum + f.rating, 0) / this.feedbacks.length
        : 0,
      highConfidencePatterns: this.patterns.filter(p => p.confidence >= 0.8).length,
    }
  }

  /**
   * 학습된 패턴 요약 (시스템 프롬프트용)
   */
  getPatternSummary(): string {
    const highConfPatterns = this.patterns.filter(p => p.confidence >= 0.7)
    if (highConfPatterns.length === 0) return ''

    const summaryLines = highConfPatterns.slice(0, 5).map(p => {
      const config = p.preferredConfig
      const parts: string[] = []

      if (config.expertCount) parts.push(`전문가 수: ${config.expertCount}명`)
      if (config.domains?.length) parts.push(`분야: ${config.domains.slice(0, 3).join(', ')}`)
      if (config.votingMethod) parts.push(`투표: ${config.votingMethod}`)

      return `- ${p.category} 작업: ${parts.join(', ')} (신뢰도: ${(p.confidence * 100).toFixed(0)}%)`
    })

    return `이전 사용자 피드백에서 학습된 선호 설정:\n${summaryLines.join('\n')}`
  }

  // 헬퍼 함수들
  private extractKeywords(text: string): string[] {
    const stopWords = ['을', '를', '이', '가', '에', '의', '로', '와', '과', '한', '하는', '있는', '만들', '해줘', '해주세요']
    const words = text.toLowerCase()
      .replace(/[^\w가-힣\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !stopWords.some(s => w.includes(s)))

    return [...new Set(words)]
  }

  private detectCategory(text: string): string {
    const lowerText = text.toLowerCase()
    if (/평가|위원|투표|다수결|전문가|패널|에이전트/.test(lowerText)) return 'multi_agent'
    if (/문서|검색|지식|rag|qa|질문.?답변/.test(lowerText)) return 'rag'
    if (/분석|통계|차트|그래프|데이터|시각화/.test(lowerText)) return 'analysis'
    if (/api|http|외부|연동|웹/.test(lowerText)) return 'integration'
    if (/이미지.*생성|그림/.test(lowerText)) return 'image_generation'
    if (/이미지.*분석|ocr/.test(lowerText)) return 'image_analysis'
    return 'general'
  }
}

// 싱글톤 인스턴스
export const WorkflowLearningSystem = new WorkflowLearningSystemImpl()

// ============================================================
// Design Error Learning System (워크플로우 설계 품질 학습)
// ============================================================

export interface DesignError {
  id: string
  errorType: 'UNREGISTERED_NODE' | 'CONNECTION_ERROR' | 'EXECUTION_ERROR' | 'PORT_MISMATCH'
  invalidValue: string           // 잘못된 노드 타입 또는 연결 패턴
  correctValue?: string          // 올바른 값 (있는 경우)
  promptContext: string          // 어떤 프롬프트에서 발생했는지 (첫 50자)
  count: number                  // 발생 횟수
  lastOccurred: string
}

// ============================================================
// Success Pattern Learning (성공 패턴 학습)
// ============================================================

interface SuccessPattern {
  id: string
  promptKeywords: string[]  // 프롬프트에서 추출한 키워드
  nodeSequence: string[]     // 사용된 노드 타입 시퀀스
  edgePattern: string[]      // 연결 패턴 (예: "io.local-file → convert.doc-parser")
  successCount: number       // 성공 횟수
  lastUsed: string
}

class SuccessPatternLearningSystemImpl {
  private patterns: Map<string, SuccessPattern> = new Map()
  private dbInitialized = false

  async initialize(): Promise<void> {
    if (this.dbInitialized) return
    try {
      await invoke('memory_db_execute', {
        sql: `
          CREATE TABLE IF NOT EXISTS success_patterns (
            id TEXT PRIMARY KEY,
            prompt_keywords TEXT,
            node_sequence TEXT,
            edge_pattern TEXT,
            success_count INTEGER,
            last_used TEXT
          )
        `,
        params: [],
      })
      await this.loadFromDB()
      this.dbInitialized = true
      console.log('[SuccessPatternLearning] 초기화 완료')
    } catch (error) {
      console.warn('[SuccessPatternLearning] DB 초기화 실패, 메모리 모드:', error)
      this.dbInitialized = true  // 메모리 모드로 계속
    }
  }

  private async loadFromDB(): Promise<void> {
    try {
      const rows = await invoke<any[]>('memory_db_query', {
        sql: 'SELECT * FROM success_patterns ORDER BY success_count DESC LIMIT 50',
        params: [],
      })
      for (const row of rows) {
        this.patterns.set(row.id, {
          id: row.id,
          promptKeywords: JSON.parse(row.prompt_keywords || '[]'),
          nodeSequence: JSON.parse(row.node_sequence || '[]'),
          edgePattern: JSON.parse(row.edge_pattern || '[]'),
          successCount: row.success_count,
          lastUsed: row.last_used,
        })
      }
      console.log(`[SuccessPatternLearning] ${this.patterns.size}개 성공 패턴 로드`)
    } catch (error) {
      console.warn('[SuccessPatternLearning] DB 로드 실패:', error)
    }
  }

  /**
   * 성공한 워크플로우 패턴 기록
   */
  async recordSuccess(
    prompt: string,
    nodes: Array<{ type: string }>,
    edges: Array<{ source: string; target: string }>,
  ): Promise<void> {
    await this.initialize()

    // 키워드 추출 (간단한 방식)
    const keywords = prompt.toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 10)

    // 노드 시퀀스
    const nodeSequence = nodes.map(n => n.type)

    // 엣지 패턴 (노드 ID → 노드 타입 변환은 별도 처리 필요)
    const edgePattern = edges.map(e => `${e.source} → ${e.target}`).slice(0, 5)

    const id = nodeSequence.join('→')
    const existing = this.patterns.get(id)

    if (existing) {
      existing.successCount += 1
      existing.lastUsed = new Date().toISOString()
      // 키워드 병합
      const allKeywords = new Set([...existing.promptKeywords, ...keywords])
      existing.promptKeywords = Array.from(allKeywords).slice(0, 20)
    } else {
      this.patterns.set(id, {
        id,
        promptKeywords: keywords,
        nodeSequence,
        edgePattern,
        successCount: 1,
        lastUsed: new Date().toISOString(),
      })
    }

    // DB 저장
    try {
      const pattern = this.patterns.get(id)!
      await invoke('memory_db_execute', {
        sql: `
          INSERT OR REPLACE INTO success_patterns
          (id, prompt_keywords, node_sequence, edge_pattern, success_count, last_used)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        params: [
          pattern.id,
          JSON.stringify(pattern.promptKeywords),
          JSON.stringify(pattern.nodeSequence),
          JSON.stringify(pattern.edgePattern),
          pattern.successCount,
          pattern.lastUsed,
        ],
      })
    } catch (e) {
      console.warn('[SuccessPatternLearning] 저장 실패:', e)
    }

    console.log(`[SuccessPatternLearning] 성공 패턴 기록: ${nodeSequence.join(' → ')} (총 ${this.patterns.get(id)!.successCount}회)`)
  }

  /**
   * 프롬프트에 맞는 성공 패턴 추천
   */
  getSuggestedPatterns(prompt: string): string {
    if (this.patterns.size === 0) return ''

    const promptKeywords = prompt.toLowerCase().split(/\s+/)

    // 키워드 매칭으로 관련 패턴 찾기
    const scored = Array.from(this.patterns.values()).map(p => {
      const matchCount = p.promptKeywords.filter(k => promptKeywords.some(pk => pk.includes(k) || k.includes(pk))).length
      return { pattern: p, score: matchCount * p.successCount }
    }).filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    if (scored.length === 0) return ''

    const lines: string[] = ['## ✅ 검증된 성공 패턴 (이 패턴을 참고하세요!)']
    for (const { pattern } of scored) {
      lines.push(`\n### 패턴: ${pattern.nodeSequence.join(' → ')}`)
      lines.push(`- 성공 횟수: ${pattern.successCount}회`)
      lines.push(`- 관련 키워드: ${pattern.promptKeywords.slice(0, 5).join(', ')}`)
    }

    return lines.join('\n')
  }

  /**
   * 동적 Few-Shot 예시 생성
   */
  getDynamicFewShotExamples(): string {
    const topPatterns = Array.from(this.patterns.values())
      .sort((a, b) => b.successCount - a.successCount)
      .slice(0, 2)

    if (topPatterns.length === 0) return ''

    const examples: string[] = ['## 🎯 검증된 워크플로우 예시 (이 패턴은 실제로 성공했습니다!)']

    for (const pattern of topPatterns) {
      examples.push(`\n**패턴**: \`${pattern.nodeSequence.join(' → ')}\``)
      examples.push(`- 성공 횟수: ${pattern.successCount}회`)
      examples.push(`- 키워드: ${pattern.promptKeywords.slice(0, 3).join(', ')}`)
    }

    return examples.join('\n')
  }
}

export const SuccessPatternLearningSystem = new SuccessPatternLearningSystemImpl()

// ============================================================
// Design Error Learning (설계 오류 학습) - 기존 유지
// ============================================================

class DesignErrorLearningSystemImpl {
  private errors: Map<string, DesignError> = new Map()
  private dbInitialized = false

  /**
   * DB 초기화
   */
  async initialize(): Promise<void> {
    if (this.dbInitialized) return

    try {
      await invoke('memory_db_execute', {
        sql: `
          CREATE TABLE IF NOT EXISTS design_errors (
            id TEXT PRIMARY KEY,
            error_type TEXT,
            invalid_value TEXT,
            correct_value TEXT,
            prompt_context TEXT,
            count INTEGER,
            last_occurred TEXT
          )
        `,
        params: [],
      })

      await this.loadFromDB()
      this.dbInitialized = true
      console.log('[DesignErrorLearning] 초기화 완료')
    } catch (error) {
      console.warn('[DesignErrorLearning] DB 초기화 실패, 메모리 모드:', error)
    }
  }

  private async loadFromDB(): Promise<void> {
    try {
      const rows = await invoke<any[]>('memory_db_query', {
        sql: 'SELECT * FROM design_errors ORDER BY count DESC LIMIT 100',
        params: [],
      })

      for (const row of rows) {
        this.errors.set(row.id, {
          id: row.id,
          errorType: row.error_type,
          invalidValue: row.invalid_value,
          correctValue: row.correct_value,
          promptContext: row.prompt_context,
          count: row.count,
          lastOccurred: row.last_occurred,
        })
      }

      console.log(`[DesignErrorLearning] ${this.errors.size}개 오류 패턴 로드`)
    } catch (error) {
      console.warn('[DesignErrorLearning] DB 로드 실패:', error)
    }
  }

  /**
   * 설계 오류 기록
   */
  async recordError(
    errorType: DesignError['errorType'],
    invalidValue: string,
    promptContext: string,
    correctValue?: string,
  ): Promise<void> {
    await this.initialize()

    const id = `${errorType}:${invalidValue}`
    const existing = this.errors.get(id)

    if (existing) {
      existing.count += 1
      existing.lastOccurred = new Date().toISOString()
      if (correctValue) existing.correctValue = correctValue
    } else {
      this.errors.set(id, {
        id,
        errorType,
        invalidValue,
        correctValue,
        promptContext: promptContext.slice(0, 50),
        count: 1,
        lastOccurred: new Date().toISOString(),
      })
    }

    // DB에 저장
    try {
      const error = this.errors.get(id)!
      await invoke('memory_db_execute', {
        sql: `
          INSERT OR REPLACE INTO design_errors
          (id, error_type, invalid_value, correct_value, prompt_context, count, last_occurred)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          error.id,
          error.errorType,
          error.invalidValue,
          error.correctValue || '',
          error.promptContext,
          error.count,
          error.lastOccurred,
        ],
      })
    } catch (e) {
      console.warn('[DesignErrorLearning] 저장 실패:', e)
    }

    console.log(`[DesignErrorLearning] 오류 기록: ${errorType} - ${invalidValue} (총 ${this.errors.get(id)!.count}회)`)
  }

  /**
   * 시스템 프롬프트용 오류 회피 가이드라인 생성
   */
  getErrorAvoidanceGuidelines(): string {
    if (this.errors.size === 0) return ''

    const topErrors = Array.from(this.errors.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const unregisteredNodes = topErrors.filter(e => e.errorType === 'UNREGISTERED_NODE')
    const connectionErrors = topErrors.filter(e => e.errorType === 'CONNECTION_ERROR')

    const lines: string[] = ['## ⚠️ 자주 발생하는 설계 오류 (반드시 피하세요!)']

    if (unregisteredNodes.length > 0) {
      lines.push('\n### 존재하지 않는 노드 타입 (사용 금지):')
      for (const error of unregisteredNodes.slice(0, 5)) {
        const correction = error.correctValue ? ` → 대신 \`${error.correctValue}\` 사용` : ''
        lines.push(`- ❌ \`${error.invalidValue}\` (${error.count}회 실패)${correction}`)
      }
    }

    if (connectionErrors.length > 0) {
      lines.push('\n### 연결 불가능한 노드 조합:')
      for (const error of connectionErrors.slice(0, 5)) {
        lines.push(`- ❌ ${error.invalidValue} (${error.count}회 실패)`)
      }
    }

    lines.push('\n**위 패턴은 과거 시뮬레이션에서 반복적으로 실패했습니다. 반드시 피하세요!**')

    return lines.join('\n')
  }

  /**
   * 통계 조회
   */
  getStatistics(): {
    totalErrors: number
    byType: Record<string, number>
    topInvalidValues: Array<{ value: string; count: number }>
  } {
    const byType: Record<string, number> = {}
    const topInvalidValues: Array<{ value: string; count: number }> = []

    for (const error of this.errors.values()) {
      byType[error.errorType] = (byType[error.errorType] || 0) + error.count
      topInvalidValues.push({ value: error.invalidValue, count: error.count })
    }

    topInvalidValues.sort((a, b) => b.count - a.count)

    return {
      totalErrors: Array.from(this.errors.values()).reduce((sum, e) => sum + e.count, 0),
      byType,
      topInvalidValues: topInvalidValues.slice(0, 10),
    }
  }

  /**
   * 학습 데이터 초기화
   */
  async clearErrors(): Promise<void> {
    this.errors.clear()
    try {
      await invoke('memory_db_execute', { sql: 'DELETE FROM design_errors', params: [] })
    } catch (e) {
      console.warn('[DesignErrorLearning] 삭제 실패:', e)
    }
  }
}

// 싱글톤 인스턴스
export const DesignErrorLearningSystem = new DesignErrorLearningSystemImpl()

// ============================================================
// Types
// ============================================================

export interface WorkflowNode {
  id: string
  type: string
  label: string
  description: string
  tool?: string
  toolConfig?: Record<string, any>
  position: { x: number; y: number }
  reasoning: string  // 왜 이 노드가 필요한지 설명
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  label?: string
  condition?: string
}

export interface WorkflowDesign {
  name: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  summary: string
  reasoning: string  // 전체 워크플로우 설계 이유
  suggestions: string[]  // 추가 개선 제안
}

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  workflowSnapshot?: WorkflowDesign  // 해당 시점의 워크플로우
}

export interface AgentSession {
  id: string
  conversation: ConversationTurn[]
  currentWorkflow: WorkflowDesign | null
  userPreferences: Record<string, any>
  createdAt: string
  updatedAt: string
}

// ============================================================
// MCP Tool Knowledge Base
// ============================================================

const MCP_TOOL_KNOWLEDGE = {
  // 기본 도구
  text_transform: {
    category: '텍스트 처리',
    useCases: ['대소문자 변환', 'Base64 인코딩/디코딩', 'URL 인코딩/디코딩', '문자열 정규화'],
    bestFor: '텍스트 전처리, 데이터 정규화, 포맷 변환',
    commonPairs: ['json_process', 'data_transform'],
  },
  json_process: {
    category: '데이터 처리',
    useCases: ['JSON 파싱', 'JSONPath 쿼리', 'JSON 포맷팅', '스키마 검증'],
    bestFor: 'API 응답 처리, 데이터 추출, 구조 변환',
    commonPairs: ['http_request', 'data_transform'],
  },
  math_calculate: {
    category: '계산/분석',
    useCases: ['수식 계산', '통계 분석', '단위 변환', '백분율 계산'],
    bestFor: '데이터 분석, 수치 처리, 통계 산출',
    commonPairs: ['chart_generate', 'data_transform'],
  },
  datetime: {
    category: '시간 처리',
    useCases: ['현재 시간', '날짜 포맷 변환', '날짜 계산', '타임존 변환'],
    bestFor: '일정 관리, 타임스탬프 처리, 기간 계산',
    commonPairs: ['text_transform'],
  },
  chart_generate: {
    category: '시각화',
    useCases: ['바 차트', '라인 차트', '파이 차트', '데이터 시각화'],
    bestFor: '보고서 생성, 데이터 시각화, 대시보드',
    commonPairs: ['math_calculate', 'data_transform'],
  },
  http_request: {
    category: '외부 연동',
    useCases: ['API 호출', '웹 데이터 가져오기', 'REST 요청'],
    bestFor: '외부 서비스 연동, 데이터 수집, API 통합',
    commonPairs: ['json_process', 'data_transform'],
  },
  regex: {
    category: '패턴 처리',
    useCases: ['패턴 매칭', '텍스트 추출', '치환', '분할'],
    bestFor: '데이터 검증, 정보 추출, 텍스트 정제',
    commonPairs: ['text_transform', 'data_transform'],
  },
  crypto_utils: {
    category: '보안/암호화',
    useCases: ['UUID 생성', '해시 계산', '랜덤 문자열', 'HMAC'],
    bestFor: '보안 처리, 고유 ID 생성, 데이터 무결성',
    commonPairs: ['text_transform'],
  },
  data_transform: {
    category: '데이터 변환',
    useCases: ['CSV→JSON', 'JSON→마크다운', 'XML 변환', '포맷 변환'],
    bestFor: '데이터 포맷 변환, 보고서 생성, 데이터 이관',
    commonPairs: ['json_process', 'chart_generate'],
  },

  // 고급 도구 (RAG)
  rag_ingest: {
    category: 'RAG',
    useCases: ['문서 인제스트', '지식베이스 구축', '임베딩 생성'],
    bestFor: '문서 기반 Q&A 시스템, 지식 관리, 검색 시스템',
    commonPairs: ['rag_query', 'rag_generate', 'kb_create'],
  },
  rag_query: {
    category: 'RAG',
    useCases: ['시맨틱 검색', '문서 검색', '유사 문서 찾기'],
    bestFor: '지식 검색, 관련 문서 찾기, 컨텍스트 수집',
    commonPairs: ['rag_ingest', 'rag_generate'],
  },
  rag_generate: {
    category: 'RAG',
    useCases: ['RAG 기반 응답', '문서 기반 답변', '출처 포함 생성'],
    bestFor: '문서 기반 Q&A, 컨텍스트 인식 응답, 지식 활용',
    commonPairs: ['rag_query', 'rag_ingest'],
  },

  // 고급 도구 (S3)
  s3_upload: {
    category: 'AWS S3',
    useCases: ['파일 업로드', '백업', '클라우드 저장'],
    bestFor: '데이터 백업, 파일 공유, 클라우드 저장소',
    commonPairs: ['s3_download', 's3_list', 'rag_ingest'],
  },
  s3_download: {
    category: 'AWS S3',
    useCases: ['파일 다운로드', '데이터 가져오기'],
    bestFor: '클라우드 데이터 활용, 파일 복원',
    commonPairs: ['s3_list', 'rag_ingest'],
  },
  s3_list: {
    category: 'AWS S3',
    useCases: ['버킷 탐색', '파일 목록', '폴더 구조'],
    bestFor: '데이터 탐색, 파일 관리, 인벤토리',
    commonPairs: ['s3_download', 's3_upload'],
  },

  // 고급 도구 (KB)
  kb_create: {
    category: '지식베이스',
    useCases: ['지식베이스 생성', 'KB 설정'],
    bestFor: 'RAG 시스템 구축, 문서 관리 시스템',
    commonPairs: ['rag_ingest', 'kb_list'],
  },
  kb_list: {
    category: '지식베이스',
    useCases: ['KB 목록', '상태 확인'],
    bestFor: 'KB 관리, 모니터링',
    commonPairs: ['kb_create', 'rag_query'],
  },

  // 고급 도구 (에이전트)
  agent_invoke: {
    category: 'AI 에이전트',
    useCases: ['에이전트 호출', '멀티스텝 처리', '자동화'],
    bestFor: '복잡한 작업 자동화, 다단계 처리',
    commonPairs: ['rag_generate', 'http_request'],
  },

  // 고급 도구 (비전)
  vision_analyze: {
    category: '비전/멀티모달',
    useCases: ['이미지 분석', 'OCR', '문서 이해', '차트 분석'],
    bestFor: '이미지 처리, 문서 디지털화, 시각 데이터 분석',
    commonPairs: ['data_transform', 'rag_ingest', 'image_generate'],
  },

  // 고급 도구 (이미지 생성)
  image_generate: {
    category: '이미지 생성',
    useCases: ['텍스트→이미지', 'AI 아트', '일러스트 생성', '컨셉 아트'],
    bestFor: '이미지 생성, 시각 콘텐츠 제작, 디자인 프로토타입',
    commonPairs: ['vision_analyze', 'data_transform'],
  },
}

// ============================================================
// Workflow Templates
// ============================================================

/**
 * 워크플로우 템플릿 - 실제 등록된 노드 타입 사용
 *
 * 실제 등록된 노드 타입:
 * - rag.retriever, rag.context-builder
 * - data.file-loader, data.preprocess
 * - storage.local, storage.cloud, storage.unified
 * - convert.doc-parser
 * - text.splitter
 * - prompt.template, prompt.agent, prompt.few-shot, prompt.cot
 * - ai.llm-invoke, ai.embedding
 * - control.merge, control.conditional, control.voting-aggregator
 * - agent.persona
 * - api.http-request
 * - viz.result-viewer, viz.chart, viz.table, viz.stats
 */
const WORKFLOW_TEMPLATES: Record<string, {
  name: string
  description: string
  nodes: Array<{
    type: string
    label: string
    description: string
    config?: Record<string, any>
  }>
  pattern: 'sequential' | 'parallel_then_aggregate'
}> = {
  // RAG 문서 Q&A 파이프라인
  'rag': {
    name: '문서 기반 Q&A 시스템',
    description: '문서를 파싱하고, 청킹하고, 임베딩하여 질문에 답변하는 RAG 파이프라인',
    nodes: [
      { type: 'io.local-file', label: '문서 입력', description: '문서 파일 선택' },
      { type: 'convert.doc-parser', label: '문서 파싱', description: 'PDF, Word 등 문서를 텍스트로 변환' },
      { type: 'text.splitter', label: '텍스트 청킹', description: '긴 텍스트를 의미 단위로 분할' },
      { type: 'ai.embedding', label: '임베딩 생성', description: '텍스트를 벡터로 변환하여 검색 가능하게 함' },
      { type: 'rag.retriever', label: 'RAG 검색', description: '질문과 유사한 문서 청크 검색', config: { search_mode: 'hybrid', top_k: 5 } },
      { type: 'rag.context-builder', label: '컨텍스트 구성', description: '검색 결과를 LLM 프롬프트로 조합' },
      { type: 'ai.llm-invoke', label: 'LLM 응답', description: '컨텍스트 기반으로 질문에 답변 생성' },
    ],
    pattern: 'sequential',
  },

  // 데이터 분석 파이프라인
  'analysis': {
    name: '데이터 분석 파이프라인',
    description: '데이터를 로드, 전처리, 분석, 시각화하는 워크플로우',
    nodes: [
      { type: 'data.file-loader', label: '데이터 로드', description: 'CSV, Excel, JSON 파일 로드' },
      { type: 'data.preprocess', label: '데이터 전처리', description: '필터링, 변환, 정제' },
      { type: 'ai.llm-invoke', label: 'AI 분석', description: 'LLM으로 데이터 패턴 분석' },
      { type: 'viz.chart', label: '차트 생성', description: '분석 결과 시각화' },
      { type: 'viz.stats', label: '통계 요약', description: '주요 통계량 표시' },
    ],
    pattern: 'sequential',
  },

  // 다중 에이전트 평가 시스템
  'multi_agent': {
    name: '다중 에이전트 평가 시스템',
    description: '여러 전문가 에이전트가 평가하고 투표하는 시스템',
    nodes: [
      { type: 'io.local-file', label: '문서 입력', description: '평가 대상 문서 선택' },
      { type: 'convert.doc-parser', label: '문서 파싱', description: '평가 대상 문서 파싱' },
      { type: 'agent.persona', label: '전문가 1', description: '첫 번째 전문가 평가', config: { persona_name: '전문가 A', experience_level: 'expert' } },
      { type: 'agent.persona', label: '전문가 2', description: '두 번째 전문가 평가', config: { persona_name: '전문가 B', experience_level: 'senior' } },
      { type: 'agent.persona', label: '전문가 3', description: '세 번째 전문가 평가', config: { persona_name: '전문가 C', experience_level: 'expert' } },
      { type: 'control.voting-aggregator', label: '투표 집계', description: '평가 결과 종합 및 다수결 판정' },
    ],
    pattern: 'parallel_then_aggregate',
  },

  // 문서 처리 파이프라인
  'vision': {
    name: '문서 처리 파이프라인',
    description: '문서를 읽고, 변환하고, 저장하는 워크플로우',
    nodes: [
      { type: 'data.file-loader', label: '파일 입력', description: '문서/이미지 파일 로드' },
      { type: 'convert.doc-parser', label: '문서 파싱', description: '다양한 포맷의 문서 파싱' },
      { type: 'text.splitter', label: '텍스트 분할', description: '긴 문서를 청크로 분할' },
      { type: 'storage.local', label: '로컬 저장', description: '처리 결과 저장' },
    ],
    pattern: 'sequential',
  },

  // API 통합 워크플로우
  'integration': {
    name: 'API 통합 워크플로우',
    description: '외부 API와 연동하여 데이터를 처리하는 시스템',
    nodes: [
      { type: 'api.http-request', label: 'API 호출', description: 'REST API에서 데이터 가져오기', config: { method: 'GET' } },
      { type: 'data.preprocess', label: '데이터 처리', description: 'JSON 응답 파싱 및 변환' },
      { type: 'ai.llm-invoke', label: 'AI 분석', description: 'LLM으로 데이터 분석' },
      { type: 'viz.result-viewer', label: '결과 표시', description: '처리 결과 시각화' },
    ],
    pattern: 'sequential',
  },

  // 기본 처리 워크플로우
  'general': {
    name: '기본 데이터 처리 워크플로우',
    description: '텍스트와 데이터를 처리하는 범용 워크플로우',
    nodes: [
      { type: 'data.file-loader', label: '데이터 입력', description: '파일 또는 텍스트 입력' },
      { type: 'prompt.template', label: '프롬프트 구성', description: '입력을 프롬프트로 변환' },
      { type: 'ai.llm-invoke', label: 'AI 처리', description: 'LLM으로 텍스트 처리' },
      { type: 'viz.result-viewer', label: '결과 표시', description: '처리 결과 출력' },
    ],
    pattern: 'sequential',
  },

  // 이미지 생성 워크플로우
  'image_generation': {
    name: 'AI 이미지 생성 파이프라인',
    description: '텍스트 프롬프트로 이미지를 생성하고 분석하는 워크플로우',
    nodes: [
      { type: 'prompt.template', label: '프롬프트 구성', description: '이미지 생성용 프롬프트 최적화' },
      { type: 'vision.generate', label: '이미지 생성', description: 'Titan Image로 이미지 생성' },
      { type: 'vision.analyze', label: '이미지 검증', description: '생성된 이미지 품질 분석' },
      { type: 'storage.local', label: '이미지 저장', description: '생성된 이미지 로컬 저장' },
    ],
    pattern: 'sequential',
  },

  // 이미지 분석 워크플로우
  'image_analysis': {
    name: '이미지/문서 분석 파이프라인',
    description: '이미지나 문서를 분석하여 텍스트와 데이터를 추출하는 워크플로우',
    nodes: [
      { type: 'data.file-loader', label: '이미지/문서 입력', description: '분석할 파일 로드' },
      { type: 'vision.analyze', label: '비전 분석', description: 'Claude Vision으로 이미지 분석' },
      { type: 'ai.llm-invoke', label: 'AI 해석', description: '분석 결과 해석 및 정리' },
      { type: 'viz.result-viewer', label: '결과 표시', description: '분석 결과 시각화' },
    ],
    pattern: 'sequential',
  },
}

// ============================================================
// Integrated Workflow Agent
// ============================================================

class IntegratedWorkflowAgentImpl {
  private sessions: Map<string, AgentSession> = new Map()

  /**
   * 시스템 프롬프트 생성 - 동적으로 등록된 노드 정보 포함
   */
  private buildSystemPrompt(): string {
    // MCP 도구 목록
    const toolList = Object.entries(MCP_TOOL_KNOWLEDGE)
      .map(([name, info]) => `- **${name}** (${info.category}): ${info.bestFor}`)
      .join('\n')

    // 학습된 패턴 정보 (있으면)
    const learnedPatternInfo = WorkflowLearningSystem.getPatternSummary()

    // 설계 오류 회피 가이드라인 (강화학습 기반)
    const errorAvoidanceGuidelines = DesignErrorLearningSystem.getErrorAvoidanceGuidelines()

    // 성공 패턴 추천 (강화학습 - 성공 사례)
    const successPatternExamples = SuccessPatternLearningSystem.getDynamicFewShotExamples()

    // RL 시스템 학습 인사이트 (비동기 호출 불가, 캐싱된 값 사용)
    let rlInsights = ''
    try {
      // @ts-ignore - 동적 임포트로 순환 참조 방지
      const { ReinforcementLearningSystem } = require('./ReinforcementLearningSystem')
      // Note: 동기 호출이 필요하므로 캐싱된 인사이트 사용
    } catch {
      // RL 시스템 미초기화 시 무시
    }

    return `당신은 Handbox 통합 워크플로우 생성 에이전트입니다.

## 🎯 핵심 목표: NotebookLM을 능가하는 워크플로우 생성
- **추론 능력**: 단순 나열이 아닌, 논리적 추론과 근거 제시
- **결과물 품질**: 명확하고 실행 가능한 워크플로우
- **설명 가능성**: 왜 이 구조인지 사용자가 이해할 수 있도록

## 핵심 역할 - 가장 중요!
**사용자의 모든 요청에 대해 워크플로우를 자유롭게 설계할 수 있습니다.**
- 미리 정의된 템플릿에 제한받지 마세요
- 사용자의 의도를 파악하고 창의적으로 노드를 조합하세요
- 불확실하면 질문하되, 완벽히 이해했다면 바로 워크플로우를 설계하세요

## 의미론적 이해 - 매우 중요!
사용자의 요청에서 숨겨진 의미를 파악하세요:

### 숫자/수량 감지
- "50건의 논문", "수십 개의 파일", "다수의 문서" → \`io.local-folder\` (다중 파일)
- "이 파일", "한 개의 문서" → \`io.local-file\` (단일 파일)

### 데이터 규모 추론
- 대량 데이터 → 청킹(\`text.splitter\`) + 배치 처리 고려
- 소량 데이터 → 직접 처리 가능

### 복잡도 추론
- "비교", "종합", "통합 분석" → 병렬 처리 + 병합 필요
- "각각", "개별적으로" → 반복/배치 구조
- "전문가 의견", "다양한 관점" → 다중 에이전트

### 출력 형식 추론
- "보고서", "리포트" → 문서 내보내기 노드
- "차트", "그래프", "시각화" → \`viz.chart\`
- "비교 분석" → \`viz.table\` 또는 \`viz.stats\`

### 예시
- "50건의 논문을 분석해서 트렌드 파악" →
  - \`io.local-folder\` (다중 파일 로드)
  - \`convert.doc-parser\` (PDF→텍스트)
  - \`text.splitter\` (대량 텍스트 청킹)
  - \`ai.llm-invoke\` (분석)
  - \`viz.chart\` (트렌드 시각화)

- "계약서 검토해줘" →
  - \`io.local-file\` (단일 파일)
  - \`convert.doc-parser\` (문서 파싱)
  - \`ai.llm-invoke\` (법률 검토 프롬프트)
  - \`viz.result-viewer\` (결과 표시)

## 사용 가능한 모든 노드 타입 (전체 목록)

### 입출력 (IO)
- \`io.local-folder\`: 로컬 폴더의 파일들 로드 (다중 파일)
- \`io.local-file\`: 로컬 파일 선택 및 읽기
- \`data.file-loader\`: 파일 데이터 로드 (CSV, JSON, Excel)

### 문서 처리 (Document)
- \`convert.doc-parser\`: PDF, Word, HWP, Excel 등 문서 텍스트 추출

### 텍스트 처리 (Text)
- \`text.splitter\`: 텍스트 청킹 (RAG용 문서 분할)
- \`data.preprocess\`: JavaScript/Python 스크립트로 데이터 변환

### 프롬프트 엔지니어링 (Prompt)
- \`prompt.template\`: 템플릿 변수로 프롬프트 구성
- \`prompt.cot\`: Chain-of-Thought (단계별 추론 유도)
- \`prompt.few-shot\`: Few-Shot 예시 프롬프트
- \`prompt.agent\`: 에이전트형 프롬프트

### AI 모델 (AI)
- \`ai.llm-invoke\`: LLM 호출 (Bedrock, Ollama, OpenAI 등)
- \`ai.embedding\`: 텍스트 벡터화 (임베딩 생성)

### RAG (검색 증강 생성)
- \`rag.retriever\`: 벡터 또는 키워드 검색
- \`rag.context-builder\`: 검색 결과를 LLM 컨텍스트로 조합

### 스토리지
- \`storage.local\`: 로컬 파일 저장
- \`storage.cloud\`: 클라우드(S3) 저장
- \`storage.unified\`: 통합 스토리지 관리

### 제어 흐름 (Control)
- \`control.merge\`: 여러 입력 병합 (병렬 → 단일)
- \`control.conditional\`: 조건 분기 (IF-ELSE)
- \`control.sub-workflow\`: 서브 워크플로우 호출
- \`control.voting-aggregator\`: 다수결 투표 집계
- \`control.cli\`: CLI 명령 실행
- \`control.script\`: 스크립트 실행

### 에이전트 (Agent)
- \`agent.persona\`: 페르소나 기반 전문가 에이전트
  - toolConfig: persona_name, domain, experience_level, evaluation_criteria, system_prompt

### 시각화 (Visualization)
- \`viz.result-viewer\`: 결과 텍스트 표시
- \`viz.json-viewer\`: JSON 트리 뷰어
- \`viz.chart\`: 차트 (bar, line, pie, scatter)
- \`viz.table\`: 테이블 뷰어
- \`viz.stats\`: 통계 요약 (평균, 분포 등)

### 비전 (Vision/Multimodal)
- \`vision.analyze\`: 이미지 분석 (Claude Vision)
- \`vision.generate\`: 이미지 생성 (Titan Image)

### API 연동
- \`api.http-request\`: HTTP 요청 (GET, POST 등)

### 내보내기 (Export)
- \`export.excel\`: Excel 파일 생성

⚠️ **중요: 위 목록에 없는 노드 타입은 절대 사용하지 마세요!**
- ❌ \`cross_reference_analyzer\` - 존재하지 않음
- ❌ \`retrieve_context\` - 존재하지 않음 (RAG 검색은 \`rag.retriever\` 사용)
- ❌ \`data_analyzer\` - 존재하지 않음
- ❌ \`text_processor\` - 존재하지 않음
- ❌ \`document_parser\` - 존재하지 않음 (문서 파싱은 \`convert.doc-parser\` 사용)
- ❌ \`llm_invoke\` - 존재하지 않음 (LLM 호출은 \`ai.llm-invoke\` 사용)
- ❌ \`text_preprocessing\` - 존재하지 않음 (전처리는 \`data.preprocess\` 사용)
- ❌ \`result_view\` - 존재하지 않음 (결과 표시는 \`viz.result-viewer\` 사용)
- ❌ \`vector_search\` - 존재하지 않음 (벡터 검색은 \`rag.retriever\` 사용)
- ❌ \`display_results\` - 존재하지 않음 (결과 표시는 \`viz.result-viewer\` 사용)
- ❌ \`kb.create\`, \`kb.query\` - Knowledge Base 노드는 없음 (RAG는 \`rag.retriever\` 사용)
- ❌ \`retrieve\` - 존재하지 않음 (RAG 검색은 \`rag.retriever\` 사용)
- ❌ \`retrieve_relevant_laws\`, \`analyze_additions\` - 함수 이름 형식 불가! (\`rag.retriever\`, \`ai.llm-invoke\` 사용)
- ❌ \`extract_*\`, \`analyze_*\`, \`process_*\`, \`get_*\`, \`search_*\` - 함수명 패턴 노드는 존재하지 않음
- ❌ \`search_docs\` - 존재하지 않음 (문서 검색은 \`rag.retriever\` 사용)
- ❌ \`image_analysis\` - 존재하지 않음 (이미지 분석은 \`vision.image-analyzer\` 사용)
- ❌ \`result_display\` - 존재하지 않음 (결과 표시는 \`viz.result-viewer\` 사용)

⚠️ **중요: 노드 타입 명명 규칙**
- ✅ 정확한 노드 타입만 사용: \`io.local-file\`, \`ai.llm-invoke\`, \`viz.result-viewer\` 등
- ✅ **노드 타입은 반드시 "카테고리.이름" 형식입니다** (예: io.local-file, ai.llm-invoke)
- ✅ **벡터 저장/검색**: \`ai.embedding\` → \`rag.retriever\` (kb.* 노드 없음)
- ❌ **절대 금지**: 함수명처럼 생긴 노드 타입 (예: retrieve_relevant_laws, analyze_additions, extract_data)
- ❌ 위 Available Nodes 카탈로그에 없는 노드 타입은 생성 불가

⚠️ **시작 노드 연결 금지**: 다음 노드들은 입력이 없으므로 다른 노드에서 연결할 수 없습니다:
- \`io.local-folder\`, \`io.local-file\`, \`data.file-loader\` - 시작 노드끼리 연결 불가
- ❌ 잘못된 예: \`io.local-file → data.file-loader\` (둘 다 시작 노드)

⚠️ **필수 입력 연결**: 다음 노드들은 반드시 입력이 연결되어야 합니다:
- \`convert.doc-parser\` - 반드시 파일 소스(\`io.local-file\`)에서 연결 필요
- \`prompt.few-shot\` - 반드시 텍스트 입력(\`variable.input\` 또는 다른 노드 출력)에서 연결 필요
- \`ai.llm-invoke\` - 반드시 프롬프트 입력이 필요
- \`rag.retriever\` - 반드시 쿼리 텍스트 입력이 필요
- ❌ 모든 처리 노드는 입력 없이 사용 불가!

## MCP 도구 (확장)
${toolList}

## 워크플로우 설계 원칙

### 1. 자유로운 조합
어떤 노드든 논리적으로 연결 가능하면 사용하세요:
- 파일 → LLM → 차트 (데이터 분석)
- 이미지 → 비전분석 → LLM → 결과 (이미지 이해)
- 입력 → 에이전트A,B,C(병렬) → 투표 → 결과 (다중 평가)
- 문서 → 청킹 → 임베딩 → 검색 → LLM (RAG)

### 2. 병렬 구조 활용
동시에 처리 가능한 작업은 병렬로:
- 하나의 입력 → 여러 노드로 분기
- 병렬 결과 → merge 또는 voting-aggregator로 집계

### 3. 조건 분기
결과에 따라 다른 경로:
- conditional 노드로 true/false 분기
- 점수나 조건에 따른 다른 처리

## 워크플로우 JSON 출력 형식
\`\`\`workflow
{
  "name": "워크플로우 이름",
  "description": "무엇을 하는 워크플로우인지 설명",
  "nodes": [
    {
      "id": "unique_id",
      "type": "노드.타입",
      "label": "사용자에게 보이는 이름",
      "description": "노드 설명",
      "toolConfig": { ... 설정 ... },
      "reasoning": "왜 이 노드가 필요한지"
    }
  ],
  "edges": [
    {"source": "소스노드id", "target": "타겟노드id"}
  ],
  "reasoning": "전체 워크플로우 설계 이유",
  "suggestions": ["개선 가능한 포인트들"]
}
\`\`\`

${learnedPatternInfo ? `## 학습된 사용자 선호 패턴\n${learnedPatternInfo}\n` : ''}

${successPatternExamples ? `${successPatternExamples}\n` : ''}

${errorAvoidanceGuidelines ? `${errorAvoidanceGuidelines}\n` : ''}

${getConnectionRulesSummary()}

## 핵심 규칙
1. **노드 연결 규칙 필수 준수** - 위 연결 규칙에 따라 노드를 연결하세요
2. **템플릿에 얽매이지 마세요** - 사용자 요청에 맞게 자유롭게 설계
3. **모든 노드 타입 활용 가능** - 위 목록의 모든 노드 사용 가능
4. **논리적 흐름 중시** - 데이터가 어떻게 흐르는지 명확하게
5. **reasoning 필수** - 각 노드와 전체 설계의 이유 설명
6. **워크플로우 블록 필수** - 워크플로우 생성 시 반드시 \`\`\`workflow 블록 사용

**중요: 노드 연결 시 반드시 위 "노드 연결 규칙"을 확인하세요!**

## 🧠 설명 가이드라인 (XAI - 설명 가능한 AI)

응답 시 **단계별로 생각하며(Think step by step)** 다음을 포함하세요:

### 1. 직관적 설명 (Intuitiveness)
- 전문 용어 대신 **일상어**로 설명: "파싱한다" → "읽어서 텍스트로 변환한다"
- 비유와 예시 활용: "마치 비서가 문서를 정리하듯이..."
- 구조화된 설명 (번호, 불릿, 화살표 →)

### 2. 투명한 근거 (Transparency)
- **왜** 이 워크플로우인지 설명: "~하기 위해서", "~때문에"
- 각 노드가 **왜 필요한지** 구체적 이유 제시
- 데이터가 **어떻게 흐르는지** 단계별 설명

### 3. 불확실성 표현 (Uncertainty)
- 한계점 솔직히 언급: "다만, ~한 경우에는 추가 조정이 필요할 수 있습니다"
- 확신 수준 표현: "대부분의 경우", "일반적으로", "상황에 따라"
- 추가 정보 필요 시 질문

### 4. 대안 제시 (Alternatives)
- 다른 접근법 언급: "또는 ~방식도 가능합니다"
- 장단점 비교: "A는 빠르지만 정확도가 낮고, B는 느리지만 정확합니다"
- 사용자 선택지 제공

### 5. 사용자 맞춤 (User Context)
- 사용자 요청 재확인: "~라고 요청하셨는데"
- 맥락 반영: "~을 고려하여"
- 개인화된 제안: "귀하의 상황에는 ~가 적합합니다"

**응답 예시:**
"먼저 PDF 파일들을 **읽어서 텍스트로 변환**합니다 (왜냐하면 LLM이 텍스트만 처리할 수 있기 때문입니다).
다음으로 긴 문서를 **작은 조각으로 나눕니다** (한 번에 처리하기엔 너무 길기 때문입니다).
다만, 문서가 매우 짧다면 이 단계는 생략할 수 있습니다.
또는, 요약 대신 핵심 키워드만 추출하는 방식도 가능합니다."

사용자의 창의적 요청에 유연하게 대응하세요!`
  }

  /**
   * 학습된 패턴 요약 (시스템 프롬프트용)
   */
  static getPatternSummary(): string {
    return WorkflowLearningSystem.getPatternSummary()
  }

  /**
   * 사용자 의도 분석
   * 의미론적 이해 강화: 수량, 규모, 복잡도 추론
   */
  private analyzeIntent(message: string): {
    category: string
    keywords: string[]
    suggestedTools: string[]
    clarifyingQuestions: string[]
    semanticHints: {
      isMultiFile: boolean
      isLargeScale: boolean
      needsParallel: boolean
      outputFormat?: string
    }
  } {
    const lowerMessage = message.toLowerCase()
    const keywords: string[] = []
    const suggestedTools: string[] = []
    const clarifyingQuestions: string[] = []
    let category = 'general'

    // ================================================================
    // 의미론적 분석 (Semantic Analysis)
    // ================================================================

    const semanticHints = {
      isMultiFile: false,
      isLargeScale: false,
      needsParallel: false,
      outputFormat: undefined as string | undefined,
    }

    // 다중 파일 감지 - 숫자 + 파일 관련 단어
    const multiFilePatterns = [
      /(\d+)\s*(건|개|편|장|권|부|매).*?(논문|문서|파일|보고서|계약서|자료)/,
      /(수십|수백|수천|많은|다수|여러|모든|전체).*?(논문|문서|파일|보고서|자료)/,
      /(폴더|디렉토리|디렉터리).*?(내|안|속|에서)/,
      /일괄|배치|대량|bulk/,
    ]

    if (multiFilePatterns.some(p => p.test(lowerMessage))) {
      semanticHints.isMultiFile = true
      keywords.push('다중 파일', '폴더 처리')
      suggestedTools.push('io.local-folder', 'text.splitter')
    }

    // 대규모 처리 감지
    const largeScalePatterns = [
      /(\d{2,})\s*(건|개|편|페이지|mb|gb)/,
      /(수십|수백|수천|많은|대량|방대한)/,
    ]

    if (largeScalePatterns.some(p => p.test(lowerMessage))) {
      semanticHints.isLargeScale = true
      keywords.push('대규모 처리')
      suggestedTools.push('text.splitter', 'data.preprocess')
    }

    // 병렬 처리 필요 감지
    const parallelPatterns = [
      /(비교|대조|versus|vs)/,
      /(각각|개별|별도로|동시에)/,
      /(다양한|여러|복수).*?(관점|의견|분석)/,
    ]

    if (parallelPatterns.some(p => p.test(lowerMessage))) {
      semanticHints.needsParallel = true
      keywords.push('병렬 처리')
      suggestedTools.push('control.merge')
    }

    // 출력 형식 추론
    if (/보고서|리포트|report/.test(lowerMessage)) {
      semanticHints.outputFormat = 'report'
      suggestedTools.push('export.excel')
    } else if (/차트|그래프|시각화/.test(lowerMessage)) {
      semanticHints.outputFormat = 'chart'
      suggestedTools.push('viz.chart')
    } else if (/표|테이블|정리/.test(lowerMessage)) {
      semanticHints.outputFormat = 'table'
      suggestedTools.push('viz.table')
    }

    // ================================================================
    // 카테고리 분류 (기존 로직 + 의미론적 힌트 반영)
    // ================================================================

    // RAG 관련 - 다중 파일이면 더 복잡한 RAG 파이프라인
    if (/문서|검색|지식|rag|qa|질문.?답변/.test(lowerMessage)) {
      category = 'rag'
      keywords.push('문서 기반', 'RAG', '지식베이스')
      suggestedTools.push('rag.retriever', 'rag.context-builder', 'ai.embedding')

      if (semanticHints.isMultiFile) {
        clarifyingQuestions.push('폴더 경로를 지정해주세요.')
      } else {
        clarifyingQuestions.push('어떤 종류의 문서를 사용하시나요?')
      }
    }

    // 데이터 분석
    if (/분석|통계|차트|그래프|데이터|시각화/.test(lowerMessage)) {
      category = 'analysis'
      keywords.push('데이터 분석', '시각화', '통계')
      suggestedTools.push('viz.stats', 'viz.chart', 'data.preprocess')

      if (semanticHints.isLargeScale) {
        clarifyingQuestions.push('대량 데이터 처리가 필요합니다. 샘플링이 필요한가요?')
      }
    }

    // 다중 에이전트/평가
    if (/평가|위원|투표|다수결|전문가|패널|에이전트/.test(lowerMessage)) {
      category = 'multi_agent'
      keywords.push('다중 에이전트', '평가', '투표')
      suggestedTools.push('agent_invoke', 'math_calculate')
      clarifyingQuestions.push(
        '몇 명의 평가자(에이전트)가 필요하신가요?',
        '평가 기준은 어떻게 되나요?',
        '투표 방식은 다수결인가요, 가중 투표인가요?',
      )
    }

    // API 연동
    if (/api|http|외부|연동|웹|크롤/.test(lowerMessage)) {
      category = 'integration'
      keywords.push('API', '외부 연동', '데이터 수집')
      suggestedTools.push('http_request', 'json_process')
      clarifyingQuestions.push(
        '연동할 API의 종류는 무엇인가요?',
        '인증이 필요한 API인가요?',
      )
    }

    // 이미지/문서 분석
    if (/이미지.*분석|ocr|스캔|사진.*분석|pdf|문서.*인식/.test(lowerMessage)) {
      category = 'image_analysis'
      keywords.push('이미지 분석', 'OCR', '문서 스캔')
      suggestedTools.push('vision_analyze', 'data_transform')
      clarifyingQuestions.push(
        '처리할 이미지/문서의 종류는 무엇인가요?',
        '추출하고 싶은 정보가 무엇인가요?',
      )
    }

    // 이미지 생성
    if (/이미지.*생성|그림.*그|일러스트|아트|그래픽.*생성|ai.*이미지|titan.*image/.test(lowerMessage)) {
      category = 'image_generation'
      keywords.push('이미지 생성', 'AI 아트', 'Titan Image')
      suggestedTools.push('image_generate', 'vision_analyze')
      clarifyingQuestions.push(
        '어떤 스타일의 이미지를 원하시나요? (사진, 일러스트, 아트 등)',
        '이미지 크기는 어떻게 하시겠어요? (512x512, 1024x1024 등)',
      )
    }

    return { category, keywords, suggestedTools, clarifyingQuestions, semanticHints }
  }

  /**
   * 다중 에이전트 요청의 필수 정보 확인
   * 더 유연한 처리: 전문가 수만 필수, 나머지는 기본값 적용 가능
   */
  private checkMultiAgentRequirements(message: string): string[] {
    const missing: string[] = []
    const lowerMessage = message.toLowerCase()

    // 전문가 수 확인 - 이것만 필수! (또는 학습된 패턴이 있으면 생략 가능)
    const numberMatch = message.match(/(\d+)\s*(명|인|개|위원|전문가|에이전트|평가자)/)
    const learnedConfig = WorkflowLearningSystem.applyLearnedPatterns(message)

    if (!numberMatch && !learnedConfig?.expertCount) {
      missing.push('몇 명의 전문가(에이전트)가 필요하신가요? (예: 5명, 10명)')
    }

    // 평가 대상 또는 분야가 전혀 없는 경우만 질문
    // 대부분의 경우 컨텍스트에서 추론 가능
    const hasDomainInfo = /분야|전문|관점|기준|평가|구조|재료|시공|경제|안전|환경|법|정책|기술/.test(lowerMessage)
    const hasTargetInfo = /평가|심사|검토|분석|판단/.test(lowerMessage)

    if (!hasDomainInfo && !hasTargetInfo && !learnedConfig?.domains) {
      missing.push('어떤 분야의 전문가들이 필요하신가요? (예: 기술, 경제, 안전, 환경 등)')
    }

    // 투표 방식은 기본값(다수결) 사용 - 질문하지 않음
    // 평가 기준도 기본값 사용 - 질문하지 않음

    return missing
  }

  /**
   * 다중 에이전트 재질문 응답 생성
   */
  private generateMultiAgentClarification(message: string, missingInfo: string[]): string {
    // 사용자 요청에서 추출한 정보 요약
    const numberMatch = message.match(/(\d+)\s*(명|인|개|위원|전문가|에이전트|평가자)/)
    const expertCount = numberMatch ? numberMatch[1] : '미정'

    return `## 다중 전문가 평가 시스템 설계

요청하신 **${expertCount}명의 전문가 위원회** 워크플로우를 설계하려면 몇 가지 정보가 더 필요합니다.

### 확인이 필요한 사항

${missingInfo.map((q, i) => `${i + 1}. ${q}`).join('\n')}

### 예시 답변

> "5명의 전문가가 건설 신기술을 평가합니다.
> 각 전문가 분야: 구조공학, 시공관리, 경제성, 안전성, 환경영향
> 결과는 다수결 투표로 결정합니다."

위와 같이 상세하게 알려주시면, **병렬 구조**로 각 전문가가 독립적으로 평가하고 마지막에 투표로 집계하는 워크플로우를 설계해 드리겠습니다.

---

**참고:** 각 전문가에게 전용 지식베이스를 연결하거나, Chain-of-Thought 추론을 추가할 수도 있습니다.`
  }

  /**
   * 사용자 요청에서 다중 에이전트 상세 정보 추출
   * 학습된 패턴이 있으면 우선 적용
   */
  private extractMultiAgentDetails(message: string): {
    expertCount: number
    domains: string[]
    evaluationTarget: string
    votingMethod: string
    criteria: string[]
  } {
    // 학습된 패턴 확인 (강화학습 결과 적용)
    const learnedConfig = WorkflowLearningSystem.applyLearnedPatterns(message)
    if (learnedConfig) {
      console.log('[IntegratedWorkflowAgent] 학습된 패턴 적용:', learnedConfig)
    }

    // 전문가 수 추출 (학습된 설정 우선)
    let expertCount = learnedConfig?.expertCount || 3
    const numberMatch = message.match(/(\d+)\s*(명|인|개|위원|전문가|에이전트|평가자)/)
    if (numberMatch) {
      expertCount = parseInt(numberMatch[1])
    }

    // 도메인/분야 추출
    const domainPatterns = [
      /분야[:\s]*([^,.]+(?:[,、]?\s*[^,.]+)*)/,
      /전문[:\s]*([^,.]+(?:[,、]?\s*[^,.]+)*)/,
      /관점[:\s]*([^,.]+(?:[,、]?\s*[^,.]+)*)/,
      /(구조|재료|시공|경제|안전|환경|법률|정책|기술|품질|지속가능|혁신|효율|비용|특허|지반)/g,
    ]

    let domains: string[] = []
    for (const pattern of domainPatterns) {
      const match = message.match(pattern)
      if (match) {
        if (match[1]) {
          // 그룹 캡처된 경우
          domains = match[1].split(/[,、\s]+/).filter(d => d.length > 1)
        } else {
          // 글로벌 매칭의 경우
          const globalMatch = message.match(pattern)
          if (globalMatch) {
            domains = [...new Set(globalMatch)]
          }
        }
        if (domains.length >= 2) break
      }
    }

    // 도메인이 부족하면 기본 도메인 생성
    const defaultDomains = ['기술성', '경제성', '안전성', '실현가능성', '혁신성', '지속가능성', '법적합성', '품질', '환경영향', '사회적가치']
    while (domains.length < expertCount) {
      const nextDomain = defaultDomains[domains.length % defaultDomains.length]
      if (!domains.includes(nextDomain)) {
        domains.push(nextDomain)
      } else {
        domains.push(`${nextDomain} ${domains.length + 1}`)
      }
    }

    // 평가 대상 추출
    let evaluationTarget = '제출 문서'
    const targetPatterns = [
      /평가\s*대상[:\s]*([^,.]+)/,
      /([가-힣]+(?:기술|시스템|제안|계획|보고서|문서|프로젝트|제품))/,
      /(\S+)(?:을|를)\s*평가/,
    ]
    for (const pattern of targetPatterns) {
      const match = message.match(pattern)
      if (match && match[1]) {
        evaluationTarget = match[1].trim()
        break
      }
    }

    // 투표 방식 추출 (학습된 설정 또는 요청에서 추출)
    let votingMethod = learnedConfig?.votingMethod || 'simple_majority'
    if (/만장일치|전원\s*합의|unanimous/.test(message)) {
      votingMethod = 'unanimous'
    } else if (/2\/3|3분의\s*2|과반/.test(message)) {
      votingMethod = 'two_thirds'
    } else if (/가중|weighted|경험.*기반/.test(message)) {
      votingMethod = 'weighted'
    } else if (/다수결|majority/.test(message)) {
      votingMethod = 'simple_majority'
    }

    // 평가 기준 추출 (학습된 설정 우선)
    let criteria: string[] = learnedConfig?.criteria || []

    if (criteria.length === 0) {
      const criteriaPatterns = [
        /기준[:\s]*([^,.]+(?:[,、]\s*[^,.]+)*)/,
        /평가.*항목[:\s]*([^,.]+(?:[,、]\s*[^,.]+)*)/,
      ]
      for (const pattern of criteriaPatterns) {
        const match = message.match(pattern)
        if (match && match[1]) {
          criteria = match[1].split(/[,、]+/).map(c => c.trim()).filter(c => c.length > 1)
          break
        }
      }
    }

    if (criteria.length === 0) {
      criteria = ['적합성', '완성도', '실현가능성', '기대효과']
    }

    // 학습된 도메인과 병합
    if (learnedConfig?.domains && learnedConfig.domains.length > 0) {
      // 학습된 도메인으로 부족한 부분 채우기
      const mergedDomains = [...domains]
      for (const learnedDomain of learnedConfig.domains) {
        if (!mergedDomains.includes(learnedDomain) && mergedDomains.length < expertCount) {
          mergedDomains.push(learnedDomain)
        }
      }
      domains = mergedDomains
    }

    return {
      expertCount,
      domains: domains.slice(0, expertCount),
      evaluationTarget,
      votingMethod,
      criteria,
    }
  }

  /**
   * 도메인별 전문가 페르소나 생성
   */
  private generateExpertPersona(domain: string, index: number): {
    name: string
    title: string
    systemPrompt: string
    evaluationFocus: string[]
    experienceLevel: string
  } {
    // 도메인별 전문가 템플릿
    const expertTemplates: Record<string, {
      titlePrefix: string
      focuses: string[]
      promptTemplate: string
    }> = {
      '구조': {
        titlePrefix: '구조공학',
        focuses: ['구조 안전성', '내구성', '하중 분석', '구조 효율성'],
        promptTemplate: '당신은 구조공학 분야의 전문가입니다. 구조적 안전성, 내구성, 설계 적합성 관점에서 평가합니다.',
      },
      '재료': {
        titlePrefix: '재료공학',
        focuses: ['재료 특성', '내구성', '비용효율', '친환경성'],
        promptTemplate: '당신은 재료공학 전문가입니다. 재료의 특성, 수명, 환경 영향을 분석합니다.',
      },
      '시공': {
        titlePrefix: '시공관리',
        focuses: ['시공성', '공정 효율', '품질 관리', '안전 시공'],
        promptTemplate: '당신은 시공 관리 전문가입니다. 시공 가능성, 공정 효율성, 현장 적용성을 평가합니다.',
      },
      '경제': {
        titlePrefix: '경제성 분석',
        focuses: ['비용 효율', 'ROI', '시장성', '예산 적합성'],
        promptTemplate: '당신은 경제성 분석 전문가입니다. 비용, 투자 대비 효과, 경제적 타당성을 평가합니다.',
      },
      '안전': {
        titlePrefix: '안전공학',
        focuses: ['안전성', '리스크 관리', '재해 예방', '규정 준수'],
        promptTemplate: '당신은 안전 분야 전문가입니다. 안전 기준 충족, 위험 요소, 예방 대책을 분석합니다.',
      },
      '환경': {
        titlePrefix: '환경공학',
        focuses: ['환경 영향', '지속가능성', '탄소 저감', '생태계 보전'],
        promptTemplate: '당신은 환경 전문가입니다. 환경 영향, 지속가능성, 친환경성을 평가합니다.',
      },
      '법률': {
        titlePrefix: '법률 자문',
        focuses: ['법적 적합성', '규정 준수', '계약 조건', '인허가'],
        promptTemplate: '당신은 법률 전문가입니다. 관련 법규, 인허가 요건, 계약 조건을 검토합니다.',
      },
      '정책': {
        titlePrefix: '정책 분석',
        focuses: ['정책 부합성', '사회적 영향', '공공 이익', '규제 동향'],
        promptTemplate: '당신은 정책 분석 전문가입니다. 정부 정책, 규제 방향, 사회적 수용성을 평가합니다.',
      },
      '기술': {
        titlePrefix: '기술 평가',
        focuses: ['기술 혁신성', '실현가능성', '기술 성숙도', '확장성'],
        promptTemplate: '당신은 기술 평가 전문가입니다. 기술의 혁신성, 실현가능성, 성숙도를 분석합니다.',
      },
      '품질': {
        titlePrefix: '품질 관리',
        focuses: ['품질 기준', '신뢰성', '일관성', '검증 체계'],
        promptTemplate: '당신은 품질 관리 전문가입니다. 품질 기준 충족, 신뢰성, 검증 체계를 평가합니다.',
      },
    }

    // 도메인 키워드 매칭
    let template = expertTemplates['기술'] // 기본값
    for (const [key, value] of Object.entries(expertTemplates)) {
      if (domain.includes(key) || key.includes(domain.slice(0, 2))) {
        template = value
        break
      }
    }

    // 경험 레벨 다양화
    const levels = ['senior', 'expert', 'master', 'senior', 'expert']
    const experienceLevel = levels[index % levels.length]

    // 전문가 이름 생성
    const surnames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '한']
    const name = `${surnames[index % surnames.length]}${domain.slice(0, 2)}전문가`

    return {
      name,
      title: `${template.titlePrefix} 수석연구원`,
      systemPrompt: `${template.promptTemplate}\n\n평가 시 다음을 고려하세요:\n${template.focuses.map(f => `- ${f}`).join('\n')}\n\n평가 결과는 JSON 형식으로 출력하세요:\n{\n  "score": 1-10,\n  "reasoning": "판단 근거",\n  "strengths": ["강점들"],\n  "weaknesses": ["약점들"],\n  "recommendation": "적합/조건부적합/부적합"\n}`,
      evaluationFocus: template.focuses,
      experienceLevel,
    }
  }

  /**
   * 워크플로우 설계 생성
   */
  private async generateWorkflowDesign(
    userRequest: string,
    conversation: ConversationTurn[],
  ): Promise<WorkflowDesign | null> {
    if (!LocalLLMProvider.getConfig()) {
      configureOllama()
    }

    // 대화 컨텍스트 구성
    const conversationContext = conversation
      .map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
      .join('\n\n')

    const prompt = `${conversationContext}

User: ${userRequest}

위 대화를 바탕으로 워크플로우를 설계해주세요.
반드시 \`\`\`workflow 블록 안에 JSON 형식으로 출력하세요.
각 노드의 reasoning 필드에 해당 노드가 필요한 이유를 설명하세요.`

    try {
      const response = await LocalLLMProvider.generate({
        prompt,
        systemPrompt: this.buildSystemPrompt(),
        temperature: 0.7,
        maxTokens: getMaxTokensFromSettings(),
      })

      // 워크플로우 JSON 추출
      const workflowMatch = response.content.match(/```workflow\s*([\s\S]*?)```/)
      if (workflowMatch) {
        try {
          const workflowJson = JSON.parse(workflowMatch[1])
          return this.normalizeWorkflow(workflowJson)
        } catch {
          console.warn('[IntegratedWorkflowAgent] Failed to parse workflow JSON')
        }
      }

      return null
    } catch (error) {
      console.error('[IntegratedWorkflowAgent] Generation failed:', error)
      return null
    }
  }

  /**
   * Bedrock 폴백 시도
   *
   * 순서:
   * 1. invoke_bedrock Tauri 명령어 직접 호출 (가장 확실)
   * 2. 실패 시 ProviderRegistry에서 연결된 LLM 확인
   * 3. BedrockLLMProvider 직접 연결 시도
   */
  private async tryBedrockFallback(
    message: string,
    conversation: ConversationTurn[],
    intent: { category: string; keywords: string[]; suggestedTools: string[]; clarifyingQuestions: string[] },
    currentWorkflow?: WorkflowDesign | null,
    messageType?: string
  ): Promise<{ success: boolean; content: string; error?: string }> {
    const conversationContext = conversation
      .slice(-10)
      .map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
      .join('\n\n')

    // 기존 워크플로우 컨텍스트 (수정 요청 시 반드시 참조)
    const existingWorkflowContext = currentWorkflow
      ? `
[현재 워크플로우 - 수정 요청 시 이 워크플로우를 기반으로 수정]
\`\`\`json
${JSON.stringify(currentWorkflow, null, 2)}
\`\`\`
노드 수: ${currentWorkflow.nodes.length}개
엣지 수: ${currentWorkflow.edges.length}개

**중요: 사용자가 "고도화", "수정", "추가", "변경" 등을 요청하면 위 워크플로우를 유지하면서 수정하세요. 절대로 단순화하거나 새로 만들지 마세요.**
`
      : ''

    const prompt = `${conversationContext}

${existingWorkflowContext}

[분석된 의도]
- 카테고리: ${intent.category}
- 키워드: ${intent.keywords.join(', ')}
- 추천 도구: ${intent.suggestedTools.join(', ')}
- 메시지 유형: ${messageType || 'new_request'} (modification이면 기존 워크플로우 수정)

사용자의 요청에 대해 응답하세요.
- **수정/고도화 요청이면 기존 워크플로우의 모든 노드를 유지하면서 수정/추가**
- 새 워크플로우 요청이면 새로 설계
- 워크플로우는 \`\`\`workflow 블록에 JSON으로 출력
- 불명확하면 구체화 질문을 제시`

    // 1. invoke_bedrock Tauri 명령어 직접 호출 (가장 확실한 방법)
    try {
      console.log('[IntegratedWorkflowAgent] invoke_bedrock 직접 호출 시도')

      const bedrockResult = await invoke<{
        response: string
        usage: { input_tokens: number; output_tokens: number }
      }>('invoke_bedrock', {
        request: {
          model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
          prompt,
          system_prompt: this.buildSystemPrompt(),
          max_tokens: getMaxTokensFromSettings(),  // 설정에서 가져옴
          temperature: 0.7,
        },
      })

      console.log('[IntegratedWorkflowAgent] invoke_bedrock 성공!')
      return { success: true, content: bedrockResult.response }
    } catch (invokeError) {
      const invokeErrorMsg = invokeError instanceof Error ? invokeError.message : String(invokeError)
      console.warn('[IntegratedWorkflowAgent] invoke_bedrock 직접 호출 실패:', invokeErrorMsg)
    }

    // 2. ProviderRegistry에서 연결된 LLM 확인
    try {
      const connectedProviders = ProviderRegistry.getConnectedLLMProviders()
      console.log(`[IntegratedWorkflowAgent] 연결된 프로바이더: ${connectedProviders.map(p => p.id).join(', ') || '없음'}`)

      if (connectedProviders.length > 0) {
        const provider = connectedProviders[0]
        console.log(`[IntegratedWorkflowAgent] ${provider.id} 프로바이더 사용`)

        const response = await provider.invoke({
          model: '',
          prompt,
          systemPrompt: this.buildSystemPrompt(),
          maxTokens: getMaxTokensFromSettings(),
          temperature: 0.7,
        })

        return { success: true, content: response.text }
      }
    } catch (providerError) {
      console.warn('[IntegratedWorkflowAgent] ProviderRegistry 폴백 실패:', providerError)
    }

    // 3. BedrockLLMProvider 직접 연결 시도
    try {
      const bedrockProvider = ProviderRegistry.getLLMProvider('bedrock')
      if (bedrockProvider) {
        console.log('[IntegratedWorkflowAgent] BedrockLLMProvider 직접 연결 시도')

        if (!bedrockProvider.isConnected()) {
          await bedrockProvider.connect({})
        }

        if (bedrockProvider.isConnected()) {
          const response = await bedrockProvider.invoke({
            model: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
            prompt,
            systemPrompt: this.buildSystemPrompt(),
            maxTokens: getMaxTokensFromSettings(),
            temperature: 0.7,
          })

          return { success: true, content: response.text }
        }
      }
    } catch (bedrockError) {
      console.warn('[IntegratedWorkflowAgent] BedrockLLMProvider 직접 연결 실패:', bedrockError)
    }

    return {
      success: false,
      content: '',
      error: 'AWS Bedrock 연결 실패. AWS 자격 증명을 확인하세요.'
    }
  }

  /**
   * 워크플로우 정규화
   *
   * 노드 타입 검증 및 레거시 타입 변환 포함
   */
  private normalizeWorkflow(raw: any): WorkflowDesign {
    // 레거시 타입 매핑 (executors/index.ts의 LEGACY_TYPE_MAP 참조)
    const LEGACY_TYPE_MAP: Record<string, string> = {
      'mcp_tool': 'data.preprocess',
      'mcp-tool': 'data.preprocess',
      'local-folder': 'io.local-folder',
      'local-file': 'io.local-file',
      'input': 'io.local-file',
      'file-loader': 'data.file-loader',
      'doc-parser': 'convert.doc-parser',
      'text-splitter': 'text.splitter',
      'llm': 'ai.llm-invoke',
      'llm-invoke': 'ai.llm-invoke',
      'chat': 'ai.llm-invoke',
      'embedding': 'ai.embedding',
      'embedder': 'ai.embedding',
      'rag-retriever': 'rag.retriever',
      'rag-search': 'rag.retriever',
      'context-builder': 'rag.context-builder',
      'prompt': 'prompt.template',
      'prompt-template': 'prompt.template',
      'cot': 'prompt.cot',
      'few-shot': 'prompt.few-shot',
      'merge': 'control.merge',
      'conditional': 'control.conditional',
      'voting': 'control.voting-aggregator',
      'vote': 'control.voting-aggregator',
      'persona': 'agent.persona',
      'agent': 'agent.persona',
      'evaluator': 'agent.persona',
      'result': 'viz.result-viewer',
      'output': 'viz.result-viewer',
      'chart': 'viz.chart',
      'table': 'viz.table',
      'stats': 'viz.stats',
      'excel': 'export.excel',
      'http': 'api.http-request',
      'api': 'api.http-request',
      'vision': 'vision.analyze',
      'image': 'vision.generate',
      'storage': 'storage.local',
    }

    const nodes: WorkflowNode[] = (raw.nodes || []).map((n: any, i: number) => {
      // 노드 타입 정규화
      let nodeType = n.type || 'data.preprocess'

      // 레거시 타입 변환
      if (LEGACY_TYPE_MAP[nodeType]) {
        nodeType = LEGACY_TYPE_MAP[nodeType]
      }

      // 점(.) 없는 타입을 적절한 카테고리로 변환
      if (!nodeType.includes('.')) {
        const lowercaseType = nodeType.toLowerCase()
        if (LEGACY_TYPE_MAP[lowercaseType]) {
          nodeType = LEGACY_TYPE_MAP[lowercaseType]
        } else {
          // 기본 카테고리 추가
          nodeType = `data.${lowercaseType}`
        }
      }

      return {
        id: n.id || `node_${i + 1}`,
        type: nodeType,
        label: n.label || n.tool || `Node ${i + 1}`,
        description: n.description || '',
        tool: n.tool,
        toolConfig: n.toolConfig || {},
        position: n.position || { x: 100 + i * 200, y: 100 },
        reasoning: n.reasoning || '(이유 없음)',
      }
    })

    const edges: WorkflowEdge[] = (raw.edges || []).map((e: any, i: number) => ({
      id: e.id || `edge_${i + 1}`,
      source: e.source,
      target: e.target,
      label: e.label,
      condition: e.condition,
    }))

    return {
      name: raw.name || '새 워크플로우',
      description: raw.description || '',
      nodes,
      edges,
      summary: raw.summary || '',
      reasoning: raw.reasoning || '',
      suggestions: raw.suggestions || [],
    }
  }

  /**
   * 템플릿 기반 워크플로우 생성 (LLM 없이도 동작)
   * 실제 등록된 노드 타입 사용
   * 다중 에이전트의 경우 사용자 요청에서 동적으로 전문가 생성
   */
  private generateWorkflowFromTemplate(
    intent: {
      category: string
      keywords: string[]
      suggestedTools: string[]
      clarifyingQuestions: string[]
      semanticHints: {
        isMultiFile: boolean
        isLargeScale: boolean
        needsParallel: boolean
        outputFormat?: string
      }
    },
    userRequest: string,
    xaiSessionId?: string,  // XAI 세션 ID - 노드 선택 기록용
  ): WorkflowDesign {
    console.log(`[IntegratedWorkflowAgent] 템플릿 조회: category=${intent.category}`)
    console.log(`[IntegratedWorkflowAgent] 사용 가능한 템플릿: ${Object.keys(WORKFLOW_TEMPLATES).join(', ')}`)
    console.log(`[IntegratedWorkflowAgent] 시맨틱 힌트 적용: multiFile=${intent.semanticHints.isMultiFile}, largeScale=${intent.semanticHints.isLargeScale}`)

    // 다중 에이전트인 경우 동적 생성
    if (intent.category === 'multi_agent') {
      return this.generateDynamicMultiAgentWorkflow(userRequest, intent.semanticHints)
    }

    const template = WORKFLOW_TEMPLATES[intent.category] || WORKFLOW_TEMPLATES['general']
    console.log(`[IntegratedWorkflowAgent] 선택된 템플릿: ${template.name}, 노드 수: ${template.nodes.length}`)
    console.log(`[IntegratedWorkflowAgent] 템플릿 노드들:`, template.nodes.map(n => `${n.type}:${n.label}`).join(', '))

    // 노드 생성 - 시맨틱 힌트 기반 노드 타입 조정
    const nodes: WorkflowNode[] = template.nodes.map((nodeDef, i) => {
      let nodeType = nodeDef.type
      let nodeLabel = nodeDef.label
      let nodeDescription = nodeDef.description
      let nodeConfig = nodeDef.config || {}

      // 시맨틱 힌트 기반 노드 타입 조정
      // 1. 다중 파일인 경우: io.local-file → io.local-folder
      if (intent.semanticHints.isMultiFile) {
        if (nodeType === 'io.local-file') {
          nodeType = 'io.local-folder'
          nodeLabel = nodeLabel.replace(/파일/g, '폴더')
          nodeDescription = nodeDescription.replace(/파일/g, '다중 파일')
          console.log(`[IntegratedWorkflowAgent] 시맨틱 조정: io.local-file → io.local-folder (다중 파일 감지)`)
        }
      }

      // 2. 대규모 데이터인 경우: 청킹/배치 처리 추가
      if (intent.semanticHints.isLargeScale) {
        if (nodeType === 'text.splitter') {
          nodeConfig = {
            ...nodeConfig,
            chunk_size: 2000,  // 큰 청크
            overlap: 200,
            batch_mode: true,
          }
          console.log(`[IntegratedWorkflowAgent] 시맨틱 조정: text.splitter 배치 모드 활성화 (대규모 감지)`)
        }
      }

      // 3. 출력 형식 힌트
      if (intent.semanticHints.outputFormat && nodeType.startsWith('viz.')) {
        const outputMap: Record<string, string> = {
          'chart': 'viz.chart',
          'table': 'viz.table',
          'report': 'viz.result-viewer',
        }
        const preferredType = outputMap[intent.semanticHints.outputFormat]
        if (preferredType && nodeType === 'viz.result-viewer') {
          nodeType = preferredType
          console.log(`[IntegratedWorkflowAgent] 시맨틱 조정: ${nodeDef.type} → ${nodeType} (출력 형식: ${intent.semanticHints.outputFormat})`)
        }
      }

      const node = {
        id: `node_${i + 1}`,
        type: nodeType,
        label: nodeLabel,
        description: nodeDescription,
        tool: nodeType.split('.')[1],
        toolConfig: nodeConfig,
        position: { x: 100 + (i % 3) * 280, y: 100 + Math.floor(i / 3) * 180 },
        reasoning: `${nodeDescription}를 위해 사용됩니다.`,
      }

      // XAI: 노드 선택 결정 기록
      if (xaiSessionId) {
        const wasAdjusted = nodeType !== nodeDef.type
        InteractiveXAI.recordNodeSelection(
          xaiSessionId,
          `${nodeType} (${nodeLabel})`,
          wasAdjusted
            ? `시맨틱 분석에 따라 ${nodeDef.type} → ${nodeType}로 조정됨: ${nodeDescription}`
            : `템플릿 기반 선택: ${nodeDescription}`,
          wasAdjusted
            ? [{ option: nodeDef.type, reason: '템플릿 기본 노드', whyNotChosen: '시맨틱 힌트에 따라 조정됨' }]
            : [],
          ['NodeRegistry', '템플릿 매칭', '시맨틱 분석'],
          wasAdjusted ? 0.9 : 0.85,
        )
      }

      return node
    })

    // 엣지 생성 - 패턴에 따라
    const edges: WorkflowEdge[] = []
    if (template.pattern === 'parallel_then_aggregate' && nodes.length > 2) {
      // 다중 에이전트 패턴: 입력 노드 → 병렬 에이전트들 → 집계 노드
      // 첫 번째 노드(입력)에서 에이전트들로 분기
      const inputNode = nodes[0]
      const aggregatorNode = nodes[nodes.length - 1]
      const agentNodes = nodes.slice(1, -1)

      // 입력 → 각 에이전트
      agentNodes.forEach((agentNode, i) => {
        edges.push({
          id: `edge_in_${i + 1}`,
          source: inputNode.id,
          target: agentNode.id,
          label: '',
        })
      })

      // 각 에이전트 → 집계
      agentNodes.forEach((agentNode, i) => {
        edges.push({
          id: `edge_out_${i + 1}`,
          source: agentNode.id,
          target: aggregatorNode.id,
          label: `평가 ${i + 1}`,
        })
      })
    } else {
      // 순차 패턴
      for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({
          id: `edge_${i + 1}`,
          source: nodes[i].id,
          target: nodes[i + 1].id,
        })
      }
    }

    return {
      name: template.name,
      description: template.description,
      nodes,
      edges,
      summary: `"${userRequest}"에 대한 ${template.name}`,
      reasoning: `${intent.category} 카테고리의 요청으로 분석되어 ${template.name} 템플릿을 적용했습니다. 각 노드는 실제 구현된 기능을 제공합니다.`,
      suggestions: [
        '각 노드를 클릭하여 세부 설정을 조정할 수 있습니다.',
        '필요에 따라 노드를 추가하거나 삭제하세요.',
        ...intent.clarifyingQuestions.slice(0, 2),
      ],
    }
  }

  /**
   * 동적 다중 에이전트 워크플로우 생성
   * 사용자 요청에서 전문가 수, 도메인, 평가 기준을 추출하여 생성
   * 시맨틱 힌트를 반영하여 다중 파일, 대규모 처리 등에 대응
   */
  private generateDynamicMultiAgentWorkflow(
    userRequest: string,
    semanticHints?: {
      isMultiFile: boolean
      isLargeScale: boolean
      needsParallel: boolean
      outputFormat?: string
    },
  ): WorkflowDesign {
    // 상세 정보 추출
    const details = this.extractMultiAgentDetails(userRequest)
    console.log(`[IntegratedWorkflowAgent] 다중 에이전트 상세 정보:`, details)
    console.log(`[IntegratedWorkflowAgent] 시맨틱 힌트:`, semanticHints)

    const nodes: WorkflowNode[] = []
    const edges: WorkflowEdge[] = []

    // 1. 입력 노드 - 시맨틱 힌트에 따라 결정
    // 다중 파일인 경우: io.local-folder 사용
    // 단일 파일인 경우: convert.doc-parser 사용
    const isMultiFile = semanticHints?.isMultiFile || false
    const inputNode: WorkflowNode = isMultiFile
      ? {
          id: 'input_node',
          type: 'io.local-folder',
          label: '다중 문서 로드',
          description: `${details.evaluationTarget} 폴더 내 모든 문서 로드`,
          tool: 'local-folder',
          toolConfig: {
            target: details.evaluationTarget,
            recursive: true,
            fileTypes: ['.pdf', '.docx', '.hwp', '.txt'],
          },
          position: { x: 400, y: 50 },
          reasoning: `${details.evaluationTarget} 폴더의 다중 파일을 일괄 로드하여 각 전문가에게 전달합니다.`,
        }
      : {
          id: 'input_node',
          type: 'convert.doc-parser',
          label: '평가 대상 입력',
          description: `${details.evaluationTarget} 문서 파싱 및 분석 준비`,
          tool: 'doc-parser',
          toolConfig: {
            target: details.evaluationTarget,
            parseMode: 'full',
          },
          position: { x: 400, y: 50 },
          reasoning: `${details.evaluationTarget}을(를) 파싱하여 각 전문가에게 전달할 준비를 합니다.`,
        }
    nodes.push(inputNode)

    // 대규모 데이터인 경우 텍스트 스플리터 추가
    if (semanticHints?.isLargeScale) {
      const splitterNode: WorkflowNode = {
        id: 'splitter_node',
        type: 'text.splitter',
        label: '대용량 텍스트 분할',
        description: '대규모 문서를 처리 가능한 청크로 분할',
        tool: 'splitter',
        toolConfig: {
          chunk_size: 4000,
          overlap: 400,
          batch_mode: true,
        },
        position: { x: 400, y: 100 },
        reasoning: '대규모 데이터를 효율적으로 처리하기 위해 청킹합니다.',
      }
      nodes.push(splitterNode)
      edges.push({
        id: 'edge_split',
        source: inputNode.id,
        target: splitterNode.id,
        label: '',
      })
    }

    // 2. N명의 전문가 에이전트 (병렬 배치)
    const expertCount = details.expertCount
    const rowCapacity = Math.min(5, expertCount) // 한 행에 최대 5명
    const totalRows = Math.ceil(expertCount / rowCapacity)
    // 스플리터 노드가 있으면 Y 시작점 조정
    const expertBaseY = semanticHints?.isLargeScale ? 250 : 200

    for (let i = 0; i < expertCount; i++) {
      const domain = details.domains[i] || `전문분야 ${i + 1}`
      const persona = this.generateExpertPersona(domain, i)

      // 위치 계산 (병렬 배치)
      const row = Math.floor(i / rowCapacity)
      const col = i % rowCapacity
      const colCount = row < totalRows - 1 ? rowCapacity : (expertCount - 1) % rowCapacity + 1
      const startX = 400 - (colCount - 1) * 140

      const expertNode: WorkflowNode = {
        id: `expert_${i + 1}`,
        type: 'agent.persona',
        label: `${domain} 전문가`,
        description: `${persona.title} - ${domain} 관점에서 평가`,
        tool: 'persona',
        toolConfig: {
          persona_id: `expert_${domain.replace(/\s/g, '_')}`,
          persona_name: persona.name,
          title: persona.title,
          domain: domain,
          experience_level: persona.experienceLevel,
          evaluation_criteria: details.criteria,
          evaluation_focus: persona.evaluationFocus,
          system_prompt: persona.systemPrompt,
          xai_enabled: true, // 판단 근거 출력
          output_format: 'structured_json',
        },
        position: { x: startX + col * 280, y: expertBaseY + row * 150 },
        reasoning: `${domain} 분야의 전문 지식으로 ${details.evaluationTarget}을(를) 독립적으로 평가합니다.`,
      }
      nodes.push(expertNode)

      // 입력(또는 스플리터) → 전문가 엣지
      // 스플리터 노드가 있으면 그것을 소스로 사용
      const sourceNodeId = semanticHints?.isLargeScale ? 'splitter_node' : inputNode.id
      edges.push({
        id: `edge_in_${i + 1}`,
        source: sourceNodeId,
        target: expertNode.id,
        label: '',
      })
    }

    // 3. 투표 집계 노드
    const aggregatorY = expertBaseY + totalRows * 150 + 50
    const aggregatorNode: WorkflowNode = {
      id: 'aggregator_node',
      type: 'control.voting-aggregator',
      label: '평가 결과 집계',
      description: `${expertCount}명의 평가 결과를 ${details.votingMethod === 'simple_majority' ? '다수결' : details.votingMethod}로 집계`,
      tool: 'voting-aggregator',
      toolConfig: {
        voting_method: details.votingMethod,
        expert_count: expertCount,
        domains: details.domains,
        criteria: details.criteria,
        threshold: details.votingMethod === 'two_thirds' ? 0.67 : 0.5,
        xai_report: true,
        domain_analysis: true, // 도메인별 점수 분석
      },
      position: { x: 400, y: aggregatorY },
      reasoning: `${expertCount}명 전문가의 평가 결과를 종합하고, ${details.votingMethod} 방식으로 최종 판정을 도출합니다.`,
    }
    nodes.push(aggregatorNode)

    // 전문가 → 집계 엣지
    for (let i = 0; i < expertCount; i++) {
      edges.push({
        id: `edge_out_${i + 1}`,
        source: `expert_${i + 1}`,
        target: aggregatorNode.id,
        label: `${details.domains[i] || `분야 ${i + 1}`} 평가`,
      })
    }

    // 4. 결과 표시 노드
    const resultNode: WorkflowNode = {
      id: 'result_node',
      type: 'viz.result-viewer',
      label: '최종 평가 결과',
      description: '평가 결과 시각화 및 XAI 보고서',
      tool: 'result-viewer',
      toolConfig: {
        display_mode: 'detailed',
        show_individual_scores: true,
        show_domain_analysis: true,
        show_reasoning: true,
        chart_type: 'radar', // 레이더 차트로 도메인별 점수 표시
      },
      position: { x: 400, y: aggregatorY + 150 },
      reasoning: '전문가별 평가 결과와 최종 판정을 시각적으로 표시하고, 판단 근거를 설명합니다.',
    }
    nodes.push(resultNode)

    edges.push({
      id: 'edge_to_result',
      source: aggregatorNode.id,
      target: resultNode.id,
    })

    // 워크플로우 설명
    const domainList = details.domains.slice(0, Math.min(5, expertCount)).join(', ')
    const domainsEllipsis = expertCount > 5 ? ` 외 ${expertCount - 5}명` : ''

    return {
      name: `${expertCount}인 전문가 위원회 평가 시스템`,
      description: `${expertCount}명의 전문가(${domainList}${domainsEllipsis})가 ${details.evaluationTarget}을(를) 병렬로 독립 평가하고, ${details.votingMethod === 'simple_majority' ? '다수결' : details.votingMethod} 투표로 최종 판정을 도출합니다.`,
      nodes,
      edges,
      summary: `${expertCount}명 전문가의 병렬 평가 → ${details.votingMethod} 투표 집계`,
      reasoning: `
### 워크플로우 설계 근거

1. **병렬 구조 채택**: 각 전문가가 독립적으로 평가하여 편향 방지
2. **전문가 ${expertCount}명 구성**: ${domainList}${domainsEllipsis} 분야 커버
3. **투표 방식**: ${details.votingMethod === 'simple_majority' ? '단순 다수결 (50% 초과)' : details.votingMethod}
4. **XAI 활성화**: 각 전문가의 판단 근거와 점수 상세 출력
5. **도메인별 분석**: 분야별 점수 분포와 강점/약점 분석

### 평가 기준
${details.criteria.map(c => `- ${c}`).join('\n')}
      `.trim(),
      suggestions: [
        '각 전문가 노드를 클릭하여 평가 기준과 시스템 프롬프트를 조정할 수 있습니다.',
        '투표 집계 노드에서 투표 방식(다수결/만장일치/가중)을 변경할 수 있습니다.',
        '전문가에게 전용 지식베이스(RAG)를 연결하면 더 정확한 평가가 가능합니다.',
        'Chain-of-Thought 노드를 추가하면 단계별 추론이 가능합니다.',
      ],
    }
  }

  /**
   * 메시지 유형 분석 (새 요청 vs 후속 질문/수정 요청)
   */
  private analyzeMessageType(message: string, hasExistingWorkflow: boolean): 'new_request' | 'modification' | 'question' | 'follow_up' {
    const lowerMessage = message.toLowerCase()

    // 질문 패턴
    if (/\?$|어떻게|왜|뭐|무엇|할 수 있|가능|인가요|인데\?|있나요|줄 수/.test(message)) {
      // 기존 워크플로우가 있고 수정 관련 키워드가 있으면 modification
      if (hasExistingWorkflow && /수정|변경|추가|삭제|늘리|줄이|바꿔|개선|업데이트/.test(lowerMessage)) {
        return 'modification'
      }
      return 'question'
    }

    // 수정 요청 패턴
    if (hasExistingWorkflow && /수정|변경|추가|삭제|늘리|줄이|바꿔|개선|업데이트|적용|반영/.test(lowerMessage)) {
      return 'modification'
    }

    // 후속 설명/추가 정보
    if (hasExistingWorkflow && /그리고|또한|추가로|더|이외에|그런데|근데/.test(lowerMessage)) {
      return 'follow_up'
    }

    return 'new_request'
  }

  /**
   * 후속 질문에 대한 규칙 기반 응답 생성 (LLM 없이)
   */
  private generateRuleBasedResponse(
    message: string,
    messageType: string,
    workflow: WorkflowDesign | null,
    intent: { category: string; keywords: string[]; suggestedTools: string[]; clarifyingQuestions: string[] }
  ): string {
    if (!workflow) {
      return `워크플로우가 아직 생성되지 않았습니다. 어떤 워크플로우를 만들어드릴까요?

예시:
- "문서 기반 Q&A 시스템 만들어줘"
- "데이터 분석 파이프라인 구성해줘"
- "다중 전문가 평가 시스템 설계해줘"`
    }

    const lowerMessage = message.toLowerCase()

    // 질문 유형별 응답
    if (messageType === 'question') {
      // 지식베이스 관련 질문
      if (/지식베이스|kb|knowledge|rag/.test(lowerMessage)) {
        return `## 지식베이스 설정 안내

현재 워크플로우에 지식베이스를 추가하려면:

1. **각 에이전트별 전용 지식베이스 구성**
   - \`convert.doc-parser\` 노드를 각 에이전트 앞에 추가
   - \`ai.embedding\` 노드로 문서 임베딩 생성
   - \`rag.retriever\` 노드로 관련 지식 검색

2. **워크플로우 수정 방법**
   - 캔버스에서 노드를 직접 추가/연결
   - 또는 "각 에이전트에 지식베이스 추가해줘"라고 요청

> 💡 **팁**: 각 전문가 에이전트가 서로 다른 도메인의 지식베이스를 참조하면 더 다양한 관점의 평가가 가능합니다.`
      }

      // 프롬프트 체인 관련
      if (/프롬프트|체인|chain|단계|step/.test(lowerMessage)) {
        return `## 프롬프트 체인 구성 안내

현재 \`agent.persona\` 노드는 단일 평가 프롬프트를 사용합니다.
더 정교한 추론을 위해 프롬프트 체인을 구성할 수 있습니다:

1. **Chain-of-Thought 추가**
   - \`prompt.cot\` 노드를 에이전트 앞에 배치
   - 단계별 추론 유도로 더 깊은 분석 가능

2. **Few-Shot 예시 추가**
   - \`prompt.few-shot\` 노드로 평가 예시 제공
   - 일관된 평가 기준 유지

3. **수정 방법**
   - "각 전문가에게 Chain-of-Thought 추론 추가해줘"
   - "Few-Shot 예시 포함해서 수정해줘"

현재 워크플로우에서 수정하시겠습니까?`
      }

      // 투표/다수결 관련
      if (/투표|다수결|vote|집계|결과/.test(lowerMessage)) {
        return `## 투표 시스템 안내

현재 \`control.voting-aggregator\` 노드의 투표 방식:

1. **지원 투표 방식**
   - \`simple_majority\`: 단순 다수결 (50% 초과)
   - \`two_thirds\`: 2/3 다수결
   - \`unanimous\`: 만장일치
   - \`weighted\`: 경험 레벨 기반 가중 투표
   - \`threshold\`: 커스텀 임계값

2. **수정 방법**
   - 캔버스에서 투표 집계 노드 클릭 → 설정 변경
   - 또는 "투표 방식을 2/3 다수결로 바꿔줘"라고 요청

3. **XAI 설명**
   - 각 평가자의 판단 근거와 점수가 출력됩니다
   - 도메인별/기준별 점수 분석 제공`
      }

      // 에이전트/전문가 관련
      if (/에이전트|전문가|평가자|페르소나/.test(lowerMessage)) {
        return `## 페르소나 에이전트 안내

현재 워크플로우의 에이전트 구성:
${workflow.nodes.filter(n => n.type === 'agent.persona').map((n, i) => `${i + 1}. **${n.label}** - ${n.description}`).join('\n')}

**수정 가능 항목:**
- \`persona_name\`: 전문가 이름
- \`domain\`: 전문 분야 (구조, 재료, 경제성 등)
- \`experience_level\`: 경험 레벨 (junior/mid/senior/expert/master)
- \`evaluation_criteria\`: 평가 기준
- \`xai_enabled\`: 판단 근거 출력 여부

**예시 요청:**
- "에이전트를 5명으로 늘려줘"
- "경제성 전문가와 안전 전문가 추가해줘"
- "각 전문가의 전문 분야를 다르게 설정해줘"`
      }

      // 일반 질문
      return `## 현재 워크플로우 설명

**${workflow.name}**
${workflow.description}

### 구성 노드 (${workflow.nodes.length}개)
${workflow.nodes.map((n, i) => `${i + 1}. \`${n.type}\` - ${n.label}`).join('\n')}

### 연결 관계 (${workflow.edges.length}개)
${workflow.edges.map(e => {
  const src = workflow.nodes.find(n => n.id === e.source)?.label || e.source
  const tgt = workflow.nodes.find(n => n.id === e.target)?.label || e.target
  return `- ${src} → ${tgt}`
}).join('\n')}

더 구체적인 질문이 있으시면 말씀해주세요.`
    }

    // 수정 요청
    if (messageType === 'modification' || messageType === 'follow_up') {
      return `## 워크플로우 수정 안내

요청하신 내용을 반영하려면 다음 방법을 사용하세요:

1. **캔버스에서 직접 수정**
   - 노드 클릭 → 설정 패널에서 수정
   - 노드 드래그로 추가/삭제

2. **구체적인 수정 요청**
   - "에이전트를 10명으로 늘려줘"
   - "각 에이전트에 지식베이스 연결해줘"
   - "투표 방식을 가중 투표로 변경해줘"

> ⚠️ 현재 로컬 LLM이 연결되지 않아 자동 수정이 제한됩니다.
> Ollama를 실행하면 대화형으로 워크플로우를 수정할 수 있습니다.

**Ollama 설치:** https://ollama.ai
**실행 명령:** \`ollama run llama3.2\``
    }

    return ''
  }

  /**
   * 대화 처리 (메인 인터페이스)
   */
  async chat(
    message: string,
    sessionId?: string,
  ): Promise<{
    response: string
    workflow: WorkflowDesign | null
    clarifyingQuestions: string[]
    suggestions: string[]
    xaiSessionId?: string  // XAI 세션 ID - UI에서 실시간 추론 표시용
  }> {
    // 입력 검증 (Guardrails)
    const inputValidation = Guardrails.validateInput(message)
    if (!inputValidation.passed) {
      return {
        response: '입력에 문제가 감지되었습니다: ' + inputValidation.contentViolations.join(', '),
        workflow: null,
        clarifyingQuestions: [],
        suggestions: [],
      }
    }
    const safeMessage = inputValidation.processedText

    // 세션 관리
    let session = sessionId ? this.sessions.get(sessionId) : null
    if (!session) {
      session = {
        id: sessionId || `session_${Date.now()}`,
        conversation: [],
        currentWorkflow: null,
        userPreferences: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      this.sessions.set(session.id, session)
    }

    // 사용자 메시지 기록
    session.conversation.push({
      role: 'user',
      content: safeMessage,
      timestamp: new Date().toISOString(),
    })

    // 메시지 유형 분석 (새 요청 vs 후속 질문)
    const messageType = this.analyzeMessageType(safeMessage, session.currentWorkflow !== null)
    console.log(`[IntegratedWorkflowAgent] 메시지 유형: ${messageType}, 기존 워크플로우: ${session.currentWorkflow ? 'Y' : 'N'}`)

    // XAI 세션 시작 - 실시간 추론 과정 추적
    const xaiSession = startXAISession(safeMessage)
    console.log(`[IntegratedWorkflowAgent] XAI 세션 시작: ${xaiSession.id}`)

    // 의도 분석 (시맨틱 힌트 포함)
    const intent = this.analyzeIntent(safeMessage)
    console.log(`[IntegratedWorkflowAgent] 의도 분석 결과: category=${intent.category}, keywords=${intent.keywords.join(',')}`)
    console.log(`[IntegratedWorkflowAgent] 시맨틱 힌트: multiFile=${intent.semanticHints.isMultiFile}, largeScale=${intent.semanticHints.isLargeScale}, parallel=${intent.semanticHints.needsParallel}, output=${intent.semanticHints.outputFormat || 'auto'}`)

    // XAI: 의도 분석 결정 기록
    InteractiveXAI.recordIntentAnalysis(
      xaiSession.id,
      `${intent.category} (${intent.keywords.slice(0, 3).join(', ')})`,
      `사용자 요청 "${safeMessage.slice(0, 50)}..."에서 ${intent.category} 카테고리로 분류했습니다. ` +
      `시맨틱 분석: ${intent.semanticHints.isMultiFile ? '다중 파일' : '단일 파일'}, ` +
      `${intent.semanticHints.isLargeScale ? '대규모 데이터' : '일반 규모'}`,
      [
        { option: 'general', reason: '범용 워크플로우', whyNotChosen: intent.category !== 'general' ? '더 구체적인 카테고리 감지됨' : '' },
        { option: 'rag', reason: 'RAG 기반 문서 검색/질의', whyNotChosen: intent.category !== 'rag' ? '문서 검색 키워드 부족' : '' },
        { option: 'multi_agent', reason: '다중 에이전트 평가', whyNotChosen: intent.category !== 'multi_agent' ? '전문가/평가 키워드 부족' : '' },
      ].filter(alt => alt.whyNotChosen),  // 선택되지 않은 대안만 포함
      0.85,
    )

    // 다중 에이전트 요청인 경우: 기본값으로 워크플로우 생성 (재질문 생략)
    // 이전: 필수 정보 없으면 재질문 → 시뮬레이션/자동화에서 실패
    // 현재: 기본값(3명 전문가, 범용 분야) 사용하여 즉시 생성
    if (intent.category === 'multi_agent') {
      const missingInfo = this.checkMultiAgentRequirements(safeMessage)
      if (missingInfo.length > 0) {
        // 기본값 적용 후 워크플로우 생성 진행 (재질문 없이)
        console.log('[IntegratedWorkflowAgent] multi_agent 기본값 적용:', missingInfo.length, '개 항목 자동 설정')
        // 기본값: 3명 전문가, 범용 평가 분야
        // 워크플로우 생성은 아래 로직에서 계속 진행됨
      }
    }

    // ===== LLM 프로바이더: Bedrock 직접 사용 (기본값) =====
    // LocalLLM은 LocalLLMProviderAdapter.connect() 성공 시에만 사용됨
    console.log('[IntegratedWorkflowAgent] Bedrock 직접 사용')

    // Bedrock 호출
    const bedrockResponse = await this.tryBedrockFallback(safeMessage, session.conversation, intent, session.currentWorkflow, messageType)

    if (bedrockResponse.success) {
        // Bedrock 응답 처리
        let workflow: WorkflowDesign | null = null
        const workflowMatch = bedrockResponse.content.match(/```workflow\s*([\s\S]*?)```/)
        if (workflowMatch) {
          try {
            workflow = this.normalizeWorkflow(JSON.parse(workflowMatch[1]))
            session.currentWorkflow = workflow
          } catch (parseError) {
            // JSON 파싱 실패 - 템플릿 기반 생성으로 fallback
            console.log('[IntegratedWorkflowAgent] JSON 파싱 실패, 템플릿 기반 생성:', parseError)
            workflow = this.generateWorkflowFromTemplate(intent, safeMessage, xaiSession.id)
            session.currentWorkflow = workflow
          }
        } else {
          // workflow 블록이 없으면 템플릿 기반 생성
          console.log('[IntegratedWorkflowAgent] workflow 블록 없음, 템플릿 기반 생성')
          workflow = this.generateWorkflowFromTemplate(intent, safeMessage, xaiSession.id)
          session.currentWorkflow = workflow
        }

        const responseText = bedrockResponse.content.replace(/```workflow[\s\S]*?```/g, '').trim() ||
          `## ${workflow.name}\n\n${workflow.description}\n\n### 설계 이유\n${workflow.reasoning}`

        session.conversation.push({
          role: 'assistant',
          content: responseText,
          timestamp: new Date().toISOString(),
          workflowSnapshot: workflow || undefined,
        })

        session.updatedAt = new Date().toISOString()

        // XAI 세션 완료 처리
        InteractiveXAI.completeSession(xaiSession.id, workflow?.name || 'Bedrock 응답')

        return {
          response: responseText,
          workflow,
          clarifyingQuestions: workflow ? [] : intent.clarifyingQuestions,
          suggestions: workflow?.suggestions || [],
          xaiSessionId: xaiSession.id,
        }
      }

      // Bedrock도 실패 - 연결 안내 반환
      console.log('[IntegratedWorkflowAgent] Bedrock도 실패, 연결 안내 반환')

      const connectionGuide = `## ⚠️ AI 연결 필요

워크플로우 생성을 위해 AI 모델 연결이 필요합니다.

### 연결 방법

**방법 1: 로컬 LLM (Ollama) - 무료**
1. Ollama 설치: https://ollama.ai
2. 모델 다운로드: \`ollama pull llama3.2\`
3. 실행 확인: \`ollama run llama3.2\`

**방법 2: AWS Bedrock - 유료**
1. 상단 메뉴 → AI 설정
2. AWS 자격 증명 입력 (Access Key, Secret Key, Region)
3. Bedrock 연결 테스트

**방법 3: API 키 설정**
1. 상단 메뉴 → AI 설정
2. OpenAI 또는 Anthropic API 키 입력

---

**현재 상태:**
- 로컬 LLM: ❌ 연결 안 됨
- AWS Bedrock: ${bedrockResponse.error?.includes('credentials') ? '❌ 자격 증명 필요' : '❌ 연결 안 됨'}

AI가 연결되면 다음이 가능합니다:
- 🎯 요구사항에 맞는 정교한 워크플로우 설계
- 💬 대화형 수정 및 개선
- 🧠 각 노드 선택 이유와 근거 설명`

      session.conversation.push({
        role: 'assistant',
        content: connectionGuide,
        timestamp: new Date().toISOString(),
      })

      session.updatedAt = new Date().toISOString()

    return {
      response: connectionGuide,
      workflow: null,
      clarifyingQuestions: [],
      suggestions: [
        'Ollama 설치 후 "ollama run llama3.2" 실행',
        'AWS 자격 증명 설정 (상단 AI 설정)',
        'OpenAI/Anthropic API 키 등록',
      ],
      xaiSessionId: xaiSession.id,
    }
  }

  /**
   * 워크플로우 수정 요청
   */
  async modifyWorkflow(
    sessionId: string,
    modification: string,
  ): Promise<{
    response: string
    workflow: WorkflowDesign | null
    changes: string[]
  }> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.currentWorkflow) {
      return {
        response: '수정할 워크플로우가 없습니다. 먼저 워크플로우를 생성해주세요.',
        workflow: null,
        changes: [],
      }
    }

    const currentWorkflowJson = JSON.stringify(session.currentWorkflow, null, 2)

    const prompt = `현재 워크플로우:
\`\`\`json
${currentWorkflowJson}
\`\`\`

수정 요청: ${modification}

위 워크플로우를 수정 요청에 맞게 변경하세요.
변경 사항을 설명하고, 수정된 워크플로우를 \`\`\`workflow 블록에 출력하세요.`

    const result = await this.chat(prompt, sessionId)

    // 변경 사항 추출 (간단한 분석)
    const changes: string[] = []
    if (result.workflow) {
      const oldNodes = session.currentWorkflow.nodes.length
      const newNodes = result.workflow.nodes.length
      if (newNodes !== oldNodes) {
        changes.push(`노드 수 변경: ${oldNodes} → ${newNodes}`)
      }

      const oldEdges = session.currentWorkflow.edges.length
      const newEdges = result.workflow.edges.length
      if (newEdges !== oldEdges) {
        changes.push(`연결 수 변경: ${oldEdges} → ${newEdges}`)
      }
    }

    return {
      response: result.response,
      workflow: result.workflow,
      changes,
    }
  }

  /**
   * 워크플로우 설명 요청
   */
  async explainWorkflow(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.currentWorkflow) {
      return '설명할 워크플로우가 없습니다.'
    }

    const workflow = session.currentWorkflow
    let explanation = `## ${workflow.name}\n\n`
    explanation += `**설명**: ${workflow.description}\n\n`
    explanation += `**전체 설계 이유**: ${workflow.reasoning}\n\n`
    explanation += `### 노드 구성\n\n`

    for (const node of workflow.nodes) {
      explanation += `#### ${node.label}\n`
      explanation += `- **도구**: ${node.tool || '없음'}\n`
      explanation += `- **이유**: ${node.reasoning}\n\n`
    }

    explanation += `### 데이터 흐름\n\n`
    for (const edge of workflow.edges) {
      const sourceNode = workflow.nodes.find(n => n.id === edge.source)
      const targetNode = workflow.nodes.find(n => n.id === edge.target)
      explanation += `- ${sourceNode?.label || edge.source} → ${targetNode?.label || edge.target}`
      if (edge.label) explanation += ` (${edge.label})`
      explanation += '\n'
    }

    if (workflow.suggestions.length > 0) {
      explanation += `\n### 추가 개선 제안\n\n`
      for (const suggestion of workflow.suggestions) {
        explanation += `- ${suggestion}\n`
      }
    }

    return explanation
  }

  /**
   * 도구 추천
   */
  recommendTools(task: string): {
    tools: string[]
    explanations: Record<string, string>
  } {
    const intent = this.analyzeIntent(task)
    const explanations: Record<string, string> = {}

    for (const tool of intent.suggestedTools) {
      const info = MCP_TOOL_KNOWLEDGE[tool as keyof typeof MCP_TOOL_KNOWLEDGE]
      if (info) {
        explanations[tool] = `${info.category} - ${info.bestFor}`
      }
    }

    return {
      tools: intent.suggestedTools,
      explanations,
    }
  }

  /**
   * 세션 관리
   */
  getSession(sessionId: string): AgentSession | null {
    return this.sessions.get(sessionId) || null
  }

  clearSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId)
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys())
  }

  // ============================================================
  // 피드백 및 학습 시스템
  // ============================================================

  /**
   * 워크플로우 피드백 기록
   * UI에서 사용자가 평가하면 호출
   */
  async recordWorkflowFeedback(
    sessionId: string,
    rating: 1 | 2 | 3 | 4 | 5,
    feedbackText?: string,
    corrections?: Array<{
      field: string
      original: any
      corrected: any
    }>
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.currentWorkflow) {
      console.warn('[IntegratedWorkflowAgent] 피드백 기록 실패: 세션 또는 워크플로우 없음')
      return
    }

    // 사용자 요청 찾기 (마지막 사용자 메시지)
    const lastUserMessage = session.conversation
      .filter(t => t.role === 'user')
      .pop()

    const feedback: WorkflowFeedback = {
      workflowId: session.currentWorkflow.name + '_' + Date.now(),
      sessionId,
      userRequest: lastUserMessage?.content || '',
      workflow: session.currentWorkflow,
      rating,
      feedbackText,
      corrections,
      timestamp: new Date().toISOString(),
    }

    await WorkflowLearningSystem.recordFeedback(feedback)
    console.log(`[IntegratedWorkflowAgent] 피드백 기록 완료: rating=${rating}`)
  }

  /**
   * 학습 데이터 내보내기
   * JSON 파일로 저장하여 다른 환경에서 가져오기 가능
   */
  async exportLearningData(): Promise<LearningData> {
    return WorkflowLearningSystem.exportLearningData()
  }

  /**
   * 학습 데이터 가져오기
   * 다른 환경에서 내보낸 JSON 파일 적용
   */
  async importLearningData(data: LearningData): Promise<{ imported: number; skipped: number }> {
    return WorkflowLearningSystem.importLearningData(data)
  }

  /**
   * 학습 통계 조회
   */
  getLearningStatistics(): {
    totalFeedbacks: number
    totalPatterns: number
    averageRating: number
    highConfidencePatterns: number
  } {
    return WorkflowLearningSystem.getStatistics()
  }

  /**
   * 학습 데이터 초기화
   */
  async clearLearningData(): Promise<void> {
    return WorkflowLearningSystem.clearLearningData()
  }
}

// 싱글톤 인스턴스
export const IntegratedWorkflowAgent = new IntegratedWorkflowAgentImpl()

// ============================================================
// 편의 함수
// ============================================================

/**
 * 워크플로우 생성 대화 시작
 */
export async function createWorkflowWithAgent(
  request: string,
  sessionId?: string,
) {
  return IntegratedWorkflowAgent.chat(request, sessionId)
}

/**
 * 워크플로우 수정
 */
export async function modifyWorkflowWithAgent(
  sessionId: string,
  modification: string,
) {
  return IntegratedWorkflowAgent.modifyWorkflow(sessionId, modification)
}

/**
 * 도구 추천 받기
 */
export function getToolRecommendations(task: string) {
  return IntegratedWorkflowAgent.recommendTools(task)
}

/**
 * 워크플로우 피드백 기록
 */
export async function recordWorkflowFeedback(
  sessionId: string,
  rating: 1 | 2 | 3 | 4 | 5,
  feedbackText?: string,
  corrections?: Array<{ field: string; original: any; corrected: any }>
) {
  return IntegratedWorkflowAgent.recordWorkflowFeedback(sessionId, rating, feedbackText, corrections)
}

/**
 * 학습 데이터 내보내기 (JSON)
 */
export async function exportWorkflowLearningData(): Promise<LearningData> {
  return IntegratedWorkflowAgent.exportLearningData()
}

/**
 * 학습 데이터 가져오기
 */
export async function importWorkflowLearningData(data: LearningData) {
  return IntegratedWorkflowAgent.importLearningData(data)
}

/**
 * 학습 통계 조회
 */
export function getWorkflowLearningStats() {
  return IntegratedWorkflowAgent.getLearningStatistics()
}
