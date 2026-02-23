/**
 * Interactive XAI Service
 *
 * 설명 가능한 AI의 핵심 구현:
 * 1. 실시간 추론 과정 표시 - AI가 결정할 때마다 즉시 표시
 * 2. 사용자 개입 지점 - 각 단계에서 수정/승인 가능
 * 3. 대안 제시 - "왜 이것인가? 다른 옵션은?"
 */

// ============================================================
// Types
// ============================================================

/** 추론 단계 하나 */
export interface XAIDecisionStep {
  id: string
  timestamp: number

  /** 결정 유형 */
  type: 'intent_analysis' | 'node_selection' | 'connection_design' | 'config_decision' | 'validation'

  /** 결정 내용 */
  decision: string

  /** 왜 이 결정을 했는지 */
  reasoning: string

  /** 고려한 대안들 */
  alternatives: {
    option: string
    reason: string
    whyNotChosen: string
  }[]

  /** 사용된 정보/지식 */
  usedKnowledge: string[]

  /** 신뢰도 (0-1) */
  confidence: number

  /** 사용자가 수정했는지 */
  userModified: boolean

  /** 사용자 수정 내용 (있으면) */
  userModification?: string

  /** 상태 */
  status: 'pending' | 'approved' | 'modified' | 'rejected'
}

/** 전체 XAI 세션 */
export interface XAISession {
  id: string
  startTime: number
  userRequest: string
  steps: XAIDecisionStep[]
  status: 'in_progress' | 'completed' | 'cancelled'
  finalDecision?: string
}

/** 사용자 개입 요청 */
export interface XAIInterventionRequest {
  stepId: string
  action: 'approve' | 'modify' | 'reject' | 'ask_why'
  modification?: string
  question?: string
}

/** 사용자 개입 응답 */
export interface XAIInterventionResponse {
  stepId: string
  success: boolean
  message: string
  newStep?: XAIDecisionStep
}

// ============================================================
// Event System (실시간 업데이트용)
// ============================================================

export type XAIEventListener = (event: XAIEvent) => void

export interface XAIEvent {
  type: 'step_started' | 'step_completed' | 'decision_made' | 'awaiting_approval' | 'session_completed'
  sessionId: string
  data: any
}

// ============================================================
// Interactive XAI Service
// ============================================================

class InteractiveXAIServiceImpl {
  private sessions: Map<string, XAISession> = new Map()
  private listeners: XAIEventListener[] = []
  private pendingApprovals: Map<string, (response: XAIInterventionResponse) => void> = new Map()

  // --------------------------------------------------------
  // Event System
  // --------------------------------------------------------

