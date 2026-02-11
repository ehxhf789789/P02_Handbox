import { useState } from 'react'
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  Collapse,
  Tabs,
  Tab,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import CheckIcon from '@mui/icons-material/Check'
import CodeIcon from '@mui/icons-material/Code'
import MarkdownIcon from '@mui/icons-material/Article'

interface OutputDisplayProps {
  result: string | null | undefined
  format?: 'text' | 'json' | 'markdown'
}

export default function OutputDisplay({ result, format = 'text' }: OutputDisplayProps) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [viewMode, setViewMode] = useState(0)

  if (!result) {
    return (
      <Box
        sx={{
          p: 3,
          borderRadius: 2,
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px dashed rgba(255, 255, 255, 0.1)',
          textAlign: 'center',
        }}
      >
        <Typography variant="body2" color="grey.600">
          실행 후 결과가 여기에 표시됩니다
        </Typography>
      </Box>
    )
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('복사 실패:', e)
    }
  }

  // 결과 상태 판별 (성공/실패/정보)
  const getResultStatus = () => {
    if (result.includes('성공') || result.includes('완료') || result.includes('✅')) {
      return 'success'
    }
    if (result.includes('실패') || result.includes('오류') || result.includes('❌') || result.includes('Error')) {
      return 'error'
    }
    return 'info'
  }

  const status = getResultStatus()
  const statusColors = {
    success: { bg: 'rgba(34, 197, 94, 0.08)', border: 'rgba(34, 197, 94, 0.25)', text: '#4ade80' },
    error: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.25)', text: '#f87171' },
    info: { bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.25)', text: '#a5b4fc' },
  }

  const colors = statusColors[status]

  // JSON 형식인지 확인
  const isJSON = () => {
    if (format === 'json') return true
    try {
      JSON.parse(result)
      return true
    } catch {
      return false
    }
  }

  // JSON 포맷팅
  const formatJSON = (str: string) => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2)
    } catch {
      return str
    }
  }

  // 마크다운 간단 렌더링 (기본적인 포맷팅)
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n')
    return lines.map((line, idx) => {
      // 헤더
      if (line.startsWith('### ')) {
        return (
          <Typography key={idx} variant="subtitle1" sx={{ fontWeight: 600, color: '#a5b4fc', mt: 2, mb: 1 }}>
            {line.slice(4)}
          </Typography>
        )
      }
      if (line.startsWith('## ')) {
        return (
          <Typography key={idx} variant="h6" sx={{ fontWeight: 700, color: '#c4b5fd', mt: 2, mb: 1, fontSize: '1rem' }}>
            {line.slice(3)}
          </Typography>
        )
      }
      if (line.startsWith('# ')) {
        return (
          <Typography key={idx} variant="h5" sx={{ fontWeight: 700, color: '#e9d5ff', mt: 2, mb: 1, fontSize: '1.1rem' }}>
            {line.slice(2)}
          </Typography>
        )
      }
      // 리스트
      if (line.match(/^[\-\*] /)) {
        return (
          <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
            <Typography sx={{ color: colors.text }}>•</Typography>
            <Typography variant="body2" sx={{ color: 'grey.300', flex: 1 }}>
              {formatInlineText(line.slice(2))}
            </Typography>
          </Box>
        )
      }
      // 번호 리스트
      if (line.match(/^\d+\. /)) {
        const match = line.match(/^(\d+)\. (.*)/)
        if (match) {
          return (
            <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
              <Chip
                label={match[1]}
                size="small"
                sx={{
                  height: 20,
                  minWidth: 24,
                  fontSize: '0.7rem',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#a5b4fc',
                }}
              />
              <Typography variant="body2" sx={{ color: 'grey.300', flex: 1 }}>
                {formatInlineText(match[2])}
              </Typography>
            </Box>
          )
        }
      }
      // 코드 블록 시작
      if (line.startsWith('```')) {
        return null // 간단한 구현에서는 생략
      }
      // 빈 줄
      if (line.trim() === '') {
        return <Box key={idx} sx={{ height: 8 }} />
      }
      // 일반 텍스트
      return (
        <Typography key={idx} variant="body2" sx={{ color: 'grey.300', mb: 0.5 }}>
          {formatInlineText(line)}
        </Typography>
      )
    })
  }

  // 인라인 텍스트 포맷팅 (볼드, 이탤릭, 코드)
  const formatInlineText = (text: string) => {
    // 간단한 볼드 처리
    const parts = text.split(/(\*\*[^*]+\*\*|\`[^`]+\`)/)
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <Box key={idx} component="span" sx={{ fontWeight: 700, color: 'white' }}>
            {part.slice(2, -2)}
          </Box>
        )
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <Box
            key={idx}
            component="code"
            sx={{
              background: 'rgba(99, 102, 241, 0.2)',
              px: 0.5,
              py: 0.25,
              borderRadius: 0.5,
              fontFamily: 'monospace',
              fontSize: '0.85em',
              color: '#a5b4fc',
            }}
          >
            {part.slice(1, -1)}
          </Box>
        )
      }
      return part
    })
  }

  // 줄 수 계산
  const lineCount = result.split('\n').length
  const charCount = result.length

  return (
    <Box
      sx={{
        borderRadius: 2,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderBottom: `1px solid ${colors.border}`,
          background: 'rgba(0, 0, 0, 0.2)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ color: colors.text, fontWeight: 600 }}>
            실행 결과
          </Typography>
          <Chip
            label={status === 'success' ? '성공' : status === 'error' ? '오류' : '완료'}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.6rem',
              background: colors.bg,
              color: colors.text,
              border: `1px solid ${colors.border}`,
            }}
          />
          <Typography variant="caption" color="grey.600">
            {lineCount}줄 • {charCount.toLocaleString()}자
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {/* 뷰 모드 토글 */}
          <Tabs
            value={viewMode}
            onChange={(_, v) => setViewMode(v)}
            sx={{
              minHeight: 24,
              '& .MuiTabs-indicator': { display: 'none' },
              '& .MuiTab-root': {
                minHeight: 24,
                minWidth: 32,
                p: 0.5,
                color: 'grey.600',
                '&.Mui-selected': { color: colors.text },
              },
            }}
          >
            <Tab icon={<MarkdownIcon sx={{ fontSize: 16 }} />} />
            <Tab icon={<CodeIcon sx={{ fontSize: 16 }} />} />
          </Tabs>

          <Tooltip title={copied ? '복사됨!' : '복사'}>
            <IconButton onClick={handleCopy} size="small" sx={{ color: copied ? '#4ade80' : 'grey.500' }}>
              {copied ? <CheckIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>

          <IconButton onClick={() => setExpanded(!expanded)} size="small" sx={{ color: 'grey.500' }}>
            {expanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Box>
      </Box>

      {/* 결과 내용 */}
      <Collapse in={expanded}>
        <Box
          sx={{
            p: 2,
            maxHeight: 400,
            overflow: 'auto',
            '&::-webkit-scrollbar': { width: 6 },
            '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.2)', borderRadius: 3 },
          }}
        >
          {viewMode === 0 ? (
            // 포맷된 뷰
            format === 'markdown' || (!isJSON() && result.includes('\n')) ? (
              <Box>{renderMarkdown(result)}</Box>
            ) : isJSON() ? (
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 0,
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  color: 'grey.300',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {formatJSON(result)}
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: 'grey.300', whiteSpace: 'pre-wrap' }}>
                {result}
              </Typography>
            )
          ) : (
            // 원본 뷰
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 0,
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: 'grey.400',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {result}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}
