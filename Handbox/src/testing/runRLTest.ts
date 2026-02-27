/**
 * RL Simulation Test Runner
 *
 * 소규모 테스트 (100건)를 실행하여 시스템 동작 확인
 * 전체 시뮬레이션 (20,000건) 전 검증용
 */

import { RLSimulationSystem } from './RLSimulationSystem'
import { initializeRLSimulation, verifySimulationRealism } from './RLIntegration'
import { rlLogger } from './RLLogger'
import { experienceBuffer } from './ExperienceBuffer'
import { policyNetwork } from './PolicyNetwork'
import { supervisorAgent } from './SupervisorAgent'

// ============================================================
// Test Configuration
// ============================================================

const TEST_CONFIG = {
  targetSuccesses: 100,      // 테스트: 100건
  batchSize: 10,             // 배치: 10건
  checkpointInterval: 50,    // 체크포인트: 50건마다
  timeoutMs: 30000,          // 타임아웃: 30초
}

// ============================================================
// Test Runner
// ============================================================

export async function runRLTest(): Promise<{
  success: boolean
  summary: TestSummary
  errors: string[]
}> {
  console.log('==========================================')
  console.log('RL Simulation Test (100건)')
  console.log('==========================================\n')

  const errors: string[] = []
  const startTime = Date.now()

  // 1. 현실성 검증
  console.log('[1/5] 현실성 검증...')
  const realismChecks = await verifySimulationRealism()

  console.log('현실성 검증 결과:')
  for (const check of realismChecks) {
    const status = check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠️' : '❌'
    console.log(`  ${status} ${check.category}/${check.item}: ${check.details}`)
  }

  const criticalFailures = realismChecks.filter(c => c.status === 'fail')
  if (criticalFailures.length > 0) {
    console.log('\n❌ 필수 요소 검증 실패:')
    for (const f of criticalFailures) {
      console.log(`  - ${f.category}/${f.item}: ${f.details}`)
      errors.push(`${f.category}/${f.item}: ${f.details}`)
    }

    return {
      success: false,
      summary: createEmptySummary(),
      errors,
    }
  }

  // 2. 시스템 초기화
  console.log('\n[2/5] 시스템 초기화...')
  try {
    const initResult = await initializeRLSimulation()

    if (!initResult.success) {
      console.log('❌ 초기화 실패:', initResult.warnings)
      return {
        success: false,
        summary: createEmptySummary(),
        errors: initResult.warnings,
      }
    }

    if (initResult.warnings.length > 0) {
      console.log('⚠️ 경고:', initResult.warnings.join(', '))
    }

    console.log('✅ 초기화 완료')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.log('❌ 초기화 오류:', msg)
    errors.push(msg)
    return {
      success: false,
      summary: createEmptySummary(),
      errors,
    }
  }

  // 3. 테스트 실행
  console.log('\n[3/5] 테스트 실행 (100건)...')

  const testSystem = new RLSimulationSystem({
    ...TEST_CONFIG,
    persistenceMode: 'memory',  // 테스트용 메모리 모드
  })

  let successCount = 0
  let totalAttempts = 0
  let lastProgressTime = Date.now()

  testSystem.setEventHandlers({
    onProgress: (state) => {
      const now = Date.now()
      if (now - lastProgressTime > 5000) {  // 5초마다 진행 상황
        const rate = state.totalAttempts > 0
          ? (state.successCount / state.totalAttempts * 100).toFixed(1)
          : '0'
        console.log(`  진행: ${state.successCount}/${state.totalAttempts} (${rate}% 성공률)`)
        lastProgressTime = now
      }
      successCount = state.successCount
      totalAttempts = state.totalAttempts
    },
    onLoopComplete: (result) => {
      // 개별 루프 완료 시 (조용히)
    },
    onCheckpoint: (cp) => {
      console.log(`  📌 체크포인트: ${cp.successCount}/${cp.totalAttempts}`)
    },
    onError: (error) => {
      console.log(`  ⚠️ 오류: ${error.message}`)
      errors.push(error.message)
    },
  })

  try {
    const result = await testSystem.runSimulation()

    console.log('\n✅ 테스트 완료')
    console.log(`  성공: ${successCount}건`)
    console.log(`  시도: ${totalAttempts}건`)
    console.log(`  성공률: ${(successCount / Math.max(1, totalAttempts) * 100).toFixed(2)}%`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.log('\n❌ 테스트 중 오류:', msg)
    errors.push(msg)
  }

  // 4. 학습 결과 분석
  console.log('\n[4/5] 학습 결과 분석...')

  const bufferStats = experienceBuffer.getStats()
  const policyProgress = policyNetwork.getLearningProgress()
  const growthMetrics = await supervisorAgent.getGrowthMetrics()

  console.log('경험 버퍼:')
  console.log(`  - 크기: ${bufferStats.size}`)
  console.log(`  - 성공률: ${(bufferStats.successRate * 100).toFixed(2)}%`)
  console.log(`  - 평균 보상: ${bufferStats.averageReward.toFixed(3)}`)

  console.log('\n정책 네트워크:')
  console.log(`  - 탐색률 (ε): ${(policyProgress.epsilon * 100).toFixed(2)}%`)
  console.log(`  - 수렴 점수: ${(policyProgress.convergenceScore * 100).toFixed(2)}%`)
  console.log(`  - 지배적 전략: ${policyProgress.dominantStrategy}`)

  console.log('\n에이전트 성장:')
  console.log(`  - 총 경험: ${growthMetrics.totalExperiences}`)
  console.log(`  - 버그 패턴 탐지: ${growthMetrics.bugPatternsDetected}`)
  console.log(`  - Few-shot 예제: ${growthMetrics.fewShotExamplesGenerated}`)
  console.log(`  - 학습 속도: ${growthMetrics.learningVelocity > 0 ? '📈 개선 중' : growthMetrics.learningVelocity < 0 ? '📉 저하' : '➡️ 안정'}`)

  // 5. 테스트 요약
  console.log('\n[5/5] 테스트 요약')
  console.log('==========================================')

  const duration = (Date.now() - startTime) / 1000
  const avgTimePerLoop = duration / Math.max(1, totalAttempts)

  const summary: TestSummary = {
    testDuration: duration,
    totalAttempts,
    successCount,
    successRate: successCount / Math.max(1, totalAttempts),
    averageReward: bufferStats.averageReward,
    avgTimePerLoop,
    estimatedFullSimulationTime: avgTimePerLoop * 20000 / 3600,  // 시간 단위
    bugPatternsFound: growthMetrics.bugPatternsDetected,
    dominantStrategy: policyProgress.dominantStrategy,
    readyForFullSimulation: successCount >= 10 && bufferStats.successRate > 0.1,
    errors: errors.length,
  }

  console.log(`테스트 시간: ${duration.toFixed(1)}초`)
  console.log(`성공: ${successCount}/${totalAttempts} (${(summary.successRate * 100).toFixed(2)}%)`)
  console.log(`평균 루프 시간: ${avgTimePerLoop.toFixed(2)}초`)
  console.log(`예상 전체 시뮬레이션 시간: ${summary.estimatedFullSimulationTime.toFixed(1)}시간`)
  console.log(`버그 패턴: ${summary.bugPatternsFound}개`)
  console.log(`지배적 전략: ${summary.dominantStrategy}`)

  if (summary.readyForFullSimulation) {
    console.log('\n✅ 전체 시뮬레이션 준비 완료!')
  } else {
    console.log('\n⚠️ 성공률이 낮습니다. 시스템 점검이 필요합니다.')
  }

  console.log('==========================================\n')

  return {
    success: summary.readyForFullSimulation,
    summary,
    errors,
  }
}

// ============================================================
// Types
// ============================================================

interface TestSummary {
  testDuration: number
  totalAttempts: number
  successCount: number
  successRate: number
  averageReward: number
  avgTimePerLoop: number
  estimatedFullSimulationTime: number
  bugPatternsFound: number
  dominantStrategy: string
  readyForFullSimulation: boolean
  errors: number
}

function createEmptySummary(): TestSummary {
  return {
    testDuration: 0,
    totalAttempts: 0,
    successCount: 0,
    successRate: 0,
    averageReward: 0,
    avgTimePerLoop: 0,
    estimatedFullSimulationTime: 0,
    bugPatternsFound: 0,
    dominantStrategy: 'none',
    readyForFullSimulation: false,
    errors: 0,
  }
}

// ============================================================
// Export
// ============================================================

export default runRLTest
