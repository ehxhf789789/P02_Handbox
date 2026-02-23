/**
 * LLM XAI Wrapper
 *
 * LLM 호출을 래핑하여 XAI 추적 데이터를 자동으로 생성합니다.
 * 모든 LLM 호출은 이 래퍼를 통해 이루어져야 XAI 기능이 활성화됩니다.
 */

import { invoke } from '@tauri-apps/api/tauri'
import { xaiService, type LLMCallTrace, type TokenAttribution, type CoTStep, type ConfidenceAnalysis } from './XAIService'
import type { XAIExplanation, Alternative, KnowledgeReference } from '../agents/types'

// ============================================================
// Types
// ============================================================

export interface LLMRequest {
  model: string
  prompt: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  /** XAI 추적 활성화 */
  xaiEnabled?: boolean
  /** 추가 컨텍스트 */
  context?: {
    domain?: string
    userKeywords?: string[]
    previousResponses?: string[]
    knowledgeBase?: KnowledgeReference[]
  }
}

export interface LLMResponse {
  content: string
  tokensUsed: {
    prompt: number
    completion: number
    total: number
  }
  /** XAI 추적 데이터 (xaiEnabled=true인 경우) */
  xai?: {
    trace: LLMCallTrace
    tokenAttributions: TokenAttribution[]
    chainOfThought: CoTStep[]
    confidence: ConfidenceAnalysis
    fullExplanation: XAIExplanation
  }
  /** 처리 시간 (ms) */
  processingTime: number
}

// ============================================================
// No Backend Fallback (replaces fake simulation)
// ============================================================

/**
 * LLM 백엔드 미연결 시 반환
 * 가짜 콘텐츠 생성하지 않고 명확한 에러 메시지 반환
 */
async function simulateLLMCall(request: LLMRequest): Promise<{ content: string; rawResponse: any }> {
  // 시뮬레이션은 가짜 응답을 생성하지 않음
  // 명확하게 LLM 연결이 필요하다는 메시지만 반환
  const response = `[LLM 연결 필요] Tauri 백엔드가 연결되지 않았습니다.

AI 설정에서 LLM 프로바이더를 설정하세요:
- AWS Bedrock (자격 증명 입력)
- OpenAI API 키
- Anthropic API 키
- Ollama (로컬 LLM)

요청: "${request.prompt.slice(0, 50)}..."`

  return {
    content: response,
    rawResponse: {
      model: 'no-backend',
      error: 'LLM backend not connected',
      choices: [{ message: { content: response } }],
      usage: {
        prompt_tokens: Math.ceil(request.prompt.length / 4),
        completion_tokens: Math.ceil(response.length / 4),
        total_tokens: Math.ceil((request.prompt.length + response.length) / 4),
      },
    },
  }
}

// ============================================================
// LLM XAI Wrapper Functions
// ============================================================

/**
 * XAI 추적 기능이 포함된 LLM 호출
 */
