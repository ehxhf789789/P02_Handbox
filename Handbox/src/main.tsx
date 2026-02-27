import React from 'react'
import ReactDOM from 'react-dom/client'

// ===== 앱 초기화: App import 전에 실행 필수 =====
import { registerBuiltinExecutors } from './executors'
import { registerBuiltinProviders } from './providers'
import { registerBuiltinPlugins, initializePluginSystem } from './plugins'
import { initializeTools, getToolStats } from './tools'

// 1. 프로바이더 등록 (LLM, Cloud 등)
registerBuiltinProviders()

// 2. 플러그인 시스템 등록
registerBuiltinPlugins()

// 3. 레거시 executor 등록 (NodeRegistry - 하위 호환)
registerBuiltinExecutors()

// 4. 통합 도구 시스템 초기화 (ToolRegistry - 144+ 원자화 도구)
initializeTools()

// 도구 통계 로깅
const stats = getToolStats()
console.log(`[Handbox] 도구 시스템 초기화 완료:`)
console.log(`  - 통합 도구: ${stats.total}개 (17개 카테고리)`)
console.log(`  - 카테고리:`, Object.entries(stats.byCategory).map(([k, v]) => `${k}(${v})`).join(', '))

// Tier 2 플러그인 시스템 비동기 초기화 (설치된 플러그인 복원)
initializePluginSystem().catch(err =>
  console.warn('[Plugins] 플러그인 시스템 초기화 실패:', err)
)

