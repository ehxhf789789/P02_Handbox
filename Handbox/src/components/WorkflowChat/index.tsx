/**
 * WorkflowChat Component
 *
 * LLM을 통한 자연어 워크플로우 생성 채팅 인터페이스.
 * 오른쪽 드로어로 표시되며, 대화를 통해 워크플로우 생성.
 */

import { useState, useRef, useEffect, useCallback, memo } from 'react'
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
import AttachFileIcon from '@mui/icons-material/AttachFile'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useChatStore } from '../../stores/chatStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { generateWorkflowFromChat, deserializeWorkflow, analyzeWorkflowJSON } from '../../services/WorkflowOrchestratorAgent'
import { IntegratedWorkflowAgent, getToolRecommendations } from '../../services/IntegratedWorkflowAgent'
import { parseWorkflowJSON } from '../../utils/workflowSerializer'
import { applyAutoLayout } from '../../utils/autoLayout'
import ChatMessage from './ChatMessage'
import WorkflowPreview from './WorkflowPreview'
import UploadOptionsDialog, { type UploadAction } from './UploadOptionsDialog'
import FeedbackDialog from './FeedbackDialog'
import { XAIExplanationPanel } from '../XAIExplanation'
import { xaiService } from '../../services/XAIService'
import type { XAIExplanation } from '../../agents/types'
import type { WorkflowFile } from '../../types/WorkflowFile'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import PsychologyIcon from '@mui/icons-material/Psychology'

const DRAWER_WIDTH = 420

