/**
 * WorkflowChat Component
 *
 * LLM을 통한 자연어 워크플로우 생성 채팅 인터페이스.
 * 오른쪽 드로어로 표시되며, 대화를 통해 워크플로우 생성.
 */

import { useState, useRef, useEffect, memo } from 'react'
import {
  Drawer,
  Box,
  Typography,
  TextField,
  IconButton,
  Button,
  CircularProgress,
  Divider,
  Alert,
  Tooltip,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import CloseIcon from '@mui/icons-material/Close'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import CheckIcon from '@mui/icons-material/Check'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useChatStore } from '../../stores/chatStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { generateWorkflowFromChat, deserializeWorkflow } from '../../services/WorkflowOrchestratorAgent'
import { applyAutoLayout } from '../../utils/autoLayout'
import ChatMessage from './ChatMessage'
import WorkflowPreview from './WorkflowPreview'

const DRAWER_WIDTH = 420

function WorkflowChat() {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    isOpen,
    messages,
    isGenerating,
    previewWorkflow,
    lastError,
    closeChat,
    addMessage,
    setGenerating,
    setPreviewWorkflow,
    setError,
    clearChat,
  } = useChatStore()

  const { setNodes, setEdges } = useWorkflowStore()

  // 메시지 추가 시 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 메시지 전송
  const handleSend = async () => {
    if (!input.trim() || isGenerating) return

    const userMessage = input.trim()
    setInput('')
    setError(null)

    // 사용자 메시지 추가
    addMessage({ role: 'user', content: userMessage })

    setGenerating(true)

    try {
      const result = await generateWorkflowFromChat(messages, userMessage)

      // 어시스턴트 응답 추가
      addMessage({
        role: 'assistant',
        content: result.responseText,
        workflowPreview: result.workflow || undefined,
      })

      // 워크플로우가 생성되면 미리보기 설정
      if (result.workflow) {
        setPreviewWorkflow(result.workflow)
      }

      // 검증 오류/경고 표시
      if (result.validationErrors.length > 0) {
        setError(`검증 오류: ${result.validationErrors.join(', ')}`)
      }
    } catch (error) {
      addMessage({
        role: 'assistant',
        content: `죄송합니다, 오류가 발생했습니다: ${error}`,
        error: String(error),
      })
      setError(String(error))
    } finally {
      setGenerating(false)
    }
  }

  // 워크플로우 적용
  const handleApplyWorkflow = () => {
    if (!previewWorkflow) return

    const { nodes, edges } = deserializeWorkflow(previewWorkflow)

    // 자동 레이아웃 적용
    const layoutedNodes = applyAutoLayout(nodes, edges)

    // 캔버스에 적용 (기존 노드 대체)
    setNodes(layoutedNodes)
    setEdges(edges)

    // 미리보기 초기화 및 드로어 닫기
    setPreviewWorkflow(null)
    closeChat()

    console.log('[WorkflowChat] 워크플로우 적용 완료:', layoutedNodes.length, '개 노드')
  }

  // 키보드 이벤트 처리
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={closeChat}
      variant="persistent"
      sx={{
        width: isOpen ? DRAWER_WIDTH : 0,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderLeft: '1px solid rgba(16, 185, 129, 0.2)',
        },
      }}
    >
      {/* 헤더 */}
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <AutoFixHighIcon sx={{ color: '#10b981' }} />
        <Typography variant="h6" sx={{ color: 'white', flex: 1, fontSize: '1rem' }}>
          AI 워크플로우 생성
        </Typography>
        <Tooltip title="대화 지우기">
          <IconButton onClick={clearChat} size="small" sx={{ color: 'grey.500' }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="닫기">
          <IconButton onClick={closeChat} size="small" sx={{ color: 'grey.500' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 메시지 영역 */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 3,
          },
        }}
      >
        {/* 빈 상태 */}
        {messages.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <AutoFixHighIcon sx={{ fontSize: 48, color: 'rgba(16, 185, 129, 0.3)', mb: 2 }} />
            <Typography color="grey.400" sx={{ mb: 1 }}>
              어떤 워크플로우를 만들고 싶으신가요?
            </Typography>
            <Typography variant="caption" color="grey.600" sx={{ display: 'block' }}>
              예시:
            </Typography>
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {[
                'PDF 문서를 읽어서 요약해줘',
                '보고서를 분석하는 심사 에이전트를 만들어줘',
                'CSV 파일을 JSON으로 변환하는 워크플로우',
              ].map((example, i) => (
                <Typography
                  key={i}
                  variant="caption"
                  sx={{
                    color: '#10b981',
                    cursor: 'pointer',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                  onClick={() => setInput(example)}
                >
                  "{example}"
                </Typography>
              ))}
            </Box>
          </Box>
        )}

        {/* 메시지 목록 */}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* 생성 중 표시 */}
        {isGenerating && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={16} sx={{ color: '#10b981' }} />
            <Typography variant="caption" color="grey.400">
              워크플로우 설계 중...
            </Typography>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* 오류 표시 */}
      {lastError && (
        <Alert severity="error" sx={{ mx: 2, mb: 1, fontSize: '0.75rem' }}>
          {lastError}
        </Alert>
      )}

      {/* 워크플로우 미리보기 */}
      {previewWorkflow && (
        <Box
          sx={{
            mx: 2,
            mb: 2,
            p: 2,
            borderRadius: 2,
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
          }}
        >
          <WorkflowPreview workflow={previewWorkflow} />
          <Divider sx={{ my: 2, borderColor: 'rgba(16, 185, 129, 0.2)' }} />
          <Button
            fullWidth
            variant="contained"
            startIcon={<CheckIcon />}
            onClick={handleApplyWorkflow}
            sx={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              },
            }}
          >
            워크플로우 적용
          </Button>
        </Box>
      )}

      {/* 입력 영역 */}
      <Box sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder="워크플로우 요청을 입력하세요..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
          InputProps={{
            endAdornment: (
              <IconButton
                onClick={handleSend}
                disabled={isGenerating || !input.trim()}
                sx={{ ml: 1 }}
              >
                <SendIcon
                  sx={{
                    color: input.trim() && !isGenerating ? '#10b981' : 'grey.600',
                  }}
                />
              </IconButton>
            ),
            sx: {
              pr: 0.5,
            },
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              background: 'rgba(255,255,255,0.05)',
              color: 'white',
              '& fieldset': {
                borderColor: 'rgba(255,255,255,0.1)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(16, 185, 129, 0.3)',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#10b981',
              },
            },
            '& .MuiInputBase-input::placeholder': {
              color: 'grey.500',
              opacity: 1,
            },
          }}
        />
        <Typography variant="caption" color="grey.600" sx={{ mt: 0.5, display: 'block' }}>
          Enter로 전송, Shift+Enter로 줄바꿈
        </Typography>
      </Box>
    </Drawer>
  )
}

export default memo(WorkflowChat)
