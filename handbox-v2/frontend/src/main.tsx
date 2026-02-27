import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

// Load all domain-specific tool catalogs (GIS, IFC, Fusion)
import { loadAllCatalogs } from './data/catalogLoader'
loadAllCatalogs()

// ===== RL 시뮬레이션 시스템 초기화 (개발 모드) =====
// @ts-ignore - Vite env type
if (import.meta.env?.DEV) {
  // RL 시뮬레이션 시스템 노출
  import('./testing').then(({
    runRLTest,
    startRLSimulation,
    verifySimulationRealism,
    initializeRLSimulation,
    pauseSimulation,
    resumeSimulation,
    stopSimulation,
    getSimulationState,
    rlSimulationSystem,
  }) => {
    // @ts-ignore - 글로벌 함수 노출
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
    // @ts-ignore
    window.rl = rlSimulationSystem

    // @ts-ignore - 개발자 제어판 헬퍼
    window.rlDevTools = {
      status: () => rlSimulationSystem.getDeveloperControl(),
      state: () => rlSimulationSystem.getState(),
      stats: () => rlSimulationSystem.getStats(),
      apiUsage: () => rlSimulationSystem.getAPIUsage(),
      pause: () => rlSimulationSystem.pause(),
      resume: () => rlSimulationSystem.resume(),
      stop: () => rlSimulationSystem.stop(),
      emergencyStop: () => rlSimulationSystem.emergencyStop(),
      clearCooldown: () => rlSimulationSystem.clearCooldown(),
      resetDailyCounters: () => rlSimulationSystem.resetDailyCounters(),
      // @ts-ignore
      updateGuardrails: (config: any) => rlSimulationSystem.updateGuardrails(config),
      // @ts-ignore
      queryData: (query: any) => rlSimulationSystem.queryExperiences(query),
      exportData: () => rlSimulationSystem.exportLearningData(),
      // @ts-ignore
      importData: (data: any) => rlSimulationSystem.importLearningData(data),
      clearAllData: () => rlSimulationSystem.clearAllLearningData(),
      help: () => {
        console.log('═'.repeat(70))
        console.log('🛠️  RL 시뮬레이션 개발자 도구 (Handbox v2)')
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
        console.log('  rlDevTools.emergencyStop() - 긴급 중지')
        console.log('')
        console.log('🧠 RL 시뮬레이션:')
        console.log('  window.runRLTest()        - 100건 테스트')
        console.log('  window.startRLSimulation() - 20,000건 전체 시뮬레이션')
        console.log('═'.repeat(70))
      },
    }

    console.log('═'.repeat(70))
    console.log('[Handbox v2] RL 시뮬레이션 시스템 준비 완료')
    console.log('═'.repeat(70))
    console.log('🧠 RL 시뮬레이션:')
    console.log('  • window.runRLTest()           - 100건 테스트 (시스템 검증)')
    console.log('  • window.startRLSimulation()   - 20,000건 전체 시뮬레이션')
    console.log('  • window.stopRLSimulation()    - 시뮬레이션 중지')
    console.log('  • window.getRLState()          - 상태 조회')
    console.log('')
    console.log('🛠️ 개발자 도구:')
    console.log('  • rlDevTools.help()            - 전체 명령어 도움말')
    console.log('═'.repeat(70))
  }).catch((err) => {
    console.warn('[RL] 시뮬레이션 시스템 로드 실패:', err)
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
