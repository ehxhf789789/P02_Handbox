/**
 * ExecutionResultsPanel Component
 *
 * 워크플로우 실행 결과를 시각적으로 표시하는 하단 패널.
 * 각 노드의 실행 상태, 출력, 에러를 보여줌.
 */

import { memo, useState } from 'react'
import {
  Box,
  Typography,
  IconButton,
  Tabs,
  Tab,
  Chip,
  Collapse,
  Paper,
  Tooltip,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import PlayCircleIcon from '@mui/icons-material/PlayCircle'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { useExecutionStore } from '../../stores/executionStore'
import { useWorkflowStore } from '../../stores/workflowStore'

interface ExecutionResultsPanelProps {
  onClose: () => void
}

function ExecutionResultsPanel({ onClose }: ExecutionResultsPanelProps) {
  const { nodeExecutionResults, isWorkflowRunning } = useExecutionStore()
  const { nodes } = useWorkflowStore()
  const [selectedTab, setSelectedTab] = useState(0)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  const results = Object.entries(nodeExecutionResults)
  const completedCount = results.filter(([_, r]) => r.status === 'completed').length
  const errorCount = results.filter(([_, r]) => r.status === 'error').length
  const runningCount = results.filter(([_, r]) => r.status === 'running').length

  const toggleNodeExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      return newSet
    })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon sx={{ fontSize: 16, color: '#22c55e' }} />
      case 'error':
        return <ErrorIcon sx={{ fontSize: 16, color: '#ef4444' }} />
      case 'running':
        return <PlayCircleIcon sx={{ fontSize: 16, color: '#6366f1' }} />
      default:
        return <HourglassEmptyIcon sx={{ fontSize: 16, color: 'grey.500' }} />
    }
  }

  const formatOutput = (output: any): string => {
    if (!output) return ''
    if (typeof output === 'string') return output
    try {
      return JSON.stringify(output, null, 2)
    } catch {
      return String(output)
    }
  }

  const getNodeLabel = (nodeId: string): string => {
    const node = nodes.find(n => n.id === nodeId)
    return node?.data?.label || node?.type || nodeId
  }

  // 최종 출력 노드 찾기 (마지막 실행된 노드)
  const lastCompletedNode = results
    .filter(([_, r]) => r.status === 'completed' && r.output)
    .sort((a, b) => (b[1].endTime || 0) - (a[1].endTime || 0))[0]

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="subtitle2" color="white" fontWeight={600}>
            실행 결과
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {completedCount > 0 && (
              <Chip
                icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                label={`${completedCount} 완료`}
                size="small"
                sx={{
                  height: 22,
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#22c55e',
                  '& .MuiChip-icon': { color: '#22c55e' },
                }}
              />
            )}
            {errorCount > 0 && (
              <Chip
                icon={<ErrorIcon sx={{ fontSize: 14 }} />}
                label={`${errorCount} 에러`}
                size="small"
                sx={{
                  height: 22,
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  '& .MuiChip-icon': { color: '#ef4444' },
                }}
              />
            )}
            {runningCount > 0 && (
              <Chip
                icon={<PlayCircleIcon sx={{ fontSize: 14 }} />}
                label={`${runningCount} 실행중`}
                size="small"
                sx={{
                  height: 22,
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#6366f1',
                  '& .MuiChip-icon': { color: '#6366f1' },
                }}
              />
            )}
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: 'grey.500' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* 탭 */}
      <Tabs
        value={selectedTab}
        onChange={(_, v) => setSelectedTab(v)}
        sx={{
          minHeight: 36,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          '& .MuiTab-root': {
            minHeight: 36,
            color: 'grey.500',
            fontSize: '0.8rem',
            '&.Mui-selected': { color: '#10b981' },
          },
          '& .MuiTabs-indicator': { background: '#10b981' },
        }}
      >
        <Tab label="최종 출력" />
        <Tab label="노드별 상세" />
      </Tabs>

      {/* 컨텐츠 */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {selectedTab === 0 ? (
          /* 최종 출력 탭 */
          <Box>
            {lastCompletedNode ? (
              <Paper
                sx={{
                  p: 2,
                  background: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: 2,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption" color="grey.400">
                    {getNodeLabel(lastCompletedNode[0])}의 출력
                  </Typography>
                  <Tooltip title="복사">
                    <IconButton
                      size="small"
                      onClick={() => copyToClipboard(formatOutput(lastCompletedNode[1].output))}
                      sx={{ color: 'grey.500' }}
                    >
                      <ContentCopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1.5,
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 1,
                    overflow: 'auto',
                    maxHeight: 180,
                    fontSize: '0.8rem',
                    color: '#6ee7b7',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {formatOutput(lastCompletedNode[1].output)}
                </Box>
              </Paper>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="grey.500">
                  {isWorkflowRunning ? '워크플로우 실행 중...' : '실행 결과가 없습니다'}
                </Typography>
              </Box>
            )}
          </Box>
        ) : (
          /* 노드별 상세 탭 */
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {results.map(([nodeId, result]) => (
              <Paper
                key={nodeId}
                sx={{
                  background: result.status === 'error'
                    ? 'rgba(239, 68, 68, 0.05)'
                    : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${result.status === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)'}`,
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                {/* 노드 헤더 */}
                <Box
                  sx={{
                    px: 1.5,
                    py: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    cursor: 'pointer',
                    '&:hover': { background: 'rgba(255,255,255,0.02)' },
                  }}
                  onClick={() => toggleNodeExpand(nodeId)}
                >
                  {getStatusIcon(result.status)}
                  <Typography variant="body2" color="white" sx={{ flex: 1 }}>
                    {getNodeLabel(nodeId)}
                  </Typography>
                  {result.duration && (
                    <Typography variant="caption" color="grey.500">
                      {(result.duration / 1000).toFixed(2)}s
                    </Typography>
                  )}
                  {expandedNodes.has(nodeId) ? (
                    <ExpandLessIcon sx={{ fontSize: 18, color: 'grey.500' }} />
                  ) : (
                    <ExpandMoreIcon sx={{ fontSize: 18, color: 'grey.500' }} />
                  )}
                </Box>

                {/* 노드 상세 */}
                <Collapse in={expandedNodes.has(nodeId)}>
                  <Box sx={{ px: 1.5, pb: 1.5 }}>
                    {result.error ? (
                      <Box
                        sx={{
                          p: 1,
                          background: 'rgba(239, 68, 68, 0.1)',
                          borderRadius: 1,
                          fontSize: '0.75rem',
                          color: '#f87171',
                          fontFamily: 'monospace',
                        }}
                      >
                        {result.error}
                      </Box>
                    ) : result.output ? (
                      <Box
                        component="pre"
                        sx={{
                          m: 0,
                          p: 1,
                          background: 'rgba(0,0,0,0.2)',
                          borderRadius: 1,
                          overflow: 'auto',
                          maxHeight: 120,
                          fontSize: '0.7rem',
                          color: 'grey.300',
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {formatOutput(result.output)}
                      </Box>
                    ) : (
                      <Typography variant="caption" color="grey.600">
                        출력 없음
                      </Typography>
                    )}
                  </Box>
                </Collapse>
              </Paper>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default memo(ExecutionResultsPanel)
