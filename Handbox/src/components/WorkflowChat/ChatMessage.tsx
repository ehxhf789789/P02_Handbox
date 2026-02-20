/**
 * ChatMessage Component
 *
 * 채팅 메시지 렌더링 컴포넌트.
 * 사용자/어시스턴트 메시지를 구분하여 표시.
 */

import { memo, useCallback } from 'react'
import { Box, Typography, Paper, Chip, Button } from '@mui/material'
import PersonIcon from '@mui/icons-material/Person'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import type { ChatMessage as ChatMessageType } from '../../types/ChatTypes'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useChatStore } from '../../stores/chatStore'
import { deserializeWorkflow } from '../../services/WorkflowOrchestratorAgent'
import { applyAutoLayout } from '../../utils/autoLayout'

interface ChatMessageProps {
  message: ChatMessageType
}

function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const { setNodes, setEdges } = useWorkflowStore()
  const { closeChat } = useChatStore()

  // 워크플로우 재생성 (과거 대화에서 생성된 워크플로우 적용)
  const handleApplyWorkflow = useCallback(() => {
    if (!message.workflowPreview) return

    try {
      const { nodes, edges } = deserializeWorkflow(message.workflowPreview)
      const layoutedNodes = applyAutoLayout(nodes, edges)

      setNodes(layoutedNodes)
      setEdges(edges)
      closeChat()

      console.log('[ChatMessage] 워크플로우 재적용:', layoutedNodes.length, '개 노드')
    } catch (error) {
      console.error('[ChatMessage] 워크플로우 적용 실패:', error)
    }
  }, [message.workflowPreview, setNodes, setEdges, closeChat])

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        mb: 2,
      }}
    >
      {/* 역할 표시 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          mb: 0.5,
        }}
      >
        {isUser ? (
          <PersonIcon sx={{ fontSize: 14, color: '#60a5fa' }} />
        ) : (
          <SmartToyIcon sx={{ fontSize: 14, color: '#10b981' }} />
        )}
        <Typography
          variant="caption"
          sx={{
            color: isUser ? '#60a5fa' : '#10b981',
            fontWeight: 600,
          }}
        >
          {isUser ? 'You' : 'AI Assistant'}
        </Typography>
        <Typography variant="caption" sx={{ color: 'grey.600' }}>
          {formatTime(message.timestamp)}
        </Typography>
      </Box>

      {/* 메시지 내용 */}
      <Paper
        sx={{
          p: 1.5,
          maxWidth: '90%',
          background: isUser
            ? 'rgba(96, 165, 250, 0.15)'
            : 'rgba(16, 185, 129, 0.1)',
          border: `1px solid ${isUser ? 'rgba(96, 165, 250, 0.3)' : 'rgba(16, 185, 129, 0.2)'}`,
          borderRadius: isUser
            ? '12px 12px 4px 12px'
            : '12px 12px 12px 4px',
        }}
      >
        <Typography
          variant="body2"
          sx={{
            color: 'grey.200',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '0.85rem',
            lineHeight: 1.6,
          }}
        >
          {formatContent(message.content)}
        </Typography>
      </Paper>

      {/* 워크플로우 생성 표시 및 재적용 버튼 */}
      {message.workflowPreview && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
          <Chip
            label={`워크플로우 생성됨: ${message.workflowPreview.nodes.length}개 노드`}
            size="small"
            sx={{
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          />
          <Button
            size="small"
            startIcon={<PlayArrowIcon sx={{ fontSize: 14 }} />}
            onClick={handleApplyWorkflow}
            sx={{
              height: 24,
              px: 1.5,
              fontSize: '0.75rem',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              '&:hover': {
                background: 'rgba(16, 185, 129, 0.25)',
                borderColor: '#10b981',
              },
            }}
          >
            다시 적용
          </Button>
        </Box>
      )}

      {/* 오류 표시 */}
      {message.error && (
        <Chip
          label={message.error}
          size="small"
          sx={{
            mt: 1,
            background: 'rgba(239, 68, 68, 0.2)',
            color: '#f87171',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        />
      )}
    </Box>
  )
}

/**
 * 타임스탬프를 시:분 형식으로 변환
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 메시지 내용 포맷팅 (JSON 코드 블록 하이라이트)
 */
function formatContent(content: string): string {
  // JSON 코드 블록은 그대로 유지
  return content
}

export default memo(ChatMessage)
