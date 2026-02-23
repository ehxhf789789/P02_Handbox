/**
 * ChatHistory Component
 *
 * 대화 기록 사이드바 - ChatGPT 스타일의 대화 목록
 * 날짜별 그룹화, 검색, 워크플로우 연결 표시
 */

import { memo, useState, useMemo } from 'react'
import {
  Box,
  Typography,
  IconButton,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Divider,
  Tooltip,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Collapse,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import ChatIcon from '@mui/icons-material/Chat'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import HubIcon from '@mui/icons-material/Hub'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { useChatStore, groupSessionsByDate } from '../../stores/chatStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { invoke } from '@tauri-apps/api/tauri'
import type { ChatSession } from '../../types/ChatTypes'

interface ChatHistoryProps {
  onSelectSession?: (sessionId: string) => void
  onNewChat?: () => void
}

function ChatHistory({ onSelectSession, onNewChat }: ChatHistoryProps) {
  const {
    sessions,
    activeSessionId,
    searchQuery,
    setSearchQuery,
    createSession,
    loadSession,
    deleteSession,
    renameSession,
  } = useChatStore()

  const [contextMenu, setContextMenu] = useState<{ anchorEl: HTMLElement | null; sessionId: string | null }>({
    anchorEl: null,
    sessionId: null,
  })
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; sessionId: string | null; title: string }>({
    open: false,
    sessionId: null,
    title: '',
  })
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; sessionId: string | null }>({
    open: false,
    sessionId: null,
  })
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // 필터링된 세션 (인라인 계산으로 불필요한 리렌더 방지)
  const filteredSessions = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    const sorted = [...sessions].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    if (!query) return sorted
    return sorted.filter((session) => {
      if (session.title.toLowerCase().includes(query)) return true
      if (session.linkedWorkflowName?.toLowerCase().includes(query)) return true
      return session.messages.some((msg) => msg.content.toLowerCase().includes(query))
    })
  }, [sessions, searchQuery])

  // 날짜별 그룹화
  const groupedSessions = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions])
  const groupOrder = ['오늘', '어제', '이번 주', '이번 달']

  const handleNewChat = () => {
    const newId = createSession()
    onNewChat?.()
    onSelectSession?.(newId)
  }

  const { setNodes, setEdges, triggerFitView } = useWorkflowStore()

  const handleSelectSession = async (sessionId: string) => {
    loadSession(sessionId)
    onSelectSession?.(sessionId)

    // 연결된 워크플로우가 있으면 로드
    const session = sessions.find((s) => s.id === sessionId)
    if (session?.linkedWorkflowId) {
      try {
        const workflow = await invoke<any>('load_workflow', { id: session.linkedWorkflowId })
        if (workflow?.nodes) {
          setNodes(workflow.nodes.map((n: any) => ({
            id: n.id,
            type: n.node_type,
            position: n.position,
            data: n.data,
          })))
        }
        if (workflow?.edges) {
          setEdges(workflow.edges.map((e: any) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.source_handle,
            targetHandle: e.target_handle,
          })))
        }
        triggerFitView()
        console.log('[ChatHistory] 워크플로우 로드 완료:', session.linkedWorkflowName)
      } catch (error) {
        console.error('[ChatHistory] 워크플로우 로드 실패:', error)
      }
    }
  }

  const handleContextMenu = (event: React.MouseEvent<HTMLElement>, sessionId: string) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ anchorEl: event.currentTarget, sessionId })
  }

  const handleCloseContextMenu = () => {
    setContextMenu({ anchorEl: null, sessionId: null })
  }

  const handleRename = () => {
    const session = sessions.find((s) => s.id === contextMenu.sessionId)
    if (session) {
      setRenameDialog({ open: true, sessionId: session.id, title: session.title })
    }
    handleCloseContextMenu()
  }

  const handleConfirmRename = () => {
    if (renameDialog.sessionId && renameDialog.title.trim()) {
      renameSession(renameDialog.sessionId, renameDialog.title.trim())
    }
    setRenameDialog({ open: false, sessionId: null, title: '' })
  }

  const handleDelete = () => {
    setDeleteConfirm({ open: true, sessionId: contextMenu.sessionId })
    handleCloseContextMenu()
  }

  const handleConfirmDelete = () => {
    if (deleteConfirm.sessionId) {
      deleteSession(deleteConfirm.sessionId)
    }
    setDeleteConfirm({ open: false, sessionId: null })
  }

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey)
      } else {
        newSet.add(groupKey)
      }
      return newSet
    })
  }

  const formatSessionTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  const renderSessionItem = (session: ChatSession) => {
    const isActive = session.id === activeSessionId

    return (
      <ListItem
        key={session.id}
        disablePadding
        sx={{ mb: 0.5 }}
        secondaryAction={
          <IconButton
            size="small"
            onClick={(e) => handleContextMenu(e, session.id)}
            sx={{ opacity: 0, '.MuiListItem-root:hover &': { opacity: 1 }, color: 'grey.500' }}
          >
            <MoreVertIcon sx={{ fontSize: 16 }} />
          </IconButton>
        }
      >
        <ListItemButton
          onClick={() => handleSelectSession(session.id)}
          selected={isActive}
          sx={{
            borderRadius: 1,
            py: 1,
            pr: 4,
            '&.Mui-selected': {
              background: 'rgba(16, 185, 129, 0.15)',
              '&:hover': { background: 'rgba(16, 185, 129, 0.2)' },
            },
            '&:hover': { background: 'rgba(255, 255, 255, 0.05)' },
          }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <ChatIcon sx={{ fontSize: 16, color: isActive ? '#10b981' : 'grey.500' }} />
          </ListItemIcon>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                  variant="body2"
                  noWrap
                  sx={{
                    color: isActive ? '#6ee7b7' : 'grey.300',
                    fontSize: '0.85rem',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {session.title}
                </Typography>
              </Box>
            }
            secondary={
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                <Typography variant="caption" color="grey.600" sx={{ fontSize: '0.7rem' }}>
                  {formatSessionTime(session.updatedAt)}
                </Typography>
                {session.linkedWorkflowName && (
                  <Chip
                    icon={<HubIcon sx={{ fontSize: 10 }} />}
                    label={session.linkedWorkflowName}
                    size="small"
                    sx={{
                      height: 16,
                      ml: 0.5,
                      '& .MuiChip-label': { fontSize: '0.65rem', px: 0.5 },
                      '& .MuiChip-icon': { ml: 0.3 },
                      background: 'rgba(99, 102, 241, 0.2)',
                      color: '#a5b4fc',
                    }}
                  />
                )}
              </Box>
            }
            secondaryTypographyProps={{ component: 'div' }}
          />
        </ListItemButton>
      </ListItem>
    )
  }

  // 그룹 키 정렬
  const sortedGroupKeys = Object.keys(groupedSessions).sort((a, b) => {
    const indexA = groupOrder.indexOf(a)
    const indexB = groupOrder.indexOf(b)
    if (indexA !== -1 && indexB !== -1) return indexA - indexB
    if (indexA !== -1) return -1
    if (indexB !== -1) return 1
    return a.localeCompare(b)
  })

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="subtitle2" color="white" fontWeight={600}>
            대화 기록
          </Typography>
          <Tooltip title="새 대화">
            <IconButton
              size="small"
              onClick={handleNewChat}
              sx={{
                color: '#10b981',
                background: 'rgba(16, 185, 129, 0.1)',
                '&:hover': { background: 'rgba(16, 185, 129, 0.2)' },
              }}
            >
              <AddIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* 검색 */}
        <TextField
          fullWidth
          size="small"
          placeholder="대화 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: 'grey.500' }} />
              </InputAdornment>
            ),
            sx: {
              fontSize: '0.85rem',
              color: 'white',
              background: 'rgba(255,255,255,0.05)',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#10b981' },
            },
          }}
        />
      </Box>

      {/* 대화 목록 */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', p: 1 }}>
        {filteredSessions.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <ChatIcon sx={{ fontSize: 40, color: 'grey.700', mb: 1 }} />
            <Typography color="grey.500" variant="body2">
              {searchQuery ? '검색 결과가 없습니다' : '대화 기록이 없습니다'}
            </Typography>
            <Button
              variant="text"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleNewChat}
              sx={{ mt: 1, color: '#10b981' }}
            >
              새 대화 시작
            </Button>
          </Box>
        ) : (
          <List sx={{ p: 0 }}>
            {sortedGroupKeys.map((groupKey) => (
              <Box key={groupKey}>
                {/* 그룹 헤더 */}
                <Box
                  onClick={() => toggleGroup(groupKey)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 1,
                    py: 0.5,
                    cursor: 'pointer',
                    '&:hover': { background: 'rgba(255,255,255,0.02)' },
                  }}
                >
                  <Typography variant="caption" color="grey.500" fontWeight={600} sx={{ textTransform: 'uppercase' }}>
                    {groupKey}
                  </Typography>
                  {collapsedGroups.has(groupKey) ? (
                    <ExpandMoreIcon sx={{ fontSize: 16, color: 'grey.600' }} />
                  ) : (
                    <ExpandLessIcon sx={{ fontSize: 16, color: 'grey.600' }} />
                  )}
                </Box>

                {/* 그룹 내 세션 */}
                <Collapse in={!collapsedGroups.has(groupKey)}>
                  {groupedSessions[groupKey].map(renderSessionItem)}
                </Collapse>

                <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.05)' }} />
              </Box>
            ))}
          </List>
        )}
      </Box>

      {/* 컨텍스트 메뉴 */}
      <Menu
        anchorEl={contextMenu.anchorEl}
        open={Boolean(contextMenu.anchorEl)}
        onClose={handleCloseContextMenu}
        PaperProps={{
          sx: { background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1.5, minWidth: 150 },
        }}
      >
        <MenuItem onClick={handleRename} sx={{ py: 1 }}>
          <ListItemIcon>
            <EditIcon sx={{ fontSize: 16, color: 'grey.400' }} />
          </ListItemIcon>
          <Typography variant="body2" color="grey.300">
            이름 변경
          </Typography>
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={{ py: 1 }}>
          <ListItemIcon>
            <DeleteIcon sx={{ fontSize: 16, color: '#f87171' }} />
          </ListItemIcon>
          <Typography variant="body2" color="#f87171">
            삭제
          </Typography>
        </MenuItem>
      </Menu>

      {/* 이름 변경 다이얼로그 */}
      <Dialog
        open={renameDialog.open}
        onClose={() => setRenameDialog({ open: false, sessionId: null, title: '' })}
        PaperProps={{
          sx: { background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, minWidth: 350 },
        }}
      >
        <DialogTitle sx={{ color: 'white' }}>대화 이름 변경</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            autoFocus
            value={renameDialog.title}
            onChange={(e) => setRenameDialog((prev) => ({ ...prev, title: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirmRename()}
            sx={{ mt: 1 }}
            InputProps={{ sx: { color: 'white' } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setRenameDialog({ open: false, sessionId: null, title: '' })} sx={{ color: 'grey.400' }}>
            취소
          </Button>
          <Button onClick={handleConfirmRename} variant="contained" sx={{ background: '#10b981' }}>
            확인
          </Button>
        </DialogActions>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, sessionId: null })}
        PaperProps={{
          sx: { background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, minWidth: 350 },
        }}
      >
        <DialogTitle sx={{ color: 'white' }}>대화 삭제</DialogTitle>
        <DialogContent>
          <Typography color="grey.300">이 대화를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteConfirm({ open: false, sessionId: null })} sx={{ color: 'grey.400' }}>
            취소
          </Button>
          <Button onClick={handleConfirmDelete} variant="contained" sx={{ background: '#f87171' }}>
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default memo(ChatHistory)
