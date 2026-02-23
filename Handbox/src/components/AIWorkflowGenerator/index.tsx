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
  Collapse,
  Alert,
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
import PsychologyIcon from '@mui/icons-material/Psychology'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { open } from '@tauri-apps/api/dialog'
import { listen } from '@tauri-apps/api/event'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { useChatStore } from '../../stores/chatStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { generateWorkflowFromChat, deserializeWorkflow, recordWorkflowApplied } from '../../services/WorkflowOrchestratorAgent'
import { IntegratedWorkflowAgent } from '../../services/IntegratedWorkflowAgent'
import type { WorkflowFile } from '../../types/WorkflowFile'
import { NodeRegistry } from '../../registry/NodeRegistry'
import { applyAutoLayout } from '../../utils/autoLayout'
import ChatMessage from '../WorkflowChat/ChatMessage'
import WorkflowPreview from '../WorkflowChat/WorkflowPreview'
import ChatHistory from '../ChatHistory'
// Agent System & XAI 통합
import type { XAIExplanation, TaskPlan, PromptAnalysis } from '../../agents/types'
import { XAIExplanationPanel } from '../XAIExplanation'
import { TaskPlanViewer } from '../TaskPlanViewer'
// XAI 서비스 통합
import { callLLMWithXAI, evaluatePromptQuality } from '../../services/LLMXAIWrapper'
// 추가 서비스 (UI 확장 시 사용)
// import { xaiService } from '../../services/XAIService'
// import { LocalMCPRegistry } from '../../services/LocalMCPRegistry'

// 간소화된 프롬프트 분석 결과 (에이전트 시스템 연동 전 임시)
interface SimplePromptAnalysis {
  intent: string
  complexity: number
  detectedDomain: string
  suggestions: string[]
  clarityScore: number
}

// 간소화된 프롬프트 분석 함수
function analyzePromptSimple(prompt: string): SimplePromptAnalysis {
  const keywords = {
    data: ['데이터', '분석', 'csv', 'excel', '통계', '차트'],
    document: ['문서', 'pdf', 'word', '읽어', '요약', '번역'],
    automation: ['자동화', '반복', '스케줄', '배치', '워크플로우'],
    ai: ['AI', 'LLM', '생성', '학습', '모델', '에이전트']
  }

  let detectedDomain = 'general'
  for (const [domain, words] of Object.entries(keywords)) {
    if (words.some(w => prompt.toLowerCase().includes(w.toLowerCase()))) {
      detectedDomain = domain
      break
    }
  }

  const wordCount = prompt.split(/\s+/).length
  const complexity = Math.min(1, wordCount / 50)
  const clarityScore = prompt.includes('?') || prompt.includes('해줘') ? 0.8 : 0.5

  return {
    intent: prompt.slice(0, 50) + (prompt.length > 50 ? '...' : ''),
    complexity,
    detectedDomain,
    suggestions: complexity > 0.7 ? ['요청을 더 구체화하면 좋겠습니다'] : [],
    clarityScore
  }
}

// 예시 프롬프트 (기본 모드)
const EXAMPLE_PROMPTS = [
  'PDF 문서를 읽어서 요약해줘',
  'CSV 파일을 분석하고 보고서를 만들어줘',
  '여러 문서를 비교 분석하는 워크플로우',
  '이미지에서 텍스트를 추출하고 번역해줘',
]