export async function callLLMWithXAI(request: LLMRequest): Promise<LLMResponse> {
  const traceId = `llm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const startTime = Date.now()

  // XAI 추적 시작
  if (request.xaiEnabled !== false) {
    xaiService.startTrace(
      traceId,
      request.model,
      request.prompt,
      request.systemPrompt,
      {
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        ...request.context,
      }
    )
  }

  try {
    // LLM 호출 (시뮬레이션 또는 실제 백엔드)
    let result: { content: string; rawResponse: any }

    // Tauri 백엔드가 있으면 실제 호출, 없으면 시뮬레이션
    try {
      result = await invoke<{ content: string; rawResponse: any }>('invoke_llm', {
        model: request.model,
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
      })
    } catch {
      // 백엔드 없으면 시뮬레이션
      result = await simulateLLMCall(request)
    }

    const processingTime = Date.now() - startTime

    // 토큰 사용량 계산
    const tokensUsed = {
      prompt: result.rawResponse?.usage?.prompt_tokens || Math.ceil(request.prompt.length / 4),
      completion: result.rawResponse?.usage?.completion_tokens || Math.ceil(result.content.length / 4),
      total: result.rawResponse?.usage?.total_tokens || Math.ceil((request.prompt.length + result.content.length) / 4),
    }

    // XAI 추적 완료 및 분석
    if (request.xaiEnabled !== false) {
      const trace = xaiService.completeTrace(traceId, result.content, tokensUsed, result.rawResponse)

      if (trace) {
        // 토큰 기여도 분석
        const tokenAttributions = xaiService.analyzeTokenAttribution(
          request.prompt,
          result.content,
          request.context
        )

        // Chain-of-Thought 추출
        const chainOfThought = xaiService.extractChainOfThought(result.content)

        // 신뢰도 계산
        const confidence = xaiService.calculateConfidence(trace)

        // 대안 생성 (간단한 버전)
        const alternatives = generateAlternatives(request.prompt, result.content)

        // 종합 XAI 설명 생성
        const fullExplanation = xaiService.generateFullExplanation(trace, 'llm_response', {
          alternatives,
          knowledgeUsed: request.context?.knowledgeBase || [],
          domain: request.context?.domain,
          userKeywords: request.context?.userKeywords,
        })

        return {
          content: result.content,
          tokensUsed,
          xai: {
            trace,
            tokenAttributions,
            chainOfThought,
            confidence,
            fullExplanation,
          },
          processingTime,
        }
      }
    }

    // XAI 없이 반환
    return {
      content: result.content,
      tokensUsed,
      processingTime,
    }
  } catch (error) {
    throw error
  }
}

/**
 * 스트리밍 LLM 호출 (XAI 추적 포함)
 */
export async function* streamLLMWithXAI(
  request: LLMRequest
): AsyncGenerator<{ chunk: string; done: boolean; xai?: LLMResponse['xai'] }> {
  const traceId = `llm_stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const startTime = Date.now()

  // XAI 추적 시작
  if (request.xaiEnabled !== false) {
    xaiService.startTrace(
      traceId,
      request.model,
      request.prompt,
      request.systemPrompt
    )
  }

  // 시뮬레이션: 청크 단위로 응답 생성
  const { content } = await simulateLLMCall(request)
  const words = content.split(' ')
  let accumulated = ''

  for (let i = 0; i < words.length; i++) {
    accumulated += (i > 0 ? ' ' : '') + words[i]
    await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 30))

    yield {
      chunk: words[i] + (i < words.length - 1 ? ' ' : ''),
      done: false,
    }
  }

  // 스트리밍 완료 후 XAI 분석
  if (request.xaiEnabled !== false) {
    const tokensUsed = {
      prompt: Math.ceil(request.prompt.length / 4),
      completion: Math.ceil(accumulated.length / 4),
      total: Math.ceil((request.prompt.length + accumulated.length) / 4),
    }

    const trace = xaiService.completeTrace(traceId, accumulated, tokensUsed)

    if (trace) {
      const tokenAttributions = xaiService.analyzeTokenAttribution(
        request.prompt,
        accumulated,
        request.context
      )
      const chainOfThought = xaiService.extractChainOfThought(accumulated)
      const confidence = xaiService.calculateConfidence(trace)
      const alternatives = generateAlternatives(request.prompt, accumulated)
      const fullExplanation = xaiService.generateFullExplanation(trace, 'llm_response', {
        alternatives,
        domain: request.context?.domain,
      })

      yield {
        chunk: '',
        done: true,
        xai: {
          trace,
          tokenAttributions,
          chainOfThought,
          confidence,
          fullExplanation,
        },
      }
    } else {
      yield { chunk: '', done: true }
    }
  } else {
    yield { chunk: '', done: true }
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * 대안 생성 (단순화된 버전)
 */
function generateAlternatives(prompt: string, response: string): Alternative[] {
  const alternatives: Alternative[] = []

  // 프롬프트 분석을 통한 대안 제안
  const promptLower = prompt.toLowerCase()

  if (promptLower.includes('요약') || promptLower.includes('summarize')) {
    alternatives.push({
      description: '더 상세한 요약',
      rejectionReason: '현재 요청은 간결한 요약을 원함',
      expectedOutcome: '더 긴 요약문 생성',
      score: 0.7,
    })
    alternatives.push({
      description: '핵심 포인트만 추출',
      rejectionReason: '맥락 정보가 부족할 수 있음',
      expectedOutcome: '불릿 포인트 형식의 핵심 내용',
      score: 0.6,
    })
  }

  if (promptLower.includes('분석') || promptLower.includes('analyze')) {
    alternatives.push({
      description: '통계적 분석 중심',
      rejectionReason: '시각적 분석도 필요함',
      expectedOutcome: '수치 기반 분석 결과',
      score: 0.65,
    })
    alternatives.push({
      description: '시각화 중심',
      rejectionReason: '수치 데이터도 함께 필요',
      expectedOutcome: '차트 및 그래프 중심',
      score: 0.6,
    })
  }

  if (promptLower.includes('워크플로우') || promptLower.includes('workflow')) {
    alternatives.push({
      description: '더 세분화된 단계',
      rejectionReason: '과도한 복잡성 방지',
      expectedOutcome: '더 많은 노드로 구성된 워크플로우',
      score: 0.55,
    })
    alternatives.push({
      description: '병렬 처리 추가',
      rejectionReason: '순차 처리가 더 안정적',
      expectedOutcome: '동시 실행 가능한 구조',
      score: 0.5,
    })
  }

  // 기본 대안
  if (alternatives.length === 0) {
    alternatives.push({
      description: '더 간결한 응답',
      rejectionReason: '충분한 설명이 필요함',
      expectedOutcome: '짧은 응답',
      score: 0.4,
    })
    alternatives.push({
      description: '예시 포함',
      rejectionReason: '일반적인 설명 우선',
      expectedOutcome: '구체적인 예시가 포함된 응답',
      score: 0.5,
    })
  }

  return alternatives
}

/**
 * 프롬프트 품질 평가
 */
export function evaluatePromptQuality(prompt: string): {
  score: number
  issues: string[]
  suggestions: string[]
} {
  const issues: string[] = []
  const suggestions: string[] = []
  let score = 1.0

  // 길이 검사
  if (prompt.length < 10) {
    issues.push('프롬프트가 너무 짧습니다')
    suggestions.push('더 구체적인 설명을 추가하세요')
    score -= 0.3
  } else if (prompt.length > 2000) {
    issues.push('프롬프트가 너무 깁니다')
    suggestions.push('핵심 내용만 포함하세요')
    score -= 0.1
  }

  // 구체성 검사
  const vagueWords = ['그냥', '좀', '대충', '뭔가', 'something', 'just', 'maybe']
  const hasVagueWords = vagueWords.some(w => prompt.toLowerCase().includes(w))
  if (hasVagueWords) {
    issues.push('모호한 표현이 포함되어 있습니다')
    suggestions.push('구체적인 요구사항을 명시하세요')
    score -= 0.15
  }

  // 액션 동사 검사
  const actionVerbs = ['만들', '생성', '분석', '요약', '변환', '처리', '추출', '검색', '비교',
                       'create', 'generate', 'analyze', 'summarize', 'convert', 'process']
  const hasActionVerb = actionVerbs.some(v => prompt.toLowerCase().includes(v))
  if (!hasActionVerb) {
    issues.push('명확한 액션이 없습니다')
    suggestions.push('수행할 작업을 명확히 지정하세요')
    score -= 0.2
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    issues,
    suggestions,
  }
}

/**
 * XAI 추적 데이터를 사람이 읽을 수 있는 형식으로 포맷
 */
export function formatXAIForDisplay(xai: LLMResponse['xai']): {
  summary: string
  details: {
    reasoning: string[]
    keyFactors: { name: string; impact: string; value: number }[]
    confidence: { level: string; percent: number; color: string }
    alternatives: { name: string; reason: string }[]
  }
} {
  if (!xai) {
    return {
      summary: 'XAI 데이터 없음',
      details: {
        reasoning: [],
        keyFactors: [],
        confidence: { level: '알 수 없음', percent: 0, color: '#6b7280' },
        alternatives: [],
      },
    }
  }

  // 추론 과정 요약
  const reasoning = xai.chainOfThought.map(step =>
    `${step.step}. ${step.action}`
  )

  // 핵심 요인 추출
  const keyFactors = xai.confidence.factors
    .filter(f => Math.abs(f.contribution) > 0.1)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5)
    .map(f => ({
      name: f.factor,
      impact: f.contribution > 0 ? '긍정' : '부정',
      value: Math.round(f.contribution * 100),
    }))

  // 신뢰도 레벨
  const confidencePercent = Math.round(xai.confidence.overall * 100)
  let confidenceLevel: string
  let confidenceColor: string
  if (confidencePercent >= 80) {
    confidenceLevel = '높음'
    confidenceColor = '#10b981'
  } else if (confidencePercent >= 60) {
    confidenceLevel = '보통'
    confidenceColor = '#f59e0b'
  } else {
    confidenceLevel = '낮음'
    confidenceColor = '#ef4444'
  }

  // 대안 요약
  const alternatives = xai.fullExplanation.alternatives.map(alt => ({
    name: alt.description,
    reason: alt.rejectionReason,
  }))

  return {
    summary: xai.fullExplanation.summary,
    details: {
      reasoning,
      keyFactors,
      confidence: {
        level: confidenceLevel,
        percent: confidencePercent,
        color: confidenceColor,
      },
      alternatives,
    },
  }
}
