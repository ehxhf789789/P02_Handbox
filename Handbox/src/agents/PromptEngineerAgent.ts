/**
 * Prompt Engineer Agent
 *
 * 프롬프트를 분석, 개선, 최적화하는 전문 에이전트.
 * 사용자의 의도를 파악하고 더 효과적인 프롬프트로 변환.
 *
 * 핵심 기능:
 * - 프롬프트 분석 (명확성, 구체성, 의도 파악)
 * - 프롬프트 개선 (자동 최적화)
 * - 템플릿 생성 (도메인별 프롬프트 템플릿)
 * - Few-shot 예시 생성
 * - Chain-of-Thought 분해
 */

import { invoke } from '@tauri-apps/api/tauri'
import { MemoryAgent } from './MemoryAgent'
import type {
  AgentContext,
  AgentResponse,
  IPromptEngineerAgent,
  PromptAnalysis,
  PromptTemplate,
  Example,
  ChainOfThoughtStep,
  XAIExplanation,
  ReasoningStep,
} from './types'

// ============================================================
// Constants
// ============================================================

const SYSTEM_PROMPT = `당신은 Handbox의 Prompt Engineer Agent입니다.
프롬프트를 분석하고 최적화하는 전문가입니다.

규칙:
1. 프롬프트의 의도를 정확히 파악합니다
2. 누락된 정보와 모호한 부분을 식별합니다
3. 구체적이고 실행 가능한 개선안을 제시합니다
4. 도메인 특성을 고려한 최적화를 수행합니다
5. 모든 분석 결과는 JSON 형식으로 응답합니다
`

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  coding: ['코드', '프로그래밍', '함수', '클래스', '버그', '에러', '개발', '구현', 'API', 'REST', 'SQL'],
  data: ['데이터', '분석', '통계', '차트', '그래프', 'CSV', 'JSON', 'ETL', '시각화'],
  writing: ['글', '작성', '문서', '보고서', '이메일', '번역', '요약', '블로그'],
  rag: ['검색', 'RAG', '지식베이스', 'KB', '임베딩', '벡터', '문서'],
  workflow: ['워크플로우', '자동화', '파이프라인', '프로세스', '작업'],
  agent: ['에이전트', '페르소나', '역할', '전문가', '평가'],
}

const COMPLEXITY_INDICATORS: Record<string, number> = {
  '그리고': 0.5,
  '또한': 0.5,
  '단계': 0.8,
  '먼저': 0.6,
  '그 다음': 0.6,
  '조건': 0.7,
  '만약': 0.7,
  '반복': 0.8,
  '여러': 0.5,
  '다양한': 0.5,
}

// ============================================================
// Prompt Engineer Agent Implementation
// ============================================================

class PromptEngineerAgentImpl implements IPromptEngineerAgent {
  private templateCache: Map<string, PromptTemplate> = new Map()

  // ── 프롬프트 분석 ──

  async analyze(
    prompt: string,
    context: AgentContext
  ): Promise<AgentResponse<PromptAnalysis>> {
    const startTime = Date.now()
    const reasoningSteps: ReasoningStep[] = []

    try {
      // Step 1: 기본 분석
      reasoningSteps.push({
        step: 1,
        action: '기본 분석',
        rationale: '프롬프트의 길이, 구조, 키워드를 분석합니다',
        input: prompt,
        output: null,
        duration: 0,
      })

      const step1Start = Date.now()
      const basicAnalysis = this.performBasicAnalysis(prompt)
      reasoningSteps[0].output = basicAnalysis
      reasoningSteps[0].duration = Date.now() - step1Start

      // Step 2: 도메인 감지
      reasoningSteps.push({
        step: 2,
        action: '도메인 감지',
        rationale: '프롬프트가 속한 도메인을 식별합니다',
        input: prompt,
        output: null,
        duration: 0,
      })

      const step2Start = Date.now()
      const detectedDomain = this.detectDomain(prompt)
      reasoningSteps[1].output = detectedDomain
      reasoningSteps[1].duration = Date.now() - step2Start

      // Step 3: 복잡도 계산
      reasoningSteps.push({
        step: 3,
        action: '복잡도 계산',
        rationale: '프롬프트의 복잡도를 평가합니다',
        input: prompt,
        output: null,
        duration: 0,
      })

      const step3Start = Date.now()
      const complexity = this.calculateComplexity(prompt)
      reasoningSteps[2].output = complexity
      reasoningSteps[2].duration = Date.now() - step3Start

      // Step 4: LLM 심층 분석
      reasoningSteps.push({
        step: 4,
        action: 'LLM 심층 분석',
        rationale: 'LLM을 사용하여 의도, 누락 정보, 모호성을 분석합니다',
        input: prompt,
        output: null,
        duration: 0,
      })

      const step4Start = Date.now()
      const llmAnalysis = await this.performLLMAnalysis(prompt, detectedDomain)
      reasoningSteps[3].output = llmAnalysis
      reasoningSteps[3].duration = Date.now() - step4Start

      // Step 5: 사용자 패턴 반영
      reasoningSteps.push({
        step: 5,
        action: '사용자 패턴 반영',
        rationale: '사용자의 이전 패턴과 선호도를 반영합니다',
        input: { userId: context.userProfile.userId },
        output: null,
        duration: 0,
      })

      const step5Start = Date.now()
      const userPatterns = await this.getUserPatterns(context)
      reasoningSteps[4].output = { patternCount: userPatterns.length }
      reasoningSteps[4].duration = Date.now() - step5Start

      // 최종 분석 결과 생성
      const analysis: PromptAnalysis = {
        intent: llmAnalysis.intent || basicAnalysis.inferredIntent,
        clarityScore: this.calculateClarityScore(prompt, llmAnalysis),
        specificityScore: this.calculateSpecificityScore(prompt, llmAnalysis),
        missingInfo: llmAnalysis.missingInfo || [],
        ambiguities: llmAnalysis.ambiguities || [],
        suggestions: this.generateSuggestions(prompt, llmAnalysis, userPatterns),
        detectedDomain,
        complexity,
      }

      // 활동 로깅
      await MemoryAgent.logActivity({
        timestamp: Date.now(),
        type: 'agent_invoke',
        action: `프롬프트 분석: ${prompt.slice(0, 50)}...`,
        input: prompt,
        output: analysis,
      })

      const explanation = this.buildExplanation(reasoningSteps, analysis)

      return {
        data: analysis,
        explanation,
        confidence: (analysis.clarityScore + analysis.specificityScore) / 2,
        processingTime: Date.now() - startTime,
      }
    } catch (error) {
      return {
        data: this.getDefaultAnalysis(prompt),
        explanation: this.buildErrorExplanation(error, reasoningSteps),
        confidence: 0.3,
        processingTime: Date.now() - startTime,
      }
    }
  }

