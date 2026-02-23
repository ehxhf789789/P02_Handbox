/**
 * VotingAggregator Executor — 다수결 투표 집계
 *
 * 복수의 페르소나 에이전트 평가 결과를 집계하여 최종 결정 도출.
 *
 * 지원 투표 방식:
 * - simple_majority: 단순 과반 (50% 초과)
 * - two_thirds: 2/3 다수결 (66.7% 이상)
 * - unanimous: 만장일치
 * - weighted: 경험 레벨 기반 가중 투표
 * - threshold: 점수 임계값 기반
 *
 * XAI 통합:
 * - 각 평가자의 판단 근거 종합
 * - 도메인별/기준별 점수 통계
 * - 반대 의견 목록화
 * - 조건부 승인 조건 추출
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'
import type { VotingAggregationResult } from '../../types/PersonaTypes'

// ============================================================
// 타입 정의
// ============================================================

type VotingMethod = 'simple_majority' | 'two_thirds' | 'unanimous' | 'weighted' | 'threshold'

interface EvaluatorResult {
  evaluator: {
    id: string
    name: string
    domain: string
    experienceLevel: string
    weight: number
  }
  evaluation: {
    totalScore: number
    recommendation: 'approve' | 'conditional' | 'reject' | 'abstain'
    confidence: number
    opinion: string
  }
  xai?: {
    reasoning: string
    keyInsights: string[]
    evidences: any[]
    strengths: string[]
    weaknesses: string[]
    suggestions: string[]
    counterpoints?: string[]
    uncertainties?: string[]
  }
  scores?: Record<string, number>
}

interface VotingInput {
  /** 이전 노드들의 평가 결과 */
  _predecessors?: EvaluatorResult[]
  /** 직접 전달된 평가 결과 목록 */
  evaluations?: EvaluatorResult[]
}

interface VotingConfig {
  /** 투표 방식 */
  voting_method: VotingMethod
  /** 승인 임계점 (threshold 방식용) */
  approval_threshold?: number
  /** 가중치 사용 여부 */
  use_weights?: boolean
  /** 기권 처리 방식 */
  abstain_handling?: 'exclude' | 'count_as_reject' | 'count_as_approve'
  /** 조건부 승인 처리 */
  conditional_handling?: 'count_as_approve' | 'count_as_half' | 'separate'
  /** 합의 기준 (0-1) */
  consensus_threshold?: number
  /** 최소 투표 수 */
  min_voters?: number
}

// ============================================================
// 헬퍼 함수
// ============================================================

/** 평가 결과 수집 */
function collectEvaluations(input: VotingInput): EvaluatorResult[] {
  const results: EvaluatorResult[] = []

  // 직접 전달된 평가 결과
  if (input.evaluations && Array.isArray(input.evaluations)) {
    results.push(...input.evaluations)
  }

  // 이전 노드 출력에서 평가 결과 추출
  if (input._predecessors && Array.isArray(input._predecessors)) {
    for (const pred of input._predecessors) {
      if (pred?.evaluator && pred?.evaluation) {
        results.push(pred as EvaluatorResult)
      }
    }
  }

  return results
}

/** 투표 집계 */
function aggregateVotes(
  evaluations: EvaluatorResult[],
  config: VotingConfig,
): { approve: number; conditional: number; reject: number; abstain: number; total: number; weighted?: Record<string, number> } {
  const votes = { approve: 0, conditional: 0, reject: 0, abstain: 0, total: 0 }
  const weighted = { approve: 0, conditional: 0, reject: 0, abstain: 0, total: 0 }

  for (const eval_ of evaluations) {
    const rec = eval_.evaluation.recommendation
    const weight = config.use_weights ? (eval_.evaluator.weight || 1) : 1

    votes.total += 1
    weighted.total += weight

    switch (rec) {
      case 'approve':
        votes.approve += 1
        weighted.approve += weight
        break
      case 'conditional':
        votes.conditional += 1
        weighted.conditional += weight
        break
      case 'reject':
        votes.reject += 1
        weighted.reject += weight
        break
      case 'abstain':
        votes.abstain += 1
        weighted.abstain += weight
        break
    }
  }

  return config.use_weights
    ? { ...votes, weighted }
    : votes
}

