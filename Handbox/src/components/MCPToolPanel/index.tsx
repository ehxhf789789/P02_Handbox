/**
 * MCP Tool Panel
 *
 * Local MCP 도구를 탐색하고 실행할 수 있는 패널.
 * 내장 도구 목록, 실행 인터페이스, 결과 표시를 제공합니다.
 */

import React, { useState, useMemo } from 'react'
import {
  Box,
  Paper,
  Typography,
  Chip,
  TextField,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Divider,
  IconButton,
  Tooltip,
  Alert,
  useTheme,
  alpha,
  Tabs,
  Tab,
} from '@mui/material'
import {
  Build as BuildIcon,
  PlayArrow as PlayArrowIcon,
  Code as CodeIcon,
  TextFields as TextFieldsIcon,
  Calculate as CalculateIcon,
  Schedule as ScheduleIcon,
  BarChart as BarChartIcon,
  Description as DescriptionIcon,
  Http as HttpIcon,
  FindReplace as FindReplaceIcon,
  VpnKey as VpnKeyIcon,
  Transform as TransformIcon,
  ContentCopy as ContentCopyIcon,
  Check as CheckIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Close as CloseIcon,
  History as HistoryIcon,
} from '@mui/icons-material'
import { LocalMCPRegistry, type MCPTool, type MCPToolResult } from '../../services/LocalMCPRegistry'

// ============================================================
// Types
// ============================================================

interface MCPToolPanelProps {
  onClose?: () => void
  onToolResult?: (result: MCPToolResult) => void
}

// ============================================================
// Icon Mapping
// ============================================================

const TOOL_ICONS: Record<string, React.ReactNode> = {
  TextFields: <TextFieldsIcon />,
  Code: <CodeIcon />,
  Calculate: <CalculateIcon />,
  Schedule: <ScheduleIcon />,
  BarChart: <BarChartIcon />,
  Description: <DescriptionIcon />,
  Http: <HttpIcon />,
  FindReplace: <FindReplaceIcon />,
  VpnKey: <VpnKeyIcon />,
  Transform: <TransformIcon />,
}

// ============================================================
// Sub-Components
// ============================================================

interface ToolCardProps {
  tool: MCPTool
  onSelect: () => void
  selected: boolean
}

const ToolCard: React.FC<ToolCardProps> = ({ tool, onSelect, selected }) => {
  const theme = useTheme()

  return (
    <ListItemButton
      onClick={onSelect}
      selected={selected}
      sx={{
        borderRadius: 1,
        mb: 0.5,
        border: selected ? `1px solid ${theme.palette.primary.main}` : '1px solid transparent',
        '&.Mui-selected': {
          bgcolor: alpha(theme.palette.primary.main, 0.1),
        },
      }}
    >
      <ListItemIcon sx={{ minWidth: 40 }}>
        {TOOL_ICONS[tool.icon || 'Build'] || <BuildIcon />}
      </ListItemIcon>
      <ListItemText
        primary={tool.name}
        secondary={tool.description}
        primaryTypographyProps={{ fontWeight: 500, fontSize: 13 }}
        secondaryTypographyProps={{ fontSize: 11, noWrap: true }}
      />
      <Chip
        size="small"
        label={tool.category}
        sx={{
          height: 18,
          fontSize: 10,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
        }}
      />
    </ListItemButton>
  )
}

interface ToolExecutorProps {
  tool: MCPTool
  onExecute: (args: Record<string, any>) => Promise<void>
  isExecuting: boolean
}

