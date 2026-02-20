/**
 * WorkflowLearningService
 *
 * 워크플로우 생성기의 성능을 개선하기 위한 학습 시스템.
 * 사용자 피드백, 실행 결과, 대화 기록을 분석하여 프롬프트 품질을 향상.
 *
 * ## 학습 방법
 * 1. 피드백 수집: 사용자가 생성된 워크플로우를 수정/실행했는지 추적
 * 2. 패턴 학습: 성공적인 워크플로우의 패턴 저장
 * 3. 프롬프트 개선: Few-shot 예시로 활용
 */

import type { WorkflowFile } from '../types/WorkflowFile'
import type { ChatMessage } from '../types/ChatTypes'

// ============================================================
// 타입 정의
// ============================================================

export interface WorkflowFeedback {
  id: string
  workflowId: string
  timestamp: number

  // 원본 요청
  userRequest: string
  generatedWorkflow: WorkflowFile

  // 사용자 행동
  wasApplied: boolean           // 워크플로우 적용 여부
  wasModified: boolean          // 사용자가 수정했는지
  wasExecuted: boolean          // 실행 여부
  executionSuccess: boolean     // 실행 성공 여부

  // 명시적 피드백 (선택적)
  rating?: number               // 1-5 별점
  feedbackText?: string         // 사용자 피드백 텍스트

  // 대화 컨텍스트
  conversationTurns: number     // 몇 번의 대화가 오갔는지
  clarificationCount: number    // 추가 질문 횟수
}

export interface LearnedPattern {
  id: string
  category: string              // 'pdf-summary', 'data-analysis', etc.
  keywords: string[]            // 트리거 키워드
  successRate: number           // 성공률 (0-1)
  exampleCount: number          // 예시 수

  // Few-shot 예시
  exampleRequest: string
  exampleWorkflow: WorkflowFile
  exampleConversation: ChatMessage[]

  createdAt: string
  updatedAt: string
}

export interface LearningStats {
  totalFeedbacks: number
  successRate: number
  avgConversationTurns: number
  topPatterns: Array<{ category: string; count: number; successRate: number }>
  recentImprovements: string[]
}

// ============================================================
// 로컬 스토리지 키
// ============================================================

const STORAGE_KEYS = {
  FEEDBACKS: 'handbox-workflow-feedbacks',
  PATTERNS: 'handbox-learned-patterns',
  STATS: 'handbox-learning-stats',
  ERROR_PATTERNS: 'handbox-error-patterns',
}

// ============================================================
// 오류 패턴 타입 (스트레스 테스트에서 학습)
// ============================================================

export interface ErrorPattern {
  source_node_type: string
  target_node_type: string | null
  error_type: string
  error_message: string
  occurrence_count: number
  suggestion: string
}

// ============================================================
// 피드백 수집
// ============================================================

/**
 * 워크플로우 생성 피드백 기록
 */
export function recordWorkflowFeedback(feedback: Omit<WorkflowFeedback, 'id' | 'timestamp'>): void {
  const fullFeedback: WorkflowFeedback = {
    ...feedback,
    id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
  }

  // 로컬 스토리지에 저장
  const existing = getFeedbacks()
  existing.push(fullFeedback)

  // 최근 100개만 유지
  const trimmed = existing.slice(-100)
  localStorage.setItem(STORAGE_KEYS.FEEDBACKS, JSON.stringify(trimmed))

  // 패턴 학습 트리거
  analyzeAndLearn(fullFeedback)

  console.log('[WorkflowLearning] 피드백 기록:', fullFeedback.id)
}

/**
 * 모든 피드백 조회
 */
export function getFeedbacks(): WorkflowFeedback[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.FEEDBACKS)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// ============================================================
// 패턴 학습
// ============================================================

/**
 * 피드백을 분석하여 패턴 학습
 */