/** 최종 결정 도출 */
function determineDecision(
  votes: ReturnType<typeof aggregateVotes>,
  config: VotingConfig,
): 'approve' | 'conditional' | 'reject' | 'no_consensus' {
  const useWeighted = config.use_weights && votes.weighted
  const v = useWeighted ? votes.weighted! : votes

  // 기권 처리
  let effectiveTotal = v.total
  let approveCount = v.approve
  let rejectCount = v.reject

  switch (config.abstain_handling) {
    case 'exclude':
      effectiveTotal -= (useWeighted ? votes.weighted!.abstain : votes.abstain)
      break
    case 'count_as_reject':
      rejectCount += (useWeighted ? votes.weighted!.abstain : votes.abstain)
      break
    case 'count_as_approve':
      approveCount += (useWeighted ? votes.weighted!.abstain : votes.abstain)
      break
  }

  // 조건부 승인 처리
  switch (config.conditional_handling) {
    case 'count_as_approve':
      approveCount += (useWeighted ? votes.weighted!.conditional : v.conditional)
      break
    case 'count_as_half':
      approveCount += (useWeighted ? votes.weighted!.conditional : v.conditional) * 0.5
      break
  }

  if (effectiveTotal === 0) {
    return 'no_consensus'
  }

  const approvalRate = approveCount / effectiveTotal

  switch (config.voting_method) {
    case 'simple_majority':
      if (approvalRate > 0.5) return 'approve'
      if (rejectCount / effectiveTotal > 0.5) return 'reject'
      return v.conditional > 0 ? 'conditional' : 'no_consensus'

    case 'two_thirds':
      if (approvalRate >= 2 / 3) return 'approve'
      if (rejectCount / effectiveTotal >= 2 / 3) return 'reject'
      return 'no_consensus'

    case 'unanimous':
      if (approvalRate === 1) return 'approve'
      if (rejectCount === effectiveTotal) return 'reject'
      return 'no_consensus'

    case 'weighted':
      // 가중 투표: 과반 기준
      if (approvalRate > 0.5) return 'approve'
      if (rejectCount / effectiveTotal > 0.5) return 'reject'
      return v.conditional > 0 ? 'conditional' : 'no_consensus'

    case 'threshold':
      if (approvalRate >= (config.approval_threshold || 0.6)) return 'approve'
      if ((1 - approvalRate) >= (config.approval_threshold || 0.6)) return 'reject'
      return 'conditional'

    default:
      return 'no_consensus'
  }
}

/** 점수 통계 계산 */
function calculateScoreStats(evaluations: EvaluatorResult[]): VotingAggregationResult['scoreStats'] {
  const scores = evaluations.map(e => e.evaluation.totalScore).filter(s => s > 0)

  if (scores.length === 0) {
    return {
      average: 0,
      min: 0,
      max: 0,
      stdDev: 0,
      byDomain: {},
      byCriteria: {},
    }
  }

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length
  const stdDev = Math.sqrt(variance)

  // 도메인별 평균 점수
  const byDomain: Record<string, number> = {}
  const domainCounts: Record<string, number> = {}
  for (const e of evaluations) {
    const domain = e.evaluator.domain || '기타'
    const score = e.evaluation.totalScore
    byDomain[domain] = (byDomain[domain] || 0) + score
    domainCounts[domain] = (domainCounts[domain] || 0) + 1
  }
  for (const domain of Object.keys(byDomain)) {
    byDomain[domain] /= domainCounts[domain]
  }

  // 기준별 점수 (각 평가자의 scores 필드가 있는 경우)
  const byCriteria: Record<string, number> = {}
  const criteriaCounts: Record<string, number> = {}
  for (const e of evaluations) {
    if (e.scores) {
      for (const [key, value] of Object.entries(e.scores)) {
        byCriteria[key] = (byCriteria[key] || 0) + value
        criteriaCounts[key] = (criteriaCounts[key] || 0) + 1
      }
    }
  }
  for (const key of Object.keys(byCriteria)) {
    byCriteria[key] /= criteriaCounts[key]
  }

  return { average: avg, min, max, stdDev, byDomain, byCriteria }
}

/** 합의 수준 계산 (0-1) */
function calculateConsensusLevel(
  votes: ReturnType<typeof aggregateVotes>,
): number {
  const total = votes.total
  if (total <= 1) return 1

  // 가장 많은 투표를 받은 항목의 비율
  const maxVotes = Math.max(votes.approve, votes.conditional, votes.reject)
  const majorityRatio = maxVotes / (total - votes.abstain || 1)

  // 표준편차 기반 합의 측정
  const voteCounts = [votes.approve, votes.conditional, votes.reject]
  const avg = voteCounts.reduce((a, b) => a + b, 0) / 3
  const variance = voteCounts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / 3
  const normalizedVariance = variance / (total * total)

  // 높은 majorityRatio + 높은 variance = 높은 합의
  return Math.min(1, majorityRatio * (1 - normalizedVariance) * 1.2)
}

