import { useState, useEffect, memo, useCallback, useRef } from 'react'
import {
  Box, AppBar, Toolbar, Typography, IconButton, Drawer, Tooltip, Chip, Button, Menu, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, List, ListItem, ListItemButton,
  ListItemText, ListItemIcon, Divider, Switch, FormControlLabel, Select, FormControl, InputLabel,
  Snackbar, Alert, Avatar, Collapse,
} from '@mui/material'
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
import WidgetsIcon from '@mui/icons-material/Widgets'
import PsychologyIcon from '@mui/icons-material/Psychology'
import ExtensionIcon from '@mui/icons-material/Extension'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import LogoutIcon from '@mui/icons-material/Logout'
import PersonIcon from '@mui/icons-material/Person'
import BugReportIcon from '@mui/icons-material/BugReport'
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft'
import TerminalIcon from '@mui/icons-material/Terminal'

import { serializeWorkflow, downloadWorkflow, parseWorkflowJSON, deserializeWorkflow } from '../../utils/workflowSerializer'
import NodePalette from '../NodePalette'
import AISettingsDialog from '../AISettingsDialog'
import PluginManagerDialog from '../PluginManagerDialog'
import ExecutionDebugger from '../ExecutionDebugger'
import ExecutionResultsPanel from '../ExecutionResultsPanel'
import AIWorkflowGenerator from '../AIWorkflowGenerator'
import type { DebugLogEntry } from '../ExecutionDebugger'
import { clearSavedCredentials } from '../ProviderSetup'
import WorkflowEditor from '../WorkflowEditor'

import PropertyPanel from '../PropertyPanel'
import WorkflowChat from '../WorkflowChat'
import { useAppStore } from '../../stores/appStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useExecutionStore } from '../../stores/executionStore'
import { useChatStore } from '../../stores/chatStore'
import { invoke } from '@tauri-apps/api/tauri'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'

const DRAWER_WIDTH = 280
const PROPERTY_PANEL_WIDTH = 320
const DEFAULT_RESULTS_PANEL_HEIGHT = 280
const MIN_RESULTS_PANEL_HEIGHT = 150
const MAX_RESULTS_PANEL_HEIGHT = 600

interface SavedWorkflow {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

function MainLayoutContent() {
  const { awsStatus, logout, setUseAWSConnection, setAWSStatus, aiModelConfig } = useAppStore()
  const { nodes, edges, selectedNode, setNodes, setEdges, clearWorkflow, updateNode } = useWorkflowStore()
  const { runWorkflow, isWorkflowRunning, nodeExecutionResults } = useExecutionStore()
  const { openChat, isOpen: isChatOpen } = useChatStore()
  const [executing, setExecuting] = useState(false)
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)

  // 노드 팔레트 접기/펼치기
  const [nodePaletteOpen, setNodePaletteOpen] = useState(false)

  // 결과 패널
  const [resultsPanelOpen, setResultsPanelOpen] = useState(false)
  const [resultsPanelHeight, setResultsPanelHeight] = useState(DEFAULT_RESULTS_PANEL_HEIGHT)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(0)

  // 다이얼로그 상태
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [pluginsOpen, setPluginsOpen] = useState(false)
  const [debuggerOpen, setDebuggerOpen] = useState(false)
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([])
  const [debugVariables, setDebugVariables] = useState<Record<string, any>>({})

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

  // 캔버스가 비어있는지 확인
  const isCanvasEmpty = nodes.length === 0

  // 앱 시작시 워크플로우 목록 로드
  useEffect(() => {
    loadSavedWorkflows()
    const savedSettings = localStorage.getItem('handbox-settings')
    if (savedSettings) setSettings(JSON.parse(savedSettings))
  }, [])

  // 실행 결과가 있으면 결과 패널 자동 열기
  useEffect(() => {
    const hasResults = Object.keys(nodeExecutionResults).length > 0
    if (hasResults && !resultsPanelOpen) {
      setResultsPanelOpen(true)
    }
  }, [nodeExecutionResults])

