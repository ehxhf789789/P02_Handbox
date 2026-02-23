/**
 * PersonaAgent Executor — 페르소나 기반 전문가 에이전트
 *
 * 특정 페르소나(전문가 역할)를 가진 AI 에이전트로서 동작.
 * XAI(설명 가능한 AI) 지원: 판단 근거, 증거, 핵심 인사이트 제공.
 *
 * 주요 기능:
 * - 페르소나 시스템 프롬프트 기반 LLM 호출
 * - 구조화된 평가 결과 반환 (점수, 의견, 권고사항)
 * - XAI 요소: 판단 근거, 증거 인용, 강점/약점 분석
 * - 경험 레벨 기반 가중치 (다수결 투표용)
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'
import { ProviderRegistry } from '../../registry/ProviderRegistry'
import { LocalLLMProvider, configureOllama } from '../../services/LocalLLMProvider'
import { loadPersona } from '../../services/PersonaService'
import type {
  PersonaDefinition,
  XAIEvaluationResult,
  Evidence,
  ExperienceLevel,
  EXPERIENCE_WEIGHTS,
} from '../../types/PersonaTypes'

// ============================================================
// 타입 정의
// ============================================================

interface PersonaAgentInput {
  /** 평가/분석 대상 텍스트 */
  text?: string
  content?: string
  document?: string
  /** 평가 기준 (선택) */
  criteria?: string[]
  /** 추가 컨텍스트 */
  context?: string
  /** 이전 노드 출력 */
  _predecessors?: Record<string, any>[]
}

interface PersonaAgentConfig {
  /** 페르소나 ID (내장/사용자 정의) */
  persona_id?: string
  /** 페르소나 이름 (동적 생성용) */
  persona_name?: string
  /** 전문 분야 */
  domain?: string
  /** 시스템 프롬프트 (페르소나 미선택 시) */
  system_prompt?: string
  /** 평가 기준 */
  evaluation_criteria?: string[]
  /** 경험 레벨 */
  experience_level?: ExperienceLevel
  /** XAI 설정 */
  xai_enabled?: boolean
  xai_detail_level?: 'brief' | 'standard' | 'detailed' | 'comprehensive'
  require_evidence?: boolean
  generate_insights?: boolean
  max_insights?: number
  /** LLM 설정 */
  provider?: string
  model?: string
  temperature?: number
  max_tokens?: number
}

// ============================================================
// 헬퍼 함수
// ============================================================

/** 선행 노드 출력에서 텍스트를 추출 */
function extractInputText(input: PersonaAgentInput): string {
  if (input.text && typeof input.text === 'string') return input.text
  if (input.content && typeof input.content === 'string') return input.content
  if (input.document && typeof input.document === 'string') return input.document

  const predecessors = input._predecessors || []
  for (const pred of predecessors) {
    if (pred?.text) return pred.text
    if (pred?.content) return pred.content
    if (pred?.document) return pred.document
  }

  return ''
}

/** 경험 레벨별 가중치 */
const EXP_WEIGHTS: Record<ExperienceLevel, number> = {
  junior: 0.6,
  mid: 0.8,
  senior: 1.0,
  expert: 1.2,
  master: 1.5,
}