/** XAI 요소 통합 */
function consolidateXAI(evaluations: EvaluatorResult[]): {
  consolidatedInsights: string[]
  consolidatedStrengths: string[]
  consolidatedWeaknesses: string[]
  dissents: { evaluatorName: string; domain: string; reason: string }[]
  conditions: string[]
} {
  const allInsights: string[] = []
  const allStrengths: string[] = []
  const allWeaknesses: string[] = []
  const dissents: { evaluatorName: string; domain: string; reason: string }[] = []
  const conditions: string[] = []

  for (const e of evaluations) {
    // 인사이트 수집
    if (e.xai?.keyInsights) {
      allInsights.push(...e.xai.keyInsights)
    }

    // 강점/약점 수집
    if (e.xai?.strengths) {
      allStrengths.push(...e.xai.strengths)
    }
    if (e.xai?.weaknesses) {
      allWeaknesses.push(...e.xai.weaknesses)
    }

    // 반대 의견 수집 (reject한 평가자)
    if (e.evaluation.recommendation === 'reject') {
      dissents.push({
        evaluatorName: e.evaluator.name,
        domain: e.evaluator.domain,
        reason: e.xai?.reasoning || e.evaluation.opinion,
      })
    }

    // 조건부 승인 조건 수집
    if (e.evaluation.recommendation === 'conditional' && e.xai?.suggestions) {
      conditions.push(...e.xai.suggestions.slice(0, 2))
    }
  }

  // 중복 제거 및 빈도 기반 정렬
  const uniqueInsights = [...new Set(allInsights)].slice(0, 10)
  const uniqueStrengths = [...new Set(allStrengths)].slice(0, 5)
  const uniqueWeaknesses = [...new Set(allWeaknesses)].slice(0, 5)
  const uniqueConditions = [...new Set(conditions)].slice(0, 5)

  return {
    consolidatedInsights: uniqueInsights,
    consolidatedStrengths: uniqueStrengths,
    consolidatedWeaknesses: uniqueWeaknesses,
    dissents,
    conditions: uniqueConditions,
  }
}

/** 종합 요약 생성 */
function generateSummary(
  decision: VotingAggregationResult['finalDecision'],
  votes: ReturnType<typeof aggregateVotes>,
  scoreStats: VotingAggregationResult['scoreStats'],
  consensus: number,
): string {
  const total = votes.total
  const decisionText = {
    approve: '승인',
    conditional: '조건부 승인',
    reject: '반려',
    no_consensus: '합의 불발',
  }[decision]

  let summary = `## 투표 결과: ${decisionText}\n\n`
  summary += `- 참여 평가자: ${total}명\n`
  summary += `- 승인: ${votes.approve}표 / 조건부: ${votes.conditional}표 / 반려: ${votes.reject}표 / 기권: ${votes.abstain}표\n`
  summary += `- 평균 점수: ${scoreStats.average.toFixed(1)}점 (최저 ${scoreStats.min.toFixed(1)} ~ 최고 ${scoreStats.max.toFixed(1)})\n`
  summary += `- 합의 수준: ${(consensus * 100).toFixed(0)}%\n`

  if (Object.keys(scoreStats.byDomain).length > 0) {
    summary += '\n### 도메인별 평균 점수\n'
    for (const [domain, score] of Object.entries(scoreStats.byDomain)) {
      summary += `- ${domain}: ${score.toFixed(1)}점\n`
    }
  }

  return summary
}

// ============================================================
// Executor 구현
// ============================================================

