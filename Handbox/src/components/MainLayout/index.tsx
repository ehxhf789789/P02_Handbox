import { useState, useEffect, memo, useCallback } from 'react'
import {
  Box, AppBar, Toolbar, Typography, IconButton, Drawer, Tooltip, Chip, Button, Menu, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, List, ListItem, ListItemButton,
  ListItemText, ListItemIcon, Divider, Switch, FormControlLabel, Select, FormControl, InputLabel,
  Snackbar, Alert, Tabs, Tab, Avatar,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import SaveIcon from '@mui/icons-material/Save'
import SettingsIcon from '@mui/icons-material/Settings'
import CloudDoneIcon from '@mui/icons-material/CloudDone'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import DescriptionIcon from '@mui/icons-material/Description'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import HubIcon from '@mui/icons-material/Hub'
import FolderIcon from '@mui/icons-material/Folder'
import WidgetsIcon from '@mui/icons-material/Widgets'
import PsychologyIcon from '@mui/icons-material/Psychology'
import ExtensionIcon from '@mui/icons-material/Extension'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonIcon from '@mui/icons-material/Person'
import ApiIcon from '@mui/icons-material/Api'

import NodePalette from '../NodePalette'
import AISettingsDialog from '../AISettingsDialog'
import MCPSettingsDialog from '../MCPSettingsDialog'
import ExternalAPISettingsDialog from '../ExternalAPISettingsDialog'
import { clearSavedCredentials } from '../ProviderSetup'
import sampleRagWorkflow from '../../examples/sample-rag-workflow.json'
import sampleTextGenWorkflow from '../../examples/sample-text-generation.json'
import sampleTranslateWorkflow from '../../examples/sample-translate.json'
import sampleSentimentWorkflow from '../../examples/sample-sentiment.json'
import sampleConnectionTestWorkflow from '../../examples/sample-aws-connection-test.json'
import sampleDocumentAnalysis from '../../examples/sample-document-analysis.json'
import samplePatentSearch from '../../examples/sample-patent-search.json'
import sampleResearchPaper from '../../examples/sample-research-paper.json'
import sampleCntAssessment from '../../examples/sample-cnt-assessment.json'
import sampleS3BedrockPipeline from '../../examples/sample-s3-bedrock-pipeline.json'
import sampleNtisAnalysis from '../../examples/sample-ntis-project-analysis.json'
// 새로 추가된 워크플로우
import sampleDocumentSummary from '../../examples/sample-document-summary.json'
import sampleMultilingualContent from '../../examples/sample-multilingual-content.json'
import sampleImageAnalysis from '../../examples/sample-image-analysis.json'
import sampleCodeReview from '../../examples/sample-code-review.json'
import sampleMeetingMinutes from '../../examples/sample-meeting-minutes.json'
import sampleReportGenerator from '../../examples/sample-report-generator.json'
import sampleDataExtraction from '../../examples/sample-data-extraction.json'
import sampleFaqChatbot from '../../examples/sample-faq-chatbot.json'
import sampleEmailAutomation from '../../examples/sample-email-automation.json'
// CNT 평가 연구 워크플로우 - 통합 파이프라인만 유지
import cntFullPipeline from '../../data/workflows/cnt-integrated-workflow.json'
import WorkflowEditor from '../WorkflowEditor'

// 샘플 워크플로우 목록 - P1-P4 분리 워크플로우 제거, 통합 워크플로우만 유지
const SAMPLE_WORKFLOWS = [
  // 기본 워크플로우
  { id: 'connection-test', name: 'AWS 연결 테스트', data: sampleConnectionTestWorkflow, icon: '🔌', category: '기본' },
  { id: 'textgen', name: '텍스트 생성 (Claude)', data: sampleTextGenWorkflow, icon: '✍️', category: '기본' },
  { id: 'translate', name: '다국어 번역', data: sampleTranslateWorkflow, icon: '🌐', category: '기본' },
  { id: 'sentiment', name: '감정 분석', data: sampleSentimentWorkflow, icon: '💭', category: '기본' },
  // 문서 처리
  { id: 'document-summary', name: '문서 요약', data: sampleDocumentSummary, icon: '📋', category: '문서처리' },
  { id: 'document-analysis', name: '문서 분석 파이프라인', data: sampleDocumentAnalysis, icon: '📄', category: '문서처리' },
  { id: 'data-extraction', name: '데이터 추출 및 정리', data: sampleDataExtraction, icon: '🗃️', category: '문서처리' },
  { id: 'meeting-minutes', name: '회의록 분석', data: sampleMeetingMinutes, icon: '📝', category: '문서처리' },
  // RAG & 지식베이스
  { id: 'rag', name: '문서 기반 Q&A (RAG)', data: sampleRagWorkflow, icon: '📚', category: 'RAG' },
  { id: 'faq-chatbot', name: 'FAQ 자동 응답', data: sampleFaqChatbot, icon: '💬', category: 'RAG' },
  // 자동화
  { id: 'report-generator', name: '보고서 자동 생성', data: sampleReportGenerator, icon: '📊', category: '자동화' },
  { id: 'email-automation', name: '이메일 분류 및 응답', data: sampleEmailAutomation, icon: '📧', category: '자동화' },
  { id: 'multilingual', name: '다국어 콘텐츠 생성', data: sampleMultilingualContent, icon: '🌍', category: '자동화' },
  // 분석
  { id: 'image-analysis', name: '이미지 분석', data: sampleImageAnalysis, icon: '🖼️', category: '분석' },
  { id: 'code-review', name: 'AI 코드 리뷰', data: sampleCodeReview, icon: '👨‍💻', category: '분석' },
  // 건설신기술 평가 - 통합 워크플로우
  { id: 'cnt-assessment', name: '건설신기술 평가 (간단)', data: sampleCntAssessment, icon: '🏗️', category: '건설신기술' },
  { id: 'cnt-integrated', name: 'CNT 통합 평가 시스템', data: cntFullPipeline, icon: '🚀', category: '건설신기술' },
  // 한국 API
  { id: 'patent-search', name: '특허 검색 및 분석', data: samplePatentSearch, icon: '🔍', category: '한국API' },
  { id: 'research-paper', name: '학술논문 검색', data: sampleResearchPaper, icon: '📑', category: '한국API' },
  { id: 'ntis-analysis', name: 'NTIS R&D 분석', data: sampleNtisAnalysis, icon: '🔬', category: '한국API' },
  // AWS
  { id: 's3-bedrock', name: 'S3-Bedrock 분석', data: sampleS3BedrockPipeline, icon: '☁️', category: 'AWS' },
]
import PropertyPanel from '../PropertyPanel'
import { useAppStore } from '../../stores/appStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { invoke } from '@tauri-apps/api/tauri'

const DRAWER_WIDTH = 300
const PROPERTY_PANEL_WIDTH = 320

interface SavedWorkflow {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

function MainLayoutContent() {
  const { awsStatus, sidebarOpen, toggleSidebar, logout, setUseAWSConnection, setAWSStatus, aiModelConfig } = useAppStore()
  const { nodes, edges, selectedNode, setNodes, setEdges, clearWorkflow, updateNode } = useWorkflowStore()
  const [executing, setExecuting] = useState(false)
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)

  // 사이드바 탭 (0: 노드 팔레트, 1: 워크플로우 목록)
  const [sidebarTab, setSidebarTab] = useState(0)

  // 다이얼로그 상태
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [mcpSettingsOpen, setMcpSettingsOpen] = useState(false)
  const [externalAPISettingsOpen, setExternalAPISettingsOpen] = useState(false)

  // 현재 워크플로우
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null)
  const [workflowName, setWorkflowName] = useState('')
  const [workflowDescription, setWorkflowDescription] = useState('')
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([])

  // 설정
  const [settings, setSettings] = useState({
    autoSave: true,
    defaultRegion: 'us-east-1',
    animatedEdges: true,
    snapToGrid: true,
    gridSize: 15,
  })

  // 알림
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false, message: '', severity: 'info',
  })

  // 앱 시작시 워크플로우 목록 로드
  useEffect(() => {
    loadSavedWorkflows()
    const savedSettings = localStorage.getItem('handbox-settings')
    if (savedSettings) setSettings(JSON.parse(savedSettings))
  }, [])

  const loadSavedWorkflows = async () => {
    try {
      const workflows = await invoke<SavedWorkflow[]>('list_workflows')
      setSavedWorkflows(workflows)
    } catch (error) {
      console.error('Failed to load workflows:', error)
      setSavedWorkflows([])
    }
  }

  // AWS 연결 해제
  const handleDisconnectAWS = useCallback(async () => {
    try {
      await invoke('clear_aws_credentials')
      setAWSStatus(null as any)
      setUseAWSConnection(false)
      clearSavedCredentials()
      setSnackbar({ open: true, message: 'AWS 연결이 해제되었습니다.', severity: 'info' })
    } catch (error) {
      console.error('AWS disconnect failed:', error)
    }
    setUserMenuAnchor(null)
  }, [setAWSStatus, setUseAWSConnection])

  // 앱 로그아웃 (초기 화면으로)
  const handleLogout = useCallback(async () => {
    try {
      await invoke('clear_aws_credentials')
      clearSavedCredentials()
      logout()
    } catch (error) {
      console.error('Logout failed:', error)
      logout()
    }
    setUserMenuAnchor(null)
    setLogoutDialogOpen(false)
  }, [logout])

  const handleExecute = async () => {
    if (nodes.length === 0) {
      setSnackbar({ open: true, message: '실행할 노드가 없습니다.', severity: 'error' })
      return
    }

    // 입력 노드에서 입력 데이터 추출
    const inputNode = nodes.find((n) => n.type === 'input')
    let inputData: Record<string, any> = {}

    if (inputNode?.data?.config) {
      const config = inputNode.data.config
      // 텍스트 입력이 있으면 사용
      if (config.text_input) {
        inputData = { query: config.text_input, text: config.text_input }
      }
      // JSON 입력이 있으면 파싱해서 사용
      if (config.json_input) {
        try {
          const jsonData = JSON.parse(config.json_input)
          inputData = { ...inputData, ...jsonData }
        } catch (e) {
          console.log('JSON 파싱 실패, 텍스트로 사용:', config.json_input)
        }
      }
    }

    setExecuting(true)
    try {
      const result = await invoke<any>('execute_workflow', {
        workflow: {
          id: currentWorkflowId || 'temp',
          name: workflowName || '임시 워크플로우',
          description: workflowDescription,
          nodes: nodes.map((n) => ({ id: n.id, node_type: n.type, position: n.position, data: n.data })),
          edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, source_handle: e.sourceHandle, target_handle: e.targetHandle })),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        input: inputData,
      })

      // 실행 결과를 출력 노드에 저장
      if (result?.outputs) {
        const outputNodeResult = result.outputs.find((o: any) => {
          const node = nodes.find((n) => n.id === o.node_id)
          return node?.type === 'output'
        })

        // 결과 텍스트 포맷팅 함수
        const formatResultText = (output: any): string => {
          if (typeof output !== 'object') return String(output)

          // merge 노드 결과인 경우 summary 사용
          if (output.type === 'merge' && output.summary) {
            return output.summary
          }

          // 중첩된 merge 결과 확인 (출력 노드가 merge 결과를 받은 경우)
          const mergeResult = Object.values(output).find((v: any) => v?.type === 'merge' && v?.summary)
          if (mergeResult && typeof mergeResult === 'object' && 'summary' in mergeResult) {
            return (mergeResult as { summary: string }).summary
          }

          // 번역 결과인 경우
          if (output.translated_text) {
            const langName = { en: '영어', ja: '일본어', zh: '중국어', ko: '한국어' }[output.target_language as string] || output.target_language
            return `✅ 번역 완료 (${langName})\n\n${output.translated_text}`
          }

          // 일반적인 경우 JSON으로 출력
          return JSON.stringify(output, null, 2)
        }

        if (outputNodeResult) {
          const outputNode = nodes.find((n) => n.type === 'output')
          if (outputNode) {
            const resultText = formatResultText(outputNodeResult.output)
            updateNode(outputNode.id, {
              config: { ...outputNode.data?.config, result: resultText },
            })
            console.log('실행 결과:', resultText)
          }
        } else {
          // 출력 노드에 직접 연결된 결과가 없으면 마지막 결과를 사용
          const outputNode = nodes.find((n) => n.type === 'output')
          if (outputNode && result.outputs.length > 0) {
            const lastOutput = result.outputs[result.outputs.length - 1]
            const resultText = formatResultText(lastOutput.output)
            updateNode(outputNode.id, {
              config: { ...outputNode.data?.config, result: resultText },
            })
            console.log('실행 결과 (마지막):', resultText)
          }
        }
      }

      setSnackbar({ open: true, message: '워크플로우 실행 완료!', severity: 'success' })
    } catch (error) {
      setSnackbar({ open: true, message: `실행 실패: ${error}`, severity: 'error' })
    } finally {
      setExecuting(false)
    }
  }

  const handleSave = async () => {
    if (!workflowName.trim()) {
      setSnackbar({ open: true, message: '워크플로우 이름을 입력하세요.', severity: 'error' })
      return
    }
    try {
      const workflowId = await invoke<string>('save_workflow', {
        workflow: {
          id: currentWorkflowId || '',
          name: workflowName,
          description: workflowDescription,
          nodes: nodes.map((n) => ({ id: n.id, node_type: n.type, position: n.position, data: n.data })),
          edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, source_handle: e.sourceHandle, target_handle: e.targetHandle })),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      })
      setCurrentWorkflowId(workflowId)
      setSnackbar({ open: true, message: '저장되었습니다!', severity: 'success' })
      setSaveDialogOpen(false)
      loadSavedWorkflows()
    } catch (error) {
      setSnackbar({ open: true, message: `저장 실패: ${error}`, severity: 'error' })
    }
  }

  const handleLoadWorkflow = async (workflow: SavedWorkflow) => {
    try {
      const loaded = await invoke<any>('load_workflow', { id: workflow.id })
      if (loaded) {
        setCurrentWorkflowId(loaded.id)
        setWorkflowName(loaded.name)
        setWorkflowDescription(loaded.description || '')
        if (loaded.nodes) {
          setNodes(loaded.nodes.map((n: any) => ({ id: n.id, type: n.node_type, position: n.position, data: n.data })))
        }
        if (loaded.edges) {
          setEdges(loaded.edges.map((e: any) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.source_handle, targetHandle: e.target_handle })))
        }
        setSnackbar({ open: true, message: `"${loaded.name}" 불러옴`, severity: 'success' })
      }
    } catch (error) {
      setSnackbar({ open: true, message: `불러오기 실패: ${error}`, severity: 'error' })
    }
  }

  const handleDeleteWorkflow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await invoke('delete_workflow', { id })
      if (currentWorkflowId === id) {
        handleNewWorkflow()
      }
      setSnackbar({ open: true, message: '삭제됨', severity: 'success' })
      loadSavedWorkflows()
    } catch (error) {
      setSnackbar({ open: true, message: `삭제 실패: ${error}`, severity: 'error' })
    }
  }

  const handleNewWorkflow = () => {
    clearWorkflow()
    setCurrentWorkflowId(null)
    setWorkflowName('')
    setWorkflowDescription('')
  }

  const handleLoadSampleWorkflow = (sample: typeof SAMPLE_WORKFLOWS[0]) => {
    setCurrentWorkflowId(null)
    setWorkflowName(sample.data.name)
    setWorkflowDescription(sample.data.description)
    setNodes(sample.data.nodes.map((n: any) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    })))
    setEdges(sample.data.edges.map((e: any) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.animated,
      style: e.style,
    })))
    setSnackbar({ open: true, message: `"${sample.name}" 워크플로우를 불러왔습니다!`, severity: 'success' })
  }

  const handleSaveSettings = () => {
    localStorage.setItem('handbox-settings', JSON.stringify(settings))
    setSnackbar({ open: true, message: '설정 저장됨', severity: 'success' })
    setSettingsDialogOpen(false)
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* App Bar - Handbox Title Bar */}
      <AppBar position="fixed" elevation={0} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, background: 'linear-gradient(135deg, #0f172a 0%, #064e3b 50%, #0f172a 100%)', borderBottom: '1px solid rgba(16, 185, 129, 0.3)' }}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton color="inherit" onClick={toggleSidebar} edge="start" sx={{ mr: 1, background: 'rgba(255,255,255,0.05)', '&:hover': { background: 'rgba(16, 185, 129, 0.2)' } }}>
            <MenuIcon />
          </IconButton>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 2, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)' }}>
              <HubIcon sx={{ fontSize: 20, color: 'white' }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', background: 'linear-gradient(90deg, #fff 0%, #6ee7b7 100%)', backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Handbox
              </Typography>
            </Box>
          </Box>

          {workflowName && (
            <Chip label={workflowName} size="small" sx={{ ml: 2, background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', borderRadius: 1 }} />
          )}

          {awsStatus?.connected && (
            <Chip icon={<CloudDoneIcon sx={{ fontSize: 16 }} />} label={`AWS: ${awsStatus.region}`} size="small" sx={{ ml: 1, background: 'rgba(255, 153, 0, 0.15)', color: '#ffb84d', border: '1px solid rgba(255, 153, 0, 0.3)', '& .MuiChip-icon': { color: '#ffb84d' } }} />
          )}

          <Box sx={{ flexGrow: 1 }} />

          <Tooltip title="새 워크플로우">
            <IconButton onClick={handleNewWorkflow} sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' } }}>
              <AddIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="워크플로우 가져오기 (JSON)">
            <IconButton component="label" sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' } }}>
              <UploadFileIcon />
              <input type="file" hidden accept=".json" onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  const reader = new FileReader()
                  reader.onload = (event) => {
                    try {
                      const data = JSON.parse(event.target?.result as string)
                      if (data.nodes && data.edges) {
                        setCurrentWorkflowId(null)
                        setWorkflowName(data.name || 'Imported Workflow')
                        setWorkflowDescription(data.description || '')
                        setNodes(data.nodes.map((n: any) => ({
                          id: n.id,
                          type: n.type || n.node_type,
                          position: n.position,
                          data: n.data,
                        })))
                        setEdges(data.edges.map((edge: any) => ({
                          id: edge.id,
                          source: edge.source,
                          target: edge.target,
                          sourceHandle: edge.sourceHandle || edge.source_handle,
                          targetHandle: edge.targetHandle || edge.target_handle,
                          animated: true,
                          style: { stroke: '#10b981', strokeWidth: 2 },
                        })))
                        setSnackbar({ open: true, message: `워크플로우 "${data.name || file.name}"을(를) 가져왔습니다.`, severity: 'success' })
                      } else {
                        setSnackbar({ open: true, message: '올바른 워크플로우 JSON 파일이 아닙니다.', severity: 'error' })
                      }
                    } catch (err) {
                      setSnackbar({ open: true, message: 'JSON 파일 파싱 실패', severity: 'error' })
                    }
                  }
                  reader.readAsText(file)
                }
                e.target.value = ''
              }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="저장">
            <IconButton onClick={() => setSaveDialogOpen(true)} sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' } }}>
              <SaveIcon />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.1)' }} />

          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={handleExecute}
            disabled={executing || nodes.length === 0}
            sx={{ px: 3, background: executing ? 'rgba(99, 102, 241, 0.5)' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', boxShadow: executing ? 'none' : '0 4px 15px rgba(34, 197, 94, 0.3)', '&:disabled': { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' } }}
          >
            {executing ? '실행 중...' : '실행'}
          </Button>

          <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.1)' }} />

          <Tooltip title="AI 모델 설정">
            <IconButton onClick={() => setAiSettingsOpen(true)} sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.1)' } }}>
              <PsychologyIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="MCP 확장">
            <IconButton onClick={() => setMcpSettingsOpen(true)} sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.1)' } }}>
              <ExtensionIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="외부 API 설정">
            <IconButton onClick={() => setExternalAPISettingsOpen(true)} sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.1)' } }}>
              <ApiIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="설정">
            <IconButton onClick={() => setSettingsDialogOpen(true)} sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.1)' } }}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>

          <IconButton onClick={(e) => setUserMenuAnchor(e.currentTarget)} sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.1)' } }}>
            <AccountCircleIcon />
          </IconButton>

          <Menu
            anchorEl={userMenuAnchor}
            open={Boolean(userMenuAnchor)}
            onClose={() => setUserMenuAnchor(null)}
            PaperProps={{ sx: { background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, minWidth: 220 } }}
          >
            {/* 사용자 정보 헤더 */}
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: '#10b981' }}>
                  <PersonIcon sx={{ fontSize: 18 }} />
                </Avatar>
                <Box>
                  <Typography variant="body2" color="white" fontWeight={600}>
                    Handbox User
                  </Typography>
                  <Typography variant="caption" color="grey.500">
                    {aiModelConfig.provider.toUpperCase()} 모드
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* AWS 연결 상태 */}
            <Box sx={{ px: 2, py: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {awsStatus?.connected ? (
                  <>
                    <CloudDoneIcon sx={{ fontSize: 16, color: '#22c55e' }} />
                    <Typography variant="body2" color="#22c55e">
                      AWS 연결됨 ({awsStatus.region})
                    </Typography>
                  </>
                ) : (
                  <>
                    <CloudOffIcon sx={{ fontSize: 16, color: 'grey.500' }} />
                    <Typography variant="body2" color="grey.500">
                      AWS 연결 안됨
                    </Typography>
                  </>
                )}
              </Box>
            </Box>

            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

            {/* AWS 연결 해제 (연결된 경우만) */}
            {awsStatus?.connected && (
              <MenuItem onClick={handleDisconnectAWS} sx={{ color: '#fbbf24', py: 1.5 }}>
                <ListItemIcon>
                  <CloudOffIcon sx={{ color: '#fbbf24', fontSize: 18 }} />
                </ListItemIcon>
                <Typography variant="body2">AWS 연결 해제</Typography>
              </MenuItem>
            )}

            {/* AI 설정 */}
            <MenuItem onClick={() => { setUserMenuAnchor(null); setAiSettingsOpen(true); }} sx={{ py: 1.5 }}>
              <ListItemIcon>
                <PsychologyIcon sx={{ color: 'grey.400', fontSize: 18 }} />
              </ListItemIcon>
              <Typography variant="body2" color="grey.300">AI 모델 설정</Typography>
            </MenuItem>

            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

            {/* 로그아웃 */}
            <MenuItem onClick={() => { setUserMenuAnchor(null); setLogoutDialogOpen(true); }} sx={{ color: '#f87171', py: 1.5 }}>
              <ListItemIcon>
                <LogoutIcon sx={{ color: '#f87171', fontSize: 18 }} />
              </ListItemIcon>
              <Typography variant="body2">로그아웃</Typography>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Left Sidebar */}
      <Drawer
        variant="persistent"
        open={sidebarOpen}
        sx={{
          width: sidebarOpen ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
            borderRight: '1px solid rgba(99, 102, 241, 0.15)',
            mt: '64px',
            height: 'calc(100% - 64px)',
          },
        }}
      >
        {/* 탭 */}
        <Tabs
          value={sidebarTab}
          onChange={(_, v) => setSidebarTab(v)}
          sx={{
            minHeight: 48,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            '& .MuiTab-root': { minHeight: 48, color: 'grey.500', '&.Mui-selected': { color: '#a5b4fc' } },
            '& .MuiTabs-indicator': { background: '#6366f1' },
          }}
        >
          <Tab icon={<WidgetsIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="노드" sx={{ flex: 1, fontSize: '0.8rem' }} />
          <Tab icon={<FolderIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="워크플로우" sx={{ flex: 1, fontSize: '0.8rem' }} />
        </Tabs>

        {/* 탭 컨텐츠 */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {sidebarTab === 0 ? (
            <NodePalette />
          ) : (
            <Box sx={{ p: 2 }}>
              {/* 샘플 워크플로우 목록 - 카테고리별 */}
              {['건설신기술', '기본', '문서처리', 'RAG', '자동화', '분석', '한국API', 'AWS'].map((category) => {
                const categoryWorkflows = SAMPLE_WORKFLOWS.filter((w) => w.category === category)
                if (categoryWorkflows.length === 0) return null
                return (
                  <Box key={category} sx={{ mb: 2 }}>
                    <Typography
                      variant="caption"
                      color="grey.500"
                      sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.65rem' }}
                    >
                      {category}
                    </Typography>
                    {categoryWorkflows.map((sample) => (
                      <Button
                        key={sample.id}
                        fullWidth
                        variant="outlined"
                        onClick={() => handleLoadSampleWorkflow(sample)}
                        sx={{
                          mb: 0.5,
                          justifyContent: 'flex-start',
                          color: '#a5b4fc',
                          borderColor: 'rgba(99, 102, 241, 0.2)',
                          fontSize: '0.75rem',
                          py: 0.75,
                          '&:hover': {
                            borderColor: '#6366f1',
                            background: 'rgba(99, 102, 241, 0.1)',
                          },
                        }}
                      >
                        <Box component="span" sx={{ mr: 1, fontSize: '0.9rem' }}>{sample.icon}</Box>
                        {sample.name}
                      </Button>
                    ))}
                  </Box>
                )
              })}

              <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

              <Typography variant="caption" color="grey.500" sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                저장된 워크플로우
              </Typography>

              {savedWorkflows.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="grey.600">저장된 워크플로우가 없습니다</Typography>
                  <Typography variant="caption" color="grey.700" sx={{ display: 'block', mt: 1 }}>
                    워크플로우를 만들고 저장하세요
                  </Typography>
                </Box>
              ) : (
                <List sx={{ p: 0 }}>
                  {savedWorkflows.map((wf) => (
                    <ListItem
                      key={wf.id}
                      disablePadding
                      secondaryAction={
                        <IconButton edge="end" size="small" onClick={(e) => handleDeleteWorkflow(wf.id, e)} sx={{ color: '#f87171', opacity: 0.6, '&:hover': { opacity: 1 } }}>
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      }
                      sx={{ mb: 0.5 }}
                    >
                      <ListItemButton
                        onClick={() => handleLoadWorkflow(wf)}
                        selected={currentWorkflowId === wf.id}
                        sx={{
                          borderRadius: 1,
                          '&.Mui-selected': { background: 'rgba(99, 102, 241, 0.15)', '&:hover': { background: 'rgba(99, 102, 241, 0.2)' } },
                          '&:hover': { background: 'rgba(255,255,255,0.05)' },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <DescriptionIcon sx={{ fontSize: 18, color: currentWorkflowId === wf.id ? '#6366f1' : 'grey.600' }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={wf.name}
                          secondary={wf.description || new Date(wf.updated_at).toLocaleDateString()}
                          primaryTypographyProps={{ color: 'white', fontSize: '0.85rem', fontWeight: currentWorkflowId === wf.id ? 600 : 400 }}
                          secondaryTypographyProps={{ color: 'grey.600', fontSize: '0.7rem', noWrap: true }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          )}
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box component="main" sx={{ flexGrow: 1, mt: '64px', ml: sidebarOpen ? 0 : `-${DRAWER_WIDTH}px`, mr: selectedNode ? 0 : `-${PROPERTY_PANEL_WIDTH}px`, transition: 'margin 0.3s', height: 'calc(100vh - 64px)', background: '#0f172a' }}>
        <WorkflowEditor />
      </Box>

      {/* Right Sidebar - Property Panel */}
      <Drawer
        variant="persistent"
        anchor="right"
        open={!!selectedNode}
        sx={{
          width: selectedNode ? PROPERTY_PANEL_WIDTH : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: PROPERTY_PANEL_WIDTH, boxSizing: 'border-box', background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)', borderLeft: '1px solid rgba(99, 102, 241, 0.15)', mt: '64px', height: 'calc(100% - 64px)' },
        }}
      >
        <PropertyPanel />
      </Drawer>

      {/* Save Dialog - 워크플로우 저장 with 명확한 경로 */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} PaperProps={{ sx: { background: '#1e293b', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 3, minWidth: 500 } }}>
        <DialogTitle sx={{ color: 'white', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 1 }}>
          <SaveIcon sx={{ color: '#10b981' }} />
          워크플로우 저장
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <TextField fullWidth label="이름" value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} sx={{ mb: 2 }} InputProps={{ sx: { color: 'white' } }} InputLabelProps={{ sx: { color: 'grey.400' } }} />
          <TextField fullWidth label="설명 (선택)" value={workflowDescription} onChange={(e) => setWorkflowDescription(e.target.value)} multiline rows={2} sx={{ mb: 2 }} InputProps={{ sx: { color: 'white' } }} InputLabelProps={{ sx: { color: 'grey.400' } }} />
          <Box sx={{ p: 2, bgcolor: 'rgba(16, 185, 129, 0.1)', borderRadius: 2, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <Typography variant="caption" color="grey.400" sx={{ display: 'block', mb: 0.5 }}>저장 경로</Typography>
            <Typography variant="body2" color="#6ee7b7" sx={{ fontFamily: 'monospace' }}>./handbox-data/workflows/{workflowName || 'workflow'}.json</Typography>
          </Box>
          <Typography variant="caption" color="grey.500" sx={{ display: 'block', mt: 2 }}>
            저장된 워크플로우 파일(.json)을 복사하면 다른 환경에서도 동일하게 사용할 수 있습니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)', justifyContent: 'space-between' }}>
          <Button startIcon={<FileDownloadIcon />} onClick={() => {
            const workflowData = {
              id: currentWorkflowId || `workflow_${Date.now()}`,
              name: workflowName,
              description: workflowDescription,
              nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
              edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
            const blob = new Blob([JSON.stringify(workflowData, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${workflowName || 'workflow'}.json`
            a.click()
            setSnackbar({ open: true, message: '워크플로우를 파일로 내보냈습니다.', severity: 'success' })
          }} sx={{ color: '#6ee7b7' }}>JSON 내보내기</Button>
          <Box>
            <Button onClick={() => setSaveDialogOpen(false)} sx={{ color: 'grey.400', mr: 1 }}>취소</Button>
            <Button onClick={handleSave} variant="contained" sx={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>저장</Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Settings Dialog - Handbox 테마 */}
      <Dialog open={settingsDialogOpen} onClose={() => setSettingsDialogOpen(false)} PaperProps={{ sx: { background: '#1e293b', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 3, minWidth: 450 } }}>
        <DialogTitle sx={{ color: 'white', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon sx={{ color: '#10b981' }} />
          Handbox 설정
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="subtitle2" color="grey.400" sx={{ mb: 1.5 }}>일반</Typography>
          <FormControlLabel control={<Switch checked={settings.autoSave} onChange={(e) => setSettings({ ...settings, autoSave: e.target.checked })} sx={{ '& .Mui-checked': { color: '#10b981' }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#10b981' } }} />} label={<Typography color="white">자동 저장</Typography>} sx={{ mb: 2, display: 'block' }} />
          <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
          <Typography variant="subtitle2" color="grey.400" sx={{ mb: 1.5 }}>AWS 설정 (선택적)</Typography>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel sx={{ color: 'grey.400' }}>기본 AWS 리전</InputLabel>
            <Select value={settings.defaultRegion} onChange={(e) => setSettings({ ...settings, defaultRegion: e.target.value })} label="기본 AWS 리전" sx={{ color: 'white' }}>
              <MenuItem value="us-east-1">US East (N. Virginia)</MenuItem>
              <MenuItem value="us-west-2">US West (Oregon)</MenuItem>
              <MenuItem value="ap-northeast-1">Asia Pacific (Tokyo)</MenuItem>
              <MenuItem value="ap-northeast-2">Asia Pacific (Seoul)</MenuItem>
            </Select>
          </FormControl>
          <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
          <Typography variant="subtitle2" color="grey.400" sx={{ mb: 1.5 }}>에디터</Typography>
          <FormControlLabel control={<Switch checked={settings.animatedEdges} onChange={(e) => setSettings({ ...settings, animatedEdges: e.target.checked })} sx={{ '& .Mui-checked': { color: '#10b981' }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#10b981' } }} />} label={<Typography color="white">연결선 애니메이션</Typography>} sx={{ mb: 2, display: 'block' }} />
          <FormControlLabel control={<Switch checked={settings.snapToGrid} onChange={(e) => setSettings({ ...settings, snapToGrid: e.target.checked })} sx={{ '& .Mui-checked': { color: '#10b981' }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#10b981' } }} />} label={<Typography color="white">그리드 스냅</Typography>} sx={{ display: 'block' }} />
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <Button onClick={() => setSettingsDialogOpen(false)} sx={{ color: 'grey.400' }}>취소</Button>
          <Button onClick={handleSaveSettings} variant="contained" sx={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>저장</Button>
        </DialogActions>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <Dialog
        open={logoutDialogOpen}
        onClose={() => setLogoutDialogOpen(false)}
        PaperProps={{ sx: { background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, minWidth: 350 } }}
      >
        <DialogTitle sx={{ color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <LogoutIcon sx={{ color: '#f87171' }} />
          로그아웃
        </DialogTitle>
        <DialogContent>
          <Typography color="grey.300">
            Handbox에서 로그아웃하시겠습니까?
          </Typography>
          <Typography variant="body2" color="grey.500" sx={{ mt: 1 }}>
            저장되지 않은 워크플로우는 유지되지 않습니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setLogoutDialogOpen(false)} sx={{ color: 'grey.400' }}>
            취소
          </Button>
          <Button
            onClick={handleLogout}
            variant="contained"
            sx={{ background: '#f87171', '&:hover': { background: '#ef4444' } }}
          >
            로그아웃
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>

      {/* AI Settings Dialog */}
      <AISettingsDialog open={aiSettingsOpen} onClose={() => setAiSettingsOpen(false)} />

      {/* MCP Settings Dialog */}
      <MCPSettingsDialog open={mcpSettingsOpen} onClose={() => setMcpSettingsOpen(false)} />

      {/* External API Settings Dialog */}
      <ExternalAPISettingsDialog open={externalAPISettingsOpen} onClose={() => setExternalAPISettingsOpen(false)} />
    </Box>
  )
}

// 메모이제이션으로 불필요한 리렌더링 방지
const MainLayout = memo(MainLayoutContent)
export default MainLayout
