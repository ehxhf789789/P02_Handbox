/**
 * XAI (Explainable AI) Core Service
 *
 * 연구 기반의 설명 가능한 AI 시스템 구현:
 * - SHAP-like Feature Attribution: 입력 토큰이 출력에 기여하는 정도
 * - Chain-of-Thought Tracking: 실제 추론 단계 추적
 * - Confidence Calculation: 실제 근거 기반 신뢰도 계산
 * - Counterfactual Explanations: "왜 A가 아니라 B인가?" 설명
 *
 * References:
 * - SHAP (SHapley Additive exPlanations): Lundberg & Lee, 2017
 * - Attention Visualization: Vaswani et al., 2017
 * - Chain-of-Thought: Wei et al., 2022
 */

import type {
  XAIExplanation,
  ReasoningStep,
  Alternative,
  KnowledgeReference,
  ConfidenceFactor,
  XAIVisualization,
  XAINode,
  XAIEdge,
} from '../agents/types'

// ============================================================
// Types
// ============================================================

/** LLM 호출 추적 데이터 */
export interface LLMCallTrace {
  id: string
  timestamp: number
  model: string
  /** 입력 프롬프트 */
  prompt: string
  /** 시스템 프롬프트 */
  systemPrompt?: string
  /** 생성된 응답 */
  response: string
  /** 사용된 토큰 수 */
  tokensUsed: {
    prompt: number
    completion: number
    total: number
  }
  /** 처리 시간 (ms) */
  processingTime: number
  /** 온도 설정 */
  temperature?: number
  /** 원본 요청 파라미터 */
  rawParams?: Record<string, any>
  /** 원본 응답 */
  rawResponse?: any
}

/** 토큰별 기여도 (SHAP-like) */
export interface TokenAttribution {
  token: string
  position: number
  /** 출력에 대한 기여도 (-1 ~ 1) */
  attribution: number
  /** 기여도 유형 */
  type: 'positive' | 'negative' | 'neutral'
  /** 관련 출력 부분 */
  relatedOutput?: string
}

/** Chain-of-Thought 단계 */
export interface CoTStep {
  step: number
  thought: string
  action: string
  observation?: string
  isComplete: boolean
}

/** 신뢰도 분석 결과 */
export interface ConfidenceAnalysis {
  /** 종합 신뢰도 (0-1) */
  overall: number
  /** 신뢰도 요인별 분석 */
  factors: ConfidenceFactor[]
  /** 불확실성 요인 */
  uncertainties: string[]
  /** 권장 사항 */
  recommendations: string[]
}

/** 반사실적 설명 */
export interface CounterfactualExplanation {
  /** 원래 결정 */
  originalDecision: string
  /** 대안 결정 */
  alternativeDecision: string
  /** 변경이 필요한 입력 요소 */
  requiredChanges: string[]
  /** 변경 시 예상 결과 */
  expectedOutcome: string
  /** 변경 난이도 (0-1) */
  changeDifficulty: number
}

// ============================================================
// XAI Service Class
// ============================================================

export class XAIService {
  private callTraces: Map<string, LLMCallTrace> = new Map()
  private static instance: XAIService

  private constructor() {}

  static getInstance(): XAIService {
    if (!XAIService.instance) {
      XAIService.instance = new XAIService()
    }
    return XAIService.instance
  }

  // ============================================================
  // LLM Call Tracking
  // ============================================================

  /**
   * LLM 호출 추적 시작
   */
  startTrace(
    id: string,
    model: string,
    prompt: string,
    systemPrompt?: string,
    rawParams?: Record<string, any>
  ): void {
    this.callTraces.set(id, {
      id,
      timestamp: Date.now(),
      model,
      prompt,
      systemPrompt,
      response: '',
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      processingTime: 0,
      temperature: rawParams?.temperature,
      rawParams,
    })
  }

