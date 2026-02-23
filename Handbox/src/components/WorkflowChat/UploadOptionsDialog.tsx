/**
 * UploadOptionsDialog
 *
 * 워크플로우 JSON 파일 업로드 후 옵션 선택 다이얼로그.
 * - 캔버스에 바로 로드
 * - AI에게 분석 요청
 * - AI에게 개선 요청
 */

import { memo, useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  TextField,
  Divider,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import WarningIcon from '@mui/icons-material/Warning'
import type { WorkflowFile } from '../../types/WorkflowFile'

export type UploadAction = 'load' | 'analyze' | 'improve' | 'cancel'

interface UploadOptionsDialogProps {
  open: boolean
  workflow: WorkflowFile | null
  validationErrors: string[]
  validationWarnings: string[]
  onClose: () => void
  onAction: (action: UploadAction, additionalPrompt?: string) => void
}

function UploadOptionsDialog({
  open,
  workflow,
  validationErrors,
  validationWarnings,
  onClose,
  onAction,
}: UploadOptionsDialogProps) {
  const [additionalPrompt, setAdditionalPrompt] = useState('')
  const [selectedAction, setSelectedAction] = useState<UploadAction | null>(null)

  const handleAction = (action: UploadAction) => {
    if (action === 'analyze' || action === 'improve') {
      setSelectedAction(action)
    } else {
      onAction(action)
      handleClose()
    }
  }

  const handleConfirm = () => {
    if (selectedAction) {
      onAction(selectedAction, additionalPrompt)
      handleClose()
    }
  }

  const handleClose = () => {
    setAdditionalPrompt('')
    setSelectedAction(null)
    onClose()
  }

  if (!workflow) return null

  const nodeCount = workflow.nodes?.length || 0
  const edgeCount = workflow.edges?.length || 0
  const nodeTypes = [...new Set(workflow.nodes?.map(n => n.type) || [])]
  const hasErrors = validationErrors.length > 0
  const hasWarnings = validationWarnings.length > 0

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
        },
      }}
    >
      <DialogTitle sx={{ color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
        <UploadFileIcon sx={{ color: '#10b981' }} />
        워크플로우 파일 업로드
      </DialogTitle>

      <DialogContent>
        {/* 워크플로우 요약 */}
        <Box
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <Typography variant="subtitle1" color="white" fontWeight="bold" gutterBottom>
            {workflow.meta?.name || '이름 없음'}
          </Typography>
          {workflow.meta?.description && (
            <Typography variant="body2" color="grey.400" sx={{ mb: 1 }}>
              {workflow.meta.description}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={`${nodeCount}개 노드`}
              sx={{ background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc' }}
            />
            <Chip
              size="small"
              label={`${edgeCount}개 연결`}
              sx={{ background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc' }}
            />
            {nodeTypes.slice(0, 3).map((type) => (
              <Chip
                key={type}
                size="small"
                label={type}
                sx={{ background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7' }}
              />
            ))}
            {nodeTypes.length > 3 && (
              <Chip
                size="small"
                label={`+${nodeTypes.length - 3}`}
                sx={{ background: 'rgba(255,255,255,0.1)', color: 'grey.400' }}
              />
            )}
          </Box>
        </Box>

        {/* 검증 결과 */}
        {hasErrors && (
          <Alert
            severity="error"
            icon={<ErrorIcon />}
            sx={{ mb: 2, '& .MuiAlert-message': { width: '100%' } }}
          >
            <Typography variant="subtitle2" fontWeight="bold">
              검증 오류 ({validationErrors.length}건)
            </Typography>
            <List dense sx={{ py: 0 }}>
              {validationErrors.slice(0, 3).map((err, i) => (
                <ListItem key={i} sx={{ py: 0, px: 0 }}>
                  <Typography variant="caption">{err}</Typography>
                </ListItem>
              ))}
            </List>
          </Alert>
        )}

        {hasWarnings && !hasErrors && (
          <Alert
            severity="warning"
            icon={<WarningIcon />}
            sx={{ mb: 2, '& .MuiAlert-message': { width: '100%' } }}
          >
            <Typography variant="subtitle2" fontWeight="bold">
              경고 ({validationWarnings.length}건)
            </Typography>
            <List dense sx={{ py: 0 }}>
              {validationWarnings.slice(0, 3).map((warn, i) => (
                <ListItem key={i} sx={{ py: 0, px: 0 }}>
                  <Typography variant="caption">{warn}</Typography>
                </ListItem>
              ))}
            </List>
          </Alert>
        )}

        {!hasErrors && !hasWarnings && (
          <Alert
            severity="success"
            icon={<CheckCircleIcon />}
            sx={{ mb: 2 }}
          >
            워크플로우 검증 완료 - 정상
          </Alert>
        )}

        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

        {/* 옵션 선택 (AI 분석/개선 요청이 아닌 경우) */}
        {!selectedAction && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="subtitle2" color="grey.400" gutterBottom>
              어떻게 진행할까요?
            </Typography>

            <Button
              fullWidth
              variant="contained"
              startIcon={<OpenInNewIcon />}
              onClick={() => handleAction('load')}
              disabled={hasErrors}
              sx={{
                justifyContent: 'flex-start',
                py: 1.5,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                },
                '&:disabled': {
                  background: 'rgba(255,255,255,0.1)',
                  color: 'grey.500',
                },
              }}
            >
              <Box sx={{ textAlign: 'left' }}>
                <Typography variant="body2" fontWeight="bold">
                  캔버스에 바로 로드
                </Typography>
                <Typography variant="caption" color="rgba(255,255,255,0.7)">
                  워크플로우를 편집 가능한 캔버스에 불러옵니다
                </Typography>
              </Box>
            </Button>

            <Button
              fullWidth
              variant="outlined"
              startIcon={<AnalyticsIcon />}
              onClick={() => handleAction('analyze')}
              sx={{
                justifyContent: 'flex-start',
                py: 1.5,
                borderColor: 'rgba(99, 102, 241, 0.5)',
                color: '#a5b4fc',
                '&:hover': {
                  borderColor: '#6366f1',
                  background: 'rgba(99, 102, 241, 0.1)',
                },
              }}
            >
              <Box sx={{ textAlign: 'left' }}>
                <Typography variant="body2" fontWeight="bold">
                  AI에게 분석 요청
                </Typography>
                <Typography variant="caption" color="grey.400">
                  워크플로우 구조, 잠재적 문제점, 최적화 포인트 분석
                </Typography>
              </Box>
            </Button>

            <Button
              fullWidth
              variant="outlined"
              startIcon={<AutoFixHighIcon />}
              onClick={() => handleAction('improve')}
              sx={{
                justifyContent: 'flex-start',
                py: 1.5,
                borderColor: 'rgba(249, 115, 22, 0.5)',
                color: '#fdba74',
                '&:hover': {
                  borderColor: '#f97316',
                  background: 'rgba(249, 115, 22, 0.1)',
                },
              }}
            >
              <Box sx={{ textAlign: 'left' }}>
                <Typography variant="body2" fontWeight="bold">
                  AI에게 개선 요청
                </Typography>
                <Typography variant="caption" color="grey.400">
                  개선된 버전의 워크플로우를 생성합니다
                </Typography>
              </Box>
            </Button>
          </Box>
        )}

        {/* 추가 프롬프트 입력 (분석/개선 요청 시) */}
        {selectedAction && (
          <Box>
            <Typography variant="subtitle2" color="grey.400" gutterBottom>
              {selectedAction === 'analyze' ? '분석 시 참고할 내용 (선택)' : '개선 방향 또는 요구사항 (선택)'}
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={3}
              placeholder={
                selectedAction === 'analyze'
                  ? '예: 성능 병목점이 있는지 확인해줘'
                  : '예: 에이전트 수를 10명으로 늘리고 투표 로직 추가해줘'
              }
              value={additionalPrompt}
              onChange={(e) => setAdditionalPrompt(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  background: 'rgba(255,255,255,0.05)',
                  color: 'white',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                  '&.Mui-focused fieldset': { borderColor: '#10b981' },
                },
                '& .MuiInputBase-input::placeholder': { color: 'grey.500', opacity: 1 },
              }}
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {selectedAction ? (
          <>
            <Button onClick={() => setSelectedAction(null)} sx={{ color: 'grey.400' }}>
              뒤로
            </Button>
            <Button
              variant="contained"
              onClick={handleConfirm}
              sx={{
                background:
                  selectedAction === 'analyze'
                    ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
                    : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              }}
            >
              {selectedAction === 'analyze' ? '분석 시작' : '개선 요청'}
            </Button>
          </>
        ) : (
          <Button onClick={handleClose} sx={{ color: 'grey.400' }}>
            취소
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

export default memo(UploadOptionsDialog)