// ===== 시뮬레이션 자동 실행 (개발 모드) =====
// 개발 환경에서 시뮬레이션 결과를 확인하기 위해 글로벌 함수로 노출
// @ts-ignore - Vite 환경에서 import.meta.env 사용
if ((import.meta as any).env?.DEV) {
  // Tauri 파일 저장 함수
  const saveSimulationResults = async (summary: any) => {
    try {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `simulation_results_${timestamp}.json`

      // 프로젝트 디렉토리에 저장
      await invoke('write_file', {
        path: fileName,
        content: JSON.stringify(summary, null, 2),
      }).catch(() => {
        // write_file 명령어가 없으면 콘솔에만 출력
        console.log('[Simulation] 파일 저장 실패 - 콘솔 출력만 사용')
      })

      console.log(`[Simulation] 결과 저장: ${fileName}`)
    } catch (e) {
      console.warn('[Simulation] Tauri 파일 저장 실패:', e)
    }
  }

  // @ts-ignore - 글로벌 함수 노출
  window.runSimulation = async (count: number = 100) => {
    const { WorkflowSimulator } = await import('./testing/WorkflowSimulator')
    const simulator = new WorkflowSimulator()

    const logs: string[] = []
    const addLog = (msg: string) => {
      logs.push(`[${new Date().toISOString()}] ${msg}`)
      console.log(msg)
    }

    simulator.setProgressCallback((current, total, result) => {
      const xaiInfo = result.xaiEvaluation ? ` XAI:${result.xaiEvaluation.totalScore}/30` : ''
      const compInfo = result.competitorComparison ? ` 경쟁:${result.competitorComparison.totalScore}/60` : ''
      addLog(`[Simulation] ${current}/${total} - ${result.overallSuccess ? '✅' : '❌'} [${result.promptType}]${xaiInfo}${compInfo} ${result.prompt.slice(0, 35)}...`)
    })

    simulator.setBugCallback((bug) => {
      addLog(`[BUG] ${bug.errorType}: ${bug.errorMessage}`)
    })

    const summary = await simulator.runSimulation(count)
    addLog('='.repeat(70))
    addLog('[Simulation Complete] v2.0 - XAI & 상대평가 포함')
    addLog('='.repeat(70))
    addLog(`🎯 전체: ${summary.successCount}/${summary.totalTests} (${summary.successRate.toFixed(1)}%)`)
    addLog(`📝 단순 프롬프트: ${summary.simplePromptSuccess.toFixed(1)}%`)
    addLog(`📄 복잡 프롬프트: ${summary.complexPromptSuccess.toFixed(1)}%`)
    addLog(`📚 긴 프롬프트: ${summary.longPromptSuccess.toFixed(1)}%`)
    addLog(`🔄 멀티턴: ${summary.multiTurnSuccess.toFixed(1)}%`)
    addLog(`🧠 XAI 합격률: ${summary.xaiPassRate.toFixed(1)}% (평균 ${summary.avgXaiScore.toFixed(1)}/30)`)
    addLog(`⚔️ 경쟁 평가 합격률: ${summary.competitorPassRate.toFixed(1)}% (평균 ${summary.avgCompetitorScore.toFixed(1)}/60)`)
    addLog(`🐛 버그: ${summary.bugsDetected}개`)
    addLog('='.repeat(70))

    // 결과를 로컬 스토리지에 저장
    localStorage.setItem('lastSimulationSummary', JSON.stringify(summary))
    localStorage.setItem('lastSimulationLogs', JSON.stringify(logs))

    // 파일로도 저장
    await saveSimulationResults({ summary, logs, timestamp: new Date().toISOString() })

    return summary
  }

  // @ts-ignore - 목표 달성 모드 (성공만 카운트)
  window.runUntilSuccess = async (targetCount: number = 20000) => {
    const { WorkflowSimulator } = await import('./testing/WorkflowSimulator')
    const simulator = new WorkflowSimulator()

    console.log('🎯 목표 달성 모드 시작')
    console.log(`목표: ${targetCount.toLocaleString()}건 성공 (실패 시 재시도)`)

    simulator.setProgressCallback((current, total, result) => {
      const xaiInfo = result.xaiEvaluation ? ` XAI:${result.xaiEvaluation.totalScore}/30` : ''
      const compInfo = result.competitorComparison ? ` 경쟁:${result.competitorComparison.totalScore}/60` : ''
      if (current % 10 === 0) {
        console.log(`✅ ${current}/${total} (${(current/total*100).toFixed(1)}%)${xaiInfo}${compInfo}`)
      }
    })

    simulator.setBugCallback((bug) => {
      console.error(`🐛 [BUG] ${bug.errorType}: ${bug.errorMessage}`)
    })

    const summary = await simulator.runUntilSuccessTarget(targetCount)

    console.log('='.repeat(70))
    console.log('🏆 목표 달성!')
    console.log('='.repeat(70))
    console.log(`✅ 목표 성공 건수: ${targetCount.toLocaleString()}`)
    console.log(`📊 최종 성공률: ${summary.successRate.toFixed(2)}%`)
    console.log(`🧠 XAI 합격률: ${summary.xaiPassRate.toFixed(1)}%`)
    console.log(`⚔️ 경쟁 평가 합격률: ${summary.competitorPassRate.toFixed(1)}%`)
    console.log(`🐛 감지된 버그: ${summary.bugsDetected}개`)
    console.log('='.repeat(70))

    localStorage.setItem('lastSimulationSummary', JSON.stringify(summary))
    await saveSimulationResults({ summary, mode: 'untilSuccess', target: targetCount, timestamp: new Date().toISOString() })

    return summary
  }

  // RL 시뮬레이션 시스템 노출 (개발자 전용)
  import('./testing').then(({
    runRLTest,
    startRLSimulation,
    verifySimulationRealism,
    initializeRLSimulation,
    pauseSimulation,
    resumeSimulation,
    stopSimulation,
    getSimulationState,
  }) => {
    // @ts-ignore
    window.runRLTest = runRLTest
    // @ts-ignore
    window.startRLSimulation = startRLSimulation
    // @ts-ignore
    window.verifyRealism = verifySimulationRealism
    // @ts-ignore
    window.initRLSimulation = initializeRLSimulation
    // @ts-ignore
    window.pauseRLSimulation = pauseSimulation
    // @ts-ignore
    window.resumeRLSimulation = resumeSimulation
    // @ts-ignore
    window.stopRLSimulation = stopSimulation
    // @ts-ignore
    window.getRLState = getSimulationState
  })

  // RL 시뮬레이션 인스턴스 및 개발자 도구 노출
  import('./testing/RLSimulationSystem').then(({ rlSimulationSystem }) => {
    // @ts-ignore - 전체 시스템 인스턴스
    window.rl = rlSimulationSystem

    // @ts-ignore - 개발자 제어판 헬퍼
    window.rlDevTools = {
      // 상태 조회
      status: () => rlSimulationSystem.getDeveloperControl(),
      state: () => rlSimulationSystem.getState(),
      stats: () => rlSimulationSystem.getStats(),
      apiUsage: () => rlSimulationSystem.getAPIUsage(),

      // 제어
      pause: () => rlSimulationSystem.pause(),
      resume: () => rlSimulationSystem.resume(),
      stop: () => rlSimulationSystem.stop(),
      emergencyStop: () => rlSimulationSystem.emergencyStop(),

      // 가드레일
      clearCooldown: () => rlSimulationSystem.clearCooldown(),
      resetDailyCounters: () => rlSimulationSystem.resetDailyCounters(),
      updateGuardrails: (config: any) => rlSimulationSystem.updateGuardrails(config),

      // 학습 데이터 관리
      queryData: (query: any) => rlSimulationSystem.queryExperiences(query),
      exportData: () => rlSimulationSystem.exportLearningData(),
      importData: (data: any) => rlSimulationSystem.importLearningData(data),
      clearAllData: () => rlSimulationSystem.clearAllLearningData(),
      deleteOldData: (days: number) => rlSimulationSystem.deleteExperiencesByCondition({
        olderThan: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      }),
      deleteFailedData: () => rlSimulationSystem.deleteExperiencesByCondition({ failed: true }),

      // 도움말
      help: () => {
        console.log('═'.repeat(70))
        console.log('🛠️  RL 시뮬레이션 개발자 도구')
        console.log('═'.repeat(70))
        console.log('')
        console.log('📊 상태 조회:')
        console.log('  rlDevTools.status()       - 통합 제어 상태')
        console.log('  rlDevTools.state()        - 시뮬레이션 상태')
        console.log('  rlDevTools.stats()        - 메트릭 통계')
        console.log('  rlDevTools.apiUsage()     - API 사용량')
        console.log('')
        console.log('🎮 제어:')
        console.log('  rlDevTools.pause()        - 일시정지')
        console.log('  rlDevTools.resume()       - 재개')
        console.log('  rlDevTools.stop()         - 중지')
        console.log('  rlDevTools.emergencyStop() - 긴급 중지 (쿨다운 포함)')
        console.log('')
        console.log('🛡️ 가드레일:')
        console.log('  rlDevTools.clearCooldown()      - 쿨다운 해제')
        console.log('  rlDevTools.resetDailyCounters() - 일일 카운터 리셋')
        console.log('  rlDevTools.updateGuardrails({   - 가드레일 설정')
        console.log('    maxAPICallsPerHour: 1000,')
        console.log('    maxCostPerDay: 100')
        console.log('  })')
        console.log('')
        console.log('📁 학습 데이터 관리:')
        console.log('  rlDevTools.exportData()          - JSON 내보내기')
        console.log('  rlDevTools.importData(json)      - JSON 가져오기')
        console.log('  rlDevTools.queryData({           - 데이터 조회')
        console.log('    filter: { success: true, minReward: 2 },')
        console.log('    sort: { field: "reward", order: "desc" },')
        console.log('    pagination: { offset: 0, limit: 10 }')
        console.log('  })')
        console.log('  rlDevTools.deleteOldData(30)     - 30일 이전 데이터 삭제')
        console.log('  rlDevTools.deleteFailedData()    - 실패 데이터 삭제')
        console.log('  rlDevTools.clearAllData()        - 전체 초기화 ⚠️')
        console.log('═'.repeat(70))
      },
    }
  })

  // 기존 시뮬레이션 인스턴스도 노출
  import('./testing/WorkflowSimulator').then(({ workflowSimulator }) => {
    // @ts-ignore
    window.simulator = workflowSimulator
    console.log('═'.repeat(70))
    console.log('[Dev] 시뮬레이션 시스템 v2.0 + RL 시스템 준비 완료')
    console.log('═'.repeat(70))
    console.log('📋 기본 시뮬레이션:')
    console.log('  • window.runSimulation()       - 100건 시뮬레이션')
    console.log('  • window.runUntilSuccess(100)  - 100건 성공까지 반복')
    console.log('  • window.simulator.stop()      - 시뮬레이션 중지')
    console.log('')
    console.log('🧠 RL 시뮬레이션 (강화학습 기반, 개발자 전용):')
    console.log('  • window.runRLTest()           - 100건 테스트 (시스템 검증)')
    console.log('  • window.startRLSimulation()   - 20,000건 전체 시뮬레이션')
    console.log('  • window.stopRLSimulation()    - 시뮬레이션 중지')
    console.log('  • window.getRLState()          - 상태 조회')
    console.log('')
    console.log('🛠️ 개발자 도구:')
    console.log('  • rlDevTools.help()            - 전체 명령어 도움말')
    console.log('  • rlDevTools.status()          - 통합 상태 조회')
    console.log('  • rlDevTools.apiUsage()        - API 사용량 확인')
    console.log('  • rlDevTools.emergencyStop()   - 긴급 중지')
    console.log('═'.repeat(70))

    // ⚠️ 자동 시뮬레이션 비활성화 (개발자 전용 기능)
    // RL 시뮬레이션은 API 비용이 발생하므로 수동으로만 실행
    console.log('')
    console.log('⚠️ RL 시뮬레이션은 수동 실행 전용입니다.')
    console.log('   실행: window.startRLSimulation()')
    console.log('   테스트: window.runRLTest()')
  })
}

