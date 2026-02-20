/**
 * AIWorkflowGenerator Component
 *
 * 메인 화면 중앙에 배치되는 AI 워크플로우 생성기.
 * 캔버스가 비어있을 때 표시되며, 자연어로 워크플로우를 생성.
 * 파일 드래그앤드롭 및 첨부 기능 지원.
 */

import { useState, useRef, useEffect, memo, useCallback } from 'react'
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Button,
  CircularProgress,
  Chip,
  Paper,
  Fade,
  Tooltip,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import CheckIcon from '@mui/icons-material/Check'
import RefreshIcon from '@mui/icons-material/Refresh'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import CloseIcon from '@mui/icons-material/Close'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import { open } from '@tauri-apps/api/dialog'
import { listen } from '@tauri-apps/api/event'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { useChatStore } from '../../stores/chatStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { generateWorkflowFromChat, deserializeWorkflow, recordWorkflowApplied } from '../../services/WorkflowOrchestratorAgent'
import { applyAutoLayout } from '../../utils/autoLayout'
import ChatMessage from '../WorkflowChat/ChatMessage'
import WorkflowPreview from '../WorkflowChat/WorkflowPreview'
import ChatHistory from '../ChatHistory'

// 예시 프롬프트
const EXAMPLE_PROMPTS = [
  'PDF 문서를 읽어서 요약해줘',
  'CSV 파일을 분석하고 보고서를 만들어줘',
  '여러 문서를 비교 분석하는 워크플로우',
  '이미지에서 텍스트를 추출하고 번역해줘',
]

// 파일 확장자별 아이콘 색상
const FILE_COLORS: Record<string, string> = {
  pdf: '#ef4444',
  csv: '#22c55e',
  xlsx: '#22c55e',
  xls: '#22c55e',
  doc: '#3b82f6',
  docx: '#3b82f6',
  txt: '#6b7280',
  json: '#f59e0b',
  png: '#8b5cf6',
  jpg: '#8b5cf6',
  jpeg: '#8b5cf6',
}

interface AttachedFile {
  name: string
  path: string
  extension: string
}

const HISTORY_SIDEBAR_WIDTH = 280

