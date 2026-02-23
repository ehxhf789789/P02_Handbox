import React from 'react'
import ReactDOM from 'react-dom/client'

// ===== 앱 초기화: App import 전에 실행 필수 =====
import { registerBuiltinExecutors } from './executors'
import { registerBuiltinProviders } from './providers'
import { registerBuiltinPlugins, initializePluginSystem } from './plugins'
import { registerAllTools } from './tools'

// NodeRegistry에 먼저 등록해야 WorkflowEditor가 정상 작동
registerBuiltinExecutors()
registerBuiltinProviders()
registerBuiltinPlugins()

// Tier 1 도구 시스템 등록 (52개 내장 노드)
registerAllTools()

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

  // 시뮬레이션 인스턴스도 노출
  import('./testing/WorkflowSimulator').then(({ workflowSimulator }) => {
    // @ts-ignore
    window.simulator = workflowSimulator
    console.log('═'.repeat(60))
    console.log('[Dev] 시뮬레이션 시스템 v2.0 준비 완료')
    console.log('═'.repeat(60))
    console.log('📋 사용 가능한 명령어:')
    console.log('  • window.runSimulation()       - 100건 시뮬레이션 (기본)')
    console.log('  • window.runSimulation(500)    - 500건 시뮬레이션')
    console.log('  • window.runUntilSuccess(100)  - 100건 성공까지 반복')
    console.log('  • window.simulator.stop()      - 시뮬레이션 중지')
    console.log('')
    console.log('📊 평가 기준:')
    console.log('  • XAI 점수: 21/30점 이상 합격')
    console.log('  • 경쟁 점수: 42/60점 이상 합격')
    console.log('  • 프롬프트 유형: 단순(20%), 복잡(40%), 긴(30%), 멀티턴(10%)')
    console.log('═'.repeat(60))

    // 자동 시뮬레이션: 개발 모드에서 기본 활성화
    // runUntilSuccess로 무한 반복 (목표 달성까지)
    const autoSimDisabled = localStorage.getItem('autoSimulation') === 'disabled'
    if (!autoSimDisabled) {
      console.log('[Dev] 5초 후 자동 시뮬레이션 시작 (무한 반복 - 목표 달성까지)')
      setTimeout(async () => {
        console.log('[Dev] 🚀 자동 시뮬레이션 시작 (무한 반복, 다양한 패턴)...')
        try {
          // @ts-ignore - runUntilSuccess로 목표 달성까지 무한 반복
          const summary = await window.runUntilSuccess(1000)
          console.log('[Dev] 자동 시뮬레이션 완료')

          // 버그가 발견되면 상세 로그
          if (summary.bugsDetected > 0) {
            console.error('[Dev] 🐛 버그 발견!')
            console.log('버그 상세:', summary.bugs)
          }
        } catch (err) {
          console.error('[Dev] 자동 시뮬레이션 실패:', err)
        }
      }, 5000)
    } else {
      console.log('[Dev] 자동 시뮬레이션 비활성화. 활성화: localStorage.setItem("autoSimulation", "enabled")')
    }
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