function WorkflowChat() {
  const [input, setInput] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadedWorkflow, setUploadedWorkflow] = useState<WorkflowFile | null>(null)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([])
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [useAdvancedAgent, setUseAdvancedAgent] = useState(true) // 통합 에이전트 사용 여부
  const [agentSessionId] = useState(() => `chat_${Date.now()}`) // 세션 ID
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false) // 피드백 다이얼로그
  const [currentXAI, setCurrentXAI] = useState<XAIExplanation | null>(null) // XAI 설명
  const [showXAI, setShowXAI] = useState(false) // XAI 패널 표시 여부
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const { setNodes, setEdges, triggerFitView } = useWorkflowStore()

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
      // 통합 워크플로우 에이전트 사용 (고급 모드)
      if (useAdvancedAgent) {
        const agentResult = await IntegratedWorkflowAgent.chat(userMessage, agentSessionId)

        // WorkflowDesign을 WorkflowFile로 변환하는 헬퍼 함수
        const convertToWorkflowFile = (design: NonNullable<typeof agentResult.workflow>): WorkflowFile => ({
          id: `wf_${Date.now()}`,
          version: '1.0',
          meta: {
            name: design.name,
            description: design.description,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          nodes: design.nodes.map((n, i) => ({
            id: n.id,
            type: n.type,
            position: n.position || { x: 250 * (i % 3), y: 150 * Math.floor(i / 3) },
            data: {
              label: n.label,
              config: n.toolConfig || {},
              description: n.description,
              reasoning: n.reasoning,
            },
          })),
          edges: design.edges.map(e => ({
            id: e.id || `e_${e.source}_${e.target}`,
            source: e.source,
            target: e.target,
            sourceHandle: null,
            targetHandle: null,
          })),
        })

        // 어시스턴트 응답 추가
        const workflowPreview = agentResult.workflow ? convertToWorkflowFile(agentResult.workflow) : undefined
        addMessage({
          role: 'assistant',
          content: agentResult.response + (agentResult.workflow?.reasoning ? `\n\n**설계 이유:** ${agentResult.workflow.reasoning}` : ''),
          workflowPreview,
        })

        // 워크플로우 생성 시 미리보기 및 XAI 설명 생성
        if (workflowPreview) {
          setPreviewWorkflow(workflowPreview)

          // XAI 설명 생성
          if (agentResult.workflow) {
            const traceId = `xai_${Date.now()}`
            xaiService.startTrace(traceId, 'IntegratedWorkflowAgent', userMessage)
            xaiService.completeTrace(
              traceId,
              agentResult.response,
              { prompt: userMessage.length, completion: agentResult.response.length, total: userMessage.length + agentResult.response.length }
            )

            const trace = xaiService.getTrace(traceId)
            if (trace) {
              const xaiExplanation = xaiService.generateFullExplanation(
                trace,
                '워크플로우 생성',
                {
                  domain: 'workflow',
                  userKeywords: agentResult.workflow.nodes.map(n => n.label),
                }
              )
              setCurrentXAI(xaiExplanation)
              setShowXAI(true)
            }
          }
        }

        // 추천 제안 표시
        if (agentResult.suggestions && agentResult.suggestions.length > 0) {
          console.log('[WorkflowChat] 제안:', agentResult.suggestions)
        }
      } else {
        // 기본 모드 - 기존 generateWorkflowFromChat 사용
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

    // 뷰포트를 노드에 맞게 조정
    triggerFitView()

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

  // ============================================================
  // 파일 업로드 핸들러
  // ============================================================

  // 파일 처리 (JSON 파싱 및 검증)
  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.json')) {
      setUploadErrors(['JSON 파일만 업로드 가능합니다.'])
      setUploadedWorkflow(null)
      setShowUploadDialog(true)
      return
    }

    try {
      const content = await file.text()
      const result = parseWorkflowJSON(content)

      setUploadedWorkflow(result.workflow)
      setUploadErrors(result.validation.errors || [])
      setUploadWarnings(result.validation.warnings || [])
      setShowUploadDialog(true)
    } catch (error) {
      setUploadErrors([`파일 파싱 실패: ${error}`])
      setUploadedWorkflow(null)
      setShowUploadDialog(true)
    }
  }, [])

  // 파일 선택 핸들러
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
    // 같은 파일 재선택 허용을 위해 값 초기화
    e.target.value = ''
  }, [processFile])

  // 드래그 앤 드롭 핸들러
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
    }
  }, [processFile])

  // 업로드 옵션 선택 핸들러
  const handleUploadAction = useCallback(async (action: UploadAction, additionalPrompt?: string) => {
    if (!uploadedWorkflow) return

    switch (action) {
      case 'load': {
        // 캔버스에 바로 로드
        const { nodes, edges } = deserializeWorkflow(uploadedWorkflow)
        const layoutedNodes = applyAutoLayout(nodes, edges)
        setNodes(layoutedNodes)
        setEdges(edges)
        triggerFitView()
        setPreviewWorkflow(null)
        closeChat()
        console.log('[WorkflowChat] 워크플로우 로드 완료:', layoutedNodes.length, '개 노드')
        break
      }

      case 'analyze': {
        // AI에게 분석 요청
        const analyzePrompt = additionalPrompt
          ? `다음 워크플로우를 분석해주세요: ${additionalPrompt}`
          : '이 워크플로우를 분석하고 구조, 잠재적 문제점, 최적화 포인트를 알려주세요.'

        addMessage({ role: 'user', content: analyzePrompt, attachments: [{
          id: `file_${Date.now()}`,
          name: uploadedWorkflow.meta?.name || 'workflow.json',
          type: 'workflow-json',
          size: JSON.stringify(uploadedWorkflow).length,
          content: JSON.stringify(uploadedWorkflow),
          status: 'ready',
        }] })

        setGenerating(true)
        try {
          const result = await analyzeWorkflowJSON(uploadedWorkflow, analyzePrompt)
          addMessage({
            role: 'assistant',
            content: result.responseText,
            analysisContext: result.analysisContext,
          })
        } catch (error) {
          addMessage({
            role: 'assistant',
            content: `분석 중 오류가 발생했습니다: ${error}`,
            error: String(error),
          })
        } finally {
          setGenerating(false)
        }
        break
      }

      case 'improve': {
        // AI에게 개선 요청
        const improvePrompt = additionalPrompt
          ? `이 워크플로우를 개선해주세요: ${additionalPrompt}`
          : '이 워크플로우를 개선해서 더 나은 버전을 만들어주세요.'

        addMessage({ role: 'user', content: improvePrompt, attachments: [{
          id: `file_${Date.now()}`,
          name: uploadedWorkflow.meta?.name || 'workflow.json',
          type: 'workflow-json',
          size: JSON.stringify(uploadedWorkflow).length,
          content: JSON.stringify(uploadedWorkflow),
          status: 'ready',
        }] })

        setGenerating(true)
        try {
          // 워크플로우 컨텍스트를 포함한 프롬프트 구성
          const contextPrompt = `[첨부된 워크플로우]\n${JSON.stringify(uploadedWorkflow, null, 2)}\n\n${improvePrompt}`
          const result = await generateWorkflowFromChat(messages, contextPrompt)

          addMessage({
            role: 'assistant',
            content: result.responseText,
            workflowPreview: result.workflow || undefined,
          })

          if (result.workflow) {
            setPreviewWorkflow(result.workflow)
          }
        } catch (error) {
          addMessage({
            role: 'assistant',
            content: `개선 중 오류가 발생했습니다: ${error}`,
            error: String(error),
          })
        } finally {
          setGenerating(false)
        }
        break
      }
    }
  }, [uploadedWorkflow, messages, setNodes, setEdges, triggerFitView, setPreviewWorkflow, closeChat, addMessage, setGenerating])

  // 업로드 다이얼로그 닫기
  const handleCloseUploadDialog = useCallback(() => {
    setShowUploadDialog(false)
    setUploadedWorkflow(null)
    setUploadErrors([])
    setUploadWarnings([])
  }, [])

  return (
    <>
    {/* 숨겨진 파일 입력 */}
    <input
      type="file"
      ref={fileInputRef}
      onChange={handleFileSelect}
      accept=".json"
      style={{ display: 'none' }}
    />

    {/* 업로드 옵션 다이얼로그 */}
    <UploadOptionsDialog
      open={showUploadDialog}
      workflow={uploadedWorkflow}
      validationErrors={uploadErrors}
      validationWarnings={uploadWarnings}
      onClose={handleCloseUploadDialog}
      onAction={handleUploadAction}
    />

    {/* 피드백 다이얼로그 */}
    <FeedbackDialog
      open={showFeedbackDialog}
      onClose={() => setShowFeedbackDialog(false)}
      sessionId={agentSessionId}
      workflow={previewWorkflow}
    />

    <Drawer
      anchor="right"
      open={isOpen}
      onClose={closeChat}
      variant="temporary"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      ModalProps={{
        keepMounted: true, // 성능 향상을 위해 DOM에 유지
      }}
      sx={{
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderLeft: '1px solid rgba(16, 185, 129, 0.2)',
          mt: '56px', // AppBar 높이만큼 아래로
          height: 'calc(100% - 56px)',
          display: 'flex',
          flexDirection: 'column',
        },
        '& .MuiBackdrop-root': {
          backgroundColor: 'rgba(0, 0, 0, 0.3)', // 반투명 배경
        },
      }}
    >
      {/* 드래그 오버레이 */}
      {isDragOver && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(16, 185, 129, 0.15)',
            border: '3px dashed #10b981',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <UploadFileIcon sx={{ fontSize: 64, color: '#10b981', mb: 1 }} />
            <Typography variant="h6" color="#10b981">
              워크플로우 JSON 파일을 여기에 놓으세요
            </Typography>
          </Box>
        </Box>
      )}
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
        <Tooltip title={useAdvancedAgent ? '통합 에이전트 모드 (MCP 도구 추천, 이유 설명)' : '기본 모드'}>
          <Box
            onClick={() => setUseAdvancedAgent(!useAdvancedAgent)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              cursor: 'pointer',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              bgcolor: useAdvancedAgent ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)',
              border: useAdvancedAgent ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid transparent',
              '&:hover': { bgcolor: useAdvancedAgent ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)' },
            }}
          >
            <Typography variant="caption" sx={{ color: useAdvancedAgent ? '#10b981' : 'grey.500', fontSize: '0.7rem' }}>
              {useAdvancedAgent ? '고급' : '기본'}
            </Typography>
          </Box>
        </Tooltip>
        <Tooltip title="워크플로우 JSON 업로드">
          <IconButton
            onClick={() => fileInputRef.current?.click()}
            size="small"
            sx={{ color: '#10b981' }}
          >
            <AttachFileIcon fontSize="small" />
          </IconButton>
        </Tooltip>
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
          minHeight: 0, // flex 아이템에서 스크롤 작동을 위해 필수
          overflowY: 'auto',
          overflowX: 'hidden',
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
              {(useAdvancedAgent ? [
                '문서를 업로드하고 질문에 답변하는 RAG 시스템',
                '5명의 전문가가 평가하는 심사 워크플로우',
                '데이터를 분석하고 차트를 생성하는 자동화',
              ] : [
                'PDF 문서를 읽어서 요약해줘',
                '보고서를 분석하는 심사 에이전트를 만들어줘',
                'CSV 파일을 JSON으로 변환하는 워크플로우',
              ]).map((example, i) => (
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

          {/* 피드백 및 XAI 버튼 영역 */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 2 }}>
            <Tooltip title="이 워크플로우가 마음에 들어요">
              <IconButton
                onClick={() => setShowFeedbackDialog(true)}
                size="small"
                sx={{
                  color: '#10b981',
                  bgcolor: 'rgba(16, 185, 129, 0.1)',
                  '&:hover': { bgcolor: 'rgba(16, 185, 129, 0.2)' },
                }}
              >
                <ThumbUpIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="피드백 남기기 (개선 필요)">
              <IconButton
                onClick={() => setShowFeedbackDialog(true)}
                size="small"
                sx={{
                  color: '#ef4444',
                  bgcolor: 'rgba(239, 68, 68, 0.1)',
                  '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.2)' },
                }}
              >
                <ThumbDownIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {currentXAI && (
              <Tooltip title="AI 판단 근거 보기 (XAI)">
                <IconButton
                  onClick={() => setShowXAI(!showXAI)}
                  size="small"
                  sx={{
                    color: showXAI ? '#a78bfa' : 'rgba(167, 139, 250, 0.7)',
                    bgcolor: showXAI ? 'rgba(167, 139, 250, 0.2)' : 'rgba(167, 139, 250, 0.1)',
                    '&:hover': { bgcolor: 'rgba(167, 139, 250, 0.2)' },
                  }}
                >
                  <PsychologyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Typography variant="caption" color="grey.500" sx={{ alignSelf: 'center', ml: 1 }}>
              피드백으로 AI 학습에 기여
            </Typography>
          </Box>

          {/* XAI 설명 패널 */}
          {showXAI && currentXAI && (
            <Box sx={{ mb: 2, '& .MuiPaper-root': { bgcolor: 'rgba(26, 32, 44, 0.9)', color: 'white' } }}>
              <XAIExplanationPanel
                explanation={currentXAI}
                onClose={() => setShowXAI(false)}
                compact
              />
            </Box>
          )}

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
    </>
  )
}

export default memo(WorkflowChat)