const executor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    config: VotingConfig,
    _context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const evaluations = collectEvaluations(input as VotingInput)

    if (evaluations.length === 0) {
      return {
        error: '집계할 평가 결과가 없습니다',
        status: '평가 결과 없음',
      }
    }

    // 최소 투표 수 확인
    if (config.min_voters && evaluations.length < config.min_voters) {
      return {
        error: `최소 ${config.min_voters}명의 평가자가 필요합니다 (현재: ${evaluations.length}명)`,
        status: '투표 수 부족',
      }
    }

    // 투표 집계
    const votes = aggregateVotes(evaluations, config)

    // 최종 결정
    const finalDecision = determineDecision(votes, config)

    // 점수 통계
    const scoreStats = calculateScoreStats(evaluations)

    // 합의 수준
    const consensusLevel = calculateConsensusLevel(votes)

    // XAI 요소 통합
    const xaiConsolidated = consolidateXAI(evaluations)

    // 종합 요약
    const summary = generateSummary(finalDecision, votes, scoreStats, consensusLevel)

    const result: VotingAggregationResult = {
      finalDecision,
      votes: {
        approve: votes.approve,
        conditional: votes.conditional,
        reject: votes.reject,
        abstain: votes.abstain,
        total: votes.total,
      },
      scoreStats,
      consensusLevel,
      summary,
      ...xaiConsolidated,
    }

    return {
      // 주요 출력
      decision: finalDecision,
      approved: finalDecision === 'approve',
      text: summary,

      // 상세 결과
      result,
      votes: result.votes,
      scoreStats: result.scoreStats,

      // XAI 통합 결과
      xai: {
        consensusLevel,
        consolidatedInsights: xaiConsolidated.consolidatedInsights,
        consolidatedStrengths: xaiConsolidated.consolidatedStrengths,
        consolidatedWeaknesses: xaiConsolidated.consolidatedWeaknesses,
        dissents: xaiConsolidated.dissents,
        conditions: xaiConsolidated.conditions,
      },

      // 개별 평가 결과 (참조용)
      evaluations: evaluations.map(e => ({
        name: e.evaluator.name,
        domain: e.evaluator.domain,
        recommendation: e.evaluation.recommendation,
        score: e.evaluation.totalScore,
        confidence: e.evaluation.confidence,
      })),

      status: '투표 집계 완료',
    }
  },
}

// ============================================================
// 노드 정의
// ============================================================

export const VotingAggregatorDefinition: NodeDefinition = {
  type: 'control.voting-aggregator',
  category: 'control',
  meta: {
    label: '투표 집계',
    description: '복수 평가자의 결과를 집계하여 최종 결정 도출. 다수결, 가중 투표, 만장일치 지원.',
    icon: 'HowToVote',
    color: '#FF5722',
    tags: ['voting', 'aggregation', 'consensus', 'decision', '투표', '다수결', '집계', '합의'],
  },
  ports: {
    inputs: [
      { name: 'evaluations', type: 'evaluation-result[]', required: true, description: '페르소나 에이전트들의 평가 결과' },
    ],
    outputs: [
      { name: 'decision', type: 'decision', required: true, description: '최종 결정 (approve/conditional/reject/no_consensus)' },
      { name: 'approved', type: 'boolean', required: true, description: '승인 여부 (boolean)' },
      { name: 'result', type: 'voting-result', required: true, description: '상세 투표 결과' },
      { name: 'text', type: 'text', required: true, description: '투표 결과 요약 텍스트' },
    ],
  },
  configSchema: [
    {
      key: 'voting_method',
      label: '투표 방식',
      type: 'select',
      options: [
        { value: 'simple_majority', label: '단순 과반 (50% 초과)' },
        { value: 'two_thirds', label: '2/3 다수결 (66.7% 이상)' },
        { value: 'unanimous', label: '만장일치' },
        { value: 'weighted', label: '가중 투표 (경험 레벨 반영)' },
        { value: 'threshold', label: '임계값 기반' },
      ],
      default: 'simple_majority',
    },
    {
      key: 'approval_threshold',
      label: '승인 임계값',
      type: 'slider',
      min: 0.5,
      max: 1,
      step: 0.05,
      default: 0.6,
      description: 'threshold 방식에서 사용 (0.5-1.0)',
    },
    {
      key: 'use_weights',
      label: '가중치 사용',
      type: 'toggle',
      default: false,
      description: '평가자의 경험 레벨 가중치 적용',
    },
    {
      key: 'abstain_handling',
      label: '기권 처리',
      type: 'select',
      options: [
        { value: 'exclude', label: '집계에서 제외' },
        { value: 'count_as_reject', label: '반려로 간주' },
        { value: 'count_as_approve', label: '승인으로 간주' },
      ],
      default: 'exclude',
    },
    {
      key: 'conditional_handling',
      label: '조건부 승인 처리',
      type: 'select',
      options: [
        { value: 'separate', label: '별도 집계' },
        { value: 'count_as_approve', label: '승인으로 간주' },
        { value: 'count_as_half', label: '0.5표로 계산' },
      ],
      default: 'separate',
    },
    {
      key: 'min_voters',
      label: '최소 투표 수',
      type: 'number',
      min: 1,
      max: 100,
      default: 3,
      description: '최소 필요 평가자 수',
    },
    {
      key: 'consensus_threshold',
      label: '합의 기준',
      type: 'slider',
      min: 0.5,
      max: 1,
      step: 0.05,
      default: 0.7,
      description: '합의 성립으로 간주할 최소 비율',
    },
  ],
  runtime: 'browser',
  executor,
}

export default VotingAggregatorDefinition
