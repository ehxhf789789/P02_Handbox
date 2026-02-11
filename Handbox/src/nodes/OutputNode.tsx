import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Box, Typography, Tooltip, Chip, LinearProgress } from '@mui/material'
import OutputIcon from '@mui/icons-material/Output'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import ArticleIcon from '@mui/icons-material/Article'
import DataObjectIcon from '@mui/icons-material/DataObject'

interface OutputNodeData {
  label: string
  color: string
  config?: {
    result?: string
    outputFormat?: 'text' | 'json' | 'markdown'
    data?: string
  }
}

function OutputNode({ data, selected }: NodeProps<OutputNodeData>) {
  const result = data.config?.result || ''
  const hasResult = result.length > 0
  const outputFormat = data.config?.outputFormat || 'text'

  // 결과 상태 판별
  const getResultStatus = (): 'success' | 'error' | 'pending' => {
    if (!hasResult) return 'pending'
    if (result.includes('실패') || result.includes('오류') || result.includes('Error') || result.includes('❌')) {
      return 'error'
    }
    return 'success'
  }

  const status = getResultStatus()

  const statusConfig = {
    success: {
      color: '#22c55e',
      bgColor: 'rgba(34, 197, 94, 0.15)',
      borderColor: 'rgba(34, 197, 94, 0.5)',
      icon: <CheckCircleIcon sx={{ fontSize: 16 }} />,
      label: '완료',
    },
    error: {
      color: '#ef4444',
      bgColor: 'rgba(239, 68, 68, 0.15)',
      borderColor: 'rgba(239, 68, 68, 0.5)',
      icon: <ErrorIcon sx={{ fontSize: 16 }} />,
      label: '오류',
    },
    pending: {
      color: '#6366f1',
      bgColor: 'rgba(99, 102, 241, 0.1)',
      borderColor: 'rgba(99, 102, 241, 0.3)',
      icon: <HourglassEmptyIcon sx={{ fontSize: 16 }} />,
      label: '대기중',
    },
  }

  const currentStatus = statusConfig[status]

  // 결과 미리보기 (최대 150자)
  const getPreviewText = () => {
    if (!result) return null
    // JSON인지 확인
    try {
      JSON.parse(result)
      return result.length > 150 ? result.substring(0, 150) + '...' : result
    } catch {
      return result.length > 150 ? result.substring(0, 150) + '...' : result
    }
  }

  const previewText = getPreviewText()

  // 줄 수와 문자 수
  const lineCount = result.split('\n').length
  const charCount = result.length

  return (
    <Box
      sx={{
        background: hasResult
          ? `linear-gradient(135deg, ${currentStatus.bgColor} 0%, #1e293b 100%)`
          : '#1e293b',
        borderRadius: 2,
        border: selected
          ? `2px solid ${currentStatus.color}`
          : hasResult
          ? `2px solid ${currentStatus.borderColor}`
          : '1px solid rgba(255,255,255,0.1)',
        boxShadow: selected
          ? `0 0 20px ${currentStatus.color}40`
          : hasResult
          ? `0 0 15px ${currentStatus.color}20`
          : 'none',
        minWidth: 220,
        maxWidth: 300,
        transition: 'all 0.2s',
      }}
    >
      {/* Input Handle Only */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: currentStatus.color,
          width: 12,
          height: 12,
          border: '2px solid #0f172a',
        }}
      />

      {/* Header */}
      <Box
        sx={{
          background: `${currentStatus.color}30`,
          p: 1.5,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <OutputIcon sx={{ color: currentStatus.color, fontSize: 20 }} />
        <Typography variant="body2" fontWeight="bold" color="white" sx={{ flex: 1 }}>
          {data.label}
        </Typography>
        <Tooltip title={currentStatus.label}>
          <Box sx={{ color: currentStatus.color }}>{currentStatus.icon}</Box>
        </Tooltip>
      </Box>

      {/* Body */}
      <Box sx={{ p: 1.5 }}>
        {/* 상태 칩 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label="워크플로우 종료"
            sx={{
              fontSize: '0.6rem',
              height: 18,
              background: `${currentStatus.color}20`,
              color: currentStatus.color,
            }}
          />
          {hasResult && (
            <Chip
              size="small"
              icon={outputFormat === 'json' ? <DataObjectIcon sx={{ fontSize: 12 }} /> : <ArticleIcon sx={{ fontSize: 12 }} />}
              label={outputFormat === 'json' ? 'JSON' : outputFormat === 'markdown' ? 'MD' : '텍스트'}
              sx={{
                fontSize: '0.6rem',
                height: 18,
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#a5b4fc',
                '& .MuiChip-icon': { color: '#a5b4fc' },
              }}
            />
          )}
          {hasResult && (
            <Chip
              size="small"
              label={`${lineCount}줄 • ${charCount.toLocaleString()}자`}
              sx={{
                fontSize: '0.55rem',
                height: 16,
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'grey.500',
              }}
            />
          )}
        </Box>

        {/* 결과 미리보기 */}
        {previewText ? (
          <Tooltip title="클릭하여 전체 결과 보기" placement="bottom">
            <Box
              sx={{
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 1,
                p: 1,
                mt: 1,
                border: `1px solid ${currentStatus.color}30`,
                cursor: 'pointer',
                '&:hover': {
                  background: 'rgba(0, 0, 0, 0.4)',
                  borderColor: `${currentStatus.color}50`,
                },
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mb: 0.5,
                  fontSize: '0.6rem',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: currentStatus.color,
                }}
              >
                결과 미리보기
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: '#cbd5e1',
                  fontSize: '0.75rem',
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                  maxHeight: 80,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {previewText}
              </Typography>
            </Box>
          </Tooltip>
        ) : (
          <Box
            sx={{
              background: 'rgba(99, 102, 241, 0.05)',
              borderRadius: 1,
              p: 1.5,
              mt: 1,
              border: '1px dashed rgba(99, 102, 241, 0.2)',
              textAlign: 'center',
            }}
          >
            <HourglassEmptyIcon sx={{ color: 'grey.600', fontSize: 24, mb: 0.5 }} />
            <Typography variant="caption" color="grey.500" sx={{ display: 'block', fontSize: '0.7rem' }}>
              실행 후 결과가 표시됩니다
            </Typography>
            <Typography variant="caption" color="grey.600" sx={{ display: 'block', fontSize: '0.6rem', mt: 0.5 }}>
              상단 "실행" 버튼을 클릭하세요
            </Typography>
          </Box>
        )}

        {/* 진행중 표시 (선택적) */}
        {status === 'pending' && !hasResult && (
          <Box sx={{ mt: 1 }}>
            <LinearProgress
              variant="indeterminate"
              sx={{
                height: 2,
                borderRadius: 1,
                background: 'rgba(99, 102, 241, 0.1)',
                '& .MuiLinearProgress-bar': {
                  background: 'linear-gradient(90deg, transparent, #6366f1, transparent)',
                },
                opacity: 0.5,
              }}
            />
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default memo(OutputNode)