// ===== App import는 초기화 이후 =====
import App from './App'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#6366f1',
    },
    secondary: {
      main: '#22c55e',
    },
    background: {
      default: '#0f172a',
      paper: '#1e293b',
    },
  },
  typography: {
    fontFamily: "'Pretendard', 'Segoe UI', sans-serif",
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        // 전역 스크롤바 스타일
        '*': {
          scrollbarWidth: 'thin',
          scrollbarColor: '#475569 transparent',
        },
        '*::-webkit-scrollbar': {
          width: '8px',
          height: '8px',
        },
        '*::-webkit-scrollbar-track': {
          background: 'rgba(15, 23, 42, 0.5)',
          borderRadius: '4px',
        },
        '*::-webkit-scrollbar-thumb': {
          background: 'linear-gradient(180deg, #6366f1 0%, #8b5cf6 100%)',
          borderRadius: '4px',
          border: '2px solid transparent',
          backgroundClip: 'content-box',
          '&:hover': {
            background: 'linear-gradient(180deg, #818cf8 0%, #a78bfa 100%)',
            backgroundClip: 'content-box',
          },
        },
        '*::-webkit-scrollbar-corner': {
          background: 'transparent',
        },
        // 얇은 스크롤바 (좁은 영역용)
        '.thin-scrollbar::-webkit-scrollbar': {
          width: '4px',
          height: '4px',
        },
        '.thin-scrollbar::-webkit-scrollbar-thumb': {
          background: 'rgba(99, 102, 241, 0.5)',
          borderRadius: '2px',
          border: 'none',
        },
        // 숨김 스크롤바 (호버시 표시)
        '.hover-scrollbar::-webkit-scrollbar-thumb': {
          background: 'transparent',
        },
        '.hover-scrollbar:hover::-webkit-scrollbar-thumb': {
          background: 'rgba(99, 102, 241, 0.6)',
        },
      },
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