/** XAI 평가 결과 파싱 */
function parseXAIResult(response: string, config: PersonaAgentConfig): Partial<XAIEvaluationResult> {
  const result: Partial<XAIEvaluationResult> = {
    opinion: response,
    reasoning: '',
    keyInsights: [],
    evidences: [],
    strengths: [],
    weaknesses: [],
    suggestions: [],
  }

  try {
    // JSON 블록 추출 시도
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1])
      return {
        ...result,
        ...parsed,
      }
    }

    // 구조화된 텍스트 파싱
    const sections = {
      reasoning: /(?:판단\s*근거|reasoning|이유)[:：]\s*([^\n]+(?:\n(?![#\-●\*])[^\n]+)*)/gi,
      keyInsights: /(?:핵심\s*인사이트|인사이트|key\s*insights?)[:：]\s*([^\n]+(?:\n(?![#])[^\n]+)*)/gi,
      strengths: /(?:강점|장점|strengths?)[:：]\s*([^\n]+(?:\n(?![#])[^\n]+)*)/gi,
      weaknesses: /(?:약점|단점|weaknesses?|개선\s*필요)[:：]\s*([^\n]+(?:\n(?![#])[^\n]+)*)/gi,
      suggestions: /(?:제안|개선\s*제안|suggestions?|권고)[:：]\s*([^\n]+(?:\n(?![#])[^\n]+)*)/gi,
    }

    for (const [key, regex] of Object.entries(sections)) {
      const match = response.match(regex)
      if (match && match[1]) {
        const content = match[1].trim()
        if (key === 'reasoning') {
          result.reasoning = content
        } else {
          // 리스트 항목 파싱
          const items = content.split(/[\n\-\•\*]/)
            .map(s => s.trim())
            .filter(s => s.length > 0)
          ;(result as any)[key] = items
        }
      }
    }

    // 점수 추출
    const scoreMatch = response.match(/(?:총점|점수|score)[:：]?\s*(\d+(?:\.\d+)?)/i)
    if (scoreMatch) {
      result.totalScore = parseFloat(scoreMatch[1])
    }

    // 권고사항 추출
    const recMatch = response.match(/(?:권고|recommendation|결론)[:：]\s*(승인|조건부\s*승인|반려|기권|approve|conditional|reject|abstain)/i)
    if (recMatch) {
      const recText = recMatch[1].toLowerCase()
      if (recText.includes('승인') || recText === 'approve') {
        result.recommendation = recText.includes('조건') ? 'conditional' : 'approve'
      } else if (recText.includes('반려') || recText === 'reject') {
        result.recommendation = 'reject'
      } else {
        result.recommendation = 'abstain'
      }
    }

    // 확신도 추출
    const confMatch = response.match(/(?:확신도|confidence)[:：]?\s*(\d+(?:\.\d+)?)/i)
    if (confMatch) {
      const conf = parseFloat(confMatch[1])
      result.confidence = conf > 1 ? conf / 100 : conf
    }

  } catch (e) {
    console.warn('[PersonaAgent] XAI 결과 파싱 실패:', e)
  }

  return result
}

/** 페르소나 기반 시스템 프롬프트 생성 */
function generatePersonaSystemPrompt(config: PersonaAgentConfig): string {
  const name = config.persona_name || '전문가'
  const domain = config.domain || '일반'
  const level = config.experience_level || 'senior'

  let prompt = `당신은 ${domain} 분야의 ${level} 수준 전문가 "${name}"입니다.

## 역할 및 전문성
- 전문 분야: ${domain}
- 경험 수준: ${level}
- 평가 기준: ${(config.evaluation_criteria || ['품질', '타당성', '실현가능성']).join(', ')}

## 응답 형식
`

  if (config.xai_enabled !== false) {
    prompt += `
### XAI (설명 가능한 AI) 응답
다음 형식으로 구조화된 응답을 제공하세요:

\`\`\`json
{
  "totalScore": <0-100 사이 점수>,
  "recommendation": "<approve|conditional|reject|abstain>",
  "confidence": <0-1 사이 확신도>,
  "opinion": "<종합 평가 의견>",
  "reasoning": "<판단 근거 상세 설명>",
  "keyInsights": ["<핵심 인사이트 1>", "<핵심 인사이트 2>", ...],
  "evidences": [
    {"type": "document|data|regulation|experience|comparison", "source": "<출처>", "content": "<내용>", "relevance": <0-1>}
  ],
  "strengths": ["<강점 1>", "<강점 2>", ...],
  "weaknesses": ["<약점 1>", "<약점 2>", ...],
  "suggestions": ["<개선 제안 1>", "<개선 제안 2>", ...]${config.xai_detail_level === 'comprehensive' ? `,
  "counterpoints": ["<반대 관점 1>", ...],
  "uncertainties": ["<불확실 요소 1>", ...]` : ''}
}
\`\`\`
`
  } else {
    prompt += `
평가 의견과 점수를 자연어로 제공하세요.
`
  }

  // 추가 시스템 프롬프트
  if (config.system_prompt) {
    prompt += `\n\n## 추가 지침\n${config.system_prompt}`
  }

  return prompt
}

// ============================================================
// Executor 구현
// ============================================================

const executor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    config: PersonaAgentConfig,
    context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const inputText = extractInputText(input as PersonaAgentInput)
    const criteria = (input as PersonaAgentInput).criteria || config.evaluation_criteria || []
    const additionalContext = (input as PersonaAgentInput).context || ''

    if (!inputText) {
      return {
        error: '평가할 대상 텍스트가 없습니다',
        status: '입력 없음',
      }
    }

    // persona_id가 있으면 PersonaService에서 로드
    let effectiveConfig = { ...config }
    if (config.persona_id && !config.persona_name) {
      try {
        const persona = await loadPersona(config.persona_id)
        effectiveConfig = {
          ...config,
          persona_name: persona.name,
          domain: persona.domain,
          experience_level: persona.experience.level,
          system_prompt: persona.systemPrompt || config.system_prompt,
          evaluation_criteria: persona.evaluationBehavior?.evaluationFocus || config.evaluation_criteria,
        }
        console.log(`[PersonaAgent] 페르소나 로드: ${persona.name}`)
      } catch (e) {
        console.warn(`[PersonaAgent] 페르소나 로드 실패 (${config.persona_id}):`, e)
      }
    }

    // 시스템 프롬프트 생성
    const systemPrompt = generatePersonaSystemPrompt(effectiveConfig)

    // 사용자 프롬프트 구성
    let userPrompt = `## 평가 대상\n${inputText}`

    if (criteria.length > 0) {
      userPrompt += `\n\n## 평가 기준\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
    }

    if (additionalContext) {
      userPrompt += `\n\n## 추가 컨텍스트\n${additionalContext}`
    }

    userPrompt += '\n\n위 내용을 전문가 관점에서 평가해주세요.'

    // ===================================================================
    // LLM 호출 (Bedrock 우선 → Provider → 로컬 LLM 폴백)
    // ===================================================================
    let responseText: string
    let usage: { inputTokens: number; outputTokens: number } = { inputTokens: 0, outputTokens: 0 }
    let usedProvider = 'unknown'
    let isSimulation = false  // 시뮬레이션 여부 (버그 감지용)

    // 1. Bedrock 직접 호출 시도 (가장 확실한 방법)
    try {
      console.log('[PersonaAgent] Bedrock 직접 호출 시도')
      const bedrockResult = await invoke<{
        response: string
        usage: { input_tokens: number; output_tokens: number }
      }>('invoke_bedrock', {
        request: {
          model_id: effectiveConfig.model || 'anthropic.claude-3-5-sonnet-20240620-v1:0',
          prompt: userPrompt,
          system_prompt: systemPrompt,
          max_tokens: effectiveConfig.max_tokens || 4096,
          temperature: effectiveConfig.temperature || 0.5,
        },
      })
      responseText = bedrockResult.response
      usage = {
        inputTokens: bedrockResult.usage.input_tokens,
        outputTokens: bedrockResult.usage.output_tokens,
      }
      usedProvider = 'bedrock'
      console.log('[PersonaAgent] Bedrock 호출 성공')
    } catch (bedrockError) {
      console.warn('[PersonaAgent] Bedrock 직접 호출 실패:', bedrockError)

      // 2. ProviderRegistry에서 연결된 LLM Provider 시도
      const providerId = effectiveConfig.provider || context.defaultLLMProvider
      const provider = ProviderRegistry.getLLMProvider(providerId)

      if (provider && provider.isConnected()) {
        console.log(`[PersonaAgent] Provider ${providerId} 사용`)
        const response = await provider.invoke({
          model: effectiveConfig.model || '',
          prompt: userPrompt,
          systemPrompt,
          maxTokens: effectiveConfig.max_tokens || 4096,
          temperature: effectiveConfig.temperature || 0.5,
        })
        responseText = response.text
        usage = response.usage
        usedProvider = provider.id
      } else {
        // 3. 로컬 LLM 시도 (마지막 수단)
        console.warn('[PersonaAgent] 연결된 Provider 없음, 로컬 LLM 시도')
        try {
          if (!LocalLLMProvider.getConfig()) {
            configureOllama()
          }
          const localResponse = await LocalLLMProvider.generate({
            prompt: userPrompt,
            systemPrompt,
            temperature: effectiveConfig.temperature || 0.5,
            maxTokens: effectiveConfig.max_tokens || 4096,
          })

          // 시뮬레이션 응답 감지
          if (localResponse.model !== 'simulation') {
            responseText = localResponse.content
            usage = {
              inputTokens: localResponse.tokensUsed.prompt,
              outputTokens: localResponse.tokensUsed.completion,
            }
            usedProvider = 'local'
          } else {
            // 시뮬레이션 모드 - 버그로 기록되어야 함
            console.error('[PersonaAgent] ❌ 시뮬레이션 모드 - LLM 연결 필요')
            responseText = localResponse.content
            usage = {
              inputTokens: localResponse.tokensUsed.prompt,
              outputTokens: localResponse.tokensUsed.completion,
            }
            usedProvider = 'simulation'
            isSimulation = true  // 버그 감지용 플래그
          }
        } catch (localError) {
          // 모든 LLM 실패 - 시뮬레이션 응답 반환
          console.error('[PersonaAgent] ❌ 모든 LLM 실패:', localError)
          responseText = `[시뮬레이션] LLM 연결 실패. Bedrock, Provider, 로컬 LLM 모두 사용 불가.`
          isSimulation = true
          usedProvider = 'none'
        }
      }
    }

    // XAI 결과 파싱
    const xaiResult = parseXAIResult(responseText, effectiveConfig)

    // 경험 레벨 가중치
    const expLevel = effectiveConfig.experience_level || 'senior'
    const weight = EXP_WEIGHTS[expLevel]

    return {
      // 기본 출력
      text: responseText,
      response: responseText,

      // 페르소나 정보
      evaluator: {
        id: effectiveConfig.persona_id || `dynamic_${Date.now()}`,
        name: effectiveConfig.persona_name || '전문가',
        domain: effectiveConfig.domain || '일반',
        experienceLevel: expLevel,
        weight,
      },

      // 프로바이더 정보
      provider: usedProvider,

      // 평가 결과
      evaluation: {
        totalScore: xaiResult.totalScore || 0,
        recommendation: xaiResult.recommendation || 'abstain',
        confidence: xaiResult.confidence || 0.5,
        opinion: xaiResult.opinion || responseText,
      },

      // XAI 요소
      xai: {
        reasoning: xaiResult.reasoning || '',
        keyInsights: xaiResult.keyInsights || [],
        evidences: xaiResult.evidences || [],
        strengths: xaiResult.strengths || [],
        weaknesses: xaiResult.weaknesses || [],
        suggestions: xaiResult.suggestions || [],
        counterpoints: xaiResult.counterpoints,
        uncertainties: xaiResult.uncertainties,
      },

      // 메타데이터
      tokens_used: usage.inputTokens + usage.outputTokens,
      usage,
      status: isSimulation ? '시뮬레이션 (LLM 연결 필요)' : '평가 완료',

      // 시뮬레이션 감지용 필드 (WorkflowSimulator가 버그로 인식)
      _simulation: isSimulation,
      model: isSimulation ? 'simulation' : usedProvider,
    }
  },
}

// ============================================================
// 노드 정의
// ============================================================

export const PersonaAgentDefinition: NodeDefinition = {
  type: 'agent.persona',
  category: 'agent',
  meta: {
    label: '페르소나 에이전트',
    description: '특정 전문가 페르소나를 가진 AI 에이전트. XAI 기반 평가 및 판단 근거 제공.',
    icon: 'Psychology',
    color: '#9C27B0',
    tags: ['agent', 'persona', 'expert', 'evaluation', 'XAI', '전문가', '평가', '페르소나'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '평가/분석 대상 텍스트' },
      { name: 'criteria', type: 'array', required: false, description: '평가 기준 목록' },
      { name: 'context', type: 'text', required: false, description: '추가 컨텍스트' },
    ],
    outputs: [
      { name: 'evaluation', type: 'evaluation-result', required: true, description: '평가 결과 (점수, 권고, 확신도)' },
      { name: 'xai', type: 'xai-result', required: true, description: 'XAI 요소 (근거, 인사이트, 강점/약점)' },
      { name: 'text', type: 'llm-response', required: true, description: '원본 LLM 응답' },
    ],
  },
  configSchema: [
    // 페르소나 설정
    { key: 'persona_id', label: '페르소나 선택', type: 'persona-select', description: '내장 또는 사용자 정의 페르소나' },
    { key: 'persona_name', label: '페르소나 이름', type: 'text', placeholder: '예: 김구조 박사' },
    { key: 'domain', label: '전문 분야', type: 'text', placeholder: '예: 구조공학' },
    {
      key: 'experience_level',
      label: '경험 레벨',
      type: 'select',
      options: [
        { value: 'junior', label: '주니어 (0.6x)' },
        { value: 'mid', label: '미드 (0.8x)' },
        { value: 'senior', label: '시니어 (1.0x)' },
        { value: 'expert', label: '전문가 (1.2x)' },
        { value: 'master', label: '마스터 (1.5x)' },
      ],
      default: 'senior',
    },
    { key: 'system_prompt', label: '추가 시스템 프롬프트', type: 'code', language: 'markdown', rows: 4 },
    { key: 'evaluation_criteria', label: '평가 기준', type: 'tags', placeholder: '기준 추가' },

    // XAI 설정
    {
      key: 'xai_enabled',
      label: 'XAI 활성화',
      type: 'toggle',
      default: true,
      description: '설명 가능한 AI 기능 (판단 근거, 증거, 인사이트)',
    },
    {
      key: 'xai_detail_level',
      label: 'XAI 상세도',
      type: 'select',
      options: [
        { value: 'brief', label: '간략' },
        { value: 'standard', label: '표준' },
        { value: 'detailed', label: '상세' },
        { value: 'comprehensive', label: '종합 (반대 관점 포함)' },
      ],
      default: 'standard',
    },

    // LLM 설정
    { key: 'provider', label: '프로바이더', type: 'provider' },
    { key: 'model', label: '모델', type: 'model' },
    { key: 'temperature', label: '온도', type: 'slider', default: 0.5, min: 0, max: 1, step: 0.1 },
    { key: 'max_tokens', label: '최대 토큰', type: 'number', default: 4096, min: 1, max: 100000 },
  ],
  runtime: 'tauri',
  executor,
  requirements: {
    provider: 'aws',
  },
}

export default PersonaAgentDefinition
