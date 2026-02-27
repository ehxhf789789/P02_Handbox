/**
 * RL Data Migration Utility
 *
 * 기존 RL 시뮬레이션 학습 데이터를 Handbox v2의
 * WorkflowLearningSystem 형식으로 변환
 *
 * ## 기존 데이터 형식 (LevelDB)
 * - Strategy stats: simple (2,444 uses, 1.5 weight)
 * - Domain success rates: workflow (94.57%), writing (82.51%), etc.
 * - Complexity success rates: medium (80.91%), low (62.55%), high (45.03%)
 *
 * ## v2 형식 (SQLite memory.db)
 * - LearningData: feedbacks[], patterns[], statistics
 */

import type { LearningData, LearnedPattern, WorkflowFeedback } from '../services/IntegratedWorkflowAgent'

// ============================================================
// 기존 RL 시뮬레이션 데이터 타입
// ============================================================

export interface RLSimulationStats {
  strategyStats: {
    strategy: string
    totalUses: number
    weight: number
    successRate: number
    averageReward: number
  }[]
  domainSuccessRates: Record<string, number>
  complexitySuccessRates: Record<string, number>
  overallSuccessRate: number
  totalExperiences: number
  averageQualityScore: number
}

// ============================================================
// 실제 시뮬레이션 결과 (LevelDB에서 추출)
// ============================================================

export const EXTRACTED_RL_DATA: RLSimulationStats = {
  strategyStats: [
    {
      strategy: 'simple',
      totalUses: 2444,
      weight: 1.5,
      successRate: 0.7876,
      averageReward: 2.8,
    },
  ],
  domainSuccessRates: {
    workflow: 0.9457,
    writing: 0.8251,
    data: 0.7887,
    agent: 0.7784,
    general: 0.7577,
    coding: 0.4029,
    rag: 0.3294,
  },
  complexitySuccessRates: {
    medium: 0.8091,
    low: 0.6255,
    high: 0.4503,
  },
  overallSuccessRate: 0.7876,
  totalExperiences: 2444,
  averageQualityScore: 7.78,
}

// ============================================================
// 도메인별 키워드 매핑
// ============================================================

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  workflow: ['워크플로우', '자동화', '파이프라인', '프로세스', '단계'],
  writing: ['작성', '글', '문서', '보고서', '요약', '번역'],
  data: ['데이터', '분석', 'csv', '엑셀', '통계', '차트'],
  agent: ['에이전트', '봇', '자동', 'ai', '페르소나'],
  general: ['도움', '정보', '설명', '알려줘'],
  coding: ['코드', '프로그래밍', '개발', '스크립트', '함수'],
  rag: ['검색', 'rag', '벡터', '문서검색', '질문답변'],
}

// ============================================================
// 데이터 변환 함수
// ============================================================

/**
 * 도메인 성공률을 기반으로 LearnedPattern 생성
 */
function createPatternsFromDomainStats(stats: RLSimulationStats): LearnedPattern[] {
  const patterns: LearnedPattern[] = []

  for (const [domain, successRate] of Object.entries(stats.domainSuccessRates)) {
    const keywords = DOMAIN_KEYWORDS[domain] || [domain]

    // 복잡도별 가중치 계산
    const complexityConfig: Record<string, number> = {}
    for (const [complexity, rate] of Object.entries(stats.complexitySuccessRates)) {
      complexityConfig[complexity] = rate
    }

    // 도메인별 권장 설정
    const preferredConfig: LearnedPattern['preferredConfig'] = {}

    if (domain === 'workflow') {
      preferredConfig.expertCount = 1
      preferredConfig.domains = ['automation', 'process']
    } else if (domain === 'writing') {
      preferredConfig.expertCount = 2
      preferredConfig.domains = ['writing', 'editing']
      preferredConfig.criteria = ['clarity', 'structure']
    } else if (domain === 'data') {
      preferredConfig.expertCount = 1
      preferredConfig.domains = ['data', 'analytics']
      preferredConfig.additionalNodes = ['viz.chart', 'viz.table']
    } else if (domain === 'agent') {
      preferredConfig.expertCount = 3
      preferredConfig.votingMethod = 'majority'
    } else if (domain === 'rag') {
      preferredConfig.additionalNodes = ['rag.retriever', 'rag.context-builder']
    }

    const pattern: LearnedPattern = {
      id: `migrated_${domain}_${Date.now()}`,
      triggerKeywords: keywords,
      category: domain,
      preferredConfig,
      confidence: Math.min(1, successRate + 0.1), // 성공률 기반 신뢰도
      sampleCount: Math.floor(stats.totalExperiences * (successRate / Object.keys(stats.domainSuccessRates).length)),
      lastUpdated: new Date().toISOString(),
    }

    patterns.push(pattern)
  }

  return patterns
}

/**
 * 시뮬레이션 통계를 기반으로 가상 피드백 생성
 * (실제 피드백 없이 통계만 있을 경우)
 */