  // ── 프롬프트 개선 ──

  async enhance(
    prompt: string,
    context: AgentContext
  ): Promise<AgentResponse<string>> {
    const startTime = Date.now()
    const reasoningSteps: ReasoningStep[] = []

    try {
      // Step 1: 현재 프롬프트 분석
      const analysisResponse = await this.analyze(prompt, context)
      const analysis = analysisResponse.data

      reasoningSteps.push({
        step: 1,
        action: '현재 프롬프트 분석',
        rationale: '개선 전 프롬프트의 상태를 파악합니다',
        input: prompt,
        output: analysis,
        duration: analysisResponse.processingTime,
      })

      // Step 2: 개선 전략 수립
      reasoningSteps.push({
        step: 2,
        action: '개선 전략 수립',
        rationale: '분석 결과를 바탕으로 개선 방향을 결정합니다',
        input: analysis,
        output: null,
        duration: 0,
      })

      const step2Start = Date.now()
      const strategy = this.determineEnhancementStrategy(analysis)
      reasoningSteps[1].output = strategy
      reasoningSteps[1].duration = Date.now() - step2Start

      // Step 3: LLM을 사용한 개선
      reasoningSteps.push({
        step: 3,
        action: 'LLM 프롬프트 개선',
        rationale: 'LLM을 사용하여 프롬프트를 개선합니다',
        input: { prompt, strategy },
        output: null,
        duration: 0,
      })

      const step3Start = Date.now()
      const enhancedPrompt = await this.performLLMEnhancement(prompt, analysis, strategy, context)
      reasoningSteps[2].output = enhancedPrompt
      reasoningSteps[2].duration = Date.now() - step3Start

      // Step 4: 사용자 스타일 적용
      reasoningSteps.push({
        step: 4,
        action: '사용자 스타일 적용',
        rationale: '사용자의 선호 스타일을 반영합니다',
        input: { preferences: context.userProfile.preferences },
        output: null,
        duration: 0,
      })

      const step4Start = Date.now()
      const styledPrompt = this.applyUserStyle(enhancedPrompt, context)
      reasoningSteps[3].output = styledPrompt
      reasoningSteps[3].duration = Date.now() - step4Start

      // 활동 로깅
      await MemoryAgent.logActivity({
        timestamp: Date.now(),
        type: 'agent_invoke',
        action: '프롬프트 개선',
        input: prompt,
        output: styledPrompt,
      })

      const explanation = this.buildEnhancementExplanation(reasoningSteps, prompt, styledPrompt)

      return {
        data: styledPrompt,
        explanation,
        confidence: 0.85,
        processingTime: Date.now() - startTime,
      }
    } catch (error) {
      return {
        data: prompt, // 실패 시 원본 반환
        explanation: this.buildErrorExplanation(error, reasoningSteps),
        confidence: 0.3,
        processingTime: Date.now() - startTime,
      }
    }
  }

  // ── 프롬프트 템플릿 생성 ──

