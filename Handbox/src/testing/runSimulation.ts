/**
 * Simulation Runner - CLI에서 시뮬레이션 실행
 *
 * ⚠️ 주의: 이 파일은 앱 내부에서만 사용됩니다.
 * 실제 LLM 시뮬레이션은 SimulationPanel UI를 통해 실행하세요.
 */

import { WorkflowSimulator, type SimulationSummary } from './WorkflowSimulator'

// Node.js 환경에서만 사용 가능한 변수
declare const process: { argv: string[] } | undefined

async function main() {
  // 기본값 또는 process.argv에서 count 가져오기
  const count = typeof process !== 'undefined' && process.argv[2]
    ? parseInt(process.argv[2])
    : 1000
  const simulator = new WorkflowSimulator()

  let lastProgress = 0
  simulator.setProgressCallback((current, total, result) => {
    const progress = Math.floor((current / total) * 100)
    if (progress !== lastProgress && progress % 5 === 0) {
      lastProgress = progress
      console.log(`[${progress}%] ${current}/${total} - 성공: ${result.overallSuccess ? 'O' : 'X'}`)
    }
  })

  console.log('\n' + '='.repeat(60))
  console.log('워크플로우 시뮬레이션 테스트')
  console.log('='.repeat(60))
  console.log(`테스트 수: ${count}건`)
  console.log('시작 시간:', new Date().toLocaleString())
  console.log('='.repeat(60) + '\n')

  const summary = await simulator.runSimulation(count)
  printSummary(summary)

  // 실패 케이스 상세 출력 (최대 20개)
  const failedCases = simulator.getFailedCases().slice(0, 20)
  if (failedCases.length > 0) {
    console.log('\n' + '='.repeat(60))
    console.log('실패 케이스 상세 (상위 20개)')
    console.log('='.repeat(60))

    for (const fc of failedCases) {
      console.log(`\n[#${fc.promptId}] ${fc.promptType.toUpperCase()}`)
      console.log(`프롬프트: ${fc.prompt}`)
      console.log(`오류:`)
      fc.failureReasons.forEach(r => console.log(`  - ${r}`))
    }
  }

  return summary
}

function printSummary(summary: SimulationSummary) {
  console.log('\n' + '='.repeat(60))
  console.log('시뮬레이션 결과 요약')
  console.log('='.repeat(60))

  console.log(`\n### 전체 결과 ###`)
  console.log(`총 테스트: ${summary.totalTests}건`)
  console.log(`성공: ${summary.successCount}건`)
  console.log(`실패: ${summary.failureCount}건`)
  console.log(`성공률: ${summary.successRate.toFixed(2)}%`)

  console.log(`\n### 프롬프트 유형별 ###`)
  console.log(`단순 프롬프트 성공률: ${summary.simplePromptSuccess.toFixed(2)}%`)
  console.log(`복잡 프롬프트 성공률: ${summary.complexPromptSuccess.toFixed(2)}%`)

  console.log(`\n### 오류 유형별 집계 ###`)
  for (const [type, count] of Object.entries(summary.errorsByType)) {
    console.log(`  ${type}: ${count}건`)
  }

  if (summary.topErrors.length > 0) {
    console.log(`\n### 상위 오류 ###`)
    summary.topErrors.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.error}: ${e.count}건`)
    })
  }

  if (summary.problematicNodeTypes.length > 0) {
    console.log(`\n### 문제 노드 타입 ###`)
    summary.problematicNodeTypes.forEach((n, i) => {
      console.log(`  ${i + 1}. ${n.type}: ${n.errorCount}건`)
    })
  }

  if (summary.connectionIssues.length > 0) {
    console.log(`\n### 연결 이슈 ###`)
    summary.connectionIssues.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.source} → ${c.target}: ${c.count}건`)
    })
  }

  console.log(`\n### 성능 ###`)
  console.log(`평균 생성 시간: ${summary.avgGenerationTimeMs.toFixed(2)}ms`)
  console.log(`총 소요 시간: ${(summary.totalTimeMs / 1000).toFixed(2)}초`)

  console.log('\n' + '='.repeat(60))
}

// 브라우저 환경이 아닐 때만 실행
if (typeof window === 'undefined') {
  main().catch(console.error)
}

export { main as runSimulation }
