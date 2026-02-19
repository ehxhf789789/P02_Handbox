/**
 * ExecutionDebugger — 실행 디버거 UI
 *
 * 기능:
 * - 실행 로그 타임라인
 * - 노드별 입출력 데이터 검사
 * - 브레이크포인트 설정
 * - 스텝 실행
 * - 변수 확인
 */

import { useState, useEffect, useCallback, memo, useRef } from 'react'
import {
  Drawer,
  Box,
  Typography,
  Tabs,
  Tab,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Tooltip,
  Divider,
  Collapse,
  Paper,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import BugReportIcon from '@mui/icons-material/BugReport'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import DataObjectIcon from '@mui/icons-material/DataObject'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import type { NodeExecutionStatus } from '../../engine/types'

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export interface DebugLogEntry {
  nodeId: string
  nodeName: string
  nodeType: string
  status: NodeExecutionStatus
  timestamp: number
  output?: Record<string, any>
  error?: string
  duration?: number
}

interface ExecutionDebuggerProps {
  open: boolean
  onClose: () => void
  /** 실행 로그 엔트리 목록 */
  logs: DebugLogEntry[]
  /** 컨텍스트 변수 */
  variables: Record<string, any>
  /** 실행 중 여부 */
  isRunning: boolean
  /** 스텝 실행 콜백 (null이면 스텝 모드 비활성) */
  onStep?: () => void
}

// ─────────────────────────────────────────────
// 상태 아이콘/색상
// ─────────────────────────────────────────────

const STATUS_ICON: Record<NodeExecutionStatus, React.ReactNode> = {
  idle: <HourglassEmptyIcon sx={{ color: '#94a3b8', fontSize: 18 }} />,
  running: <PlayArrowIcon sx={{ color: '#6366f1', fontSize: 18 }} />,
  completed: <CheckCircleIcon sx={{ color: '#22c55e', fontSize: 18 }} />,
  error: <ErrorIcon sx={{ color: '#ef4444', fontSize: 18 }} />,
  skipped: <SkipNextIcon sx={{ color: '#64748b', fontSize: 18 }} />,
}

const STATUS_LABELS: Record<NodeExecutionStatus, string> = {
  idle: '대기',
  running: '실행 중',
  completed: '완료',
  error: '오류',
  skipped: '스킵됨',
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────

function ExecutionDebuggerContent({
  open,
  onClose,
  logs,
  variables,
  isRunning,
  onStep,
}: ExecutionDebuggerProps) {
  const [tabIndex, setTabIndex] = useState(0)
  const [expandedNode, setExpandedNode] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  // 자동 스크롤
  useEffect(() => {
    if (open && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs.length, open])

  // JSON 복사
  const handleCopy = useCallback((data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).catch(() => {})
  }, [])

  // 통계
  const completedCount = logs.filter(l => l.status === 'completed').length
  const errorCount = logs.filter(l => l.status === 'error').length
  const skippedCount = logs.filter(l => l.status === 'skipped').length
  const totalDuration = logs.reduce((sum, l) => sum + (l.duration || 0), 0)

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      variant="persistent"
      sx={{
        '& .MuiDrawer-paper': {
          height: 350,
          bgcolor: '#1e293b',
          borderTop: '2px solid rgba(99, 102, 241, 0.3)',
          color: 'white',
        },
      }}
    >
      {/* ── 헤더 ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <BugReportIcon sx={{ color: '#6366f1', fontSize: 20 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mr: 1 }}>
          실행 디버거
        </Typography>

        {/* 통계 칩 */}
        <Chip label={`${completedCount} 완료`} size="small" sx={{ height: 20, fontSize: 11, bgcolor: 'rgba(34,197,94,0.12)', color: '#4ade80' }} />
        {errorCount > 0 && (
          <Chip label={`${errorCount} 오류`} size="small" sx={{ height: 20, fontSize: 11, bgcolor: 'rgba(239,68,68,0.12)', color: '#f87171' }} />
        )}
        {skippedCount > 0 && (
          <Chip label={`${skippedCount} 스킵`} size="small" sx={{ height: 20, fontSize: 11, bgcolor: 'rgba(148,163,184,0.12)', color: '#94a3b8' }} />
        )}
        {totalDuration > 0 && (
          <Chip label={`${(totalDuration / 1000).toFixed(1)}s`} size="small" sx={{ height: 20, fontSize: 11, bgcolor: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }} />
        )}

        <Box sx={{ flex: 1 }} />

        {/* 스텝 실행 */}
        {onStep && isRunning && (
          <Tooltip title="다음 노드 실행">
            <IconButton size="small" onClick={onStep} sx={{ color: '#6366f1' }}>
              <SkipNextIcon />
            </IconButton>
          </Tooltip>
        )}

        <IconButton size="small" onClick={onClose} sx={{ color: 'grey.500' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* ── 탭 ── */}
      <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Tabs
          value={tabIndex}
          onChange={(_, v) => setTabIndex(v)}
          sx={{
            minHeight: 36,
            '& .MuiTab-root': { color: 'grey.500', textTransform: 'none', fontSize: 12, minHeight: 36, py: 0 },
            '& .Mui-selected': { color: '#6366f1' },
            '& .MuiTabs-indicator': { backgroundColor: '#6366f1', height: 2 },
          }}
        >
          <Tab label="실행 로그" />
          <Tab label="변수" />
        </Tabs>
      </Box>

      {/* ── 탭 내용 ── */}
      <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#0f172a' }}>
        {/* 탭 0: 실행 로그 */}
        {tabIndex === 0 && (
          <List dense sx={{ py: 0 }}>
            {logs.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="grey.600" variant="body2">
                  실행 로그가 없습니다. 워크플로우를 실행하세요.
                </Typography>
              </Box>
            ) : (
              logs.map((entry, idx) => (
                <Box key={`${entry.nodeId}-${idx}`}>
                  <ListItem
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'rgba(99,102,241,0.05)' },
                      opacity: entry.status === 'skipped' ? 0.5 : 1,
                    }}
                    onClick={() => setExpandedNode(expandedNode === `${entry.nodeId}-${idx}` ? null : `${entry.nodeId}-${idx}`)}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      {STATUS_ICON[entry.status]}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13 }}>
                            {entry.nodeName}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'grey.600', fontFamily: 'monospace' }}>
                            {entry.nodeType}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" sx={{ color: entry.status === 'error' ? '#f87171' : 'grey.500' }}>
                          {entry.error || STATUS_LABELS[entry.status]}
                          {entry.duration ? ` · ${entry.duration}ms` : ''}
                        </Typography>
                      }
                    />
                    {entry.output && (
                      <IconButton size="small" sx={{ color: 'grey.600' }}>
                        {expandedNode === `${entry.nodeId}-${idx}` ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </IconButton>
                    )}
                  </ListItem>

                  {/* 확장: 출력 데이터 */}
                  <Collapse in={expandedNode === `${entry.nodeId}-${idx}`}>
                    <Box sx={{ px: 2, pb: 1.5, ml: 4 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <DataObjectIcon sx={{ color: 'grey.600', fontSize: 14 }} />
                        <Typography variant="caption" color="grey.500">Output</Typography>
                        <Tooltip title="복사">
                          <IconButton size="small" onClick={() => handleCopy(entry.output)} sx={{ ml: 'auto', color: 'grey.600' }}>
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      <Paper
                        sx={{
                          bgcolor: '#1e293b',
                          p: 1.5,
                          borderRadius: 1,
                          maxHeight: 120,
                          overflow: 'auto',
                          border: '1px solid rgba(255,255,255,0.05)',
                        }}
                      >
                        <Typography
                          variant="caption"
                          component="pre"
                          sx={{
                            color: '#a5b4fc',
                            fontFamily: 'monospace',
                            fontSize: 11,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            m: 0,
                          }}
                        >
                          {JSON.stringify(entry.output, null, 2)}
                        </Typography>
                      </Paper>
                    </Box>
                  </Collapse>

                  {idx < logs.length - 1 && (
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.03)' }} />
                  )}
                </Box>
              ))
            )}
            <div ref={logEndRef} />
          </List>
        )}

        {/* 탭 1: 변수 */}
        {tabIndex === 1 && (
          <Box sx={{ p: 2 }}>
            {Object.keys(variables).length === 0 ? (
              <Typography color="grey.600" variant="body2" sx={{ textAlign: 'center', py: 3 }}>
                워크플로우 변수가 없습니다.
              </Typography>
            ) : (
              <List dense>
                {Object.entries(variables).map(([key, value]) => (
                  <ListItem
                    key={key}
                    sx={{
                      bgcolor: '#1e293b',
                      mb: 0.5,
                      borderRadius: 1,
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ color: '#a5b4fc', fontFamily: 'monospace', fontWeight: 600 }}>
                          {key}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" sx={{ color: 'grey.400', fontFamily: 'monospace' }}>
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}
      </Box>
    </Drawer>
  )
}

const ExecutionDebugger = memo(ExecutionDebuggerContent)
export default ExecutionDebugger