  async generateTemplate(
    task: string,
    domain: string
  ): Promise<AgentResponse<PromptTemplate>> {
    const startTime = Date.now()
    const reasoningSteps: ReasoningStep[] = []

    try {
      // 캐시 확인
      const cacheKey = `${domain}_${task.slice(0, 50)}`
      if (this.templateCache.has(cacheKey)) {
        return {
          data: this.templateCache.get(cacheKey)!,
          explanation: {
            id: `exp_cache_${Date.now()}`,
            decisionType: 'template_generation',
            reasoningSteps: [{
              step: 1,
              action: '캐시 조회',
              rationale: '이전에 생성된 템플릿 재사용',
              input: cacheKey,
              output: 'cache_hit',
              duration: 0,
            }],
            alternatives: [],
            knowledgeUsed: [],
            confidenceFactors: [],
            summary: '캐시된 템플릿 사용',
          },
          confidence: 0.95,
          processingTime: Date.now() - startTime,
        }
      }

      // Step 1: 도메인별 베스트 프랙티스 조회
      reasoningSteps.push({
        step: 1,
        action: '도메인 베스트 프랙티스 조회',
        rationale: '해당 도메인의 프롬프트 작성 모범 사례를 조회합니다',
        input: { domain },
        output: null,
        duration: 0,
      })

      const step1Start = Date.now()
      const bestPractices = this.getDomainBestPractices(domain)
      reasoningSteps[0].output = bestPractices
      reasoningSteps[0].duration = Date.now() - step1Start

      // Step 2: 템플릿 구조 설계
      reasoningSteps.push({
        step: 2,
        action: '템플릿 구조 설계',
        rationale: '작업에 적합한 템플릿 구조를 설계합니다',
        input: { task, bestPractices },
        output: null,
        duration: 0,
      })

      const step2Start = Date.now()
      const structure = this.designTemplateStructure(task, domain, bestPractices)
      reasoningSteps[1].output = structure
      reasoningSteps[1].duration = Date.now() - step2Start

      // Step 3: LLM을 사용한 템플릿 생성
      reasoningSteps.push({
        step: 3,
        action: 'LLM 템플릿 생성',
        rationale: 'LLM을 사용하여 템플릿을 생성합니다',
        input: { task, domain, structure },
        output: null,
        duration: 0,
      })

      const step3Start = Date.now()
      const template = await this.generateTemplateWithLLM(task, domain, structure)
      reasoningSteps[2].output = template
      reasoningSteps[2].duration = Date.now() - step3Start

      // 캐시 저장
      this.templateCache.set(cacheKey, template)

      const explanation = this.buildTemplateExplanation(reasoningSteps, template)

      return {
        data: template,
        explanation,
        confidence: 0.8,
        processingTime: Date.now() - startTime,
      }
    } catch (error) {
      return {
        data: this.getDefaultTemplate(task, domain),
        explanation: this.buildErrorExplanation(error, reasoningSteps),
        confidence: 0.4,
        processingTime: Date.now() - startTime,
      }
    }
  }

  // ── Few-shot 예시 생성 ──

  async generateExamples(
    task: string,
    count: number
  ): Promise<AgentResponse<Example[]>> {
    const startTime = Date.now()
    const reasoningSteps: ReasoningStep[] = []

    try {
      // Step 1: 작업 분석
      reasoningSteps.push({
        step: 1,
        action: '작업 분석',
        rationale: '예시 생성에 필요한 작업 특성을 분석합니다',
        input: task,
        output: null,
        duration: 0,
      })

      const step1Start = Date.now()
      const taskCharacteristics = this.analyzeTaskForExamples(task)
      reasoningSteps[0].output = taskCharacteristics
      reasoningSteps[0].duration = Date.now() - step1Start

      // Step 2: 기존 기억에서 관련 예시 검색
      reasoningSteps.push({
        step: 2,
        action: '관련 예시 검색',
        rationale: '기존 기억에서 유사한 예시를 검색합니다',
        input: { task, limit: count },
        output: null,
        duration: 0,
      })

      const step2Start = Date.now()
      const existingExamples = await this.searchExistingExamples(task, count)
      reasoningSteps[1].output = { found: existingExamples.length }
      reasoningSteps[1].duration = Date.now() - step2Start

      // Step 3: LLM으로 추가 예시 생성
      const neededCount = count - existingExamples.length
      const generatedExamples: Example[] = []

      if (neededCount > 0) {
        reasoningSteps.push({
          step: 3,
          action: 'LLM 예시 생성',
          rationale: `${neededCount}개의 추가 예시를 생성합니다`,
          input: { task, count: neededCount },
          output: null,
          duration: 0,
        })

        const step3Start = Date.now()
        const newExamples = await this.generateExamplesWithLLM(task, neededCount)
        generatedExamples.push(...newExamples)
        reasoningSteps[2].output = { generated: newExamples.length }
        reasoningSteps[2].duration = Date.now() - step3Start
      }

      const allExamples = [...existingExamples, ...generatedExamples].slice(0, count)

      const explanation: XAIExplanation = {
        id: `exp_examples_${Date.now()}`,
        decisionType: 'example_generation',
        reasoningSteps,
        alternatives: [],
        knowledgeUsed: existingExamples.map((_, i) => ({
          type: 'example' as const,
          source: 'memory',
          relevance: 0.9 - i * 0.1,
          summary: `기존 예시 ${i + 1}`,
        })),
        confidenceFactors: [
          {
            factor: '예시 다양성',
            contribution: allExamples.length >= count ? 0.2 : -0.1,
            explanation: `${allExamples.length}/${count}개 예시 생성`,
          },
        ],
        summary: `"${task}" 작업에 대한 ${allExamples.length}개의 few-shot 예시를 생성했습니다.`,
      }

      return {
        data: allExamples,
        explanation,
        confidence: allExamples.length >= count ? 0.85 : 0.6,
        processingTime: Date.now() - startTime,
      }
    } catch (error) {
      return {
        data: [],
        explanation: this.buildErrorExplanation(error, reasoningSteps),
        confidence: 0,
        processingTime: Date.now() - startTime,
      }
    }
  }

