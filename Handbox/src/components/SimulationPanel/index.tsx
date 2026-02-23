/**
 * LLM 시뮬레이션 패널
 *
 * 실제 LLM을 호출하여 워크플로우를 생성하고 검증하는 시뮬레이션 패널
 * 대규모 테스트를 통해 버그 및 문제점 자동 감지
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Box,
  Button,
  Typography,
  LinearProgress,
  Paper,
  Chip,
  Alert,
  CircularProgress,
  Divider,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PsychologyIcon from '@mui/icons-material/Psychology'
import BugReportIcon from '@mui/icons-material/BugReport'
import DownloadIcon from '@mui/icons-material/Download'
import {
  workflowSimulator,
  type SimulationResult,
  type SimulationSummary,
  type BugRecord,
} from '../../testing/WorkflowSimulator'

type TestMode = 'quick' | 'medium' | 'large' | 'full' | 'target' | 'custom'

const TEST_MODES: Record<TestMode, { label: string; count: number; time: string; description: string }> = {
  quick: { label: '빠른 테스트', count: 10, time: '~2분', description: '기본 동작 확인' },
  medium: { label: '중간 테스트', count: 100, time: '~20분', description: '주요 시나리오 검증' },
  large: { label: '대규모 테스트', count: 1000, time: '~3시간', description: '광범위 버그 탐지' },
  full: { label: '전체 테스트', count: 20000, time: '~24시간', description: '완전 커버리지' },
  target: { label: '🎯 목표 달성', count: 20000, time: '가변', description: '성공만 카운트, 무한 재시도' },
  custom: { label: '사용자 정의', count: 0, time: '가변', description: '직접 설정' },
}

export default function SimulationPanel() {
  const [running, setRunning] = useState(false)
  const [testMode, setTestMode] = useState<TestMode>('medium')
  const [customCount, setCustomCount] = useState(50)
  const [summary, setSummary] = useState<SimulationSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0, rate: '0%' })
  const [currentResult, setCurrentResult] = useState<SimulationResult | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)

  // 로그 자동 스크롤
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // 진행 상황 콜백
  const handleProgress = useCallback((current: number, total: number, result: SimulationResult) => {
    setProgress({
      current,
      total,
      rate: ((current / total) * 100).toFixed(1) + '%',
    })
    setCurrentResult(result)

    // 로그 추가
    const status = result.overallSuccess ? '✅' : '❌'
    const prompt = result.prompt.slice(0, 40) + (result.prompt.length > 40 ? '...' : '')
    setLogs(prev => [...prev.slice(-99), `[${current}/${total}] ${status} ${prompt}`])
  }, [])

  // 시뮬레이션 시작
  const startSimulation = useCallback(async () => {
    setRunning(true)
    setError(null)
    setSummary(null)
    setLogs([])
    setProgress({ current: 0, total: 0, rate: '0%' })

    const count = testMode === 'custom' ? customCount : TEST_MODES[testMode].count
    setProgress({ current: 0, total: count, rate: '0%' })

    workflowSimulator.setProgressCallback(handleProgress)

    try {
      let result: SimulationSummary

      if (testMode === 'target') {
        // 🎯 목표 달성 모드: 성공만 카운트, 무한 재시도
        setLogs([
          `🎯 목표 달성 모드 시작: ${count}건 성공 목표`,
          `📌 실패는 카운트하지 않고 재시도합니다`,
          `📌 버그 발생 시 자동으로 기록됩니다`,
        ])
        result = await workflowSimulator.runUntilSuccessTarget(count)
      } else {
        // 일반 모드
        setLogs([`🚀 LLM 시뮬레이션 시작: ${count}건`])
        result = await workflowSimulator.runSimulation(count)
      }

      setSummary(result)
      setLogs(prev => [
        ...prev,
        `🏁 시뮬레이션 완료!`,
        `   성공: ${result.successCount}건 (${result.successRate.toFixed(1)}%)`,
        `   버그 감지: ${result.bugsDetected}건`,
        `   노드 커버리지: ${result.coverageRate.toFixed(1)}%`,
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setLogs(prev => [...prev, `❌ 오류 발생: ${e}`])
    } finally {
      setRunning(false)
    }
  }, [testMode, customCount, handleProgress])

  // 시뮬레이션 중지
  const stopSimulation = useCallback(() => {
    workflowSimulator.stop()
    setLogs(prev => [...prev, '⛔ 시뮬레이션 중지 요청됨...'])
  }, [])

  // 결과 내보내기
  const exportResults = useCallback(() => {
    const json = workflowSimulator.exportToJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `simulation-results-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const testCount = testMode === 'custom' ? customCount : TEST_MODES[testMode].count

  return (
    <Box sx={{ p: 2, maxWidth: 1000 }}>
      <Typography variant="h5" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
        <PsychologyIcon sx={{ color: '#8b5cf6' }} />
        LLM 워크플로우 시뮬레이션
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        이 시뮬레이션은 <strong>실제 LLM을 호출</strong>하여 워크플로우를 생성합니다.
        AWS Bedrock 또는 로컬 LLM이 연결되어 있어야 합니다.
      </Alert>

      {/* 테스트 설정 */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: '#1e293b' }}>
        <Typography variant="subtitle1" sx={{ mb: 2, color: 'white' }}>테스트 설정</Typography>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel sx={{ color: 'grey.400' }}>테스트 모드</InputLabel>
            <Select
              value={testMode}
              onChange={(e) => setTestMode(e.target.value as TestMode)}
              label="테스트 모드"
              disabled={running}
              sx={{ color: 'white', '.MuiOutlinedInput-notchedOutline': { borderColor: 'grey.600' } }}
            >
              {Object.entries(TEST_MODES).map(([key, { label, count, time }]) => (
                <MenuItem key={key} value={key}>
                  {label} {key !== 'custom' && `(${count.toLocaleString()}건, ${time})`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {testMode === 'custom' && (
            <TextField
              label="테스트 횟수"
              type="number"
              value={customCount}
              onChange={(e) => setCustomCount(Math.max(1, parseInt(e.target.value) || 1))}
              size="small"
              disabled={running}
              sx={{ width: 150 }}
              InputProps={{ sx: { color: 'white' } }}
              InputLabelProps={{ sx: { color: 'grey.400' } }}
            />
          )}
        </Box>

        <Typography variant="body2" sx={{ mt: 2, color: 'grey.400' }}>
          📊 단순 프롬프트 20%, 복잡한 프롬프트 80%로 구성됩니다.
        </Typography>
      </Paper>

      {/* 실행 버튼 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          onClick={running ? stopSimulation : startSimulation}
          startIcon={running ? <StopIcon /> : <PlayArrowIcon />}
          sx={{
            bgcolor: running ? '#ef4444' : '#8b5cf6',
            '&:hover': { bgcolor: running ? '#dc2626' : '#7c3aed' },
          }}
        >
          {running ? '시뮬레이션 중지' : `시뮬레이션 시작 (${testCount.toLocaleString()}건)`}
        </Button>

        {summary && (
          <Button
            variant="outlined"
            onClick={exportResults}
            startIcon={<DownloadIcon />}
            sx={{ borderColor: '#10b981', color: '#10b981' }}
          >
            결과 내보내기 (JSON)
          </Button>
        )}
      </Box>

      {/* 진행 상태 */}
      {running && (
        <Paper sx={{ p: 2, mb: 3, bgcolor: '#1e293b' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="grey.400">
              진행률: {progress.current.toLocaleString()} / {progress.total.toLocaleString()}
            </Typography>
            <Typography variant="body2" color="#8b5cf6">
              {progress.rate}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={(progress.current / progress.total) * 100}
            sx={{
              mb: 2,
              bgcolor: '#334155',
              '& .MuiLinearProgress-bar': { bgcolor: '#8b5cf6' },
            }}
          />

          {currentResult && (
            <Box sx={{ p: 1, bgcolor: '#334155', borderRadius: 1 }}>
              <Typography variant="body2" color="grey.400" sx={{ mb: 0.5 }}>
                현재 프롬프트:
              </Typography>
              <Typography variant="body2" color="white" sx={{ fontFamily: 'monospace' }}>
                "{currentResult.prompt.slice(0, 80)}..."
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Chip
                  size="small"
                  label={currentResult.overallSuccess ? '성공' : '실패'}
                  sx={{
                    bgcolor: currentResult.overallSuccess ? '#10b98133' : '#ef444433',
                    color: currentResult.overallSuccess ? '#10b981' : '#ef4444',
                  }}
                />
                <Chip
                  size="small"
                  label={`${currentResult.generationTimeMs}ms`}
                  sx={{ bgcolor: '#6366f133', color: '#6366f1' }}
                />
              </Box>
            </Box>
          )}
        </Paper>
      )}

      {/* 실시간 로그 */}
      {logs.length > 0 && (
        <Paper sx={{ p: 2, mb: 3, bgcolor: '#0f172a', maxHeight: 200, overflow: 'auto' }}>
          <Typography variant="subtitle2" sx={{ mb: 1, color: 'grey.500' }}>
            실행 로그
          </Typography>
          <Box sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'grey.400' }}>
            {logs.map((log, i) => (
              <Box key={i} sx={{ py: 0.25 }}>{log}</Box>
            ))}
            <div ref={logsEndRef} />
          </Box>
        </Paper>
      )}

      {/* 에러 */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* 결과 요약 */}
      {summary && (
        <Paper sx={{ p: 3, bgcolor: '#1e293b' }}>
          <Typography variant="h6" sx={{ mb: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
            <BugReportIcon sx={{ color: '#f59e0b' }} />
            시뮬레이션 결과
          </Typography>

          {/* 핵심 통계 */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 2, mb: 3 }}>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#334155', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ color: 'white' }}>
                {summary.totalTests.toLocaleString()}
              </Typography>
              <Typography variant="body2" color="grey.400">총 테스트</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#334155', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ color: '#10b981' }}>
                {summary.successCount.toLocaleString()}
              </Typography>
              <Typography variant="body2" color="grey.400">성공</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#334155', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ color: summary.failureCount > 0 ? '#ef4444' : '#10b981' }}>
                {summary.failureCount.toLocaleString()}
              </Typography>
              <Typography variant="body2" color="grey.400">실패</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#334155', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ color: summary.successRate >= 90 ? '#10b981' : '#f59e0b' }}>
                {summary.successRate.toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="grey.400">성공률</Typography>
            </Box>
          </Box>

          {/* 프롬프트 유형별 성공률 */}
          <Box sx={{ display: 'flex', gap: 3, mb: 3, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="body2" color="grey.400">단순 프롬프트 성공률</Typography>
              <Typography variant="h6" sx={{ color: summary.simplePromptSuccess >= 90 ? '#10b981' : '#f59e0b' }}>
                {summary.simplePromptSuccess.toFixed(1)}%
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="grey.400">복잡 프롬프트 성공률</Typography>
              <Typography variant="h6" sx={{ color: summary.complexPromptSuccess >= 80 ? '#10b981' : '#f59e0b' }}>
                {summary.complexPromptSuccess.toFixed(1)}%
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="grey.400">평균 생성 시간</Typography>
              <Typography variant="h6" color="white">
                {summary.avgGenerationTimeMs.toFixed(0)}ms
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 2, borderColor: '#475569' }} />

          {/* 오류 유형별 */}
          {Object.keys(summary.errorsByType).length > 0 && (
            <Accordion sx={{ bgcolor: '#334155', mb: 2 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />}>
                <Typography sx={{ color: '#ef4444' }}>
                  오류 유형 ({Object.keys(summary.errorsByType).length}종)
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {Object.entries(summary.errorsByType).map(([type, count]) => (
                    <Chip
                      key={type}
                      label={`${type}: ${count}건`}
                      size="small"
                      sx={{ bgcolor: '#ef444433', color: '#ef4444' }}
                    />
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}

          {/* 연결 이슈 */}
          {summary.connectionIssues.length > 0 && (
            <Accordion sx={{ bgcolor: '#334155', mb: 2 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />}>
                <Typography sx={{ color: '#f59e0b' }}>
                  노드 연결 이슈 ({summary.connectionIssues.length}개)
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                {summary.connectionIssues.map((issue, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      py: 1,
                      borderBottom: '1px solid #475569',
                    }}
                  >
                    <Typography variant="body2" sx={{ color: 'white', fontFamily: 'monospace' }}>
                      {issue.source} → {issue.target}
                    </Typography>
                    <Chip
                      label={`${issue.count}건`}
                      size="small"
                      sx={{ bgcolor: '#f59e0b33', color: '#f59e0b' }}
                    />
                  </Box>
                ))}
              </AccordionDetails>
            </Accordion>
          )}

          {/* 문제 노드 타입 */}
          {summary.problematicNodeTypes.length > 0 && (
            <Accordion sx={{ bgcolor: '#334155' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />}>
                <Typography sx={{ color: '#06b6d4' }}>
                  문제 발생 노드 타입 ({summary.problematicNodeTypes.length}개)
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {summary.problematicNodeTypes.map(({ type, errorCount }) => (
                    <Chip
                      key={type}
                      label={`${type}: ${errorCount}건`}
                      size="small"
                      sx={{ bgcolor: '#06b6d433', color: '#06b6d4' }}
                    />
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}

          {/* 성공 알림 */}
          {summary.failureCount === 0 && (
            <Alert icon={<CheckCircleIcon />} severity="success" sx={{ mt: 2 }}>
              모든 테스트가 성공했습니다! 워크플로우 생성 시스템이 안정적입니다.
            </Alert>
          )}
        </Paper>
      )}
    </Box>
  )
}
