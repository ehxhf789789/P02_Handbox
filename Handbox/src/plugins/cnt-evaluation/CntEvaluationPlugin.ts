/**
 * CNT Evaluation Plugin — 건설신기술 평가 도메인 로직
 *
 * 10명 평가위원 에이전트, 투표 집계, 일관성 검증 등
 * CNT (건설신기술) 심사에 특화된 노드들.
 *
 * 플러그인: 범용 플랫폼에서 도메인 특화 로직을 분리.
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

// ============================================================
// CNT 평가위원 Executor
// ============================================================

const EXPERTISE_MAP: Record<string, string> = {
  '1': '구조공학', '2': '시공관리', '3': '재료공학', '4': '경제성분석',
  '5': '특허/지식재산', '6': '안전관리', '7': '환경공학', '8': '지반공학',
  '9': '정책/제도', '10': '지속가능성',
}

const STANCE_MAP: Record<string, string> = {
  '1': 'conservative', '2': 'progressive', '3': 'neutral', '4': 'neutral',
  '5': 'conservative', '6': 'conservative', '7': 'progressive', '8': 'neutral',
  '9': 'neutral', '10': 'progressive',
}

const evaluatorExecutor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    _context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const evaluatorNum = String(config.evaluator_number || '1')
    const techId = config.tech_id || 'CNT-2024-001'
    const predecessors: Record<string, any>[] = input._predecessors || []
    const documentContext = predecessors[0]?.text || predecessors[0]?.results?.map((r: any) => r.content).join('\n') || ''

    const expertise = EXPERTISE_MAP[evaluatorNum] || '일반'
    const stance = STANCE_MAP[evaluatorNum] || 'neutral'
    const stanceDesc = stance === 'conservative' ? '보수적이고 안전성 중시'
      : stance === 'progressive' ? '혁신적이고 기술발전 중시' : '균형잡힌 관점'

    const systemPrompt = `당신은 건설신기술 심사위원회의 ${expertise} 분야 전문가입니다.
평가 성향: ${stanceDesc}

평가 항목:
1. 신규성 (50점): 기존기술과의 차별성 (25점), 독창성과 자립성 (25점)
2. 진보성 (50점): 품질 향상 (15점), 개발 정도 (15점), 안전성 (10점), 첨단기술성 (10점)

반드시 다음 JSON 형식으로만 응답하세요:
\`\`\`json
{
  "verdict": "Approved" 또는 "Rejected",
  "novelty_score": 0-50 사이 정수,
  "progress_score": 0-50 사이 정수,
  "confidence": 0.7-1.0 사이 소수,
  "comments": "평가 의견 (한국어)"
}
\`\`\``

    const evalPrompt = `신기술 번호: ${techId}\n\n문서 내용:\n${documentContext.slice(0, 3000)}\n\n위 건설신기술에 대해 ${expertise} 분야 전문가로서 평가해주세요.`

    const bedrockResult = await invoke<{
      response: string
      usage: { input_tokens: number; output_tokens: number }
    }>('invoke_bedrock', {
      request: {
        model_id: config.model_id || 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        prompt: evalPrompt,
        system_prompt: systemPrompt,
        max_tokens: 1024,
        temperature: 0.2,
      },
    })

    if (bedrockResult.response) {
      const jsonMatch = bedrockResult.response.match(/```json\s*([\s\S]*?)\s*```/) || bedrockResult.response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const evalData = JSON.parse(jsonMatch[1] || jsonMatch[0])
        return {
          verdict: evalData.verdict || 'Rejected',
          novelty_score: evalData.novelty_score || 35,
          progress_score: evalData.progress_score || 35,
          confidence: evalData.confidence || 0.8,
          citation: evalData.comments || bedrockResult.response.slice(0, 200),
          expertise,
          stance,
          tokens_used: bedrockResult.usage.input_tokens + bedrockResult.usage.output_tokens,
          status: `평가위원 ${evaluatorNum} (${expertise}) 평가 완료`,
        }
      }
    }

    throw new Error('LLM 응답 파싱 실패')
  },
}

// ============================================================
// 투표 집계 Executor
// ============================================================

const votingAggregatorExecutor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    _config: Record<string, any>,
    _context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const predecessors: Record<string, any>[] = input._predecessors || []

    // 이전 노드들에서 verdict 추출
    const verdicts = predecessors
      .filter(p => p?.verdict)
      .map(p => ({
        verdict: p.verdict as string,
        expertise: p.expertise as string,
        novelty_score: p.novelty_score as number,
        progress_score: p.progress_score as number,
        confidence: p.confidence as number,
        citation: p.citation as string,
      }))

    const approvedCount = verdicts.filter(v => v.verdict === 'Approved').length
    const rejectedCount = verdicts.filter(v => v.verdict === 'Rejected').length
    const totalEvaluators = verdicts.length

    const finalVerdict = approvedCount >= Math.ceil(totalEvaluators / 2) ? 'Approved' : 'Rejected'

    return {
      final_verdict: finalVerdict,
      approved_count: approvedCount,
      rejected_count: rejectedCount,
      total_evaluators: totalEvaluators,
      vote_ratio: `${approvedCount}/${totalEvaluators}`,
      evaluator_breakdown: verdicts.map((v, i) => ({
        index: i + 1,
        verdict: v.verdict,
        expertise: v.expertise,
        score: (v.novelty_score || 0) + (v.progress_score || 0),
      })),
      status: `투표 집계 완료: ${finalVerdict} (${approvedCount}/${totalEvaluators})`,
    }
  },
}

// ============================================================
// Node Definitions
// ============================================================

export const CntEvaluatorDefinition: NodeDefinition = {
  type: 'cnt.evaluator',
  category: 'plugin',
  subcategory: 'CNT 평가',
  meta: {
    label: 'CNT 평가위원',
    description: '건설신기술 심사위원 에이전트 (Bedrock Claude)',
    icon: 'Psychology',
    color: '#6366f1',
    tags: ['CNT', '평가위원', '건설신기술', 'evaluator', 'agent'],
  },
  ports: {
    inputs: [{ name: 'text', type: 'text', required: true, description: '평가할 문서 텍스트' }],
    outputs: [{ name: 'verdict', type: 'json', required: true, description: '평가 결과 (verdict, scores, citation)' }],
  },
  configSchema: [
    { key: 'evaluator_number', label: '평가위원 번호', type: 'select', default: '1', options: Object.entries(EXPERTISE_MAP).map(([k, v]) => ({ label: `${k}번 - ${v}`, value: k })) },
    { key: 'tech_id', label: '신기술 번호', type: 'text', default: 'CNT-2024-001' },
    { key: 'model_id', label: 'Bedrock 모델', type: 'text', default: 'anthropic.claude-3-5-sonnet-20240620-v1:0' },
  ],
  runtime: 'tauri',
  executor: evaluatorExecutor,
  requirements: { provider: 'aws' },
  pluginId: 'cnt-evaluation',
}

export const CntVotingAggregatorDefinition: NodeDefinition = {
  type: 'cnt.voting-aggregator',
  category: 'plugin',
  subcategory: 'CNT 평가',
  meta: {
    label: 'CNT 투표 집계',
    description: '평가위원들의 투표 결과를 집계합니다',
    icon: 'Assessment',
    color: '#22c55e',
    tags: ['CNT', '투표', '집계', 'voting', 'aggregator'],
  },
  ports: {
    inputs: [{ name: 'verdicts', type: 'json[]', required: true, description: '평가위원 결과 배열' }],
    outputs: [{ name: 'result', type: 'json', required: true, description: '최종 투표 결과' }],
  },
  configSchema: [],
  runtime: 'internal',
  executor: votingAggregatorExecutor,
  pluginId: 'cnt-evaluation',
}

/** CNT 평가 플러그인의 모든 노드 정의 */
export const CNT_EVALUATION_DEFINITIONS: NodeDefinition[] = [
  CntEvaluatorDefinition,
  CntVotingAggregatorDefinition,
]
