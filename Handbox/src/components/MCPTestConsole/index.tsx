/**
 * MCP Test Console
 *
 * MCP 도구를 빠르게 테스트하기 위한 개발자 콘솔.
 * 모든 도구를 UI에서 직접 테스트할 수 있습니다.
 */

import React, { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Divider,
  Alert,
  CircularProgress,
  IconButton,
  Tabs,
  Tab,
  useTheme,
  alpha,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material'
import {
  PlayArrow as PlayArrowIcon,
  Clear as ClearIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  Science as ScienceIcon,
} from '@mui/icons-material'
import { LocalMCPRegistry, type MCPTool, type MCPToolResult } from '../../services/LocalMCPRegistry'
import { registerAdvancedMCPTools } from '../../services/AdvancedMCPTools'

// 고급 도구 등록 확인
registerAdvancedMCPTools()

// ============================================================
// Predefined Test Cases
// ============================================================

interface TestCase {
  name: string
  tool: string
  input: Record<string, any>
  description: string
}

const TEST_CASES: TestCase[] = [
  // 기본 도구 테스트
  {
    name: '텍스트 대문자 변환',
    tool: 'text_transform',
    input: { text: 'Hello Handbox MCP', operation: 'uppercase' },
    description: '텍스트를 대문자로 변환',
  },
  {
    name: 'Base64 인코딩',
    tool: 'text_transform',
    input: { text: '한글 테스트 123', operation: 'base64_encode' },
    description: '텍스트를 Base64로 인코딩',
  },
  {
    name: 'JSON 파싱 및 포맷',
    tool: 'json_process',
    input: { json: '{"name":"test","values":[1,2,3]}', operation: 'prettify' },
    description: 'JSON을 예쁘게 포맷',
  },
  {
    name: 'JSONPath 쿼리',
    tool: 'json_process',
    input: { json: '{"users":[{"name":"Alice"},{"name":"Bob"}]}', operation: 'query', query: '$.users[0].name' },
    description: 'JSONPath로 데이터 추출',
  },
  {
    name: '수식 계산',
    tool: 'math_calculate',
    input: { operation: 'evaluate', expression: '(100 + 200) * 0.15 + 50' },
    description: '수학 수식 계산',
  },
  {
    name: '통계 분석',
    tool: 'math_calculate',
    input: { operation: 'statistics', numbers: [85, 90, 78, 92, 88, 95, 72] },
    description: '숫자 배열의 통계 분석',
  },
  {
    name: '현재 시간',
    tool: 'datetime',
    input: { operation: 'now' },
    description: '현재 날짜/시간 조회',
  },
  {
    name: '날짜 계산',
    tool: 'datetime',
    input: { operation: 'add', date: new Date().toISOString(), amount: 30, unit: 'days' },
    description: '30일 후 날짜 계산',
  },
  {
    name: '바 차트 생성',
    tool: 'chart_generate',
    input: {
      type: 'bar',
      data: {
        labels: ['1월', '2월', '3월', '4월'],
        datasets: [{ label: '매출', data: [120, 190, 300, 250] }],
      },
      title: '월별 매출',
    },
    description: 'Chart.js 호환 바 차트 데이터 생성',
  },
  {
    name: '정규식 매칭',
    tool: 'regex',
    input: { text: '이메일: test@example.com, info@company.co.kr', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', operation: 'match' },
    description: '이메일 주소 추출',
  },
  {
    name: 'UUID 생성',
    tool: 'crypto_utils',
    input: { operation: 'uuid' },
    description: '새 UUID 생성',
  },
  {
    name: 'SHA-256 해시',
    tool: 'crypto_utils',
    input: { operation: 'hash', text: 'password123', algorithm: 'SHA-256' },
    description: '텍스트의 SHA-256 해시',
  },
  {
    name: 'CSV → JSON 변환',
    tool: 'data_transform',
    input: { data: 'name,age,city\nAlice,30,Seoul\nBob,25,Busan', from: 'csv', to: 'json' },
    description: 'CSV를 JSON으로 변환',
  },

  // RAG 도구 테스트
  {
    name: 'RAG 문서 인제스트',
    tool: 'rag_ingest',
    input: {
      sourceType: 'local',
      sourcePath: 'C:/Documents/manual.pdf',
      knowledgeBaseName: 'test_kb',
      chunkingStrategy: 'semantic',
      chunkSize: 512,
    },
    description: '로컬 문서를 지식 베이스에 추가',
  },
  {
    name: 'RAG 시맨틱 검색',
    tool: 'rag_query',
    input: {
      query: 'API 인증 방법',
      knowledgeBaseName: 'test_kb',
      topK: 5,
      similarityThreshold: 0.7,
      reranking: true,
    },
    description: '지식 베이스에서 시맨틱 검색',
  },
  {
    name: 'RAG 응답 생성',
    tool: 'rag_generate',
    input: {
      question: '제품 설치 방법을 단계별로 설명해주세요',
      knowledgeBaseName: 'test_kb',
      model: 'claude-3-sonnet',
      includeSourceCitations: true,
    },
    description: 'RAG 기반 응답 생성',
  },

  // AWS S3 테스트
  {
    name: 'S3 버킷 목록',
    tool: 's3_list',
    input: { bucket: 'my-bucket', prefix: 'documents/', maxKeys: 10 },
    description: 'S3 버킷 내 객체 목록 조회',
  },

  // 지식 베이스 테스트
  {
    name: '지식 베이스 생성',
    tool: 'kb_create',
    input: {
      name: 'engineering_docs',
      description: '엔지니어링 기술 문서',
      embeddingModel: 'local',
      vectorDB: 'local',
    },
    description: '새 지식 베이스 생성',
  },
  {
    name: '지식 베이스 목록',
    tool: 'kb_list',
    input: { status: 'all' },
    description: '모든 지식 베이스 조회',
  },

  // 에이전트 테스트
  {
    name: '에이전트 호출',
    tool: 'agent_invoke',
    input: {
      agentName: 'code_reviewer',
      prompt: '다음 함수를 리뷰해줘: def add(a, b): return a + b',
      enableTrace: true,
    },
    description: 'AI 에이전트 호출 및 추적',
  },

  // 비전 테스트
  {
    name: '이미지 분석',
    tool: 'vision_analyze',
    input: {
      imagePath: 'C:/Images/diagram.png',
      analysisType: 'general',
      model: 'claude-3-sonnet',
    },
    description: '이미지 분석 (일반)',
  },
]

// ============================================================
// Main Component
// ============================================================

export const MCPTestConsole: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const theme = useTheme()
  const [selectedTool, setSelectedTool] = useState<string>('')
  const [inputJson, setInputJson] = useState<string>('{}')
  const [result, setResult] = useState<MCPToolResult | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [executionHistory, setExecutionHistory] = useState<Array<{
    tool: string
    input: any
    result: MCPToolResult
    timestamp: number
  }>>([])

  const tools = LocalMCPRegistry.listTools()

  // 도구 선택 시 기본 입력 템플릿 생성
  useEffect(() => {
    if (selectedTool) {
      const tool = LocalMCPRegistry.getTool(selectedTool)
      if (tool) {
        const template: Record<string, any> = {}
        Object.entries(tool.inputSchema.properties).forEach(([key, prop]) => {
          if (prop.default !== undefined) {
            template[key] = prop.default
          } else if (prop.enum) {
            template[key] = prop.enum[0]
          } else if (prop.type === 'string') {
            template[key] = ''
          } else if (prop.type === 'number') {
            template[key] = 0
          } else if (prop.type === 'boolean') {
            template[key] = false
          } else if (prop.type === 'array') {
            template[key] = []
          } else if (prop.type === 'object') {
            template[key] = {}
          }
        })
        setInputJson(JSON.stringify(template, null, 2))
      }
    }
  }, [selectedTool])

  // 테스트 케이스 로드
  const loadTestCase = (testCase: TestCase) => {
    setSelectedTool(testCase.tool)
    setInputJson(JSON.stringify(testCase.input, null, 2))
    setResult(null)
    setError(null)
  }

  // 도구 실행
  const executeTool = async () => {
    if (!selectedTool) {
      setError('도구를 선택하세요')
      return
    }

    let parsedInput: Record<string, any>
    try {
      parsedInput = JSON.parse(inputJson)
    } catch (e) {
      setError('잘못된 JSON 형식입니다')
      return
    }

    setIsExecuting(true)
    setError(null)
    setResult(null)

    try {
      const toolResult = await LocalMCPRegistry.executeTool(
        selectedTool,
        parsedInput,
        {
          sessionId: `test_${Date.now()}`,
          xaiEnabled: true,
        }
      )

      setResult(toolResult)
      setExecutionHistory(prev => [
        { tool: selectedTool, input: parsedInput, result: toolResult, timestamp: Date.now() },
        ...prev.slice(0, 19),
      ])
    } catch (e) {
      setError(String(e))
    } finally {
      setIsExecuting(false)
    }
  }

  // 결과 복사
  const copyResult = () => {
    if (result) {
      const text = result.content.map(c => c.text || JSON.stringify(c.data, null, 2)).join('\n')
      navigator.clipboard.writeText(text)
    }
  }

  return (
    <Paper
      elevation={4}
      sx={{
        width: '100%',
        maxWidth: 900,
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        m: 'auto',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 3,
          py: 2,
          bgcolor: alpha(theme.palette.secondary.main, 0.1),
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <ScienceIcon color="secondary" />
        <Typography variant="h6" fontWeight={600}>
          MCP 테스트 콘솔
        </Typography>
        <Chip label={`${tools.length}개 도구`} size="small" />
        <Box sx={{ flexGrow: 1 }} />
        {onClose && (
          <IconButton onClick={onClose}>
            <ClearIcon />
          </IconButton>
        )}
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}
      >
        <Tab label="테스트 실행" />
        <Tab label="테스트 케이스" />
        <Tab label="실행 기록" />
      </Tabs>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {activeTab === 0 && (
          <Box sx={{ display: 'flex', gap: 2 }}>
            {/* Input Panel */}
            <Box sx={{ flex: 1 }}>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>도구 선택</InputLabel>
                <Select
                  value={selectedTool}
                  onChange={(e) => setSelectedTool(e.target.value)}
                  label="도구 선택"
                >
                  {tools.map(tool => (
                    <MenuItem key={tool.name} value={tool.name}>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>
                          {tool.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {tool.description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Typography variant="subtitle2" gutterBottom>
                입력 (JSON)
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={12}
                value={inputJson}
                onChange={(e) => setInputJson(e.target.value)}
                sx={{
                  mb: 2,
                  '& .MuiInputBase-input': {
                    fontFamily: 'monospace',
                    fontSize: 12,
                  },
                }}
              />

              <Button
                variant="contained"
                fullWidth
                startIcon={isExecuting ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                onClick={executeTool}
                disabled={isExecuting || !selectedTool}
              >
                {isExecuting ? '실행 중...' : '실행'}
              </Button>
            </Box>

            {/* Result Panel */}
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="subtitle2">
                  결과
                </Typography>
                {result && (
                  <IconButton size="small" onClick={copyResult}>
                    <CopyIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              {result && (
                <Box
                  sx={{
                    p: 2,
                    bgcolor: alpha(result.success ? theme.palette.success.main : theme.palette.error.main, 0.05),
                    border: `1px solid ${result.success ? theme.palette.success.main : theme.palette.error.main}`,
                    borderRadius: 1,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {result.success ? (
                      <CheckIcon fontSize="small" color="success" />
                    ) : (
                      <ErrorIcon fontSize="small" color="error" />
                    )}
                    <Typography variant="subtitle2">
                      {result.success ? '성공' : '실패'}
                    </Typography>
                    {result.metadata?.executionTime && (
                      <Chip
                        size="small"
                        label={`${result.metadata.executionTime}ms`}
                        sx={{ ml: 'auto' }}
                      />
                    )}
                  </Box>

                  {result.content.map((content, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        mt: 1,
                        p: 1,
                        bgcolor: alpha(theme.palette.background.default, 0.5),
                        borderRadius: 1,
                        overflow: 'auto',
                        maxHeight: 300,
                      }}
                    >
                      <Typography
                        variant="body2"
                        component="pre"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: 11,
                          whiteSpace: 'pre-wrap',
                          m: 0,
                        }}
                      >
                        {content.text || JSON.stringify(content.data, null, 2)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        )}

        {activeTab === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              미리 정의된 테스트 케이스를 클릭하여 빠르게 테스트할 수 있습니다.
            </Typography>

            {['기본 도구', 'RAG', 'AWS S3', '지식 베이스', '에이전트', '비전'].map(category => {
              const categoryTests = TEST_CASES.filter(tc => {
                if (category === '기본 도구') return !tc.tool.startsWith('rag_') && !tc.tool.startsWith('s3_') && !tc.tool.startsWith('kb_') && !tc.tool.startsWith('agent_') && !tc.tool.startsWith('vision_')
                if (category === 'RAG') return tc.tool.startsWith('rag_')
                if (category === 'AWS S3') return tc.tool.startsWith('s3_')
                if (category === '지식 베이스') return tc.tool.startsWith('kb_')
                if (category === '에이전트') return tc.tool.startsWith('agent_')
                if (category === '비전') return tc.tool.startsWith('vision_')
                return false
              })

              if (categoryTests.length === 0) return null

              return (
                <Accordion key={category} defaultExpanded={category === '기본 도구'}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography fontWeight={500}>{category}</Typography>
                    <Chip size="small" label={categoryTests.length} sx={{ ml: 1 }} />
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {categoryTests.map(tc => (
                        <Button
                          key={tc.name}
                          variant="outlined"
                          size="small"
                          onClick={() => {
                            loadTestCase(tc)
                            setActiveTab(0)
                          }}
                          sx={{ textTransform: 'none' }}
                        >
                          {tc.name}
                        </Button>
                      ))}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              )
            })}
          </Box>
        )}

        {activeTab === 2 && (
          <Box>
            {executionHistory.length === 0 ? (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                실행 기록이 없습니다
              </Typography>
            ) : (
              executionHistory.map((item, idx) => (
                <Box
                  key={idx}
                  sx={{
                    p: 2,
                    mb: 1,
                    borderRadius: 1,
                    border: `1px solid ${theme.palette.divider}`,
                    bgcolor: alpha(
                      item.result.success ? theme.palette.success.main : theme.palette.error.main,
                      0.02
                    ),
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {item.result.success ? (
                      <CheckIcon fontSize="small" color="success" />
                    ) : (
                      <ErrorIcon fontSize="small" color="error" />
                    )}
                    <Typography fontWeight={500}>{item.tool}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </Typography>
                  </Box>
                  <Typography variant="caption" component="pre" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
                    입력: {JSON.stringify(item.input).slice(0, 100)}...
                  </Typography>
                </Box>
              ))
            )}
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default MCPTestConsole