  /** 이벤트 구독 */
  subscribe(listener: XAIEventListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private emit(event: XAIEvent): void {
    this.listeners.forEach(l => l(event))
  }

  // --------------------------------------------------------
  // Session Management
  // --------------------------------------------------------

  /** 새 XAI 세션 시작 */
  startSession(userRequest: string): XAISession {
    const session: XAISession = {
      id: `xai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: Date.now(),
      userRequest,
      steps: [],
      status: 'in_progress',
    }

    this.sessions.set(session.id, session)

    this.emit({
      type: 'step_started',
      sessionId: session.id,
      data: { userRequest },
    })

    return session
  }

  /** 세션 가져오기 */
  getSession(sessionId: string): XAISession | undefined {
    return this.sessions.get(sessionId)
  }

  // --------------------------------------------------------
  // Decision Recording (AI가 결정할 때마다 호출)
  // --------------------------------------------------------

  /**
   * 의도 분석 결정 기록
   */
  recordIntentAnalysis(
    sessionId: string,
    detectedIntent: string,
    reasoning: string,
    alternatives: { option: string; reason: string; whyNotChosen: string }[],
    confidence: number
  ): XAIDecisionStep {
    return this.recordDecision(sessionId, {
      type: 'intent_analysis',
      decision: detectedIntent,
      reasoning,
      alternatives,
      usedKnowledge: ['사용자 입력 분석', '키워드 감지', '컨텍스트 이해'],
      confidence,
    })
  }

  /**
   * 노드 선택 결정 기록
   */
  recordNodeSelection(
    sessionId: string,
    selectedNode: string,
    reasoning: string,
    alternatives: { option: string; reason: string; whyNotChosen: string }[],
    usedKnowledge: string[],
    confidence: number
  ): XAIDecisionStep {
    return this.recordDecision(sessionId, {
      type: 'node_selection',
      decision: selectedNode,
      reasoning,
      alternatives,
      usedKnowledge,
      confidence,
    })
  }

  /**
   * 연결 설계 결정 기록
   */
  recordConnectionDesign(
    sessionId: string,
    connection: string,
    reasoning: string,
    confidence: number
  ): XAIDecisionStep {
    return this.recordDecision(sessionId, {
      type: 'connection_design',
      decision: connection,
      reasoning,
      alternatives: [],
      usedKnowledge: ['데이터 흐름 분석', '노드 입출력 타입'],
      confidence,
    })
  }

  /**
   * 설정 결정 기록
   */
  recordConfigDecision(
    sessionId: string,
    config: string,
    reasoning: string,
    alternatives: { option: string; reason: string; whyNotChosen: string }[],
    confidence: number
  ): XAIDecisionStep {
    return this.recordDecision(sessionId, {
      type: 'config_decision',
      decision: config,
      reasoning,
      alternatives,
      usedKnowledge: ['도메인 지식', '사용자 컨텍스트', '학습된 패턴'],
      confidence,
    })
  }

  /**
   * 범용 결정 기록
   */
  private recordDecision(
    sessionId: string,
    params: {
      type: XAIDecisionStep['type']
      decision: string
      reasoning: string
      alternatives: { option: string; reason: string; whyNotChosen: string }[]
      usedKnowledge: string[]
      confidence: number
    }
  ): XAIDecisionStep {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`XAI 세션 없음: ${sessionId}`)
    }

    const step: XAIDecisionStep = {
      id: `step_${session.steps.length + 1}`,
      timestamp: Date.now(),
      type: params.type,
      decision: params.decision,
      reasoning: params.reasoning,
      alternatives: params.alternatives,
      usedKnowledge: params.usedKnowledge,
      confidence: params.confidence,
      userModified: false,
      status: 'pending',
    }

    session.steps.push(step)

    this.emit({
      type: 'decision_made',
      sessionId,
      data: step,
    })

    return step
  }

  // --------------------------------------------------------
  // User Intervention (사용자 개입)
  // --------------------------------------------------------

  /**
   * 사용자 승인 요청
   * 중요한 결정에서 사용자에게 확인을 구함
   */
  async requestApproval(sessionId: string, stepId: string): Promise<XAIInterventionResponse> {
    this.emit({
      type: 'awaiting_approval',
      sessionId,
      data: { stepId },
    })

    // 사용자 응답 대기 (Promise로 처리)
    return new Promise((resolve) => {
      this.pendingApprovals.set(stepId, resolve)

      // 30초 타임아웃 - 자동 승인
      setTimeout(() => {
        if (this.pendingApprovals.has(stepId)) {
          this.pendingApprovals.delete(stepId)
          resolve({
            stepId,
            success: true,
            message: '자동 승인 (타임아웃)',
          })
        }
      }, 30000)
    })
  }

  /**
   * 사용자 개입 처리
   */
  processIntervention(request: XAIInterventionRequest): XAIInterventionResponse {
    const resolver = this.pendingApprovals.get(request.stepId)

    // 해당 세션과 단계 찾기
    let session: XAISession | undefined
    let step: XAIDecisionStep | undefined

    for (const s of this.sessions.values()) {
      const foundStep = s.steps.find(st => st.id === request.stepId)
      if (foundStep) {
        session = s
        step = foundStep
        break
      }
    }

    if (!session || !step) {
      return {
        stepId: request.stepId,
        success: false,
        message: '해당 결정을 찾을 수 없습니다.',
      }
    }

    let response: XAIInterventionResponse

    switch (request.action) {
      case 'approve':
        step.status = 'approved'
        response = {
          stepId: request.stepId,
          success: true,
          message: '승인되었습니다.',
        }
        break

      case 'modify':
        if (!request.modification) {
          response = {
            stepId: request.stepId,
            success: false,
            message: '수정 내용이 필요합니다.',
          }
        } else {
          step.status = 'modified'
          step.userModified = true
          step.userModification = request.modification
          step.decision = request.modification

          response = {
            stepId: request.stepId,
            success: true,
            message: '수정이 반영되었습니다.',
            newStep: step,
          }
        }
        break

      case 'reject':
        step.status = 'rejected'
        response = {
          stepId: request.stepId,
          success: true,
          message: '거부되었습니다. 대안을 찾습니다.',
        }
        break

      case 'ask_why':
        // "왜?" 질문에 대한 상세 설명 제공
        response = {
          stepId: request.stepId,
          success: true,
          message: this.generateDetailedExplanation(step, request.question),
        }
        break

      default:
        response = {
          stepId: request.stepId,
          success: false,
          message: '알 수 없는 액션입니다.',
        }
    }

    // 대기 중인 Promise 해결
    if (resolver) {
      this.pendingApprovals.delete(request.stepId)
      resolver(response)
    }

    return response
  }

  /**
   * 상세 설명 생성 (사용자가 "왜?"라고 물을 때)
   */
  private generateDetailedExplanation(step: XAIDecisionStep, question?: string): string {
    let explanation = `## ${step.decision}을(를) 선택한 이유\n\n`

    explanation += `### 주요 근거\n${step.reasoning}\n\n`

    if (step.usedKnowledge.length > 0) {
      explanation += `### 사용된 지식/정보\n`
      explanation += step.usedKnowledge.map(k => `- ${k}`).join('\n')
      explanation += '\n\n'
    }

    if (step.alternatives.length > 0) {
      explanation += `### 고려했던 대안들\n`
      for (const alt of step.alternatives) {
        explanation += `- **${alt.option}**: ${alt.reason}\n`
        explanation += `  - 선택하지 않은 이유: ${alt.whyNotChosen}\n`
      }
      explanation += '\n'
    }

    explanation += `### 신뢰도: ${(step.confidence * 100).toFixed(0)}%\n`

    if (question) {
      explanation += `\n### "${question}"에 대한 추가 설명\n`
      explanation += `이 결정은 ${step.type === 'node_selection' ? '노드 선택' : step.type === 'intent_analysis' ? '의도 분석' : '설정 결정'} 단계에서 이루어졌습니다. `
      explanation += `사용자의 원래 요청과 가용한 도구/노드를 고려하여 가장 적합한 옵션을 선택했습니다.`
    }

    return explanation
  }

  // --------------------------------------------------------
  // Session Completion
  // --------------------------------------------------------

  /**
   * 세션 완료
   */
  completeSession(sessionId: string, finalDecision: string): XAISession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`XAI 세션 없음: ${sessionId}`)
    }