  // 결과 패널 리사이즈 핸들러
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeStartY.current = e.clientY
    resizeStartHeight.current = resultsPanelHeight
  }, [resultsPanelHeight])

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!isResizing) return
      const deltaY = resizeStartY.current - e.clientY
      const newHeight = Math.min(
        MAX_RESULTS_PANEL_HEIGHT,
        Math.max(MIN_RESULTS_PANEL_HEIGHT, resizeStartHeight.current + deltaY)
      )
      setResultsPanelHeight(newHeight)
    }

    const handleResizeEnd = () => {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    if (isResizing) {
      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleResizeMove)
      document.addEventListener('mouseup', handleResizeEnd)
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMove)
      document.removeEventListener('mouseup', handleResizeEnd)
    }
  }, [isResizing])

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

    // 디버그 로그 초기화
    setDebugLogs([])
    setDebugVariables({})

    setExecuting(true)
    try {
      // 새 ExecutionEngine으로 실행 (NodeRegistry 기반)
      await runWorkflow(nodes, edges)

      // 디버그 로그 수집
      const execResults = useExecutionStore.getState().nodeExecutionResults
      const newLogs: DebugLogEntry[] = Object.entries(execResults).map(([nodeId, result]) => {
        const node = nodes.find(n => n.id === nodeId)
        return {
          nodeId,
          nodeName: node?.data?.label || node?.type || nodeId,
          nodeType: node?.type || 'unknown',
          status: result.status,
          timestamp: result.startTime || Date.now(),
          output: result.output,
          error: result.error,
          duration: result.duration,
        }
      })
      setDebugLogs(newLogs)

      // 실행 완료 후 결과를 출력 노드에 반영
      const outputNode = nodes.find((n) => n.type === 'output')
      if (outputNode) {
        // 출력 노드에 연결된 소스 노드의 결과를 가져옴
        const incomingEdge = edges.find(e => e.target === outputNode.id)
        const sourceResult = incomingEdge ? execResults[incomingEdge.source] : null

        if (sourceResult?.output) {
          const resultText = sourceResult.output.text
            || sourceResult.output.status
            || JSON.stringify(sourceResult.output, null, 2)
          updateNode(outputNode.id, {
            config: { ...outputNode.data?.config, result: resultText },
          })
        }
      }

      // 에러가 있는 노드 확인
      const errorNodes = Object.entries(execResults)
        .filter(([_, r]) => r.status === 'error')
        .map(([id, r]) => `${id}: ${r.error}`)

      if (errorNodes.length > 0) {
        setSnackbar({ open: true, message: `실행 완료 (${errorNodes.length}개 오류)`, severity: 'info' })
      } else {
        setSnackbar({ open: true, message: '워크플로우 실행 완료!', severity: 'success' })
      }
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
    useExecutionStore.getState().clearAllExecutionResults()
    setResultsPanelOpen(false)
  }

  const handleSaveSettings = () => {
    localStorage.setItem('handbox-settings', JSON.stringify(settings))
    setSnackbar({ open: true, message: '설정 저장됨', severity: 'success' })
    setSettingsDialogOpen(false)
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* App Bar - Minimal */}
      <AppBar position="fixed" elevation={0} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, background: 'linear-gradient(135deg, #0f172a 0%, #064e3b 50%, #0f172a 100%)', borderBottom: '1px solid rgba(16, 185, 129, 0.3)' }}>
        <Toolbar sx={{ gap: 1, minHeight: '56px !important' }}>
          {/* Logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 32, height: 32, borderRadius: 1.5, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)' }}>
              <HubIcon sx={{ fontSize: 18, color: 'white' }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', background: 'linear-gradient(90deg, #fff 0%, #6ee7b7 100%)', backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Handbox
            </Typography>
          </Box>

          {workflowName && (
            <Chip label={workflowName} size="small" sx={{ ml: 2, background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', borderRadius: 1, height: 24 }} />
          )}

          {awsStatus?.connected && (
            <Chip icon={<CloudDoneIcon sx={{ fontSize: 14 }} />} label={awsStatus.region} size="small" sx={{ ml: 1, background: 'rgba(255, 153, 0, 0.15)', color: '#ffb84d', border: '1px solid rgba(255, 153, 0, 0.3)', height: 24, '& .MuiChip-icon': { color: '#ffb84d' } }} />
          )}

          <Box sx={{ flexGrow: 1 }} />

          {/* 노드 추가 (캔버스에 노드가 있을 때만) */}
          {!isCanvasEmpty && (
            <Tooltip title="노드 팔레트">
              <IconButton
                onClick={() => setNodePaletteOpen(!nodePaletteOpen)}
                sx={{
                  color: nodePaletteOpen ? '#10b981' : 'rgba(255,255,255,0.7)',
                  '&:hover': { color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }
                }}
              >
                <WidgetsIcon />
              </IconButton>
            </Tooltip>
          )}

          {/* AI 워크플로우 생성 (캔버스에 노드가 있을 때만 표시) */}
          {!isCanvasEmpty && (
            <Tooltip title="AI 워크플로우 생성">
              <IconButton
                onClick={openChat}
                sx={{
                  color: isChatOpen ? '#10b981' : 'rgba(255,255,255,0.7)',
                  '&:hover': { color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }
                }}
              >
                <AutoFixHighIcon />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title="새 워크플로우">
            <IconButton onClick={handleNewWorkflow} sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' } }}>
              <AddIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="워크플로우 가져오기">
            <IconButton component="label" sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' } }}>
              <UploadFileIcon />
              <input type="file" hidden accept=".json" onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  const reader = new FileReader()
                  reader.onload = (event) => {
                    try {
                      const jsonStr = event.target?.result as string
                      const { workflow, validation } = parseWorkflowJSON(jsonStr)
                      if (!validation.valid) {
                        setSnackbar({ open: true, message: `검증 실패: ${validation.errors[0]}`, severity: 'error' })
                        return
                      }
                      const { nodes: importedNodes, edges: importedEdges, meta, id } = deserializeWorkflow(workflow)
                      setCurrentWorkflowId(id)
                      setWorkflowName(meta.name)
                      setWorkflowDescription(meta.description || '')
                      setNodes(importedNodes)
                      setEdges(importedEdges)
                      setSnackbar({ open: true, message: `"${meta.name}" 불러옴`, severity: 'success' })
                    } catch (err) {
                      setSnackbar({ open: true, message: 'JSON 파싱 실패', severity: 'error' })
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

          {/* 실행 버튼 (노드가 있을 때만) */}
          {!isCanvasEmpty && (
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={handleExecute}
              disabled={executing || isWorkflowRunning}
              sx={{ px: 2, py: 0.75, background: (executing || isWorkflowRunning) ? 'rgba(99, 102, 241, 0.5)' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', boxShadow: (executing || isWorkflowRunning) ? 'none' : '0 4px 15px rgba(34, 197, 94, 0.3)', '&:disabled': { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' } }}
            >
              {(executing || isWorkflowRunning) ? '실행 중...' : '실행'}
            </Button>
          )}

          <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: 'rgba(255,255,255,0.1)' }} />

          {/* 결과 패널 토글 */}
          {Object.keys(nodeExecutionResults).length > 0 && (
            <Tooltip title="실행 결과">
              <IconButton
                onClick={() => setResultsPanelOpen(!resultsPanelOpen)}
                sx={{
                  color: resultsPanelOpen ? '#10b981' : 'rgba(255,255,255,0.7)',
                  '&:hover': { color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }
                }}
              >
                <TerminalIcon />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title="AI 모델 설정">
            <IconButton onClick={() => setAiSettingsOpen(true)} sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.1)' } }}>
              <PsychologyIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="플러그인">
            <IconButton onClick={() => setPluginsOpen(true)} sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.1)' } }}>
              <ExtensionIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="디버거">
            <IconButton onClick={() => setDebuggerOpen(!debuggerOpen)} sx={{ color: debuggerOpen ? '#6366f1' : 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.1)' } }}>
              <BugReportIcon />
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
                    {aiModelConfig.provider.toUpperCase()}
                  </Typography>
                </Box>
              </Box>
            </Box>

            <Box sx={{ px: 2, py: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {awsStatus?.connected ? (
                  <>
                    <CloudDoneIcon sx={{ fontSize: 16, color: '#22c55e' }} />
                    <Typography variant="body2" color="#22c55e">AWS 연결됨</Typography>
                  </>
                ) : (
                  <>
                    <CloudOffIcon sx={{ fontSize: 16, color: 'grey.500' }} />
                    <Typography variant="body2" color="grey.500">AWS 연결 안됨</Typography>
                  </>
                )}
              </Box>
            </Box>

            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

            {awsStatus?.connected && (
              <MenuItem onClick={handleDisconnectAWS} sx={{ color: '#fbbf24', py: 1.5 }}>
                <ListItemIcon><CloudOffIcon sx={{ color: '#fbbf24', fontSize: 18 }} /></ListItemIcon>
                <Typography variant="body2">AWS 연결 해제</Typography>
              </MenuItem>
            )}

            <MenuItem onClick={() => { setUserMenuAnchor(null); setAiSettingsOpen(true); }} sx={{ py: 1.5 }}>
              <ListItemIcon><PsychologyIcon sx={{ color: 'grey.400', fontSize: 18 }} /></ListItemIcon>
              <Typography variant="body2" color="grey.300">AI 모델 설정</Typography>
            </MenuItem>

            <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

            <MenuItem onClick={() => { setUserMenuAnchor(null); setLogoutDialogOpen(true); }} sx={{ color: '#f87171', py: 1.5 }}>
              <ListItemIcon><LogoutIcon sx={{ color: '#f87171', fontSize: 18 }} /></ListItemIcon>
              <Typography variant="body2">로그아웃</Typography>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Left Sidebar - Node Palette (접을 수 있음) */}
      <Drawer
        variant="persistent"
        open={nodePaletteOpen && !isCanvasEmpty}
        sx={{
          width: nodePaletteOpen && !isCanvasEmpty ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
            borderRight: '1px solid rgba(99, 102, 241, 0.15)',
            mt: '56px',
            height: 'calc(100% - 56px)',
          },
        }}
      >
        <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WidgetsIcon sx={{ color: '#6366f1', fontSize: 18 }} />
            <Typography variant="subtitle2" color="white">노드 추가</Typography>
          </Box>
          <IconButton size="small" onClick={() => setNodePaletteOpen(false)} sx={{ color: 'grey.500' }}>
            <KeyboardArrowLeftIcon fontSize="small" />
          </IconButton>
        </Box>
        <NodePalette />
      </Drawer>

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          mt: '56px',
          height: 'calc(100vh - 56px)',
          background: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* 캔버스가 비어있으면 AI 생성기 표시 */}
        {isCanvasEmpty ? (
          <AIWorkflowGenerator />
        ) : (
          <>
            {/* 워크플로우 에디터 */}
            <Box sx={{ flex: 1, position: 'relative' }}>
              <WorkflowEditor />
            </Box>

            {/* 실행 결과 패널 (하단) */}
            <Collapse in={resultsPanelOpen}>
              <Box
                sx={{
                  height: resultsPanelHeight,
                  borderTop: '1px solid rgba(16, 185, 129, 0.3)',
                  background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                  position: 'relative',
                }}
              >
                {/* 리사이즈 핸들 */}
                <Box
                  onMouseDown={handleResizeStart}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 6,
                    cursor: 'ns-resize',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    '&:hover': {
                      background: 'rgba(16, 185, 129, 0.2)',
                    },
                    '&:hover::after': {
                      background: '#10b981',
                    },
                    '&::after': {
                      content: '""',
                      width: 40,
                      height: 3,
                      borderRadius: 2,
                      background: isResizing ? '#10b981' : 'rgba(255,255,255,0.2)',
                      transition: 'background 0.2s',
                    },
                  }}
                />
                <ExecutionResultsPanel
                  onClose={() => setResultsPanelOpen(false)}
                />
              </Box>
            </Collapse>
          </>
        )}
      </Box>

      {/* Right Sidebar - Property Panel */}
      <Drawer
        variant="persistent"
        anchor="right"
        open={!!selectedNode && !isCanvasEmpty}
        sx={{
          width: selectedNode && !isCanvasEmpty ? PROPERTY_PANEL_WIDTH : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: PROPERTY_PANEL_WIDTH,
            boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
            borderLeft: '1px solid rgba(99, 102, 241, 0.15)',
            mt: '56px',
            height: 'calc(100% - 56px)',
          },
        }}
      >
        <PropertyPanel />
      </Drawer>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} PaperProps={{ sx: { background: '#1e293b', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 3, minWidth: 450 } }}>
        <DialogTitle sx={{ color: 'white', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 1 }}>
          <SaveIcon sx={{ color: '#10b981' }} />
          워크플로우 저장
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <TextField fullWidth label="이름" value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} sx={{ mb: 2 }} InputProps={{ sx: { color: 'white' } }} InputLabelProps={{ sx: { color: 'grey.400' } }} />
          <TextField fullWidth label="설명 (선택)" value={workflowDescription} onChange={(e) => setWorkflowDescription(e.target.value)} multiline rows={2} sx={{ mb: 2 }} InputProps={{ sx: { color: 'white' } }} InputLabelProps={{ sx: { color: 'grey.400' } }} />

          {/* 저장된 워크플로우 목록 */}
          {savedWorkflows.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="grey.500" sx={{ display: 'block', mb: 1 }}>
                저장된 워크플로우
              </Typography>
              <List sx={{ maxHeight: 150, overflow: 'auto', p: 0 }}>
                {savedWorkflows.map((wf) => (
                  <ListItem key={wf.id} disablePadding sx={{ mb: 0.5 }}
                    secondaryAction={
                      <IconButton edge="end" size="small" onClick={(e) => handleDeleteWorkflow(wf.id, e)} sx={{ color: '#f87171', opacity: 0.6 }}>
                        <DeleteIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    }
                  >
                    <ListItemButton onClick={() => handleLoadWorkflow(wf)} sx={{ borderRadius: 1, py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <DescriptionIcon sx={{ fontSize: 16, color: 'grey.500' }} />
                      </ListItemIcon>
                      <ListItemText primary={wf.name} primaryTypographyProps={{ fontSize: '0.8rem', color: 'grey.300' }} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)', justifyContent: 'space-between' }}>
          <Button startIcon={<FileDownloadIcon />} onClick={() => {
            const wf = serializeWorkflow(nodes, edges, { name: workflowName || 'workflow', description: workflowDescription, id: currentWorkflowId || undefined })
            downloadWorkflow(wf)
            setSnackbar({ open: true, message: 'JSON 내보내기 완료', severity: 'success' })
          }} sx={{ color: '#6ee7b7' }}>JSON 내보내기</Button>
          <Box>
            <Button onClick={() => setSaveDialogOpen(false)} sx={{ color: 'grey.400', mr: 1 }}>취소</Button>
            <Button onClick={handleSave} variant="contained" sx={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>저장</Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onClose={() => setSettingsDialogOpen(false)} PaperProps={{ sx: { background: '#1e293b', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 3, minWidth: 400 } }}>
        <DialogTitle sx={{ color: 'white', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon sx={{ color: '#10b981' }} />
          설정
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <FormControlLabel control={<Switch checked={settings.autoSave} onChange={(e) => setSettings({ ...settings, autoSave: e.target.checked })} sx={{ '& .Mui-checked': { color: '#10b981' }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#10b981' } }} />} label={<Typography color="white">자동 저장</Typography>} sx={{ mb: 2, display: 'block' }} />
          <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel sx={{ color: 'grey.400' }}>AWS 리전</InputLabel>
            <Select value={settings.defaultRegion} onChange={(e) => setSettings({ ...settings, defaultRegion: e.target.value })} label="AWS 리전" sx={{ color: 'white' }}>
              <MenuItem value="us-east-1">US East (N. Virginia)</MenuItem>
              <MenuItem value="us-west-2">US West (Oregon)</MenuItem>
              <MenuItem value="ap-northeast-1">Asia Pacific (Tokyo)</MenuItem>
              <MenuItem value="ap-northeast-2">Asia Pacific (Seoul)</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel control={<Switch checked={settings.animatedEdges} onChange={(e) => setSettings({ ...settings, animatedEdges: e.target.checked })} sx={{ '& .Mui-checked': { color: '#10b981' }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#10b981' } }} />} label={<Typography color="white">연결선 애니메이션</Typography>} sx={{ mb: 2, display: 'block' }} />
          <FormControlLabel control={<Switch checked={settings.snapToGrid} onChange={(e) => setSettings({ ...settings, snapToGrid: e.target.checked })} sx={{ '& .Mui-checked': { color: '#10b981' }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#10b981' } }} />} label={<Typography color="white">그리드 스냅</Typography>} sx={{ display: 'block' }} />
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <Button onClick={() => setSettingsDialogOpen(false)} sx={{ color: 'grey.400' }}>취소</Button>
          <Button onClick={handleSaveSettings} variant="contained" sx={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>저장</Button>
        </DialogActions>
      </Dialog>

      {/* Logout Dialog */}
      <Dialog open={logoutDialogOpen} onClose={() => setLogoutDialogOpen(false)} PaperProps={{ sx: { background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, minWidth: 350 } }}>
        <DialogTitle sx={{ color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <LogoutIcon sx={{ color: '#f87171' }} />
          로그아웃
        </DialogTitle>
        <DialogContent>
          <Typography color="grey.300">Handbox에서 로그아웃하시겠습니까?</Typography>
          <Typography variant="body2" color="grey.500" sx={{ mt: 1 }}>저장되지 않은 워크플로우는 유지되지 않습니다.</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setLogoutDialogOpen(false)} sx={{ color: 'grey.400' }}>취소</Button>
          <Button onClick={handleLogout} variant="contained" sx={{ background: '#f87171', '&:hover': { background: '#ef4444' } }}>로그아웃</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>

      {/* AI Settings Dialog */}
      <AISettingsDialog open={aiSettingsOpen} onClose={() => setAiSettingsOpen(false)} />

      {/* Plugin Manager Dialog */}
      <PluginManagerDialog open={pluginsOpen} onClose={() => setPluginsOpen(false)} />

      {/* Execution Debugger (Bottom Drawer) */}
      <ExecutionDebugger
        open={debuggerOpen}
        onClose={() => setDebuggerOpen(false)}
        logs={debugLogs}
        variables={debugVariables}
        isRunning={executing || isWorkflowRunning}
      />

      {/* AI Workflow Chat (Right Drawer) - 캔버스에 노드가 있을 때만 */}
      {!isCanvasEmpty && <WorkflowChat />}
    </Box>
  )
}

const MainLayout = memo(MainLayoutContent)
export default MainLayout
