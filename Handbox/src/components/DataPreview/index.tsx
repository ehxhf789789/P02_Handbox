/**
 * DataPreview - 실시간 데이터 미리보기
 *
 * JSON, 테이블, 텍스트 데이터를 다양한 형식으로 시각화
 */

import { useState, useMemo } from 'react'
import {
  Box,
  Typography,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  InputAdornment,
  Collapse,
} from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SearchIcon from '@mui/icons-material/Search'
import TableChartIcon from '@mui/icons-material/TableChart'
import CodeIcon from '@mui/icons-material/Code'
import ArticleIcon from '@mui/icons-material/Article'
import DataObjectIcon from '@mui/icons-material/DataObject'

type ViewMode = 'auto' | 'json' | 'table' | 'text'

interface DataPreviewProps {
  data: unknown
  title?: string
  maxHeight?: number
  defaultView?: ViewMode
}

export default function DataPreview({
  data,
  title = '데이터 미리보기',
  maxHeight = 400,
  defaultView = 'auto',
}: DataPreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['$']))

  // 데이터 타입 감지
  const dataType = useMemo(() => {
    if (data === null || data === undefined) return 'empty'
    if (typeof data === 'string') return 'text'
    if (Array.isArray(data)) {
      if (data.length > 0 && typeof data[0] === 'object') return 'table'
      return 'array'
    }
    if (typeof data === 'object') return 'object'
    return 'primitive'
  }, [data])

  // 자동 뷰 모드 결정
  const effectiveViewMode = useMemo(() => {
    if (viewMode !== 'auto') return viewMode
    switch (dataType) {
      case 'table':
        return 'table'
      case 'text':
        return 'text'
      default:
        return 'json'
    }
  }, [viewMode, dataType])

  // 복사 기능
  const handleCopy = async () => {
    try {
      const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      await navigator.clipboard.writeText(text)
    } catch (e) {
      console.error('복사 실패:', e)
    }
  }

  // 경로 토글
  const togglePath = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  // 데이터 통계
  const stats = useMemo(() => {
    if (Array.isArray(data)) {
      return { type: '배열', count: data.length }
    }
    if (typeof data === 'object' && data !== null) {
      return { type: '객체', count: Object.keys(data).length }
    }
    if (typeof data === 'string') {
      return { type: '텍스트', count: data.length }
    }
    return { type: dataType, count: 0 }
  }, [data, dataType])

  if (data === null || data === undefined) {
    return (
      <Box
        sx={{
          p: 3,
          textAlign: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          borderRadius: 1,
          border: '1px dashed rgba(255, 255, 255, 0.1)',
        }}
      >
        <DataObjectIcon sx={{ fontSize: 32, color: 'grey.600', mb: 1 }} />
        <Typography variant="body2" color="grey.500">
          데이터가 없습니다
        </Typography>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        borderRadius: 1,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 0.75,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'grey.400' }}>
            {title}
          </Typography>
          <Chip
            label={`${stats.type} (${stats.count})`}
            size="small"
            sx={{ height: 18, fontSize: '0.6rem' }}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {/* 뷰 모드 탭 */}
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
              },
            }}
          >
            <Tab
              value="auto"
              icon={<DataObjectIcon sx={{ fontSize: 14 }} />}
              sx={{ color: viewMode === 'auto' ? '#6366f1' : 'grey.500' }}
            />
            <Tab
              value="json"
              icon={<CodeIcon sx={{ fontSize: 14 }} />}
              sx={{ color: viewMode === 'json' ? '#6366f1' : 'grey.500' }}
            />
            <Tab
              value="table"
              icon={<TableChartIcon sx={{ fontSize: 14 }} />}
              sx={{ color: viewMode === 'table' ? '#6366f1' : 'grey.500' }}
              disabled={dataType !== 'table' && dataType !== 'array'}
            />
            <Tab
              value="text"
              icon={<ArticleIcon sx={{ fontSize: 14 }} />}
              sx={{ color: viewMode === 'text' ? '#6366f1' : 'grey.500' }}
            />
          </Tabs>

          <Tooltip title="복사">
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopyIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 검색 (JSON 뷰에서만) */}
      {effectiveViewMode === 'json' && (
        <Box sx={{ px: 1.5, py: 0.5, borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <TextField
            size="small"
            placeholder="검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 14, color: 'grey.500' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                height: 28,
                fontSize: '0.75rem',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
              },
            }}
          />
        </Box>
      )}

      {/* 콘텐츠 */}
      <Box
        sx={{
          maxHeight,
          overflow: 'auto',
          p: 1.5,
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.2)', borderRadius: 3 },
        }}
      >
        {effectiveViewMode === 'json' && (
          <JsonTreeView
            data={data}
            path="$"
            expandedPaths={expandedPaths}
            onToggle={togglePath}
            searchQuery={searchQuery}
          />
        )}

        {effectiveViewMode === 'table' && <TableView data={data} />}

        {effectiveViewMode === 'text' && (
          <Box
            component="pre"
            sx={{
              m: 0,
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              color: 'grey.300',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// JSON 트리 뷰 컴포넌트
interface JsonTreeViewProps {
  data: unknown
  path: string
  expandedPaths: Set<string>
  onToggle: (path: string) => void
  searchQuery: string
  depth?: number
}

function JsonTreeView({
  data,
  path,
  expandedPaths,
  onToggle,
  searchQuery,
  depth = 0,
}: JsonTreeViewProps) {
  const isExpanded = expandedPaths.has(path)

  // 프리미티브 값
  if (data === null) {
    return <JsonValue value="null" type="null" />
  }
  if (typeof data === 'boolean') {
    return <JsonValue value={String(data)} type="boolean" />
  }
  if (typeof data === 'number') {
    return <JsonValue value={String(data)} type="number" />
  }
  if (typeof data === 'string') {
    const highlighted = Boolean(searchQuery && data.toLowerCase().includes(searchQuery.toLowerCase()))
    return <JsonValue value={`"${data}"`} type="string" highlighted={highlighted} />
  }

  // 배열
  if (Array.isArray(data)) {
    return (
      <Box>
        <Box
          sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => onToggle(path)}
        >
          {isExpanded ? (
            <ExpandMoreIcon sx={{ fontSize: 16, color: 'grey.500' }} />
          ) : (
            <ChevronRightIcon sx={{ fontSize: 16, color: 'grey.500' }} />
          )}
          <Typography component="span" sx={{ color: '#6366f1', fontSize: '0.75rem' }}>
            Array[{data.length}]
          </Typography>
        </Box>
        <Collapse in={isExpanded}>
          <Box sx={{ pl: 2 }}>
            {data.slice(0, 100).map((item, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <Typography
                  component="span"
                  sx={{ color: 'grey.500', fontSize: '0.7rem', minWidth: 24 }}
                >
                  {idx}:
                </Typography>
                <JsonTreeView
                  data={item}
                  path={`${path}[${idx}]`}
                  expandedPaths={expandedPaths}
                  onToggle={onToggle}
                  searchQuery={searchQuery}
                  depth={depth + 1}
                />
              </Box>
            ))}
            {data.length > 100 && (
              <Typography sx={{ color: 'grey.500', fontSize: '0.7rem' }}>
                ... 외 {data.length - 100}개
              </Typography>
            )}
          </Box>
        </Collapse>
      </Box>
    )
  }

  // 객체
  if (typeof data === 'object' && data !== null) {
    const entries = Object.entries(data as Record<string, unknown>)
    return (
      <Box>
        <Box
          sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => onToggle(path)}
        >
          {isExpanded ? (
            <ExpandMoreIcon sx={{ fontSize: 16, color: 'grey.500' }} />
          ) : (
            <ChevronRightIcon sx={{ fontSize: 16, color: 'grey.500' }} />
          )}
          <Typography component="span" sx={{ color: '#a855f7', fontSize: '0.75rem' }}>
            Object{'{'}
            {entries.length}
            {'}'}
          </Typography>
        </Box>
        <Collapse in={isExpanded}>
          <Box sx={{ pl: 2 }}>
            {entries.slice(0, 50).map(([key, value]) => {
              const keyHighlighted =
                searchQuery && key.toLowerCase().includes(searchQuery.toLowerCase())
              return (
                <Box key={key} sx={{ display: 'flex', alignItems: 'flex-start' }}>
                  <Typography
                    component="span"
                    sx={{
                      color: keyHighlighted ? '#fbbf24' : '#22d3ee',
                      fontSize: '0.75rem',
                      backgroundColor: keyHighlighted ? 'rgba(251, 191, 36, 0.2)' : 'transparent',
                      mr: 0.5,
                    }}
                  >
                    {key}:
                  </Typography>
                  <JsonTreeView
                    data={value}
                    path={`${path}.${key}`}
                    expandedPaths={expandedPaths}
                    onToggle={onToggle}
                    searchQuery={searchQuery}
                    depth={depth + 1}
                  />
                </Box>
              )
            })}
            {entries.length > 50 && (
              <Typography sx={{ color: 'grey.500', fontSize: '0.7rem' }}>
                ... 외 {entries.length - 50}개
              </Typography>
            )}
          </Box>
        </Collapse>
      </Box>
    )
  }

  return <JsonValue value={String(data)} type="unknown" />
}

// JSON 값 컴포넌트
interface JsonValueProps {
  value: string
  type: 'string' | 'number' | 'boolean' | 'null' | 'unknown'
  highlighted?: boolean
}

function JsonValue({ value, type, highlighted = false }: JsonValueProps) {
  const colors = {
    string: '#4ade80',
    number: '#fbbf24',
    boolean: '#f472b6',
    null: '#94a3b8',
    unknown: '#94a3b8',
  }

  return (
    <Typography
      component="span"
      sx={{
        color: colors[type],
        fontSize: '0.75rem',
        fontFamily: 'monospace',
        backgroundColor: highlighted ? 'rgba(251, 191, 36, 0.2)' : 'transparent',
        wordBreak: 'break-word',
      }}
    >
      {value.length > 200 ? `${value.slice(0, 200)}...` : value}
    </Typography>
  )
}

// 테이블 뷰 컴포넌트
interface TableViewProps {
  data: unknown
}

function TableView({ data }: TableViewProps) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <Typography variant="body2" color="grey.500">
        테이블로 표시할 수 없는 데이터입니다.
      </Typography>
    )
  }

  const firstItem = data[0]
  if (typeof firstItem !== 'object' || firstItem === null) {
    // 단순 배열
    return (
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, color: 'grey.400' }}>Index</TableCell>
              <TableCell sx={{ fontWeight: 600, color: 'grey.400' }}>Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.slice(0, 100).map((item, idx) => (
              <TableRow key={idx}>
                <TableCell sx={{ color: 'grey.500' }}>{idx}</TableCell>
                <TableCell sx={{ color: 'grey.300' }}>{String(item)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    )
  }

  // 객체 배열
  const headers = Object.keys(firstItem as Record<string, unknown>)

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {headers.map((header) => (
              <TableCell key={header} sx={{ fontWeight: 600, color: 'grey.400', fontSize: '0.7rem' }}>
                {header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.slice(0, 100).map((item, idx) => (
            <TableRow key={idx}>
              {headers.map((header) => {
                const value = (item as Record<string, unknown>)[header]
                return (
                  <TableCell key={header} sx={{ color: 'grey.300', fontSize: '0.7rem' }}>
                    {typeof value === 'object'
                      ? JSON.stringify(value)
                      : String(value ?? '')}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.length > 100 && (
        <Typography sx={{ p: 1, color: 'grey.500', fontSize: '0.7rem', textAlign: 'center' }}>
          100개 행만 표시됨 (총 {data.length}개)
        </Typography>
      )}
    </TableContainer>
  )
}
