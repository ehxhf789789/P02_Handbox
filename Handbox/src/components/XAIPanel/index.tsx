/**
 * XAI Panel - 설명 가능한 AI 패널
 *
 * AI의 실시간 추론 과정을 표시하고 사용자 개입을 허용합니다.
 * - 각 결정 단계를 실시간으로 표시
 * - 사용자가 승인/수정/거부 가능
 * - "왜?" 질문으로 상세 설명 요청 가능
 */

import { useState, useEffect, useCallback } from 'react'
import {
  InteractiveXAI,
  subscribeToXAI,
  type XAIDecisionStep,
  type XAISession,
  type XAIEvent,
} from '../../services/InteractiveXAI'
import './styles.css'

interface XAIPanelProps {
  sessionId?: string
  isOpen: boolean
  onClose: () => void
}

export function XAIPanel({ sessionId, isOpen, onClose }: XAIPanelProps) {
  const [session, setSession] = useState<XAISession | null>(null)
  const [steps, setSteps] = useState<XAIDecisionStep[]>([])
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [modifyingStep, setModifyingStep] = useState<string | null>(null)
  const [modificationText, setModificationText] = useState('')
  const [askingWhy, setAskingWhy] = useState<string | null>(null)
  const [whyQuestion, setWhyQuestion] = useState('')
  const [whyResponse, setWhyResponse] = useState<string | null>(null)

  // XAI 이벤트 구독
  useEffect(() => {
    const unsubscribe = subscribeToXAI((event: XAIEvent) => {
      if (sessionId && event.sessionId === sessionId) {
        // 세션 업데이트
        const updatedSession = InteractiveXAI.getSession(sessionId)
        if (updatedSession) {
          setSession(updatedSession)
          setSteps([...updatedSession.steps])
        }
      }
    })

    // 초기 세션 로드
    if (sessionId) {
      const existingSession = InteractiveXAI.getSession(sessionId)
      if (existingSession) {
        setSession(existingSession)
        setSteps([...existingSession.steps])
      }
    }

    return unsubscribe
  }, [sessionId])

  // 결정 승인
  const handleApprove = useCallback((stepId: string) => {
    const response = InteractiveXAI.processIntervention({
      stepId,
      action: 'approve',
    })
    console.log('[XAIPanel] 승인:', response)
  }, [])

  // 결정 수정
  const handleModify = useCallback((stepId: string) => {
    if (!modificationText.trim()) return

    const response = InteractiveXAI.processIntervention({
      stepId,
      action: 'modify',
      modification: modificationText,
    })
    console.log('[XAIPanel] 수정:', response)
    setModifyingStep(null)
    setModificationText('')
  }, [modificationText])

  // 결정 거부
  const handleReject = useCallback((stepId: string) => {
    const response = InteractiveXAI.processIntervention({
      stepId,
      action: 'reject',
    })
    console.log('[XAIPanel] 거부:', response)
  }, [])

  // "왜?" 질문
  const handleAskWhy = useCallback((stepId: string) => {
    const response = InteractiveXAI.processIntervention({
      stepId,
      action: 'ask_why',
      question: whyQuestion || undefined,
    })
    setWhyResponse(response.message)
    setAskingWhy(null)
    setWhyQuestion('')
  }, [whyQuestion])

  // 단계 타입 아이콘
  const getStepIcon = (type: XAIDecisionStep['type']) => {
    switch (type) {
      case 'intent_analysis': return '🎯'
      case 'node_selection': return '📦'
      case 'connection_design': return '🔗'
      case 'config_decision': return '⚙️'
      case 'validation': return '✅'
      default: return '📋'
    }
  }

  // 상태 아이콘
  const getStatusIcon = (status: XAIDecisionStep['status']) => {
    switch (status) {
      case 'approved': return '✅'
      case 'modified': return '✏️'
      case 'rejected': return '❌'
      case 'pending': return '⏳'
      default: return '❓'
    }
  }

  // 신뢰도 색상
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return '#10b981'  // green
    if (confidence >= 0.6) return '#f59e0b'  // yellow
    return '#ef4444'  // red
  }

  if (!isOpen) return null

  return (
    <div className="xai-panel-overlay">
      <div className="xai-panel">
        <div className="xai-panel-header">
          <h2>🧠 AI 추론 과정 (XAI)</h2>
          <button className="xai-close-btn" onClick={onClose}>×</button>
        </div>

        {!sessionId ? (
          <div className="xai-panel-empty">
            <p>워크플로우 생성을 시작하면 AI의 추론 과정이 여기에 표시됩니다.</p>
          </div>
        ) : !session ? (
          <div className="xai-panel-loading">
            <p>세션 로딩 중...</p>
          </div>
        ) : (
          <>
            {/* 세션 정보 */}
            <div className="xai-session-info">
              <div className="xai-session-request">
                <strong>사용자 요청:</strong> {session.userRequest}
              </div>
              <div className="xai-session-status">
                상태: {session.status === 'in_progress' ? '⏳ 진행 중' : session.status === 'completed' ? '✅ 완료' : '❌ 취소됨'}
              </div>
            </div>

            {/* 결정 단계들 */}
            <div className="xai-steps">
              {steps.length === 0 ? (
                <div className="xai-no-steps">
                  <p>아직 결정 단계가 없습니다. AI가 분석 중...</p>
                </div>
              ) : (
                steps.map((step, index) => (
                  <div
                    key={step.id}
                    className={`xai-step ${step.status} ${expandedStep === step.id ? 'expanded' : ''}`}
                  >
                    {/* 단계 헤더 */}
                    <div
                      className="xai-step-header"
                      onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                    >
                      <span className="xai-step-number">{index + 1}</span>
                      <span className="xai-step-icon">{getStepIcon(step.type)}</span>
                      <span className="xai-step-decision">{step.decision}</span>
                      <span className="xai-step-status">{getStatusIcon(step.status)}</span>
                      <span
                        className="xai-step-confidence"
                        style={{ color: getConfidenceColor(step.confidence) }}
                      >
                        {Math.round(step.confidence * 100)}%
                      </span>
                    </div>

                    {/* 확장된 상세 정보 */}
                    {expandedStep === step.id && (
                      <div className="xai-step-details">
                        {/* 추론 이유 */}
                        <div className="xai-detail-section">
                          <h4>💭 추론 이유</h4>
                          <p>{step.reasoning}</p>
                        </div>

                        {/* 사용된 지식 */}
                        {step.usedKnowledge.length > 0 && (
                          <div className="xai-detail-section">
                            <h4>📚 사용된 정보</h4>
                            <ul>
                              {step.usedKnowledge.map((k, i) => (
                                <li key={i}>{k}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* 대안들 */}
                        {step.alternatives.length > 0 && (
                          <div className="xai-detail-section">
                            <h4>🔄 고려한 대안</h4>
                            {step.alternatives.map((alt, i) => (
                              <div key={i} className="xai-alternative">
                                <strong>{alt.option}</strong>: {alt.reason}
                                <span className="xai-why-not"> (선택 안 함: {alt.whyNotChosen})</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 사용자 수정 내역 */}
                        {step.userModified && step.userModification && (
                          <div className="xai-detail-section xai-user-modified">
                            <h4>✏️ 사용자 수정</h4>
                            <p>{step.userModification}</p>
                          </div>
                        )}

                        {/* "왜?" 응답 */}
                        {whyResponse && expandedStep === step.id && (
                          <div className="xai-detail-section xai-why-response">
                            <h4>❓ 상세 설명</h4>
                            <div dangerouslySetInnerHTML={{ __html: whyResponse.replace(/\n/g, '<br>') }} />
                          </div>
                        )}

                        {/* 액션 버튼들 */}
                        <div className="xai-step-actions">
                          {step.status === 'pending' && (
                            <>
                              <button
                                className="xai-btn approve"
                                onClick={() => handleApprove(step.id)}
                              >
                                ✅ 승인
                              </button>
                              <button
                                className="xai-btn modify"
                                onClick={() => setModifyingStep(step.id)}
                              >
                                ✏️ 수정
                              </button>
                              <button
                                className="xai-btn reject"
                                onClick={() => handleReject(step.id)}
                              >
                                ❌ 거부
                              </button>
                            </>
                          )}
                          <button
                            className="xai-btn why"
                            onClick={() => setAskingWhy(step.id)}
                          >
                            ❓ 왜?
                          </button>
                        </div>

                        {/* 수정 입력 */}
                        {modifyingStep === step.id && (
                          <div className="xai-modify-input">
                            <textarea
                              placeholder="수정할 내용을 입력하세요..."
                              value={modificationText}
                              onChange={(e) => setModificationText(e.target.value)}
                            />
                            <div className="xai-modify-actions">
                              <button onClick={() => handleModify(step.id)}>적용</button>
                              <button onClick={() => setModifyingStep(null)}>취소</button>
                            </div>
                          </div>
                        )}

                        {/* "왜?" 질문 입력 */}
                        {askingWhy === step.id && (
                          <div className="xai-why-input">
                            <input
                              type="text"
                              placeholder="추가 질문이 있으면 입력하세요 (선택사항)"
                              value={whyQuestion}
                              onChange={(e) => setWhyQuestion(e.target.value)}
                            />
                            <div className="xai-why-actions">
                              <button onClick={() => handleAskWhy(step.id)}>설명 보기</button>
                              <button onClick={() => setAskingWhy(null)}>취소</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* 세션 요약 */}
            {session.status === 'completed' && (
              <div className="xai-summary">
                <h3>📊 추론 요약</h3>
                <p>총 {steps.length}개 결정</p>
                <p>승인: {steps.filter(s => s.status === 'approved').length}</p>
                <p>수정: {steps.filter(s => s.userModified).length}</p>
                <p>평균 신뢰도: {Math.round(steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length * 100)}%</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default XAIPanel