const ToolExecutor: React.FC<ToolExecutorProps> = ({ tool, onExecute, isExecuting }) => {
  const theme = useTheme()
  const [args, setArgs] = useState<Record<string, any>>({})

  const handleChange = (key: string, value: any) => {
    setArgs(prev => ({ ...prev, [key]: value }))
  }

  const handleExecute = () => {
    onExecute(args)
  }

  const requiredFields = tool.inputSchema.required || []

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {TOOL_ICONS[tool.icon || 'Build'] || <BuildIcon fontSize="small" />}
        {tool.name}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {tool.description}
      </Typography>

      <Divider sx={{ my: 2 }} />

      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        매개변수
      </Typography>

      {Object.entries(tool.inputSchema.properties).map(([key, prop]) => (
        <Box key={key} sx={{ mb: 2 }}>
          <TextField
            fullWidth
            size="small"
            label={
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {key}
                {requiredFields.includes(key) && (
                  <Typography component="span" color="error" fontSize={12}>*</Typography>
                )}
              </Box>
            }
            placeholder={prop.description}
            helperText={
              <Box component="span">
                {prop.description}
                {prop.enum && (
                  <Box component="span" sx={{ display: 'block', mt: 0.5, color: theme.palette.info.main }}>
                    선택 가능: {prop.enum.join(', ')}
                  </Box>
                )}
              </Box>
            }
            value={args[key] || prop.default || ''}
            onChange={(e) => handleChange(key, e.target.value)}
            select={prop.enum !== undefined}
            SelectProps={{ native: true }}
            multiline={prop.type === 'string' && !prop.enum && key.toLowerCase().includes('text')}
            rows={key.toLowerCase().includes('text') ? 3 : 1}
          >
            {prop.enum && (
              <>
                <option value="">선택...</option>
                {prop.enum.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </>
            )}
          </TextField>
        </Box>
      ))}

      <Button
        variant="contained"
        fullWidth
        startIcon={isExecuting ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
        onClick={handleExecute}
        disabled={isExecuting || requiredFields.some(f => !args[f])}
        sx={{ mt: 1 }}
      >
        {isExecuting ? '실행 중...' : '실행'}
      </Button>
    </Box>
  )
}

interface ToolResultViewProps {
  result: MCPToolResult
  onCopy: () => void
}

const ToolResultView: React.FC<ToolResultViewProps> = ({ result, onCopy }) => {
  const theme = useTheme()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const text = result.content.map(c => c.text || JSON.stringify(c.data, null, 2)).join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopy()
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {result.success ? (
            <CheckIcon fontSize="small" color="success" />
          ) : (
            <ErrorIcon fontSize="small" color="error" />
          )}
          <Typography variant="subtitle2">
            {result.success ? '실행 성공' : '실행 실패'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {result.metadata?.executionTime && (
            <Chip
              size="small"
              label={`${result.metadata.executionTime}ms`}
              sx={{ height: 20, fontSize: 10 }}
            />
          )}
          <Tooltip title={copied ? '복사됨!' : '결과 복사'}>
            <IconButton size="small" onClick={handleCopy}>
              {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {result.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {result.error}
        </Alert>
      )}

      {result.content.map((content, idx) => (
        <Box
          key={idx}
          sx={{
            p: 1.5,
            bgcolor: alpha(theme.palette.background.default, 0.5),
            borderRadius: 1,
            border: `1px solid ${theme.palette.divider}`,
            mb: 1,
            overflow: 'auto',
            maxHeight: 300,
          }}
        >
          {content.type === 'text' && (
            <Typography
              variant="body2"
              component="pre"
              sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', m: 0 }}
            >
              {content.text}
            </Typography>
          )}
          {content.type === 'json' && (
            <Typography
              variant="body2"
              component="pre"
              sx={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', m: 0 }}
            >
              {JSON.stringify(content.data, null, 2)}
            </Typography>
          )}
          {content.type === 'chart' && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <BarChartIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
              <Typography variant="caption" display="block" color="text.secondary">
                차트 데이터 (Chart.js 연동 필요)
              </Typography>
              <Typography
                variant="body2"
                component="pre"
                sx={{ fontFamily: 'monospace', fontSize: 10, textAlign: 'left', mt: 1 }}
              >
                {JSON.stringify(content.data, null, 2)}
              </Typography>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}

// ============================================================
// Main Component
// ============================================================

export const MCPToolPanel: React.FC<MCPToolPanelProps> = ({ onClose, onToolResult }) => {
  const theme = useTheme()
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [lastResult, setLastResult] = useState<MCPToolResult | null>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  // 도구 목록
  const tools = useMemo(() => LocalMCPRegistry.listTools(), [])

  // 검색 필터링
  const filteredTools = useMemo(() => {
    if (!searchQuery) return tools
    const query = searchQuery.toLowerCase()
    return tools.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      t.tags?.some(tag => tag.toLowerCase().includes(query))
    )
  }, [tools, searchQuery])

  // 실행 로그
  const executionLogs = useMemo(
    () => LocalMCPRegistry.getExecutionLogs({ limit: 10 }),
    [lastResult] // 결과가 변경되면 로그 갱신
  )

  // 도구 실행
  const handleExecute = async (args: Record<string, any>) => {
    if (!selectedTool) return

    setIsExecuting(true)
    setLastResult(null)

    try {
      const result = await LocalMCPRegistry.executeTool(
        selectedTool.name,
        args,
        {
          sessionId: `ui_${Date.now()}`,
          xaiEnabled: true,
        }
      )

      setLastResult(result)
      onToolResult?.(result)
    } catch (error) {
      setLastResult({
        success: false,
        content: [{ type: 'text', text: `Error: ${error}` }],
        error: String(error),
      })
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <Paper
      elevation={4}
      sx={{
        width: 400,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderLeft: `1px solid ${theme.palette.divider}`,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          bgcolor: alpha(theme.palette.primary.main, 0.05),
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <BuildIcon color="primary" />
        <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
          MCP 도구
        </Typography>
        <Chip
          size="small"
          label={`${tools.length}개 도구`}
          sx={{ height: 20, fontSize: 10 }}
        />
        {onClose && (
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          minHeight: 36,
          borderBottom: `1px solid ${theme.palette.divider}`,
          '& .MuiTab-root': { minHeight: 36, py: 0 },
        }}
      >
        <Tab label="도구" icon={<BuildIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
        <Tab label="기록" icon={<HistoryIcon sx={{ fontSize: 16 }} />} iconPosition="start" />
      </Tabs>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {activeTab === 0 ? (
          <>
            {/* Tool List */}
            <Box
              sx={{
                width: selectedTool ? '50%' : '100%',
                borderRight: selectedTool ? `1px solid ${theme.palette.divider}` : 'none',
                overflow: 'auto',
                transition: 'width 0.2s',
              }}
            >
              <Box sx={{ p: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="도구 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  sx={{ mb: 1 }}
                />
              </Box>
              <List dense sx={{ px: 1 }}>
                {filteredTools.map(tool => (
                  <ToolCard
                    key={tool.name}
                    tool={tool}
                    onSelect={() => setSelectedTool(tool)}
                    selected={selectedTool?.name === tool.name}
                  />
                ))}
              </List>
            </Box>

            {/* Tool Executor & Result */}
            {selectedTool && (
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                <ToolExecutor
                  tool={selectedTool}
                  onExecute={handleExecute}
                  isExecuting={isExecuting}
                />
                {lastResult && (
                  <>
                    <Divider />
                    <ToolResultView
                      result={lastResult}
                      onCopy={() => {}}
                    />
                  </>
                )}
              </Box>
            )}
          </>
        ) : (
          /* Execution History */
          <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
            {executionLogs.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                <HistoryIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                <Typography variant="body2" sx={{ mt: 1 }}>
                  실행 기록이 없습니다
                </Typography>
              </Box>
            ) : (
              <List dense>
                {executionLogs.reverse().map(log => (
                  <ListItem
                    key={log.id}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      bgcolor: alpha(
                        log.output.success ? theme.palette.success.main : theme.palette.error.main,
                        0.05
                      ),
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      {log.output.success ? (
                        <CheckIcon fontSize="small" color="success" />
                      ) : (
                        <ErrorIcon fontSize="small" color="error" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={log.toolName}
                      secondary={
                        <Box>
                          <Typography variant="caption" display="block">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {log.executionTime}ms
                          </Typography>
                        </Box>
                      }
                      primaryTypographyProps={{ fontSize: 12, fontWeight: 500 }}
                    />
                    <Tooltip title="입력 보기">
                      <IconButton
                        size="small"
                        onClick={() => {
                          const tool = tools.find(t => t.name === log.toolName)
                          if (tool) setSelectedTool(tool)
                          setActiveTab(0)
                        }}
                      >
                        <InfoIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default MCPToolPanel
