/**
 * FeedbackDialog - 워크플로우 피드백 수집 다이얼로그
 *
 * 사용자가 생성된 워크플로우에 대해 평가하고 피드백을 제공할 수 있음
 * 강화학습 시스템(WorkflowLearningSystem)과 연동
 */

import { useState, memo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Rating,
  TextField,
  Chip,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Divider,
  Alert,
} from '@mui/material'
import {
  Star,
  ThumbUp,
  ThumbDown,
  Feedback,
  Psychology,
} from '@mui/icons-material'
import { recordWorkflowFeedback } from '../../services/IntegratedWorkflowAgent'
import type { WorkflowFile } from '../../types/WorkflowFile'

interface FeedbackDialogProps {
  open: boolean
  onClose: () => void
  sessionId: string
  workflow: WorkflowFile | null
}

interface CorrectionItem {
  field: string
  label: string
  checked: boolean
  description?: string
}

function FeedbackDialogContent({ open, onClose, sessionId, workflow }: FeedbackDialogProps) {
  const [rating, setRating] = useState<number | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [corrections, setCorrections] = useState<CorrectionItem[]>([
    { field: 'expertCount', label: '전문가 수가 맞지 않음', checked: false },
    { field: 'domains', label: '전문 분야가 틀림', checked: false },
    { field: 'structure', label: '워크플로우 구조가 잘못됨', checked: false },
    { field: 'votingMethod', label: '투표 방식이 맞지 않음', checked: false },
    { field: 'missing', label: '필요한 노드가 빠짐', checked: false },
    { field: 'tooComplex', label: '너무 복잡함', checked: false },
    { field: 'tooSimple', label: '너무 단순함', checked: false },
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleCorrectionToggle = (field: string) => {
    setCorrections(prev =>
      prev.map(c => c.field === field ? { ...c, checked: !c.checked } : c)
    )
  }

  const handleSubmit = async () => {
    if (!rating) return

    setIsSubmitting(true)
    try {
      const selectedCorrections = corrections
        .filter(c => c.checked)
        .map(c => ({
          field: c.field,
          original: null,
          corrected: c.label,
        }))

      await recordWorkflowFeedback(
        sessionId,
        rating as 1 | 2 | 3 | 4 | 5,
        feedbackText || undefined,
        selectedCorrections.length > 0 ? selectedCorrections : undefined
      )

      setSubmitted(true)
      setTimeout(() => {
        onClose()
        // 상태 초기화
        setRating(null)
        setFeedbackText('')
        setCorrections(prev => prev.map(c => ({ ...c, checked: false })))
        setSubmitted(false)
      }, 1500)
    } catch (error) {
      console.error('피드백 제출 실패:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const nodeCount = workflow?.nodes?.length || 0
  const edgeCount = workflow?.edges?.length || 0

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: '#1e293b',
          color: 'white',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Feedback sx={{ color: '#10b981' }} />
        워크플로우 피드백
      </DialogTitle>

      <DialogContent>
        {submitted ? (
          <Alert
            severity="success"
            sx={{
              bgcolor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            피드백이 저장되었습니다. 학습에 반영됩니다!
          </Alert>
        ) : (
          <>
            {/* 워크플로우 요약 */}
            <Box
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <Typography variant="subtitle2" color="grey.400" gutterBottom>
                평가 대상 워크플로우
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                {workflow?.meta?.name || '워크플로우'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Chip label={`${nodeCount}개 노드`} size="small" sx={{ bgcolor: '#10b981', color: 'white' }} />
                <Chip label={`${edgeCount}개 연결`} size="small" sx={{ bgcolor: '#0ea5e9', color: 'white' }} />
              </Box>
            </Box>

            {/* 평점 */}
            <Box sx={{ mb: 3, textAlign: 'center' }}>
              <Typography variant="subtitle2" color="grey.400" gutterBottom>
                워크플로우가 요청에 얼마나 부합하나요?
              </Typography>
              <Rating
                value={rating}
                onChange={(_, value) => setRating(value)}
                size="large"
                icon={<Star fontSize="inherit" sx={{ color: '#fbbf24' }} />}
                emptyIcon={<Star fontSize="inherit" sx={{ color: 'grey.700' }} />}
                sx={{ mt: 1 }}
              />
              {rating && (
                <Typography variant="caption" color={rating >= 4 ? '#10b981' : rating >= 2 ? '#fbbf24' : '#ef4444'}>
                  {rating === 5 && '완벽해요!'}
                  {rating === 4 && '좋아요'}
                  {rating === 3 && '보통이에요'}
                  {rating === 2 && '아쉬워요'}
                  {rating === 1 && '전혀 맞지 않아요'}
                </Typography>
              )}
            </Box>

            <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

            {/* 문제점 체크 */}
            <Typography variant="subtitle2" color="grey.400" gutterBottom>
              어떤 부분이 잘못되었나요? (선택)
            </Typography>
            <FormGroup sx={{ mb: 2 }}>
              {corrections.map((correction) => (
                <FormControlLabel
                  key={correction.field}
                  control={
                    <Checkbox
                      checked={correction.checked}
                      onChange={() => handleCorrectionToggle(correction.field)}
                      sx={{
                        color: 'grey.600',
                        '&.Mui-checked': { color: '#10b981' },
                      }}
                    />
                  }
                  label={
                    <Typography variant="body2" color="grey.300">
                      {correction.label}
                    </Typography>
                  }
                />
              ))}
            </FormGroup>

            {/* 추가 피드백 */}
            <TextField
              fullWidth
              multiline
              rows={3}
              placeholder="추가 의견이나 개선 방향을 알려주세요..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: 'white',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                  '&:hover fieldset': { borderColor: 'rgba(16, 185, 129, 0.3)' },
                  '&.Mui-focused fieldset': { borderColor: '#10b981' },
                },
                '& .MuiInputBase-input::placeholder': { color: 'grey.500' },
              }}
            />

            {/* 학습 안내 */}
            <Alert
              severity="info"
              icon={<Psychology />}
              sx={{
                mt: 2,
                bgcolor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                '& .MuiAlert-icon': { color: '#10b981' },
              }}
            >
              <Typography variant="caption" color="grey.300">
                피드백은 AI 학습에 활용됩니다. 유사한 요청에서 더 나은 워크플로우를 생성하는 데 도움이 됩니다.
              </Typography>
            </Alert>
          </>
        )}
      </DialogContent>

      {!submitted && (
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={onClose} sx={{ color: 'grey.400' }}>
            취소
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!rating || isSubmitting}
            startIcon={<ThumbUp />}
            sx={{
              background: '#10b981',
              '&:hover': { background: '#059669' },
              '&:disabled': { background: 'rgba(255,255,255,0.1)' },
            }}
          >
            {isSubmitting ? '저장 중...' : '피드백 제출'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  )
}

const FeedbackDialog = memo(FeedbackDialogContent)
export default FeedbackDialog
