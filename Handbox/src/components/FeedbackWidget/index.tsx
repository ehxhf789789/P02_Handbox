/**
 * Feedback Widget - 워크플로우 피드백 수집 및 학습 현황 표시
 *
 * 사용자가 워크플로우에 대한 피드백을 제공하고,
 * 시스템이 학습한 패턴을 확인할 수 있습니다.
 */

import { useState, useCallback } from 'react'
import { IntegratedWorkflowAgent } from '../../services/IntegratedWorkflowAgent'
import { WorkflowLearningSystem } from '../../services/IntegratedWorkflowAgent'
import './styles.css'

interface FeedbackWidgetProps {
  sessionId: string
  workflowName?: string
  onFeedbackSubmitted?: () => void
}

export function FeedbackWidget({ sessionId, workflowName, onFeedbackSubmitted }: FeedbackWidgetProps) {
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [showLearning, setShowLearning] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (!rating) return

    try {
      await IntegratedWorkflowAgent.recordWorkflowFeedback(
        sessionId,
        rating,
        feedbackText || undefined,
      )
      setSubmitted(true)
      onFeedbackSubmitted?.()
    } catch (error) {
      console.error('[FeedbackWidget] 피드백 제출 실패:', error)
    }
  }, [sessionId, rating, feedbackText, onFeedbackSubmitted])

  const learningSummary = WorkflowLearningSystem.getPatternSummary()

  if (submitted) {
    return (
      <div className="feedback-widget submitted">
        <div className="feedback-success">
          <span className="feedback-success-icon">✅</span>
          <p>피드백이 반영되었습니다!</p>
          <span className="feedback-learning-note">
            이 피드백은 향후 워크플로우 생성에 활용됩니다.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={`feedback-widget ${isExpanded ? 'expanded' : ''}`}>
      {/* 축소된 상태 */}
      {!isExpanded && (
        <button className="feedback-expand-btn" onClick={() => setIsExpanded(true)}>
          <span className="feedback-icon">💬</span>
          <span>워크플로우 피드백</span>
        </button>
      )}

      {/* 확장된 상태 */}
      {isExpanded && (
        <div className="feedback-content">
          <div className="feedback-header">
            <h3>📝 워크플로우 피드백</h3>
            <button className="feedback-close" onClick={() => setIsExpanded(false)}>×</button>
          </div>

          {workflowName && (
            <p className="feedback-workflow-name">
              <strong>대상:</strong> {workflowName}
            </p>
          )}

          {/* 별점 */}
          <div className="feedback-rating">
            <span className="feedback-rating-label">만족도:</span>
            <div className="feedback-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  className={`feedback-star ${rating && rating >= star ? 'active' : ''}`}
                  onClick={() => setRating(star as 1 | 2 | 3 | 4 | 5)}
                >
                  {rating && rating >= star ? '★' : '☆'}
                </button>
              ))}
            </div>
            {rating && (
              <span className="feedback-rating-text">
                {rating === 1 && '매우 불만족'}
                {rating === 2 && '불만족'}
                {rating === 3 && '보통'}
                {rating === 4 && '만족'}
                {rating === 5 && '매우 만족'}
              </span>
            )}
          </div>

          {/* 텍스트 피드백 */}
          <div className="feedback-text">
            <textarea
              placeholder="개선할 점이나 좋았던 점을 알려주세요 (선택사항)"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={3}
            />
          </div>

          {/* 제출 버튼 */}
          <button
            className="feedback-submit"
            onClick={handleSubmit}
            disabled={!rating}
          >
            피드백 제출
          </button>

          {/* 학습 현황 토글 */}
          <button
            className="feedback-learning-toggle"
            onClick={() => setShowLearning(!showLearning)}
          >
            {showLearning ? '📚 학습 현황 숨기기' : '📚 학습 현황 보기'}
          </button>

          {/* 학습 현황 */}
          {showLearning && (
            <div className="feedback-learning">
              <h4>🧠 시스템 학습 현황</h4>
              {learningSummary ? (
                <pre className="feedback-learning-content">{learningSummary}</pre>
              ) : (
                <p className="feedback-learning-empty">
                  아직 학습된 패턴이 없습니다.
                  피드백을 제공하면 시스템이 학습합니다.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * 학습 현황 패널 - 전체 학습 데이터 확인용
 */
export function LearningStatusPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const summary = WorkflowLearningSystem.getPatternSummary()

  if (!isOpen) return null

  return (
    <div className="learning-panel-overlay" onClick={onClose}>
      <div className="learning-panel" onClick={(e) => e.stopPropagation()}>
        <div className="learning-panel-header">
          <h2>🧠 워크플로우 학습 현황</h2>
          <button className="learning-close" onClick={onClose}>×</button>
        </div>

        <div className="learning-panel-content">
          {summary ? (
            <>
              <p className="learning-intro">
                사용자 피드백을 바탕으로 다음 패턴들을 학습했습니다:
              </p>
              <pre className="learning-patterns">{summary}</pre>
            </>
          ) : (
            <div className="learning-empty">
              <span className="learning-empty-icon">📭</span>
              <p>아직 학습된 패턴이 없습니다.</p>
              <p className="learning-empty-hint">
                워크플로우를 사용한 후 피드백을 제공하면
                시스템이 사용자 선호에 맞게 학습합니다.
              </p>
            </div>
          )}

          <div className="learning-tips">
            <h3>💡 학습 시스템 안내</h3>
            <ul>
              <li>피드백을 제출하면 패턴이 자동으로 추출됩니다</li>
              <li>높은 평점의 워크플로우 구성이 우선 적용됩니다</li>
              <li>반복된 수정은 사용자 선호로 학습됩니다</li>
              <li>학습 데이터는 로컬에 저장되어 개인화됩니다</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FeedbackWidget