  /**
   * LLM 호출 완료 및 추적 데이터 업데이트
   */
  completeTrace(
    id: string,
    response: string,
    tokensUsed: { prompt: number; completion: number; total: number },
    rawResponse?: any
  ): LLMCallTrace | null {
    const trace = this.callTraces.get(id)
    if (!trace) return null

    trace.response = response
    trace.tokensUsed = tokensUsed
    trace.processingTime = Date.now() - trace.timestamp
    trace.rawResponse = rawResponse

    return trace
  }

  /**
   * 추적 데이터 조회
   */
  getTrace(id: string): LLMCallTrace | undefined {
    return this.callTraces.get(id)
  }

  // ============================================================
  // Token Attribution (SHAP-like)
  // ============================================================

  /**
   * 입력 토큰의 출력에 대한 기여도 분석 (Simplified SHAP-like)
   *
   * 실제 SHAP 계산은 LLM의 내부 gradient에 접근해야 하므로,
   * 여기서는 어휘적/의미적 유사도 기반의 근사 방식을 사용합니다.
   */
  analyzeTokenAttribution(
    prompt: string,
    response: string,
    context?: { domain?: string; keywords?: string[] }
  ): TokenAttribution[] {
    const tokens = this.tokenize(prompt)
    const responseTokens = new Set(this.tokenize(response).map(t => t.toLowerCase()))
    const attributions: TokenAttribution[] = []

    // 도메인별 핵심 키워드
    const domainKeywords = this.getDomainKeywords(context?.domain)
    const userKeywords = context?.keywords || []
    const allKeywords = new Set([...domainKeywords, ...userKeywords.map(k => k.toLowerCase())])

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      const tokenLower = token.toLowerCase()
      let attribution = 0

      // 1. 직접 출현 (응답에 같은 토큰이 있으면 높은 기여도)
      if (responseTokens.has(tokenLower)) {
        attribution += 0.4
      }

      // 2. 키워드 매칭 (도메인/사용자 키워드와 일치)
      if (allKeywords.has(tokenLower)) {
        attribution += 0.3
      }

      // 3. 질문/지시어 (높은 기여도)
      if (this.isActionWord(token)) {
        attribution += 0.2
      }

      // 4. 위치 가중치 (문장 시작과 끝이 더 중요)
      const positionWeight = this.getPositionWeight(i, tokens.length)
      attribution *= (1 + positionWeight * 0.2)

      // 5. 불용어 패널티
      if (this.isStopWord(token)) {
        attribution *= 0.3
      }

      // 정규화 (-1 ~ 1)
      attribution = Math.min(1, Math.max(-1, attribution))

      attributions.push({
        token,
        position: i,
        attribution,
        type: attribution > 0.3 ? 'positive' : attribution < -0.1 ? 'negative' : 'neutral',
        relatedOutput: this.findRelatedOutput(token, response),
      })
    }