    session.status = 'completed'
    session.finalDecision = finalDecision

    this.emit({
      type: 'session_completed',
      sessionId,
      data: { finalDecision, totalSteps: session.steps.length },
    })

    return session
  }

  // --------------------------------------------------------
  // Summary & Export
  // --------------------------------------------------------

  /**
   * 세션 요약 생성 (UI용)
   */
  generateSessionSummary(sessionId: string): string {
    const session = this.sessions.get(sessionId)
    if (!session) return '세션을 찾을 수 없습니다.'

    let summary = `## 워크플로우 생성 과정 요약\n\n`
    summary += `**요청**: ${session.userRequest}\n`
    summary += `**총 결정 단계**: ${session.steps.length}개\n`
    summary += `**사용자 수정**: ${session.steps.filter(s => s.userModified).length}개\n\n`

    summary += `### 주요 결정들\n\n`

    for (const step of session.steps) {
      const statusIcon = step.status === 'approved' ? '✅' :
                         step.status === 'modified' ? '✏️' :
                         step.status === 'rejected' ? '❌' : '⏳'

      summary += `${statusIcon} **${this.getStepTypeLabel(step.type)}**: ${step.decision}\n`
      summary += `   - 이유: ${step.reasoning.slice(0, 100)}${step.reasoning.length > 100 ? '...' : ''}\n`

      if (step.userModified && step.userModification) {
        summary += `   - 사용자 수정: ${step.userModification}\n`
      }

      summary += '\n'
    }

    return summary
  }

  private getStepTypeLabel(type: XAIDecisionStep['type']): string {
    const labels: Record<XAIDecisionStep['type'], string> = {
      intent_analysis: '의도 분석',
      node_selection: '노드 선택',
      connection_design: '연결 설계',
      config_decision: '설정 결정',
      validation: '검증',
    }
    return labels[type] || type
  }

  /**
   * 모든 단계를 구조화된 형태로 반환 (XAI 패널용)
   */
  getStructuredSteps(sessionId: string): {
    steps: XAIDecisionStep[]
    summary: {
      totalSteps: number
      approvedSteps: number
      modifiedSteps: number
      avgConfidence: number
    }
  } | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null

    const approvedSteps = session.steps.filter(s => s.status === 'approved').length
    const modifiedSteps = session.steps.filter(s => s.userModified).length
    const avgConfidence = session.steps.reduce((sum, s) => sum + s.confidence, 0) / session.steps.length

    return {
      steps: session.steps,
      summary: {
        totalSteps: session.steps.length,
        approvedSteps,
        modifiedSteps,
        avgConfidence,
      },
    }
  }
}

// 싱글톤 인스턴스
export const InteractiveXAI = new InteractiveXAIServiceImpl()

// 편의 함수들
export function startXAISession(userRequest: string) {
  return InteractiveXAI.startSession(userRequest)
}

export function recordNodeDecision(
  sessionId: string,
  nodeType: string,
  reasoning: string,
  alternatives: { option: string; reason: string; whyNotChosen: string }[],
  confidence: number
) {
  return InteractiveXAI.recordNodeSelection(
    sessionId,
    nodeType,
    reasoning,
    alternatives,
    ['NodeRegistry', '노드 타입 매칭', '사용자 의도'],
    confidence
  )
}

export function subscribeToXAI(listener: XAIEventListener) {
  return InteractiveXAI.subscribe(listener)
}