  // ── Chain-of-Thought 분해 ──

  async decomposeToChainOfThought(
    task: string
  ): Promise<AgentResponse<ChainOfThoughtStep[]>> {
    const startTime = Date.now()
    const reasoningSteps: ReasoningStep[] = []

    try {
      // Step 1: 작업 복잡도 분석
      reasoningSteps.push({
        step: 1,
        action: '작업 복잡도 분석',
        rationale: '작업의 복잡도와 하위 작업을 식별합니다',
        input: task,
        output: null,
        duration: 0,
      })

      const step1Start = Date.now()
      const complexity = this.calculateComplexity(task)
      const subTasks = this.identifySubTasks(task)
      reasoningSteps[0].output = { complexity, subTaskCount: subTasks.length }
      reasoningSteps[0].duration = Date.now() - step1Start

      // Step 2: LLM으로 CoT 생성
      reasoningSteps.push({
        step: 2,
        action: 'CoT 단계 생성',
        rationale: 'LLM을 사용하여 Chain-of-Thought 단계를 생성합니다',
        input: { task, subTasks },
        output: null,
        duration: 0,
      })

      const step2Start = Date.now()
      const cotSteps = await this.generateCoTWithLLM(task, subTasks)
      reasoningSteps[1].output = { stepCount: cotSteps.length }
      reasoningSteps[1].duration = Date.now() - step2Start

      // Step 3: 단계 검증
      reasoningSteps.push({
        step: 3,
        action: '단계 검증',
        rationale: '생성된 단계의 논리적 일관성을 검증합니다',
        input: cotSteps,
        output: null,
        duration: 0,
      })

      const step3Start = Date.now()
      const validatedSteps = this.validateCoTSteps(cotSteps)
      reasoningSteps[2].output = { valid: validatedSteps.length === cotSteps.length }
      reasoningSteps[2].duration = Date.now() - step3Start

      const explanation: XAIExplanation = {
        id: `exp_cot_${Date.now()}`,
        decisionType: 'cot_decomposition',
        reasoningSteps,
        alternatives: [],
        knowledgeUsed: [],
        confidenceFactors: [
          {
            factor: '단계 완전성',
            contribution: validatedSteps.length === cotSteps.length ? 0.3 : -0.2,
            explanation: '모든 단계가 검증됨',
          },
          {
            factor: '복잡도 적합성',
            contribution: complexity > 3 && cotSteps.length >= complexity ? 0.2 : 0,
            explanation: `복잡도 ${complexity}에 대해 ${cotSteps.length}개 단계`,
          },
        ],
        summary: `"${task.slice(0, 50)}..." 작업을 ${validatedSteps.length}개의 사고 단계로 분해했습니다.`,
      }

      return {
        data: validatedSteps,
        explanation,
        confidence: validatedSteps.length > 0 ? 0.8 : 0.3,
        processingTime: Date.now() - startTime,
      }
    } catch (error) {
      return {
        data: [],
        explanation: this.buildErrorExplanation(error, reasoningSteps),
        confidence: 0,
        processingTime: Date.now() - startTime,
      }
    }
  }

  // ============================================================
  // Private Helper Methods
  // ============================================================

