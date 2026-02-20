/**
 * 워크플로우 스트레스 테스트 패널
 * 10,000건의 워크플로우 시뮬레이션을 실행하고 결과를 표시
 * 오류 패턴 학습 및 노드 커버리지 추적 기능 포함
 */

import { useState } from 'react'
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
  FormControlLabel,
  Switch,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SpeedIcon from '@mui/icons-material/Speed'
import SchoolIcon from '@mui/icons-material/School'
import CoverageIcon from '@mui/icons-material/Verified'
import { invoke } from '@tauri-apps/api/tauri'

interface ErrorPattern {
  source_node_type: string
  target_node_type: string | null
  error_type: string
  error_message: string
  occurrence_count: number
  suggestion: string
}

interface TestSummary {
  total_tests: number
  passed: number
  failed: number
  success_rate: number
  avg_execution_time_ms: number
  errors_by_type: Record<string, number>
  slowest_test_ms: number
  fastest_test_ms: number
  node_coverage: Record<string, number>
  nodes_never_tested: string[]
  error_patterns: ErrorPattern[]
}

interface TestConfig {
  test_count: number
  parallel_count: number
  include_llm_tests: boolean
  include_io_tests: boolean
  include_transform_tests: boolean
  include_complex_workflows: boolean
  ensure_full_coverage: boolean
}

// 오류 패턴을 학습 시스템에 저장
function saveErrorPatternsToLearning(patterns: ErrorPattern[]) {
  const STORAGE_KEY = 'handbox-error-patterns'
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const merged = [...existing]

    for (const pattern of patterns) {
      const existingIndex = merged.findIndex(
        (p: ErrorPattern) =>
          p.source_node_type === pattern.source_node_type &&
          p.target_node_type === pattern.target_node_type &&
          p.error_type === pattern.error_type
      )

      if (existingIndex >= 0) {
        merged[existingIndex].occurrence_count += pattern.occurrence_count
      } else {
        merged.push(pattern)
      }
    }

    // 상위 50개 패턴만 유지
    merged.sort((a: ErrorPattern, b: ErrorPattern) => b.occurrence_count - a.occurrence_count)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged.slice(0, 50)))
    console.log('[StressTest] 오류 패턴 학습 완료:', patterns.length, '개')
  } catch (error) {
    console.error('[StressTest] 오류 패턴 저장 실패:', error)
  }
}