function createSyntheticFeedbacks(stats: RLSimulationStats): WorkflowFeedback[] {
  const feedbacks: WorkflowFeedback[] = []

  // 각 도메인별로 대표 피드백 생성
  for (const [domain, successRate] of Object.entries(stats.domainSuccessRates)) {
    const successCount = Math.floor(successRate * 10)
    const failureCount = 10 - successCount

    // 성공 케이스
    for (let i = 0; i < successCount; i++) {
      feedbacks.push({
        workflowId: `migrated_success_${domain}_${i}`,
        sessionId: `session_${domain}_${i}`,
        userRequest: `${domain} 관련 작업 요청 (마이그레이션됨)`,
        workflow: {
          id: `workflow_${domain}_${i}`,
          nodes: [],
          edges: [],
          name: `${domain} workflow`,
          description: 'Migrated from RL simulation',
        } as any,
        rating: (4 + Math.floor(successRate)) as 1 | 2 | 3 | 4 | 5,
        feedbackText: '시뮬레이션 데이터에서 마이그레이션됨',
        timestamp: new Date().toISOString(),
      })
    }

    // 실패 케이스 (학습용)
    for (let i = 0; i < failureCount; i++) {
      feedbacks.push({
        workflowId: `migrated_failure_${domain}_${i}`,
        sessionId: `session_${domain}_${successCount + i}`,
        userRequest: `${domain} 관련 작업 요청 (실패)`,
        workflow: {
          id: `workflow_${domain}_fail_${i}`,
          nodes: [],
          edges: [],
          name: `${domain} workflow (failed)`,
          description: 'Migrated failure case',
        } as any,
        rating: 2 as 1 | 2 | 3 | 4 | 5,
        feedbackText: '시뮬레이션 실패 케이스',
        timestamp: new Date().toISOString(),
      })
    }
  }

  return feedbacks
}

/**
 * RL 시뮬레이션 데이터를 v2 LearningData로 변환
 */
export function migrateRLDataToV2(stats: RLSimulationStats = EXTRACTED_RL_DATA): LearningData {
  const patterns = createPatternsFromDomainStats(stats)
  const feedbacks = createSyntheticFeedbacks(stats)

  // 카테고리 통계 계산
  const categoryStats: Record<string, { count: number; avgRating: number }> = {}
  for (const [domain, successRate] of Object.entries(stats.domainSuccessRates)) {
    categoryStats[domain] = {
      count: Math.floor(stats.totalExperiences / Object.keys(stats.domainSuccessRates).length),
      avgRating: 2 + (successRate * 3), // 2~5 범위로 변환
    }
  }

  const learningData: LearningData = {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    feedbacks,
    patterns,
    statistics: {
      totalFeedbacks: feedbacks.length,
      averageRating: 2 + (stats.overallSuccessRate * 3),
      categoryStats,
    },
  }

  return learningData
}

// ============================================================
// 마이그레이션 실행 함수
// ============================================================

/**
 * 마이그레이션 수행 및 v2에 적용
 */
export async function executeMigration(): Promise<{
  success: boolean
  imported: number
  patterns: number
  message: string
}> {
  try {
    const { importWorkflowLearningData } = await import('../services/IntegratedWorkflowAgent')

    const learningData = migrateRLDataToV2()
    const result = await importWorkflowLearningData(learningData)

    return {
      success: true,
      imported: result.imported,
      patterns: learningData.patterns.length,
      message: `마이그레이션 완료: ${result.imported}개 패턴 가져옴, ${result.skipped}개 스킵됨`,
    }
  } catch (error) {
    return {
      success: false,
      imported: 0,
      patterns: 0,
      message: `마이그레이션 실패: ${error}`,
    }
  }
}

// ============================================================
// 마이그레이션 보고서
// ============================================================

export function generateMigrationReport(stats: RLSimulationStats = EXTRACTED_RL_DATA): string {
  const learningData = migrateRLDataToV2(stats)

  return `
# RL 시뮬레이션 → Handbox v2 마이그레이션 보고서

## 원본 데이터 (LevelDB)
- **총 경험**: ${stats.totalExperiences.toLocaleString()}건
- **전체 성공률**: ${(stats.overallSuccessRate * 100).toFixed(2)}%
- **평균 품질 점수**: ${stats.averageQualityScore.toFixed(2)}/10

## 도메인별 성공률
| 도메인 | 성공률 | 변환된 패턴 |
|--------|--------|-------------|
${Object.entries(stats.domainSuccessRates)
  .sort(([, a], [, b]) => b - a)
  .map(([domain, rate]) => `| ${domain} | ${(rate * 100).toFixed(2)}% | ✅ |`)
  .join('\n')}

## 복잡도별 성공률
| 복잡도 | 성공률 |
|--------|--------|
${Object.entries(stats.complexitySuccessRates)
  .map(([complexity, rate]) => `| ${complexity} | ${(rate * 100).toFixed(2)}% |`)
  .join('\n')}

## 변환 결과
- **생성된 패턴**: ${learningData.patterns.length}개
- **가상 피드백**: ${learningData.feedbacks.length}개
- **평균 평점**: ${learningData.statistics.averageRating.toFixed(2)}/5

## 권장 조치
1. \`executeMigration()\` 실행하여 v2에 데이터 적용
2. 실제 사용 시 피드백으로 패턴 보강
3. 낮은 성공률 도메인(coding: ${(stats.domainSuccessRates.coding * 100).toFixed(2)}%, rag: ${(stats.domainSuccessRates.rag * 100).toFixed(2)}%) 개선 필요

## 적용 방법
\`\`\`typescript
import { executeMigration } from './testing/RLDataMigration'

const result = await executeMigration()
console.log(result.message)
\`\`\`
`
}

// 브라우저에서 직접 실행 가능하도록 export
if (typeof window !== 'undefined') {
  (window as any).migrateRLData = executeMigration;
  (window as any).generateMigrationReport = () => console.log(generateMigrationReport())
}