function analyzeAndLearn(feedback: WorkflowFeedback): void {
  // 성공적인 워크플로우만 학습
  if (!feedback.wasApplied || !feedback.executionSuccess) return

  const category = categorizeRequest(feedback.userRequest)
  const keywords = extractKeywords(feedback.userRequest)

  const patterns = getLearnedPatterns()
  const existingPattern = patterns.find(p => p.category === category)

  if (existingPattern) {
    // 기존 패턴 업데이트
    existingPattern.successRate = (existingPattern.successRate * existingPattern.exampleCount + 1) / (existingPattern.exampleCount + 1)
    existingPattern.exampleCount += 1
    existingPattern.updatedAt = new Date().toISOString()

    // 키워드 병합
    existingPattern.keywords = [...new Set([...existingPattern.keywords, ...keywords])]
  } else {
    // 새 패턴 생성
    const newPattern: LearnedPattern = {
      id: `pat_${Date.now()}`,
      category,
      keywords,
      successRate: 1,
      exampleCount: 1,
      exampleRequest: feedback.userRequest,
      exampleWorkflow: feedback.generatedWorkflow,
      exampleConversation: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    patterns.push(newPattern)
  }

  localStorage.setItem(STORAGE_KEYS.PATTERNS, JSON.stringify(patterns))
  console.log('[WorkflowLearning] 패턴 학습 완료:', category)
}

/**
 * 학습된 패턴 조회
 */
export function getLearnedPatterns(): LearnedPattern[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PATTERNS)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/**
 * 요청에 매칭되는 패턴 찾기
 */
export function findMatchingPatterns(userRequest: string): LearnedPattern[] {
  const patterns = getLearnedPatterns()
  const keywords = extractKeywords(userRequest)

  return patterns
    .filter(pattern => {
      const matchCount = pattern.keywords.filter(k => keywords.includes(k)).length
      return matchCount >= 2 // 최소 2개 키워드 일치
    })
    .sort((a, b) => b.successRate - a.successRate)
}

// ============================================================
// 프롬프트 개선
// ============================================================

/**
 * 학습된 패턴을 바탕으로 Few-shot 예시 생성
 */
export function generateFewShotExamples(userRequest: string): string {
  const matchingPatterns = findMatchingPatterns(userRequest)

  if (matchingPatterns.length === 0) return ''

  const examples = matchingPatterns.slice(0, 2).map(pattern => `
## 성공 사례 (${pattern.category})
사용자 요청: "${pattern.exampleRequest}"
성공률: ${(pattern.successRate * 100).toFixed(0)}%
`)

  return `
# 참고: 유사한 성공 사례
${examples.join('\n')}
위 사례들을 참고하여 워크플로우를 설계하세요.
`
}

/**
 * 학습된 오류 패턴 조회
 */
export function getErrorPatterns(): ErrorPattern[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.ERROR_PATTERNS)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/**
 * 특정 노드 조합에 대한 오류 패턴 확인
 */
export function hasKnownIssue(sourceType: string, targetType?: string): ErrorPattern | null {
  const patterns = getErrorPatterns()
  return patterns.find(p =>
    p.source_node_type === sourceType &&
    (!targetType || p.target_node_type === targetType)
  ) || null
}

/**
 * 학습 통계 기반 시스템 프롬프트 보강
 * 오류 패턴 기반 회피 지침 포함
 */
export function enhanceSystemPrompt(basePrompt: string): string {
  const stats = getLearningStats()
  const errorPatterns = getErrorPatterns()

  const improvements = []

  // 평균 대화 턴수가 3 이상이면 더 구체적인 질문 권장
  if (stats.avgConversationTurns > 3) {
    improvements.push('- 첫 응답에서 가능한 구체적인 질문을 하여 대화 효율성을 높이세요.')
  }

  // 성공률이 낮으면 단순한 워크플로우 권장
  if (stats.successRate < 0.7) {
    improvements.push('- 복잡한 워크플로우보다 단순하고 명확한 구조를 선호하세요.')
  }

  // 상위 패턴 참고
  if (stats.topPatterns.length > 0) {
    const topPattern = stats.topPatterns[0]
    improvements.push(`- "${topPattern.category}" 유형이 가장 많이 요청됩니다 (성공률: ${(topPattern.successRate * 100).toFixed(0)}%).`)
  }

  // 오류 패턴 기반 회피 지침 (상위 5개)
  if (errorPatterns.length > 0) {
    improvements.push('\n## 알려진 문제 (회피 필요)')
    const topErrors = errorPatterns.slice(0, 5)
    for (const pattern of topErrors) {
      const connection = pattern.target_node_type
        ? `${pattern.source_node_type} → ${pattern.target_node_type}`
        : pattern.source_node_type
      improvements.push(`- ${connection}: ${pattern.suggestion}`)
    }
  }

  if (improvements.length === 0) return basePrompt

  return `${basePrompt}

# 학습된 개선사항
${improvements.join('\n')}
`
}

// ============================================================
// 통계
// ============================================================

/**
 * 학습 통계 조회
 */
export function getLearningStats(): LearningStats {
  const feedbacks = getFeedbacks()
  const patterns = getLearnedPatterns()

  if (feedbacks.length === 0) {
    return {
      totalFeedbacks: 0,
      successRate: 0,
      avgConversationTurns: 0,
      topPatterns: [],
      recentImprovements: [],
    }
  }

  const successCount = feedbacks.filter(f => f.executionSuccess).length
  const totalTurns = feedbacks.reduce((sum, f) => sum + f.conversationTurns, 0)

  // 패턴별 통계
  const patternStats = patterns
    .map(p => ({
      category: p.category,
      count: p.exampleCount,
      successRate: p.successRate,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    totalFeedbacks: feedbacks.length,
    successRate: successCount / feedbacks.length,
    avgConversationTurns: totalTurns / feedbacks.length,
    topPatterns: patternStats,
    recentImprovements: [], // TODO: 실제 개선 내역 추적
  }
}

// ============================================================
// 유틸리티
// ============================================================

/**
 * 요청 카테고리 분류
 */
function categorizeRequest(request: string): string {
  const lower = request.toLowerCase()

  if (lower.includes('pdf') || lower.includes('문서')) {
    if (lower.includes('요약')) return 'document-summary'
    if (lower.includes('분석')) return 'document-analysis'
    return 'document-processing'
  }

  if (lower.includes('csv') || lower.includes('엑셀') || lower.includes('데이터')) {
    return 'data-analysis'
  }

  if (lower.includes('이미지') || lower.includes('사진')) {
    return 'image-processing'
  }

  if (lower.includes('번역')) return 'translation'
  if (lower.includes('요약')) return 'summarization'
  if (lower.includes('검색')) return 'search'
  if (lower.includes('보고서')) return 'report-generation'

  return 'general'
}

/**
 * 키워드 추출
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['을', '를', '이', '가', '은', '는', '에', '의', '와', '과', '로', '으로', '해줘', '해주세요', '만들어줘', '하는'])

  return text
    .toLowerCase()
    .split(/[\s,.!?]+/)
    .filter(word => word.length >= 2 && !stopWords.has(word))
    .slice(0, 10)
}

// ============================================================
// 명시적 피드백 수집
// ============================================================

/**
 * 사용자에게 피드백 요청
 */
export function requestUserFeedback(_workflowId: string): Promise<{ rating: number; text: string } | null> {
  // UI에서 호출 - 다이얼로그로 피드백 수집
  // _workflowId will be used to identify the workflow for feedback
  return Promise.resolve(null) // TODO: 실제 구현
}

/**
 * 피드백 저장
 */
export function saveUserFeedback(workflowId: string, rating: number, text: string): void {
  const feedbacks = getFeedbacks()
  const feedback = feedbacks.find(f => f.workflowId === workflowId)

  if (feedback) {
    feedback.rating = rating
    feedback.feedbackText = text
    localStorage.setItem(STORAGE_KEYS.FEEDBACKS, JSON.stringify(feedbacks))
    console.log('[WorkflowLearning] 사용자 피드백 저장:', workflowId)
  }
}

// ============================================================
// 데이터 내보내기/가져오기
// ============================================================

/**
 * 학습 데이터 내보내기
 */
export function exportLearningData(): string {
  return JSON.stringify({
    feedbacks: getFeedbacks(),
    patterns: getLearnedPatterns(),
    stats: getLearningStats(),
    exportedAt: new Date().toISOString(),
  }, null, 2)
}

/**
 * 학습 데이터 가져오기
 */
export function importLearningData(json: string): boolean {
  try {
    const data = JSON.parse(json)
    if (data.feedbacks) {
      localStorage.setItem(STORAGE_KEYS.FEEDBACKS, JSON.stringify(data.feedbacks))
    }
    if (data.patterns) {
      localStorage.setItem(STORAGE_KEYS.PATTERNS, JSON.stringify(data.patterns))
    }
    console.log('[WorkflowLearning] 학습 데이터 가져오기 완료')
    return true
  } catch (error) {
    console.error('[WorkflowLearning] 가져오기 실패:', error)
    return false
  }
}

/**
 * 학습 데이터 초기화
 */
export function clearLearningData(): void {
  localStorage.removeItem(STORAGE_KEYS.FEEDBACKS)
  localStorage.removeItem(STORAGE_KEYS.PATTERNS)
  localStorage.removeItem(STORAGE_KEYS.STATS)
  console.log('[WorkflowLearning] 학습 데이터 초기화')
}