export default function StressTestPanel() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<TestSummary | null>(null)
  const [compatibilityResult, setCompatibilityResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [learnedPatterns, setLearnedPatterns] = useState(false)

  const [config, setConfig] = useState<TestConfig>({
    test_count: 10000,
    parallel_count: 10,
    include_llm_tests: false,
    include_io_tests: true,
    include_transform_tests: true,
    include_complex_workflows: true,
    ensure_full_coverage: false,
  })

  const runStressTest = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    setLearnedPatterns(false)

    try {
      const summary = await invoke<TestSummary>('run_workflow_stress_test', { config })
      setResult(summary)

      // 오류 패턴이 있으면 학습 시스템에 저장
      if (summary.error_patterns && summary.error_patterns.length > 0) {
        saveErrorPatternsToLearning(summary.error_patterns)
        setLearnedPatterns(true)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(false)
    }
  }

  const runFullCoverageTest = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    setLearnedPatterns(false)

    try {
      const coverageConfig = { ...config, ensure_full_coverage: true }
      const summary = await invoke<TestSummary>('run_workflow_stress_test', { config: coverageConfig })
      setResult(summary)

      // 오류 패턴이 있으면 학습 시스템에 저장
      if (summary.error_patterns && summary.error_patterns.length > 0) {
        saveErrorPatternsToLearning(summary.error_patterns)
        setLearnedPatterns(true)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(false)
    }
  }

  const runCompatibilityTest = async () => {
    setRunning(true)
    setError(null)
    setCompatibilityResult(null)

    try {
      const result = await invoke('run_node_compatibility_test')
      setCompatibilityResult(result)
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(false)
    }
  }

  const nodeCoverageCount = result?.node_coverage ? Object.keys(result.node_coverage).length : 0
  const totalNodeTypes = nodeCoverageCount + (result?.nodes_never_tested?.length || 0)

  return (
    <Box sx={{ p: 2, maxWidth: 900 }}>
      <Typography variant="h5" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
        <SpeedIcon sx={{ color: '#10b981' }} />
        워크플로우 스트레스 테스트
      </Typography>

      {/* 설정 */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: '#1e293b' }}>
        <Typography variant="subtitle1" sx={{ mb: 2, color: 'white' }}>테스트 설정</Typography>

        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <TextField
            label="테스트 횟수"
            type="number"
            value={config.test_count}
            onChange={(e) => setConfig({ ...config, test_count: parseInt(e.target.value) || 1000 })}
            size="small"
            sx={{ width: 150 }}
            InputProps={{ sx: { color: 'white' } }}
            InputLabelProps={{ sx: { color: 'grey.400' } }}
          />
          <TextField
            label="병렬 처리 수"
            type="number"
            value={config.parallel_count}
            onChange={(e) => setConfig({ ...config, parallel_count: parseInt(e.target.value) || 10 })}
            size="small"
            sx={{ width: 150 }}
            InputProps={{ sx: { color: 'white' } }}
            InputLabelProps={{ sx: { color: 'grey.400' } }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <FormControlLabel
            control={
              <Switch
                checked={config.include_io_tests}
                onChange={(e) => setConfig({ ...config, include_io_tests: e.target.checked })}
                size="small"
              />
            }
            label="IO 노드"
            sx={{ color: 'grey.300' }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={config.include_transform_tests}
                onChange={(e) => setConfig({ ...config, include_transform_tests: e.target.checked })}
                size="small"
              />
            }
            label="Transform 노드"
            sx={{ color: 'grey.300' }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={config.include_complex_workflows}
                onChange={(e) => setConfig({ ...config, include_complex_workflows: e.target.checked })}
                size="small"
              />
            }
            label="복잡한 워크플로우"
            sx={{ color: 'grey.300' }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={config.include_llm_tests}
                onChange={(e) => setConfig({ ...config, include_llm_tests: e.target.checked })}
                size="small"
              />
            }
            label="LLM 노드 (비용 발생)"
            sx={{ color: 'grey.300' }}
          />
        </Box>
      </Paper>

      {/* 실행 버튼 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          onClick={runStressTest}
          disabled={running}
          startIcon={running ? <CircularProgress size={16} /> : <PlayArrowIcon />}
          sx={{ bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' } }}
        >
          {running ? '테스트 실행 중...' : `스트레스 테스트 (${config.test_count.toLocaleString()}건)`}
        </Button>

        <Tooltip title="모든 노드 타입을 최소 1회씩 테스트하여 완전한 커버리지 보장">
          <Button
            variant="contained"
            onClick={runFullCoverageTest}
            disabled={running}
            startIcon={running ? <CircularProgress size={16} /> : <CoverageIcon />}
            sx={{ bgcolor: '#8b5cf6', '&:hover': { bgcolor: '#7c3aed' } }}
          >
            전체 노드 커버리지 테스트
          </Button>
        </Tooltip>

        <Button
          variant="outlined"
          onClick={runCompatibilityTest}
          disabled={running}
          sx={{ borderColor: '#6366f1', color: '#6366f1' }}
        >
          노드 호환성 테스트
        </Button>
      </Box>

      {/* 진행 상태 */}
      {running && (
        <Box sx={{ mb: 3 }}>
          <LinearProgress sx={{ mb: 1, bgcolor: '#334155', '& .MuiLinearProgress-bar': { bgcolor: '#10b981' } }} />
          <Typography variant="body2" color="grey.400">
            {config.test_count.toLocaleString()}건의 워크플로우를 생성하고 검증하는 중...
          </Typography>
        </Box>
      )}

      {/* 에러 */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* 학습 완료 알림 */}
      {learnedPatterns && (
        <Alert icon={<SchoolIcon />} severity="info" sx={{ mb: 3 }}>
          오류 패턴이 학습 시스템에 저장되었습니다. 향후 워크플로우 생성 시 이 패턴을 피하도록 개선됩니다.
        </Alert>
      )}

      {/* 스트레스 테스트 결과 */}
      {result && (
        <Paper sx={{ p: 3, bgcolor: '#1e293b', mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, color: 'white' }}>
            테스트 결과 요약
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 2, mb: 3 }}>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#334155', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ color: 'white' }}>{result.total_tests.toLocaleString()}</Typography>
              <Typography variant="body2" color="grey.400">총 테스트</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#334155', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ color: '#10b981' }}>{result.passed.toLocaleString()}</Typography>
              <Typography variant="body2" color="grey.400">성공</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#334155', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ color: result.failed > 0 ? '#ef4444' : '#10b981' }}>
                {result.failed.toLocaleString()}
              </Typography>
              <Typography variant="body2" color="grey.400">실패</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#334155', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ color: result.success_rate > 0.95 ? '#10b981' : '#f59e0b' }}>
                {(result.success_rate * 100).toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="grey.400">성공률</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#334155', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ color: nodeCoverageCount >= totalNodeTypes ? '#10b981' : '#f59e0b' }}>
                {nodeCoverageCount}/{totalNodeTypes}
              </Typography>
              <Typography variant="body2" color="grey.400">노드 커버리지</Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 2, borderColor: '#475569' }} />

          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="body2" color="grey.400">평균 실행 시간</Typography>
              <Typography variant="h6" color="white">{result.avg_execution_time_ms.toFixed(2)}ms</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="grey.400">최고 속도</Typography>
              <Typography variant="h6" color="#10b981">{result.fastest_test_ms}ms</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="grey.400">최저 속도</Typography>
              <Typography variant="h6" color="#f59e0b">{result.slowest_test_ms}ms</Typography>
            </Box>
          </Box>

          {/* 노드 커버리지 상세 */}
          {result.node_coverage && Object.keys(result.node_coverage).length > 0 && (
            <Accordion sx={{ mt: 2, bgcolor: '#334155' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />}>
                <Typography sx={{ color: '#10b981' }}>
                  테스트된 노드 타입 ({nodeCoverageCount}개)
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ maxHeight: 200, overflow: 'auto' }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {Object.entries(result.node_coverage)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <Chip
                        key={type}
                        label={`${type}: ${count}`}
                        size="small"
                        sx={{ bgcolor: '#10b98133', color: '#10b981' }}
                      />
                    ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}

          {/* 테스트되지 않은 노드 */}
          {result.nodes_never_tested && result.nodes_never_tested.length > 0 && (
            <Accordion sx={{ mt: 2, bgcolor: '#334155' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />}>
                <Typography sx={{ color: '#f59e0b' }}>
                  테스트되지 않은 노드 ({result.nodes_never_tested.length}개)
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {result.nodes_never_tested.map((type) => (
                    <Chip
                      key={type}
                      label={type}
                      size="small"
                      sx={{ bgcolor: '#f59e0b33', color: '#f59e0b' }}
                    />
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}

          {/* 에러 분류 */}
          {Object.keys(result.errors_by_type).length > 0 && (
            <Accordion sx={{ mt: 2, bgcolor: '#334155' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />}>
                <Typography sx={{ color: '#ef4444' }}>
                  에러 유형별 분류 ({Object.keys(result.errors_by_type).length}종)
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {Object.entries(result.errors_by_type).map(([type, count]) => (
                    <Chip
                      key={type}
                      label={`${type}: ${count}`}
                      size="small"
                      sx={{ bgcolor: '#ef444433', color: '#ef4444' }}
                    />
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}

          {/* 오류 패턴 (학습용) */}
          {result.error_patterns && result.error_patterns.length > 0 && (
            <Accordion sx={{ mt: 2, bgcolor: '#334155' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SchoolIcon sx={{ color: '#06b6d4', fontSize: 20 }} />
                  <Typography sx={{ color: '#06b6d4' }}>
                    학습된 오류 패턴 ({result.error_patterns.length}개)
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ maxHeight: 400, overflow: 'auto' }}>
                {result.error_patterns.map((pattern, i) => (
                  <Box
                    key={i}
                    sx={{ mb: 2, p: 2, bgcolor: '#1e293b', borderRadius: 1, borderLeft: '3px solid #06b6d4' }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" sx={{ color: '#06b6d4', fontFamily: 'monospace' }}>
                        {pattern.source_node_type}
                        {pattern.target_node_type && ` → ${pattern.target_node_type}`}
                      </Typography>
                      <Chip
                        label={`${pattern.occurrence_count}회`}
                        size="small"
                        sx={{ bgcolor: '#06b6d433', color: '#06b6d4' }}
                      />
                    </Box>
                    <Typography variant="body2" sx={{ color: '#ef4444', mb: 1 }}>
                      {pattern.error_type}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'grey.400', fontSize: '0.8rem' }}>
                      💡 {pattern.suggestion}
                    </Typography>
                  </Box>
                ))}
              </AccordionDetails>
            </Accordion>
          )}

          {/* 성공 표시 */}
          {result.failed === 0 && (
            <Alert icon={<CheckCircleIcon />} severity="success" sx={{ mt: 2 }}>
              모든 테스트가 성공했습니다! 워크플로우 시스템이 안정적입니다.
            </Alert>
          )}
        </Paper>
      )}

      {/* 호환성 테스트 결과 */}
      {compatibilityResult && (
        <Paper sx={{ p: 3, bgcolor: '#1e293b' }}>
          <Typography variant="h6" sx={{ mb: 2, color: 'white' }}>
            노드 호환성 테스트 결과
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 2, mb: 2 }}>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#334155', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ color: 'white' }}>{compatibilityResult.node_count}</Typography>
              <Typography variant="body2" color="grey.400">노드 타입</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#334155', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ color: 'white' }}>{compatibilityResult.total_pairs}</Typography>
              <Typography variant="body2" color="grey.400">총 조합</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#334155', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ color: '#10b981' }}>{compatibilityResult.compatible_pairs}</Typography>
              <Typography variant="body2" color="grey.400">호환 가능</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#334155', borderRadius: 2 }}>
              <Typography variant="h4" sx={{ color: '#10b981' }}>
                {(compatibilityResult.compatibility_rate * 100).toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="grey.400">호환율</Typography>
            </Box>
          </Box>

          {/* 호환되지 않는 조합 */}
          {compatibilityResult.issues?.length > 0 && (
            <Accordion sx={{ mt: 2, bgcolor: '#334155' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: 'grey.400' }} />}>
                <Typography sx={{ color: '#f59e0b' }}>
                  호환되지 않는 조합 ({compatibilityResult.issues.length}개)
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ maxHeight: 300, overflow: 'auto' }}>
                <Box sx={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'grey.400' }}>
                  {compatibilityResult.issues.slice(0, 100).map((issue: string, i: number) => (
                    <Box key={i} sx={{ py: 0.5, borderBottom: '1px solid #475569' }}>
                      {issue}
                    </Box>
                  ))}
                  {compatibilityResult.issues.length > 100 && (
                    <Typography color="grey.500" sx={{ mt: 1 }}>
                      ... 외 {compatibilityResult.issues.length - 100}개
                    </Typography>
                  )}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}
        </Paper>
      )}
    </Box>
  )
}