    return attributions
  }

  // ============================================================
  // Chain-of-Thought Analysis
  // ============================================================

  /**
   * 응답에서 Chain-of-Thought 패턴 추출
   */
  extractChainOfThought(response: string): CoTStep[] {
    const steps: CoTStep[] = []

    // 패턴 1: 명시적 단계 표시 (1., 2., 3. 또는 Step 1, Step 2)
    const numberedPattern = /(?:^|\n)(?:(\d+)[.\):]|\bstep\s*(\d+)[.:\)]?\s*)(.*?)(?=(?:\n(?:\d+[.\):]|\bstep\s*\d+))|$)/gis
    let match

    while ((match = numberedPattern.exec(response)) !== null) {
      const stepNum = parseInt(match[1] || match[2])
      const content = match[3].trim()

      if (content) {
        steps.push({
          step: stepNum,
          thought: this.extractThought(content),
          action: this.extractAction(content),
          observation: this.extractObservation(content),
          isComplete: true,
        })
      }
    }

    // 패턴 2: 암시적 논리 흐름 (먼저, 그 다음, 마지막으로)
    if (steps.length === 0) {
      const flowPatterns = [
        { pattern: /(?:먼저|first|initially|우선)[,:\s]*(.*?)(?=[.。]|$)/gi, phase: 'initial' },
        { pattern: /(?:그 ?다음|then|next|after that|이후에?)[,:\s]*(.*?)(?=[.。]|$)/gi, phase: 'middle' },
        { pattern: /(?:마지막으로|finally|lastly|결론적으로)[,:\s]*(.*?)(?=[.。]|$)/gi, phase: 'final' },
      ]

      let stepNum = 1
      for (const { pattern, phase } of flowPatterns) {
        while ((match = pattern.exec(response)) !== null) {
          steps.push({
            step: stepNum++,
            thought: `[${phase}] 논리 흐름`,
            action: match[1].trim(),
            isComplete: true,
          })
        }
      }
    }

    // 패턴 3: 문장 단위 분해 (위 패턴이 모두 없을 경우)
    if (steps.length === 0) {
      const sentences = response.split(/[.。!?]\s+/).filter(s => s.trim().length > 10)
      sentences.slice(0, 5).forEach((sentence, idx) => {
        steps.push({
          step: idx + 1,
          thought: '응답 분석',
          action: sentence.trim(),
          isComplete: true,
        })
      })
    }

    return steps
  }

  // ============================================================
  // Confidence Calculation
  // ============================================================

  /**
   * 실제 근거 기반 신뢰도 계산
   */
  calculateConfidence(
    trace: LLMCallTrace,
    additionalFactors?: {
      hasSourceCitation?: boolean
      isStructuredOutput?: boolean
      matchesPreviousPatterns?: boolean
      userFeedbackPositive?: boolean
    }
  ): ConfidenceAnalysis {
    const factors: ConfidenceFactor[] = []
    const uncertainties: string[] = []
    const recommendations: string[] = []

    // 1. 응답 길이 대비 복잡도
    const responseComplexity = this.analyzeResponseComplexity(trace.response)
    factors.push({
      factor: '응답 복잡도',
      contribution: responseComplexity.score * 0.3,
      explanation: responseComplexity.explanation,
    })
    if (responseComplexity.score < 0.5) {
      uncertainties.push('응답이 너무 단순하거나 불완전할 수 있습니다')
    }

    // 2. 프롬프트-응답 관련성
    const relevanceScore = this.calculateRelevance(trace.prompt, trace.response)
    factors.push({
      factor: '질문-응답 관련성',
      contribution: relevanceScore * 0.4,
      explanation: `입력과 출력의 의미적 관련성: ${(relevanceScore * 100).toFixed(0)}%`,
    })
    if (relevanceScore < 0.6) {
      uncertainties.push('응답이 질문과 충분히 관련되지 않을 수 있습니다')
      recommendations.push('더 구체적인 질문을 해보세요')
    }

    // 3. 구조화된 응답 여부
    const isStructured = additionalFactors?.isStructuredOutput || this.isStructuredResponse(trace.response)
    factors.push({
      factor: '응답 구조화',
      contribution: isStructured ? 0.15 : -0.05,
      explanation: isStructured ? '구조화된 응답으로 신뢰도 증가' : '비구조화된 응답',
    })

    // 4. 소스 인용 여부
    const hasCitation = additionalFactors?.hasSourceCitation || this.hasSourceCitation(trace.response)
    factors.push({
      factor: '소스 인용',
      contribution: hasCitation ? 0.2 : 0,
      explanation: hasCitation ? '참조 출처가 명시됨' : '인용 없음',
    })
    if (!hasCitation && trace.prompt.includes('근거') || trace.prompt.includes('출처')) {
      recommendations.push('출처나 근거를 요청해보세요')
    }

    // 5. 온도 설정 영향
    const tempFactor = this.getTemperatureFactor(trace.temperature)
    factors.push({
      factor: '생성 파라미터',
      contribution: tempFactor.contribution,
      explanation: tempFactor.explanation,
    })

    // 6. 토큰 사용량 분석
    const tokenRatio = trace.tokensUsed.completion / (trace.tokensUsed.prompt || 1)
    const tokenFactor = tokenRatio > 0.5 && tokenRatio < 5 ? 0.1 : -0.05
    factors.push({
      factor: '응답/프롬프트 비율',
      contribution: tokenFactor,
      explanation: `출력/입력 토큰 비율: ${tokenRatio.toFixed(2)}`,
    })

    // 7. 이전 패턴 일치 (선택적)
    if (additionalFactors?.matchesPreviousPatterns !== undefined) {
      factors.push({
        factor: '학습된 패턴 일치',
        contribution: additionalFactors.matchesPreviousPatterns ? 0.15 : -0.1,
        explanation: additionalFactors.matchesPreviousPatterns
          ? '이전에 성공한 패턴과 유사'
          : '새로운 유형의 응답',
      })
    }

    // 8. 사용자 피드백 (선택적)
    if (additionalFactors?.userFeedbackPositive !== undefined) {
      factors.push({
        factor: '사용자 피드백',
        contribution: additionalFactors.userFeedbackPositive ? 0.25 : -0.2,
        explanation: additionalFactors.userFeedbackPositive
          ? '이전 유사 응답에 긍정적 피드백'
          : '이전 유사 응답에 부정적 피드백',
      })
    }

    // 종합 신뢰도 계산 (시그모이드 정규화)
    const rawScore = factors.reduce((sum, f) => sum + f.contribution, 0)
    const overall = 1 / (1 + Math.exp(-rawScore * 2)) // 시그모이드로 0-1 범위 정규화

    return {
      overall,
      factors,
      uncertainties,
      recommendations,
    }
  }

  // ============================================================
  // Counterfactual Explanations
  // ============================================================

  /**
   * 반사실적 설명 생성
   * "만약 X가 달랐다면 Y가 되었을 것"
   */
  generateCounterfactuals(
    prompt: string,
    response: string,
    alternatives: Alternative[]
  ): CounterfactualExplanation[] {
    const counterfactuals: CounterfactualExplanation[] = []

    // 각 대안에 대해 반사실적 설명 생성
    for (const alt of alternatives) {
      const requiredChanges = this.identifyRequiredChanges(prompt, alt.description)

      counterfactuals.push({
        originalDecision: response.slice(0, 100) + '...',
        alternativeDecision: alt.description,
        requiredChanges,
        expectedOutcome: alt.expectedOutcome,
        changeDifficulty: 1 - alt.score, // 점수가 낮을수록 변경이 어려움
      })
    }

    return counterfactuals
  }

  // ============================================================
  // Full XAI Explanation Generation
  // ============================================================

  /**
   * 종합 XAI 설명 생성
   */
  generateFullExplanation(
    trace: LLMCallTrace,
    decisionType: string,
    additionalContext?: {
      alternatives?: Alternative[]
      knowledgeUsed?: KnowledgeReference[]
      domain?: string
      userKeywords?: string[]
    }
  ): XAIExplanation {
    const id = `xai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 1. Chain-of-Thought 추출 → 추론 단계로 변환
    const cotSteps = this.extractChainOfThought(trace.response)
    const reasoningSteps: ReasoningStep[] = cotSteps.map(cot => ({
      step: cot.step,
      action: cot.action,
      rationale: cot.thought,
      input: cot.step === 1 ? trace.prompt : `이전 단계 결과`,
      output: cot.observation || cot.action,
      duration: Math.round(trace.processingTime / cotSteps.length),
    }))

    // 2. 토큰 기여도 분석 → 시각화 데이터로 변환
    const tokenAttrs = this.analyzeTokenAttribution(trace.prompt, trace.response, {
      domain: additionalContext?.domain,
      keywords: additionalContext?.userKeywords,
    })

    // 3. 신뢰도 계산
    const confidenceAnalysis = this.calculateConfidence(trace)

    // 4. 대안 처리
    const alternatives = additionalContext?.alternatives || []

    // 5. 사용된 지식 (제공된 경우)
    const knowledgeUsed = additionalContext?.knowledgeUsed || []

    // 6. 시각화 데이터 생성
    const visualizationData = this.generateVisualization(reasoningSteps, tokenAttrs)

    // 7. 요약 생성
    const summary = this.generateSummary(trace, confidenceAnalysis, reasoningSteps)

    return {
      id,
      decisionType,
      reasoningSteps,
      alternatives,
      knowledgeUsed,
      confidenceFactors: confidenceAnalysis.factors,
      summary,
      visualizationData,
    }
  }

  // ============================================================
  // Visualization Generation
  // ============================================================

  /**
   * XAI 시각화 데이터 생성
   */
  generateVisualization(
    reasoningSteps: ReasoningStep[],
    tokenAttrs: TokenAttribution[]
  ): XAIVisualization {
    const nodes: XAINode[] = []
    const edges: XAIEdge[] = []

    // 입력 노드 (토큰 기여도 기반)
    const significantTokens = tokenAttrs.filter(t => Math.abs(t.attribution) > 0.3)
    significantTokens.forEach((token, idx) => {
      nodes.push({
        id: `input_${idx}`,
        label: token.token,
        type: token.type,
        data: {
          attribution: token.attribution,
          position: token.position,
        },
      })
    })

    // 추론 단계 노드
    reasoningSteps.forEach((step, idx) => {
      nodes.push({
        id: `step_${idx}`,
        label: `단계 ${step.step}`,
        type: 'reasoning',
        data: {
          action: step.action,
          duration: step.duration,
        },
      })

      // 이전 단계와 연결
      if (idx > 0) {
        edges.push({
          source: `step_${idx - 1}`,
          target: `step_${idx}`,
          label: `${step.duration}ms`,
        })
      }
    })

    // 입력 → 첫 번째 단계 연결
    significantTokens.forEach((_, idx) => {
      edges.push({
        source: `input_${idx}`,
        target: 'step_0',
      })
    })

    // 출력 노드
    nodes.push({
      id: 'output',
      label: '최종 출력',
      type: 'output',
      data: {},
    })

    // 마지막 단계 → 출력 연결
    if (reasoningSteps.length > 0) {
      edges.push({
        source: `step_${reasoningSteps.length - 1}`,
        target: 'output',
      })
    }

    return {
      type: 'flowchart',
      nodes,
      edges,
    }
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  /**
   * 텍스트에서 사고(thought) 부분 추출
   */
  private extractThought(content: string): string {
    // "생각:", "Thought:", "분석:" 등의 패턴 찾기
    const thoughtPatterns = [
      /(?:생각|thought|분석|이유|rationale)[:\s]*(.*?)(?=[.。]|$)/i,
      /^(.*?)(?:따라서|therefore|그래서|so)/i,
    ]

    for (const pattern of thoughtPatterns) {
      const match = content.match(pattern)
      if (match && match[1]) {
        return match[1].trim()
      }
    }

    // 패턴이 없으면 첫 문장 반환
    return content.split(/[.。!?]/)[0]?.trim() || '추론 과정'
  }

  /**
   * 텍스트에서 액션(action) 부분 추출
   */
  private extractAction(content: string): string {
    // "액션:", "Action:", "실행:" 등의 패턴 찾기
    const actionPatterns = [
      /(?:액션|action|실행|수행|do)[:\s]*(.*?)(?=[.。]|$)/i,
      /(?:따라서|therefore|그래서|so)[,:\s]*(.*?)(?=[.。]|$)/i,
    ]

    for (const pattern of actionPatterns) {
      const match = content.match(pattern)
      if (match && match[1]) {
        return match[1].trim()
      }
    }

    // 패턴이 없으면 전체 내용 반환
    return content.slice(0, 100) + (content.length > 100 ? '...' : '')
  }

  /**
   * 텍스트에서 관찰(observation) 부분 추출
   */
  private extractObservation(content: string): string | undefined {
    // "결과:", "Observation:", "확인:" 등의 패턴 찾기
    const obsPatterns = [
      /(?:결과|observation|확인|output|출력)[:\s]*(.*?)(?=[.。]|$)/i,
      /(?:완료|done|finished)[.:\s]*(.*?)$/i,
    ]

    for (const pattern of obsPatterns) {
      const match = content.match(pattern)
      if (match && match[1]) {
        return match[1].trim()
      }
    }

    return undefined
  }

  private tokenize(text: string): string[] {
    // 한국어/영어 모두 처리하는 간단한 토크나이저
    return text
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0)
  }

  private getDomainKeywords(domain?: string): string[] {
    const domainKeywordMap: Record<string, string[]> = {
      data: ['데이터', '분석', 'csv', 'excel', '통계', '차트', 'data', 'analysis'],
      document: ['문서', 'pdf', 'word', '요약', '번역', 'document', 'summary'],
      automation: ['자동화', '반복', '스케줄', '배치', 'workflow', 'automation'],
      ai: ['AI', 'LLM', '생성', '학습', '모델', 'model', 'generate'],
      rag: ['검색', 'RAG', '임베딩', '벡터', 'embedding', 'retrieval'],
      agent: ['에이전트', '페르소나', '평가', 'agent', 'persona', 'evaluate'],
    }
    return domainKeywordMap[domain || 'general'] || []
  }

  private isActionWord(token: string): boolean {
    const actionWords = [
      '만들어', '생성', '분석', '요약', '변환', '읽어', '찾아', '계산', '비교',
      'create', 'generate', 'analyze', 'summarize', 'convert', 'read', 'find', 'calculate',
    ]
    return actionWords.some(w => token.toLowerCase().includes(w.toLowerCase()))
  }

  private isStopWord(token: string): boolean {
    const stopWords = [
      '은', '는', '이', '가', '을', '를', '의', '와', '과', '에', '에서', '으로', '로',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'and', 'or', 'but', 'if', 'then', 'so', 'as', 'of', 'for', 'to', 'in', 'on',
    ]
    return stopWords.includes(token.toLowerCase())
  }

  private getPositionWeight(position: number, total: number): number {
    // U자형 가중치: 시작과 끝이 더 중요
    const normalizedPos = position / total
    return 1 - 4 * Math.pow(normalizedPos - 0.5, 2)
  }

  private findRelatedOutput(token: string, response: string): string | undefined {
    const tokenLower = token.toLowerCase()
    const sentences = response.split(/[.。!?]/)
    const related = sentences.find(s => s.toLowerCase().includes(tokenLower))
    return related?.trim().slice(0, 50)
  }

  private analyzeResponseComplexity(response: string): { score: number; explanation: string } {
    const wordCount = this.tokenize(response).length
    const sentenceCount = response.split(/[.。!?]/).filter(s => s.trim()).length
    const avgWordsPerSentence = wordCount / (sentenceCount || 1)

    let score = 0.5

    // 적절한 길이 보너스
    if (wordCount >= 20 && wordCount <= 500) score += 0.2
    if (avgWordsPerSentence >= 8 && avgWordsPerSentence <= 25) score += 0.1

    // 구조 요소 보너스
    if (response.includes('\n')) score += 0.1
    if (/\d+[.\):]/.test(response)) score += 0.1

    return {
      score: Math.min(1, score),
      explanation: `단어 ${wordCount}개, 문장 ${sentenceCount}개, 평균 문장 길이 ${avgWordsPerSentence.toFixed(1)}`,
    }
  }

  private calculateRelevance(prompt: string, response: string): number {
    const promptTokens = new Set(this.tokenize(prompt).map(t => t.toLowerCase()))
    const responseTokens = this.tokenize(response).map(t => t.toLowerCase())

    // Jaccard 유사도 + 키워드 매칭
    const intersection = responseTokens.filter(t => promptTokens.has(t))
    const union = new Set([...promptTokens, ...responseTokens])

    const jaccard = intersection.length / union.size

    // 핵심 키워드 매칭 가중치
    const keywordBonus = this.getKeywordMatchBonus(prompt, response)

    return Math.min(1, jaccard * 2 + keywordBonus)
  }

  private getKeywordMatchBonus(prompt: string, response: string): number {
    const promptLower = prompt.toLowerCase()
    const responseLower = response.toLowerCase()

    // 액션 키워드 매칭
    const actionWords = ['만들', '생성', '분석', '요약', '변환', 'create', 'generate', 'analyze']
    const matchedActions = actionWords.filter(w => promptLower.includes(w) && responseLower.includes(w))

    return matchedActions.length * 0.1
  }

  private isStructuredResponse(response: string): boolean {
    // 구조화된 응답 감지 (리스트, 번호, 헤더 등)
    const structurePatterns = [
      /^\s*[-*•]\s+/m,           // 불릿 리스트
      /^\s*\d+[.\)]\s+/m,        // 번호 리스트
      /^#+\s+/m,                 // 마크다운 헤더
      /\*\*[^*]+\*\*/,           // 볼드 텍스트
      /```[\s\S]*?```/,          // 코드 블록
    ]

    return structurePatterns.some(p => p.test(response))
  }

  private hasSourceCitation(response: string): boolean {
    // 인용/참조 패턴 감지
    const citationPatterns = [
      /\[\d+\]/,                          // [1], [2] 형태
      /\(.*?\d{4}.*?\)/,                  // (저자, 2020) 형태
      /참고|참조|출처|reference|source|according to/i,
      /https?:\/\/[^\s]+/,                // URL
    ]

    return citationPatterns.some(p => p.test(response))
  }

  private getTemperatureFactor(temperature?: number): { contribution: number; explanation: string } {
    if (temperature === undefined) {
      return { contribution: 0, explanation: '온도 설정 정보 없음' }
    }

    if (temperature <= 0.3) {
      return { contribution: 0.1, explanation: `낮은 온도(${temperature}): 일관된 응답` }
    } else if (temperature <= 0.7) {
      return { contribution: 0.05, explanation: `중간 온도(${temperature}): 균형잡힌 응답` }
    } else {
      return { contribution: -0.05, explanation: `높은 온도(${temperature}): 창의적이나 변동성 있음` }
    }
  }

  private identifyRequiredChanges(prompt: string, alternativeDescription: string): string[] {
    const changes: string[] = []

    // 간단한 차이점 분석
    const promptTokens = new Set(this.tokenize(prompt).map(t => t.toLowerCase()))
    const altTokens = this.tokenize(alternativeDescription).map(t => t.toLowerCase())

    const newConcepts = altTokens.filter(t => !promptTokens.has(t) && !this.isStopWord(t))

    if (newConcepts.length > 0) {
      changes.push(`다음 개념 추가 필요: ${newConcepts.slice(0, 3).join(', ')}`)
    }

    // 일반적인 변경 제안
    changes.push('요청의 구체성 조정')
    changes.push('다른 접근 방식 명시')

    return changes
  }

  private generateSummary(
    trace: LLMCallTrace,
    confidence: ConfidenceAnalysis,
    reasoningSteps: ReasoningStep[]
  ): string {
    const stepCount = reasoningSteps.length
    const confidencePercent = (confidence.overall * 100).toFixed(0)
    const processingTime = trace.processingTime

    let summary = `${stepCount}단계의 추론 과정을 거쳐 응답이 생성되었습니다. `
    summary += `신뢰도는 ${confidencePercent}%로 평가됩니다. `
    summary += `처리 시간: ${processingTime}ms, 사용 토큰: ${trace.tokensUsed.total}개.`

    if (confidence.uncertainties.length > 0) {
      summary += ` 주의: ${confidence.uncertainties[0]}`
    }

    return summary
  }

  /**
   * 서비스 정리 (메모리 해제)
   */
  cleanup(): void {
    this.callTraces.clear()
  }
}

// 싱글톤 인스턴스 export
export const xaiService = XAIService.getInstance()