  private performBasicAnalysis(prompt: string): any {
    const words = prompt.split(/\s+/)
    const sentences = prompt.split(/[.!?]+/).filter(s => s.trim())

    return {
      length: prompt.length,
      wordCount: words.length,
      sentenceCount: sentences.length,
      avgWordsPerSentence: words.length / Math.max(1, sentences.length),
      hasQuestionMark: prompt.includes('?'),
      hasNumbers: /\d/.test(prompt),
      hasSpecialChars: /[<>{}[\]`]/.test(prompt),
      inferredIntent: this.inferBasicIntent(prompt),
    }
  }

  private inferBasicIntent(prompt: string): string {
    const lower = prompt.toLowerCase()
    if (lower.includes('만들') || lower.includes('생성') || lower.includes('작성')) return 'create'
    if (lower.includes('수정') || lower.includes('변경') || lower.includes('업데이트')) return 'modify'
    if (lower.includes('삭제') || lower.includes('제거')) return 'delete'
    if (lower.includes('찾') || lower.includes('검색') || lower.includes('조회')) return 'search'
    if (lower.includes('분석') || lower.includes('평가')) return 'analyze'
    if (lower.includes('설명') || lower.includes('알려')) return 'explain'
    return 'general'
  }

  private detectDomain(prompt: string): string {
    const lower = prompt.toLowerCase()
    let maxScore = 0
    let detectedDomain = 'general'

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      const score = keywords.reduce((acc, kw) => {
        return acc + (lower.includes(kw.toLowerCase()) ? 1 : 0)
      }, 0)

      if (score > maxScore) {
        maxScore = score
        detectedDomain = domain
      }
    }

    return detectedDomain
  }

  private calculateComplexity(prompt: string): number {
    let complexity = 3 // 기본 복잡도

    // 길이 기반
    if (prompt.length > 200) complexity += 1
    if (prompt.length > 500) complexity += 1

    // 복잡도 지표 기반
    for (const [indicator, weight] of Object.entries(COMPLEXITY_INDICATORS)) {
      if (prompt.includes(indicator)) {
        complexity += weight
      }
    }

    // 문장 수 기반
    const sentenceCount = prompt.split(/[.!?]+/).filter(s => s.trim()).length
    if (sentenceCount > 3) complexity += 0.5
    if (sentenceCount > 5) complexity += 0.5

    return Math.min(10, Math.max(1, Math.round(complexity)))
  }

  private async performLLMAnalysis(prompt: string, domain: string): Promise<any> {
    const analysisPrompt = `
다음 프롬프트를 분석하세요:
"${prompt}"

도메인: ${domain}

JSON 형식으로 응답하세요:
{
  "intent": "주요 의도 (한 문장)",
  "missingInfo": ["누락된 정보 목록"],
  "ambiguities": ["모호한 부분 목록"],
  "strengths": ["잘 된 점"],
  "weaknesses": ["개선이 필요한 점"]
}
`

    try {
      const response = await invoke<any>('invoke_bedrock', {
        request: {
          model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
          prompt: analysisPrompt,
          system_prompt: SYSTEM_PROMPT,
          max_tokens: 1024,
          temperature: 0.3,
        },
      })

      const jsonMatch = response.response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch (error) {
      console.warn('[PromptEngineerAgent] LLM 분석 실패:', error)
    }

    return {
      intent: '',
      missingInfo: [],
      ambiguities: [],
      strengths: [],
      weaknesses: [],
    }
  }

  private async getUserPatterns(context: AgentContext): Promise<any[]> {
    const patterns = context.userProfile.behaviorPatterns
      .filter(p => p.type === 'prompt')
      .slice(0, 5)

    return patterns
  }

  private calculateClarityScore(prompt: string, analysis: any): number {
    let score = 0.7 // 기본 점수

    // 모호성 감점
    if (analysis.ambiguities?.length > 0) {
      score -= analysis.ambiguities.length * 0.1
    }

    // 명확한 의도 가점
    if (analysis.intent && analysis.intent.length > 0) {
      score += 0.1
    }

    // 적절한 길이 가점
    if (prompt.length >= 20 && prompt.length <= 500) {
      score += 0.1
    }

    return Math.max(0, Math.min(1, score))
  }

  private calculateSpecificityScore(prompt: string, analysis: any): number {
    let score = 0.6 // 기본 점수

    // 누락 정보 감점
    if (analysis.missingInfo?.length > 0) {
      score -= analysis.missingInfo.length * 0.1
    }

    // 숫자/구체적 수치 포함 가점
    if (/\d+/.test(prompt)) {
      score += 0.1
    }

    // 구체적 키워드 가점
    if (/정확히|구체적|자세히|예를 들어/.test(prompt)) {
      score += 0.1
    }

    return Math.max(0, Math.min(1, score))
  }

  private generateSuggestions(prompt: string, analysis: any, userPatterns: any[]): string[] {
    const suggestions: string[] = []

    // 누락 정보 기반 제안
    if (analysis.missingInfo?.length > 0) {
      suggestions.push(`다음 정보를 추가하세요: ${analysis.missingInfo.join(', ')}`)
    }

    // 모호성 기반 제안
    if (analysis.ambiguities?.length > 0) {
      suggestions.push(`다음 부분을 명확히 하세요: ${analysis.ambiguities.join(', ')}`)
    }

    // 길이 기반 제안
    if (prompt.length < 20) {
      suggestions.push('프롬프트를 더 자세하게 작성하세요')
    }

    // 사용자 패턴 기반 제안
    if (userPatterns.length > 0) {
      const pattern = userPatterns[0]
      if (pattern.description) {
        suggestions.push(`이전 패턴 참고: ${pattern.description}`)
      }
    }

    return suggestions
  }

  private getDefaultAnalysis(prompt: string): PromptAnalysis {
    return {
      intent: this.inferBasicIntent(prompt),
      clarityScore: 0.5,
      specificityScore: 0.5,
      missingInfo: [],
      ambiguities: [],
      suggestions: ['프롬프트를 더 구체적으로 작성해보세요'],
      detectedDomain: this.detectDomain(prompt),
      complexity: this.calculateComplexity(prompt),
    }
  }

  private determineEnhancementStrategy(analysis: PromptAnalysis): string[] {
    const strategies: string[] = []

    if (analysis.clarityScore < 0.7) {
      strategies.push('improve_clarity')
    }
    if (analysis.specificityScore < 0.7) {
      strategies.push('add_specificity')
    }
    if (analysis.missingInfo.length > 0) {
      strategies.push('fill_gaps')
    }
    if (analysis.ambiguities.length > 0) {
      strategies.push('resolve_ambiguity')
    }
    if (analysis.complexity > 7) {
      strategies.push('simplify')
    }

    return strategies.length > 0 ? strategies : ['general_improvement']
  }

  private async performLLMEnhancement(
    prompt: string,
    analysis: PromptAnalysis,
    strategy: string[],
    context: AgentContext
  ): Promise<string> {
    const enhancePrompt = `
다음 프롬프트를 개선하세요:
"${prompt}"

분석 결과:
- 의도: ${analysis.intent}
- 명확성: ${analysis.clarityScore * 100}%
- 구체성: ${analysis.specificityScore * 100}%
- 누락 정보: ${analysis.missingInfo.join(', ') || '없음'}
- 모호한 부분: ${analysis.ambiguities.join(', ') || '없음'}

개선 전략: ${strategy.join(', ')}

사용자 선호:
- 상세 수준: ${context.userProfile.preferences.detailLevel}/5
- 언어: ${context.userProfile.preferences.language}

개선된 프롬프트만 출력하세요 (설명 없이):
`

    try {
      const response = await invoke<any>('invoke_bedrock', {
        request: {
          model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
          prompt: enhancePrompt,
          system_prompt: SYSTEM_PROMPT,
          max_tokens: 2048,
          temperature: 0.5,
        },
      })

      return response.response.trim()
    } catch (error) {
      console.warn('[PromptEngineerAgent] LLM 개선 실패:', error)
      return prompt
    }
  }

  private applyUserStyle(prompt: string, context: AgentContext): string {
    const { preferences } = context.userProfile

    // 상세 수준에 따른 조정
    if (preferences.detailLevel >= 4 && prompt.length < 100) {
      prompt = prompt + '\n\n상세하고 구체적인 응답을 부탁드립니다.'
    }

    // 커스텀 시스템 프롬프트 반영
    if (preferences.customSystemPrompt) {
      prompt = `[컨텍스트: ${preferences.customSystemPrompt}]\n\n${prompt}`
    }

    return prompt
  }

  private getDomainBestPractices(domain: string): string[] {
    const practices: Record<string, string[]> = {
      coding: [
        '프로그래밍 언어 명시',
        '입력/출력 형식 정의',
        '에러 처리 요구사항',
        '코드 스타일 가이드',
      ],
      data: [
        '데이터 소스 명시',
        '출력 형식 정의',
        '분석 목적 설명',
        '시각화 요구사항',
      ],
      writing: [
        '목적과 대상 독자',
        '톤앤매너 지정',
        '길이 제한',
        '필수 포함 내용',
      ],
      rag: [
        '검색 범위 지정',
        '출처 인용 요구',
        '답변 형식 정의',
        '관련성 기준',
      ],
      workflow: [
        '입력 데이터 정의',
        '처리 단계 나열',
        '출력 형식 정의',
        '오류 처리 방법',
      ],
      agent: [
        '페르소나 정의',
        '전문성 수준',
        '평가 기준',
        '의사결정 방식',
      ],
    }

    return practices[domain] || ['명확한 목표 정의', '구체적 요구사항', '예상 출력 형식']
  }

  private designTemplateStructure(task: string, domain: string, bestPractices: string[]): any {
    return {
      sections: [
        { name: 'context', description: '배경 및 목적' },
        { name: 'task', description: '수행할 작업' },
        { name: 'requirements', description: '요구사항' },
        { name: 'format', description: '출력 형식' },
      ],
      variables: bestPractices.map((bp, i) => ({
        name: `var_${i}`,
        description: bp,
        required: i < 2,
      })),
    }
  }

  private async generateTemplateWithLLM(
    task: string,
    domain: string,
    structure: any
  ): Promise<PromptTemplate> {
    const prompt = `
다음 작업을 위한 프롬프트 템플릿을 생성하세요:
작업: ${task}
도메인: ${domain}
구조: ${JSON.stringify(structure)}

JSON 형식으로 응답하세요:
{
  "name": "템플릿 이름",
  "template": "템플릿 텍스트 (변수는 {{variable_name}} 형식)",
  "variables": [
    {"name": "변수명", "description": "설명", "type": "string", "required": true}
  ],
  "examples": [
    {"input": "입력 예시", "output": "출력 예시"}
  ]
}
`

    try {
      const response = await invoke<any>('invoke_bedrock', {
        request: {
          model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
          prompt,
          system_prompt: SYSTEM_PROMPT,
          max_tokens: 2048,
          temperature: 0.5,
        },
      })

      const jsonMatch = response.response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          id: `template_${Date.now()}`,
          name: parsed.name || task,
          template: parsed.template || '',
          variables: parsed.variables || [],
          examples: parsed.examples || [],
        }
      }
    } catch (error) {
      console.warn('[PromptEngineerAgent] 템플릿 생성 실패:', error)
    }

    return this.getDefaultTemplate(task, domain)
  }

  private getDefaultTemplate(task: string, domain: string): PromptTemplate {
    return {
      id: `template_default_${Date.now()}`,
      name: `${domain} - ${task}`,
      template: `## 목표\n{{goal}}\n\n## 요구사항\n{{requirements}}\n\n## 출력 형식\n{{format}}`,
      variables: [
        { name: 'goal', description: '수행할 목표', type: 'string', required: true },
        { name: 'requirements', description: '상세 요구사항', type: 'string', required: true },
        { name: 'format', description: '원하는 출력 형식', type: 'string', required: false },
      ],
      examples: [],
    }
  }

  private analyzeTaskForExamples(task: string): any {
    return {
      keywords: task.match(/\b\w{4,}\b/g) || [],
      expectedInputType: 'text',
      expectedOutputType: 'text',
    }
  }

  private async searchExistingExamples(task: string, limit: number): Promise<Example[]> {
    const memories = await MemoryAgent.search(task, limit)
    return memories
      .filter(m => m.category === 'example')
      .map(m => ({
        input: m.value.input || '',
        output: m.value.output || '',
        explanation: m.value.explanation,
      }))
  }

  private async generateExamplesWithLLM(task: string, count: number): Promise<Example[]> {
    const prompt = `
다음 작업에 대한 ${count}개의 few-shot 예시를 생성하세요:
"${task}"

JSON 배열로 응답하세요:
[
  {"input": "입력 예시", "output": "출력 예시", "explanation": "설명"}
]
`

    try {
      const response = await invoke<any>('invoke_bedrock', {
        request: {
          model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
          prompt,
          system_prompt: SYSTEM_PROMPT,
          max_tokens: 2048,
          temperature: 0.7,
        },
      })

      const jsonMatch = response.response.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch (error) {
      console.warn('[PromptEngineerAgent] 예시 생성 실패:', error)
    }

    return []
  }

  private identifySubTasks(task: string): string[] {
    // 단순 분해: 접속사 기준 분리
    const subTasks = task
      .split(/그리고|또한|다음으로|그 다음|그런 다음/)
      .map(s => s.trim())
      .filter(s => s.length > 5)

    return subTasks
  }

  private async generateCoTWithLLM(task: string, subTasks: string[]): Promise<ChainOfThoughtStep[]> {
    const prompt = `
다음 작업을 Chain-of-Thought 단계로 분해하세요:
"${task}"

하위 작업: ${subTasks.join(', ')}

JSON 배열로 응답하세요:
[
  {
    "step": 1,
    "thought": "이 단계에서 생각할 것",
    "action": "수행할 행동",
    "expectedOutcome": "예상 결과"
  }
]
`

    try {
      const response = await invoke<any>('invoke_bedrock', {
        request: {
          model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
          prompt,
          system_prompt: SYSTEM_PROMPT,
          max_tokens: 2048,
          temperature: 0.5,
        },
      })

      const jsonMatch = response.response.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch (error) {
      console.warn('[PromptEngineerAgent] CoT 생성 실패:', error)
    }

    // 폴백: 기본 단계
    return [
      { step: 1, thought: '문제 이해', action: '요구사항 분석', expectedOutcome: '명확한 목표 정의' },
      { step: 2, thought: '접근법 결정', action: '적절한 방법 선택', expectedOutcome: '실행 계획' },
      { step: 3, thought: '실행', action: '계획 수행', expectedOutcome: '결과물 생성' },
      { step: 4, thought: '검증', action: '결과 확인', expectedOutcome: '최종 출력' },
    ]
  }

  private validateCoTSteps(steps: ChainOfThoughtStep[]): ChainOfThoughtStep[] {
    return steps.filter(step =>
      step.step != null &&
      step.thought &&
      step.action &&
      step.expectedOutcome
    )
  }

  private buildExplanation(reasoningSteps: ReasoningStep[], analysis: PromptAnalysis): XAIExplanation {
    return {
      id: `exp_analysis_${Date.now()}`,
      decisionType: 'prompt_analysis',
      reasoningSteps,
      alternatives: [],
      knowledgeUsed: [],
      confidenceFactors: [
        {
          factor: '프롬프트 명확성',
          contribution: analysis.clarityScore - 0.5,
          explanation: `명확성 점수: ${(analysis.clarityScore * 100).toFixed(0)}%`,
        },
        {
          factor: '프롬프트 구체성',
          contribution: analysis.specificityScore - 0.5,
          explanation: `구체성 점수: ${(analysis.specificityScore * 100).toFixed(0)}%`,
        },
      ],
      summary: `프롬프트 분석 완료: 도메인=${analysis.detectedDomain}, 복잡도=${analysis.complexity}/10`,
    }
  }

  private buildEnhancementExplanation(
    reasoningSteps: ReasoningStep[],
    original: string,
    enhanced: string
  ): XAIExplanation {
    const improvement = enhanced.length > original.length
      ? `${enhanced.length - original.length}자 추가`
      : `${original.length - enhanced.length}자 감소`

    return {
      id: `exp_enhance_${Date.now()}`,
      decisionType: 'prompt_enhancement',
      reasoningSteps,
      alternatives: [],
      knowledgeUsed: [],
      confidenceFactors: [
        {
          factor: '개선 정도',
          contribution: enhanced !== original ? 0.3 : -0.2,
          explanation: improvement,
        },
      ],
      summary: `프롬프트 개선 완료 (${improvement})`,
    }
  }

  private buildTemplateExplanation(
    reasoningSteps: ReasoningStep[],
    template: PromptTemplate
  ): XAIExplanation {
    return {
      id: `exp_template_${Date.now()}`,
      decisionType: 'template_generation',
      reasoningSteps,
      alternatives: [],
      knowledgeUsed: [],
      confidenceFactors: [
        {
          factor: '변수 완성도',
          contribution: template.variables.length > 0 ? 0.2 : -0.1,
          explanation: `${template.variables.length}개 변수 정의`,
        },
        {
          factor: '예시 제공',
          contribution: template.examples.length > 0 ? 0.2 : 0,
          explanation: `${template.examples.length}개 예시 포함`,
        },
      ],
      summary: `템플릿 "${template.name}" 생성 완료`,
    }
  }

  private buildErrorExplanation(error: any, reasoningSteps: ReasoningStep[]): XAIExplanation {
    return {
      id: `exp_error_${Date.now()}`,
      decisionType: 'error',
      reasoningSteps,
      alternatives: [],
      knowledgeUsed: [],
      confidenceFactors: [],
      summary: `오류 발생: ${error?.message || error}`,
    }
  }

  // ============================================================
  // 전략 기반 프롬프트 변환 (강화학습 시스템 연동)
  // ============================================================

  /**
   * 전략 시스템을 사용한 프롬프트 변환
   *
   * @param prompt 원본 프롬프트
   * @param options 전략 옵션
   * @returns 변환된 프롬프트 및 전략 정보
   */
  async transformWithStrategy(
    prompt: string,
    options: {
      domain?: string
      complexity?: number
      examples?: Array<{ input: string; output: string }>
      preferredStrategy?: string
      maxTokens?: number
      maxTime?: number
    } = {}
  ): Promise<{
    originalPrompt: string
    transformedPrompt: string
    systemPrompt?: string
    selectedStrategy: string
    confidence: number
    alternatives: Array<{ id: string; score: number }>
    metadata: {
      tokensAdded: number
      transformationSteps: string[]
    }
  }> {
    // 동적 import로 순환 참조 방지
    const { PromptStrategyRegistry } = await import('../services/PromptStrategyRegistry')

    // 컨텍스트 구성
    const context = {
      originalPrompt: prompt,
      domain: options.domain,
      complexity: options.complexity || this.calculateComplexity(prompt),
      examples: options.examples?.map((ex, i) => ({
        input: ex.input,
        output: ex.output,
        domain: options.domain,
      })),
      constraints: {
        maxTokens: options.maxTokens,
        maxTime: options.maxTime,
      },
      userPreferences: {
        detailLevel: 3,
        language: 'ko',
      },
    }

    // 전략 자동 선택 및 적용
    const { selection, result } = await PromptStrategyRegistry.autoApply(prompt, context)

    return {
      originalPrompt: prompt,
      transformedPrompt: result.transformedPrompt,
      systemPrompt: result.systemPrompt,
      selectedStrategy: selection.selectedStrategy,
      confidence: selection.confidence,
      alternatives: selection.alternatives.map(a => ({
        id: a.strategyId,
        score: a.score,
      })),
      metadata: {
        tokensAdded: result.additionalTokens,
        transformationSteps: result.metadata.transformationSteps,
      },
    }
  }

  /**
   * 전략 결과 평가 및 학습
   *
   * @param strategyId 사용된 전략
   * @param prompt 원본 프롬프트
   * @param success 성공 여부
   * @param qualityScore 품질 점수 (1-10)
   * @param duration 소요 시간 (ms)
   */
  async evaluateAndLearn(
    strategyId: string,
    prompt: string,
    success: boolean,
    qualityScore: number,
    duration: number,
    domain?: string
  ): Promise<{
    rewardPenalty: number
    weightUpdate: { delta: number; newWeight: number }
    feedback: string
  }> {
    // 동적 import
    const { PromptStrategyEvaluator } = await import('../services/PromptStrategyEvaluator')
    const { PromptStrategyRegistry } = await import('../services/PromptStrategyRegistry')

    // 더미 result (실제 결과가 없는 경우)
    const dummyResult = {
      transformedPrompt: prompt,
      examplesUsed: 0,
      additionalTokens: 0,
      metadata: {
        strategyId: strategyId as any,
        appliedAt: Date.now(),
        transformationSteps: [],
      },
    }

    // 평가 수행
    const evaluation = PromptStrategyEvaluator.evaluate(
      strategyId as any,
      prompt,
      dummyResult,
      duration,
      success,
      qualityScore,
      domain || 'general'
    )

    // 피드백 생성
    let feedback = ''
    if (evaluation.rewardPenalty.total > 2) {
      feedback = `🚀 우수한 성과! 전략 "${strategyId}"의 가중치가 상향 조정됩니다.`
    } else if (evaluation.rewardPenalty.total > 0) {
      feedback = `✅ 양호한 성과. 전략 가중치가 소폭 상향됩니다.`
    } else if (evaluation.rewardPenalty.total < -2) {
      feedback = `⚠️ 개선 필요. 전략 "${strategyId}"의 가중치가 하향 조정됩니다.`
    } else {
      feedback = `📊 보통 성과. 전략 가중치가 유지됩니다.`
    }

    return {
      rewardPenalty: evaluation.rewardPenalty.total,
      weightUpdate: evaluation.weightUpdate,
      feedback,
    }
  }

  /**
   * 전략 통계 조회
   */
  async getStrategyStatistics(): Promise<{
    totalStrategies: number
    totalUsage: number
    topStrategies: Array<{ id: string; uses: number; successRate: number }>
    rewardDistribution: { positive: number; neutral: number; negative: number }
  }> {
    const { PromptStrategyRegistry } = await import('../services/PromptStrategyRegistry')
    const { PromptStrategyEvaluator } = await import('../services/PromptStrategyEvaluator')

    const registryStats = PromptStrategyRegistry.getStatistics()
    const evaluatorStats = PromptStrategyEvaluator.getOverallStats()

    return {
      totalStrategies: registryStats.totalStrategies,
      totalUsage: evaluatorStats.totalEvaluations,
      topStrategies: registryStats.topStrategies.map(s => ({
        id: s.id,
        uses: s.uses,
        successRate: s.successRate,
      })),
      rewardDistribution: evaluatorStats.rewardDistribution,
    }
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const PromptEngineerAgent = new PromptEngineerAgentImpl()