function AIWorkflowGenerator() {
  const [input, setInput] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    isGenerating,
    previewWorkflow,
    lastError,
    activeSessionId,
    addMessage,
    setGenerating,
    setPreviewWorkflow,
    setError,
    clearChat,
    createSession,
    linkWorkflow,
  } = useChatStore()

  const { setNodes, setEdges } = useWorkflowStore()

  // 메시지 추가 시 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Tauri 파일 드롭 이벤트 리스너 (네이티브 파일 드롭 지원)
  useEffect(() => {
    let unlistenDrop: UnlistenFn | null = null
    let unlistenHover: UnlistenFn | null = null
    let unlistenCancel: UnlistenFn | null = null
    let lastDropTime = 0 // 중복 이벤트 방지용

    const setupListeners = async () => {
      // 파일 드롭 이벤트
      unlistenDrop = await listen<string[]>('tauri://file-drop', (event) => {
        // 중복 이벤트 방지 (100ms 이내 중복 이벤트 무시)
        const now = Date.now()
        if (now - lastDropTime < 100) {
          return
        }
        lastDropTime = now

        const paths = event.payload
        if (paths && paths.length > 0) {
          const newFiles: AttachedFile[] = paths.map(path => {
            const name = path.split(/[\\/]/).pop() || path
            return {
              name,
              path,
              extension: name.split('.').pop()?.toLowerCase() || '',
            }
          })

          // 중복 파일 제거 (같은 경로의 파일은 추가하지 않음)
          setAttachedFiles(prev => {
            const existingPaths = new Set(prev.map(f => f.path))
            const uniqueNewFiles = newFiles.filter(f => !existingPaths.has(f.path))
            return [...prev, ...uniqueNewFiles]
          })
          setIsDragOver(false)

          // 자동으로 파일 관련 프롬프트 제안
          if (newFiles.length > 0) {
            const ext = newFiles[0].extension
            setInput(prev => {
              if (prev.trim()) return prev
              if (ext === 'pdf') return '이 PDF 문서를 읽고 내용을 요약해줘'
              if (['csv', 'xlsx', 'xls'].includes(ext)) return '이 데이터 파일을 분석해줘'
              if (['doc', 'docx', 'txt'].includes(ext)) return '이 문서를 처리하는 워크플로우를 만들어줘'
              return prev
            })
          }
        }
      })

      // 파일 드래그 호버 이벤트
      unlistenHover = await listen('tauri://file-drop-hover', () => {
        setIsDragOver(true)
      })

      // 파일 드래그 취소 이벤트
      unlistenCancel = await listen('tauri://file-drop-cancelled', () => {
        setIsDragOver(false)
      })
    }

    setupListeners()

    return () => {
      unlistenDrop?.()
      unlistenHover?.()
      unlistenCancel?.()
    }
  }, [])

  // 파일 드래그 이벤트 핸들러 (웹 폴백용)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Tauri 네이티브 이벤트가 처리하므로 여기서는 아무것도 하지 않음
  }, [])

  // 파일 선택 다이얼로그 열기
  const handleFileSelect = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: '지원 파일',
          extensions: ['pdf', 'csv', 'xlsx', 'xls', 'doc', 'docx', 'txt', 'json', 'png', 'jpg', 'jpeg']
        }]
      })

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected]
        const newFiles: AttachedFile[] = paths.map(path => {
          const name = path.split(/[\\/]/).pop() || path
          return {
            name,
            path,
            extension: name.split('.').pop()?.toLowerCase() || '',
          }
        })
        setAttachedFiles(prev => [...prev, ...newFiles])
      }
    } catch (error) {
      console.error('파일 선택 실패:', error)
    }
  }

  // 첨부 파일 제거
  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // 메시지 전송
  const handleSend = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isGenerating) return

    // 새 세션 생성 (세션이 없는 경우)
    if (!activeSessionId) {
      createSession()
    }

    // 파일 경로를 포함한 메시지 구성
    let userMessage = input.trim()
    if (attachedFiles.length > 0) {
      const fileInfo = attachedFiles
        .map(f => `[첨부파일: ${f.name}]\n경로: ${f.path}`)
        .join('\n\n')
      userMessage = userMessage
        ? `${userMessage}\n\n${fileInfo}`
        : `다음 파일을 처리해줘:\n\n${fileInfo}`
    }

    setInput('')
    setAttachedFiles([])
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

    // 캔버스에 적용
    setNodes(layoutedNodes)
    setEdges(edges)

    // 학습 시스템: 피드백 기록
    const userMessages = messages.filter(m => m.role === 'user')
    const firstUserRequest = userMessages[0]?.content || ''
    recordWorkflowApplied(firstUserRequest, previewWorkflow, messages.length)

    // 세션에 워크플로우 연결
    if (activeSessionId && previewWorkflow.meta?.name) {
      linkWorkflow(activeSessionId, previewWorkflow.id || activeSessionId, previewWorkflow.meta.name)
    }

    // 미리보기 초기화
    setPreviewWorkflow(null)

    console.log('[AIWorkflowGenerator] 워크플로우 적용 완료:', layoutedNodes.length, '개 노드')
  }

  // 키보드 이벤트 처리
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 예시 클릭
  const handleExampleClick = (example: string) => {
    setInput(example)
  }

  return (
    <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* 대화 기록 사이드바 */}
      <Box
        sx={{
          width: historyOpen ? HISTORY_SIDEBAR_WIDTH : 0,
          flexShrink: 0,
          borderRight: historyOpen ? '1px solid rgba(255,255,255,0.1)' : 'none',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          transition: 'width 0.2s ease',
          overflow: 'hidden',
        }}
      >
        {historyOpen && <ChatHistory />}
      </Box>

      {/* 토글 버튼 */}
      <Box
        sx={{
          position: 'absolute',
          left: historyOpen ? HISTORY_SIDEBAR_WIDTH - 12 : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 10,
          transition: 'left 0.2s ease',
        }}
      >
        <IconButton
          size="small"
          onClick={() => setHistoryOpen(!historyOpen)}
          sx={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.1)',
            width: 24,
            height: 48,
            borderRadius: '0 8px 8px 0',
            '&:hover': { background: '#334155' },
          }}
        >
          {historyOpen ? (
            <KeyboardArrowLeftIcon sx={{ fontSize: 16, color: 'grey.400' }} />
          ) : (
            <KeyboardArrowRightIcon sx={{ fontSize: 16, color: 'grey.400' }} />
          )}
        </IconButton>
      </Box>

      {/* 메인 컨텐츠 */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: messages.length === 0 ? 'center' : 'flex-start',
          p: 4,
          overflow: 'auto',
          position: 'relative',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 드래그 오버레이 */}
        {isDragOver && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(16, 185, 129, 0.1)',
            border: '3px dashed #10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <CloudUploadIcon sx={{ fontSize: 80, color: '#10b981', mb: 2 }} />
            <Typography variant="h5" sx={{ color: '#10b981', fontWeight: 600 }}>
              파일을 여기에 놓으세요
            </Typography>
            <Typography color="grey.400">
              PDF, CSV, Excel, Word 등 지원
            </Typography>
          </Box>
        </Box>
      )}

      {/* 초기 상태 - 입력 프롬프트 중앙 */}
      {messages.length === 0 ? (
        <Fade in>
          <Box
            sx={{
              width: '100%',
              maxWidth: 700,
              textAlign: 'center',
            }}
          >
            {/* 로고 & 타이틀 */}
            <Box sx={{ mb: 4 }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: 4,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 3,
                  boxShadow: '0 8px 32px rgba(16, 185, 129, 0.4)',
                }}
              >
                <AutoFixHighIcon sx={{ fontSize: 40, color: 'white' }} />
              </Box>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  background: 'linear-gradient(90deg, #fff 0%, #6ee7b7 100%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  mb: 1,
                }}
              >
                어떤 워크플로우를 만들까요?
              </Typography>
              <Typography color="grey.400" sx={{ mb: 4 }}>
                자연어로 원하는 작업을 설명하거나, 파일을 드래그하세요.
              </Typography>
            </Box>

            {/* 입력 필드 */}
            <Paper
              elevation={0}
              sx={{
                p: 2,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: 3,
                mb: 2,
              }}
            >
              {/* 첨부된 파일 표시 */}
              {attachedFiles.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                  {attachedFiles.map((file, idx) => (
                    <Chip
                      key={idx}
                      icon={<InsertDriveFileIcon sx={{ fontSize: 16 }} />}
                      label={file.name}
                      onDelete={() => removeAttachedFile(idx)}
                      deleteIcon={<CloseIcon sx={{ fontSize: 14 }} />}
                      sx={{
                        background: `${FILE_COLORS[file.extension] || '#6b7280'}20`,
                        color: FILE_COLORS[file.extension] || '#6b7280',
                        border: `1px solid ${FILE_COLORS[file.extension] || '#6b7280'}40`,
                        '& .MuiChip-icon': {
                          color: FILE_COLORS[file.extension] || '#6b7280',
                        },
                      }}
                    />
                  ))}
                </Box>
              )}

              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                <Tooltip title="파일 첨부">
                  <IconButton
                    onClick={handleFileSelect}
                    sx={{
                      color: 'grey.500',
                      '&:hover': { color: '#10b981' },
                    }}
                  >
                    <AttachFileIcon />
                  </IconButton>
                </Tooltip>

                <TextField
                  fullWidth
                  multiline
                  maxRows={4}
                  placeholder="예: PDF 문서를 읽어서 요약해줘..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isGenerating}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      background: 'transparent',
                      color: 'white',
                      fontSize: '1.1rem',
                      '& fieldset': { border: 'none' },
                    },
                    '& .MuiInputBase-input::placeholder': {
                      color: 'grey.500',
                      opacity: 1,
                    },
                  }}
                />

                <IconButton
                  onClick={handleSend}
                  disabled={isGenerating || (!input.trim() && attachedFiles.length === 0)}
                  sx={{
                    background: (input.trim() || attachedFiles.length > 0)
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'transparent',
                    '&:hover': {
                      background: (input.trim() || attachedFiles.length > 0)
                        ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                        : 'transparent',
                    },
                    '&:disabled': {
                      background: 'transparent',
                    },
                  }}
                >
                  {isGenerating ? (
                    <CircularProgress size={20} sx={{ color: '#10b981' }} />
                  ) : (
                    <SendIcon
                      sx={{
                        color: (input.trim() || attachedFiles.length > 0) ? 'white' : 'grey.600',
                      }}
                    />
                  )}
                </IconButton>
              </Box>
            </Paper>

            {/* 파일 드롭 힌트 */}
            <Box
              sx={{
                p: 2,
                mb: 3,
                border: '2px dashed rgba(99, 102, 241, 0.2)',
                borderRadius: 2,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: 'rgba(99, 102, 241, 0.4)',
                  background: 'rgba(99, 102, 241, 0.05)',
                },
              }}
              onClick={handleFileSelect}
            >
              <Typography variant="body2" color="grey.500">
                <CloudUploadIcon sx={{ fontSize: 18, verticalAlign: 'middle', mr: 1 }} />
                파일을 드래그하거나 클릭하여 첨부
              </Typography>
              <Typography variant="caption" color="grey.600">
                PDF, CSV, Excel, Word, 이미지 등 지원
              </Typography>
            </Box>

            {/* 예시 프롬프트 */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
              {EXAMPLE_PROMPTS.map((example, i) => (
                <Chip
                  key={i}
                  label={example}
                  onClick={() => handleExampleClick(example)}
                  sx={{
                    background: 'rgba(99, 102, 241, 0.1)',
                    color: '#a5b4fc',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    cursor: 'pointer',
                    '&:hover': {
                      background: 'rgba(99, 102, 241, 0.2)',
                      borderColor: '#6366f1',
                    },
                  }}
                />
              ))}
            </Box>
          </Box>
        </Fade>
      ) : (
        /* 대화 진행 중 */
        <Box
          sx={{
            width: '100%',
            maxWidth: 800,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* 헤더 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 2,
              pb: 2,
              borderBottom: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AutoFixHighIcon sx={{ color: '#10b981' }} />
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 600 }}>
                AI 워크플로우 생성
              </Typography>
            </Box>
            <Button
              startIcon={<RefreshIcon />}
              onClick={clearChat}
              size="small"
              sx={{ color: 'grey.400' }}
            >
              새로 시작
            </Button>
          </Box>

          {/* 메시지 영역 */}
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              mb: 2,
              '&::-webkit-scrollbar': { width: 6 },
              '&::-webkit-scrollbar-thumb': {
                background: 'rgba(255,255,255,0.2)',
                borderRadius: 3,
              },
            }}
          >
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

          {/* 워크플로우 미리보기 */}
          {previewWorkflow && (
            <Paper
              sx={{
                p: 3,
                mb: 2,
                borderRadius: 3,
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
              }}
            >
              <WorkflowPreview workflow={previewWorkflow} />
              <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
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
            </Paper>
          )}

          {/* 오류 표시 */}
          {lastError && (
            <Paper
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 2,
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <Typography variant="body2" color="#f87171">
                {lastError}
              </Typography>
            </Paper>
          )}

          {/* 입력 필드 */}
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: 2,
            }}
          >
            {/* 첨부된 파일 표시 */}
            {attachedFiles.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                {attachedFiles.map((file, idx) => (
                  <Chip
                    key={idx}
                    icon={<InsertDriveFileIcon sx={{ fontSize: 14 }} />}
                    label={file.name}
                    size="small"
                    onDelete={() => removeAttachedFile(idx)}
                    deleteIcon={<CloseIcon sx={{ fontSize: 12 }} />}
                    sx={{
                      height: 24,
                      background: `${FILE_COLORS[file.extension] || '#6b7280'}20`,
                      color: FILE_COLORS[file.extension] || '#6b7280',
                      '& .MuiChip-icon': {
                        color: FILE_COLORS[file.extension] || '#6b7280',
                      },
                    }}
                  />
                ))}
              </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
              <Tooltip title="파일 첨부">
                <IconButton
                  size="small"
                  onClick={handleFileSelect}
                  sx={{ color: 'grey.500', '&:hover': { color: '#10b981' } }}
                >
                  <AttachFileIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <TextField
                fullWidth
                multiline
                maxRows={4}
                placeholder="추가 요청이나 수정사항을 입력하세요..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isGenerating}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    background: 'transparent',
                    color: 'white',
                    '& fieldset': { border: 'none' },
                  },
                  '& .MuiInputBase-input::placeholder': {
                    color: 'grey.500',
                    opacity: 1,
                  },
                }}
              />

              <IconButton
                onClick={handleSend}
                disabled={isGenerating || (!input.trim() && attachedFiles.length === 0)}
              >
                {isGenerating ? (
                  <CircularProgress size={20} sx={{ color: '#10b981' }} />
                ) : (
                  <SendIcon
                    sx={{
                      color: (input.trim() || attachedFiles.length > 0) ? '#10b981' : 'grey.600',
                    }}
                  />
                )}
              </IconButton>
            </Box>

            <Typography variant="caption" color="grey.600" sx={{ ml: 5 }}>
              Enter로 전송 · 파일을 드래그해서 첨부
            </Typography>
          </Paper>
        </Box>
      )}
      </Box>
    </Box>
  )
}

export default memo(AIWorkflowGenerator)