// 고급 모드 예시 프롬프트 (MCP 도구 + 복잡한 워크플로우)
const ADVANCED_EXAMPLE_PROMPTS = [
  '문서를 업로드하고 질문에 답변하는 RAG 시스템',
  '5명의 전문가가 평가하는 심사 워크플로우',
  '데이터를 분석하고 차트를 생성하는 자동화',
  '문서에서 정보를 추출하고 검증하는 파이프라인',
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

// Agent 인스턴스는 타입 호환성 문제로 임시 비활성화
// TODO: agents/types.ts와 호환되도록 수정 후 활성화
// const promptEngineerAgent = PromptEngineerAgent
// const memoryAgent = MemoryAgent
// const orchestratorAgent = OrchestratorAgent

function AIWorkflowGenerator() {
  const [input, setInput] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // XAI & Agent 상태
  const [currentXAI, setCurrentXAI] = useState<XAIExplanation | null>(null)
  const [showXAI, setShowXAI] = useState(false)
  const [currentTaskPlan, setCurrentTaskPlan] = useState<TaskPlan | null>(null)
  const [showTaskPlan, setShowTaskPlan] = useState(false)
  const [promptAnalysis, setPromptAnalysis] = useState<PromptAnalysis | null>(null)
  const [xaiEnabled, setXaiEnabled] = useState(true) // XAI 활성화 토글
  const [useAdvancedAgent, setUseAdvancedAgent] = useState(true) // 통합 워크플로우 에이전트 사용
  const [agentSessionId] = useState(() => `main_${Date.now()}`) // 에이전트 세션 ID

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

  const { setNodes, setEdges, triggerFitView } = useWorkflowStore()

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

  // 드래그 카운터 (enter/leave 이벤트 버블링 처리용)
  const dragCounterRef = useRef(0)

  // 파일 드래그 이벤트 핸들러
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++

    // 파일 드래그인지 확인
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--

    // 카운터가 0이면 실제로 컨테이너를 벗어남
    if (dragCounterRef.current === 0) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)
    // Tauri 네이티브 이벤트가 파일 처리를 담당
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

  // 메시지 전송 (Agent 시스템 통합)
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
    setCurrentXAI(null)
    setPromptAnalysis(null)

    // 사용자 메시지 추가
    addMessage({ role: 'user', content: userMessage })

    setGenerating(true)

    try {
      // === Step 1: 프롬프트 품질 평가 (XAI 서비스 사용) ===
      console.log('[AIWorkflowGenerator] Step 1: 프롬프트 품질 평가')
      const promptQuality = evaluatePromptQuality(userMessage)

      // === Step 2: 프롬프트 분석 (기존 + XAI 강화) ===
      const simpleAnalysis = analyzePromptSimple(userMessage)
      const analysisData: PromptAnalysis = {
        intent: simpleAnalysis.intent,
        clarityScore: promptQuality.score, // XAI 기반 점수 사용
        specificityScore: simpleAnalysis.complexity,
        missingInfo: promptQuality.issues,
        ambiguities: [],
        suggestions: [...simpleAnalysis.suggestions, ...promptQuality.suggestions],
        detectedDomain: simpleAnalysis.detectedDomain,
        complexity: simpleAnalysis.complexity
      }
      setPromptAnalysis(analysisData)
      console.log('[AIWorkflowGenerator] 프롬프트 분석 완료:', simpleAnalysis.detectedDomain, '품질:', (promptQuality.score * 100).toFixed(0) + '%')

      // === Step 3: XAI 추적이 포함된 LLM 호출 ===
      let xaiData = null
      if (xaiEnabled) {
        console.log('[AIWorkflowGenerator] XAI 추적 LLM 호출')
        const llmResponse = await callLLMWithXAI({
          model: 'handbox-orchestrator',
          prompt: userMessage,
          systemPrompt: '당신은 워크플로우 생성 전문가입니다. 사용자의 요청을 분석하고 적절한 워크플로우를 설계합니다.',
          xaiEnabled: true,
          context: {
            domain: simpleAnalysis.detectedDomain,
            userKeywords: userMessage.split(/\s+/).filter(w => w.length > 2),
          },
        })

        if (llmResponse.xai) {
          xaiData = llmResponse.xai
          // XAI 설명 설정 (실제 분석 데이터 사용)
          const enrichedExplanation: XAIExplanation = {
            ...llmResponse.xai.fullExplanation,
            confidenceFactors: llmResponse.xai.confidence.factors,
            reasoningSteps: llmResponse.xai.chainOfThought.map((step, idx) => ({
              step: step.step,
              action: step.action,
              rationale: step.thought,
              input: idx === 0 ? userMessage : '이전 단계 결과',
              output: step.observation || step.action,
              duration: Math.round(llmResponse.processingTime / llmResponse.xai!.chainOfThought.length),
            })),
          }
          setCurrentXAI(enrichedExplanation)

          // 토큰 기여도 분석 로그
          const significantTokens = llmResponse.xai.tokenAttributions
            .filter(t => t.attribution > 0.3)
            .map(t => `${t.token}(${(t.attribution * 100).toFixed(0)}%)`)
          console.log('[AIWorkflowGenerator] 핵심 토큰:', significantTokens.slice(0, 5).join(', '))
        }
      }

      // === Step 4: 워크플로우 생성 ===
      console.log('[AIWorkflowGenerator] Step 4: 워크플로우 생성', useAdvancedAgent ? '(고급 모드)' : '(기본 모드)')

      if (useAdvancedAgent) {
        // 통합 워크플로우 에이전트 사용 (MCP 도구 추천, 설계 이유 설명)
        const agentResult = await IntegratedWorkflowAgent.chat(userMessage, agentSessionId)

        // WorkflowDesign을 WorkflowFile로 변환 (NodeRegistry에서 노드 정의 가져오기)
        const convertToWorkflowFile = (design: NonNullable<typeof agentResult.workflow>): WorkflowFile => ({
          id: `wf_${Date.now()}`,
          version: '1.0',
          meta: {
            name: design.name,
            description: design.description,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          nodes: design.nodes.map((n, i) => {
            // NodeRegistry에서 노드 정의 가져오기 (색상, 아이콘, 설명 등)
            const nodeDef = NodeRegistry.get(n.type)
            console.log(`[AIWorkflowGenerator] 노드 타입 확인: ${n.type} → ${nodeDef ? '발견' : '미등록'}`)

            return {
              id: n.id,
              type: n.type,
              position: n.position || { x: 100 + (i % 3) * 280, y: 100 + Math.floor(i / 3) * 180 },
              data: {
                label: nodeDef?.meta.label || n.label,
                color: nodeDef?.meta.color || '#64748b',
                description: nodeDef?.meta.description || n.description,
                config: n.toolConfig || nodeDef?.configSchema?.reduce((acc, field) => {
                  if (field.default !== undefined) acc[field.key] = field.default
                  return acc
                }, {} as Record<string, any>) || {},
                reasoning: n.reasoning,
              },
            }
          }),
          edges: design.edges.map(e => ({
            id: e.id || `e_${e.source}_${e.target}`,
            source: e.source,
            target: e.target,
            sourceHandle: 'output',
            targetHandle: 'input',
          })),
        })

        const workflowPreview = agentResult.workflow ? convertToWorkflowFile(agentResult.workflow) : undefined

        // 어시스턴트 응답 추가 (설계 이유 포함)
        addMessage({
          role: 'assistant',
          content: agentResult.response + (agentResult.workflow?.reasoning ? `\n\n**설계 이유:** ${agentResult.workflow.reasoning}` : ''),
          workflowPreview,
          metadata: xaiEnabled && xaiData ? {
            xaiAvailable: true,
            promptAnalysis: {
              intent: simpleAnalysis.intent,
              complexity: String(simpleAnalysis.complexity),
              entities: xaiData.tokenAttributions
                .filter(t => t.attribution > 0.3)
                .map(t => t.token)
            },
            memoryContextUsed: xaiData.fullExplanation.knowledgeUsed.length,
            confidence: xaiData.confidence.overall,
            processingTime: xaiData.trace.processingTime,
            tokensUsed: xaiData.trace.tokensUsed.total,
          } : undefined
        })

        // 워크플로우 미리보기 설정
        if (workflowPreview) {
          setPreviewWorkflow(workflowPreview)
        }

        // 제안 사항 로깅
        if (agentResult.suggestions && agentResult.suggestions.length > 0) {
          console.log('[AIWorkflowGenerator] 추가 제안:', agentResult.suggestions)
        }
      } else {
        // 기본 모드 - 기존 generateWorkflowFromChat 사용
        const result = await generateWorkflowFromChat(messages, userMessage)

        // 어시스턴트 응답 추가 (XAI 메타데이터 포함)
        addMessage({
          role: 'assistant',
          content: result.responseText,
          workflowPreview: result.workflow || undefined,
          metadata: xaiEnabled && xaiData ? {
            xaiAvailable: true,
            promptAnalysis: {
              intent: simpleAnalysis.intent,
              complexity: String(simpleAnalysis.complexity),
              entities: xaiData.tokenAttributions
                .filter(t => t.attribution > 0.3)
                .map(t => t.token)
            },
            memoryContextUsed: xaiData.fullExplanation.knowledgeUsed.length,
            confidence: xaiData.confidence.overall,
            processingTime: xaiData.trace.processingTime,
            tokensUsed: xaiData.trace.tokensUsed.total,
          } : undefined
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
  const handleApplyWorkflow = async () => {
    if (!previewWorkflow) return

    // XAI 활성화 시 TaskPlan 뷰어 표시 (간소화 - 현재 비활성화)
    // TODO: TaskPlan 타입 호환 후 활성화
    // if (xaiEnabled && currentTaskPlan && currentTaskPlan.status === 'draft') {
    //   setShowTaskPlan(true)
    //   return
    // }

    await executeWorkflowApplication()
  }

  // 실제 워크플로우 적용 실행
  const executeWorkflowApplication = async () => {
    if (!previewWorkflow) return

    console.log('[AIWorkflowGenerator] 워크플로우 적용 시작')
    console.log('[AIWorkflowGenerator] previewWorkflow.nodes:', previewWorkflow.nodes)

    const { nodes, edges } = deserializeWorkflow(previewWorkflow)
    console.log('[AIWorkflowGenerator] deserializeWorkflow 결과 nodes:', nodes)
    console.log('[AIWorkflowGenerator] 첫 번째 노드:', nodes[0])

    // 자동 레이아웃 적용
    const layoutedNodes = applyAutoLayout(nodes, edges)
    console.log('[AIWorkflowGenerator] applyAutoLayout 결과:', layoutedNodes[0])

    // 캔버스에 적용
    setNodes(layoutedNodes)
    setEdges(edges)
    console.log('[AIWorkflowGenerator] 캔버스에 적용 완료')

    // 뷰포트를 노드에 맞게 조정
    triggerFitView()

    // 학습 시스템: 피드백 기록
    const userMessages = messages.filter(m => m.role === 'user')
    const firstUserRequest = userMessages[0]?.content || ''
    recordWorkflowApplied(firstUserRequest, previewWorkflow, messages.length)

    // 세션에 워크플로우 연결
    if (activeSessionId && previewWorkflow.meta?.name) {
      linkWorkflow(activeSessionId, previewWorkflow.id || activeSessionId, previewWorkflow.meta.name)
    }

    // 메모리에 워크플로우 적용 기록 (Agent 시스템 활성화 후 사용)
    // TODO: MemoryAgent 타입 호환 후 활성화
    console.log('[AIWorkflowGenerator] 워크플로우 적용 기록 (메모리 저장 비활성화)')

    // 상태 초기화
    setPreviewWorkflow(null)
    setCurrentTaskPlan(null)
    setShowTaskPlan(false)

    console.log('[AIWorkflowGenerator] 워크플로우 적용 완료:', layoutedNodes.length, '개 노드')
  }

  // TaskPlan 승인 핸들러
  const handleTaskPlanApprove = async () => {
    setShowTaskPlan(false)
    await executeWorkflowApplication()
  }

  // TaskPlan 수정 핸들러 (PlanModification[] 타입)
  const handleTaskPlanModify = (_modifications: import('../../agents/types').PlanModification[]) => {
    // TODO: TaskPlan 타입 호환 후 구현
    console.log('[AIWorkflowGenerator] TaskPlan 수정 요청 (미구현)')
  }

  // TaskPlan 취소 핸들러
  const handleTaskPlanCancel = () => {
    setShowTaskPlan(false)
    setPreviewWorkflow(null)
    setCurrentTaskPlan(null)
  }

  // XAI 토글 핸들러
  const toggleXAI = () => {
    if (currentXAI) {
      setShowXAI(!showXAI)
    }
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
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
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
          minHeight: 0, // flex 스크롤 필수
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: messages.length === 0 ? 'center' : 'flex-start',
          p: 4,
          overflowY: 'auto',
          overflowX: 'hidden',
          position: 'relative',
        }}
        onDragEnter={handleDragEnter}
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
              {/* 모드 토글 - 초기 화면 */}
              <Box sx={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 1 }}>
                {/* 고급/기본 모드 토글 */}
                <Tooltip title={useAdvancedAgent ? '고급 모드: MCP 도구 추천 + 설계 이유 설명' : '기본 모드: 단순 워크플로우 생성'}>
                  <Chip
                    label={useAdvancedAgent ? '고급 모드' : '기본 모드'}
                    size="small"
                    onClick={() => setUseAdvancedAgent(!useAdvancedAgent)}
                    sx={{
                      bgcolor: useAdvancedAgent ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)',
                      color: useAdvancedAgent ? '#10b981' : 'grey.500',
                      border: useAdvancedAgent ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255,255,255,0.1)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      '&:hover': {
                        bgcolor: useAdvancedAgent ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)',
                      },
                    }}
                  />
                </Tooltip>
                {xaiEnabled && (
                  <Chip
                    icon={<PsychologyIcon sx={{ fontSize: 14 }} />}
                    label="XAI"
                    size="small"
                    sx={{
                      background: 'rgba(139, 92, 246, 0.15)',
                      color: '#a78bfa',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      '& .MuiChip-icon': { color: '#a78bfa' }
                    }}
                  />
                )}
                <Tooltip title={xaiEnabled ? 'XAI 비활성화' : 'XAI 활성화 (AI 추론 과정 표시)'}>
                  <IconButton
                    size="small"
                    onClick={() => setXaiEnabled(!xaiEnabled)}
                    sx={{
                      color: xaiEnabled ? '#a78bfa' : 'grey.500',
                      background: xaiEnabled ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                      '&:hover': { background: 'rgba(139, 92, 246, 0.15)' }
                    }}
                  >
                    <PsychologyIcon />
                  </IconButton>
                </Tooltip>
              </Box>

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
              <Typography color="grey.400" sx={{ mb: 2 }}>
                자연어로 원하는 작업을 설명하거나, 파일을 드래그하세요.
              </Typography>
              {xaiEnabled && (
                <Typography variant="caption" sx={{ color: '#a78bfa', display: 'block', mb: 2 }}>
                  🧠 XAI 모드: AI가 어떻게 생각하는지 볼 수 있습니다
                </Typography>
              )}
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

            {/* 예시 프롬프트 - 모드에 따라 다른 예시 표시 */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
              {(useAdvancedAgent ? ADVANCED_EXAMPLE_PROMPTS : EXAMPLE_PROMPTS).map((example, i) => (
                <Chip
                  key={i}
                  label={example}
                  onClick={() => handleExampleClick(example)}
                  sx={{
                    background: useAdvancedAgent ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                    color: useAdvancedAgent ? '#6ee7b7' : '#a5b4fc',
                    border: useAdvancedAgent ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(99, 102, 241, 0.2)',
                    cursor: 'pointer',
                    '&:hover': {
                      background: useAdvancedAgent ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                      borderColor: useAdvancedAgent ? '#10b981' : '#6366f1',
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
            minHeight: 0, // flex 스크롤 필수
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
              {/* XAI 상태 표시 */}
              {xaiEnabled && (
                <Chip
                  icon={<PsychologyIcon sx={{ fontSize: 16 }} />}
                  label="XAI"
                  size="small"
                  sx={{
                    ml: 1,
                    background: 'rgba(139, 92, 246, 0.2)',
                    color: '#a78bfa',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    '& .MuiChip-icon': { color: '#a78bfa' }
                  }}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {/* XAI 보기 버튼 */}
              {currentXAI && (
                <Tooltip title={showXAI ? 'XAI 숨기기' : 'AI 추론 과정 보기'}>
                  <IconButton
                    size="small"
                    onClick={toggleXAI}
                    sx={{
                      color: showXAI ? '#a78bfa' : 'grey.400',
                      background: showXAI ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                      '&:hover': { background: 'rgba(139, 92, 246, 0.15)' }
                    }}
                  >
                    <VisibilityIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {/* 고급 에이전트 모드 토글 */}
              <Tooltip title={useAdvancedAgent ? '고급 모드: MCP 도구 추천 + 설계 이유 설명' : '기본 모드로 전환'}>
                <Chip
                  label={useAdvancedAgent ? '고급' : '기본'}
                  size="small"
                  onClick={() => setUseAdvancedAgent(!useAdvancedAgent)}
                  sx={{
                    bgcolor: useAdvancedAgent ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)',
                    color: useAdvancedAgent ? '#10b981' : 'grey.500',
                    border: useAdvancedAgent ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid transparent',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    height: 24,
                    '&:hover': {
                      bgcolor: useAdvancedAgent ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)',
                    },
                  }}
                />
              </Tooltip>
              {/* XAI 활성화 토글 */}
              <Tooltip title={xaiEnabled ? 'XAI 비활성화' : 'XAI 활성화'}>
                <IconButton
                  size="small"
                  onClick={() => setXaiEnabled(!xaiEnabled)}
                  sx={{
                    color: xaiEnabled ? '#a78bfa' : 'grey.600',
                    '&:hover': { background: 'rgba(139, 92, 246, 0.1)' }
                  }}
                >
                  <PsychologyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Button
                startIcon={<RefreshIcon />}
                onClick={clearChat}
                size="small"
                sx={{ color: 'grey.400' }}
              >
                새로 시작
              </Button>
            </Box>
          </Box>

          {/* 메시지 영역 */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0, // flex 스크롤 필수
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

          {/* XAI 설명 패널 */}
          <Collapse in={showXAI && !!currentXAI}>
            {currentXAI && (
              <Box sx={{ mb: 2 }}>
                <XAIExplanationPanel
                  explanation={currentXAI}
                  confidence={0.85}
                  processingTime={currentXAI.reasoningSteps?.reduce((sum: number, r) => sum + (r.duration || 0), 0)}
                  onClose={() => setShowXAI(false)}
                />
              </Box>
            )}
          </Collapse>

          {/* 프롬프트 분석 정보 */}
          {promptAnalysis && xaiEnabled && (
            <Collapse in={!!promptAnalysis}>
              <Alert
                severity="info"
                sx={{
                  mb: 2,
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  '& .MuiAlert-message': { color: '#93c5fd' },
                  '& .MuiAlert-icon': { color: '#60a5fa' }
                }}
              >
                <Typography variant="caption" component="div">
                  <strong>의도:</strong> {promptAnalysis.intent} |{' '}
                  <strong>복잡도:</strong> {(promptAnalysis.complexity * 100).toFixed(0)}% |{' '}
                  <strong>도메인:</strong> {promptAnalysis.detectedDomain || '일반'}
                  {promptAnalysis.suggestions.length > 0 && (
                    <> | <strong>제안:</strong> {promptAnalysis.suggestions.slice(0, 2).join(', ')}</>
                  )}
                </Typography>
              </Alert>
            </Collapse>
          )}

          {/* 워크플로우 미리보기 */}
          {previewWorkflow && !showTaskPlan && (
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
                  {xaiEnabled ? '계획 검토 후 적용' : '워크플로우 적용'}
                </Button>
              </Box>
            </Paper>
          )}

          {/* TaskPlan 뷰어 (XAI 활성화 시) */}
          {showTaskPlan && currentTaskPlan && (
            <Box sx={{ mb: 2 }}>
              <TaskPlanViewer
                plan={currentTaskPlan}
                onApprove={handleTaskPlanApprove}
                onModify={handleTaskPlanModify}
                onCancel={handleTaskPlanCancel}
              />
            </Box>
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
