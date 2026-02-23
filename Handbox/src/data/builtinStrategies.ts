/**
 * Built-in Prompt Strategies - 내장 프롬프트 전략 정의
 *
 * 검증된 프롬프트 엔지니어링 기법들:
 * - Simple: 직접적인 질문
 * - Few-shot: 예시 기반 학습
 * - Chain-of-Thought: 단계별 추론
 * - Tree-of-Thought: 분기 탐색
 * - ReAct: 추론 + 행동
 * - 기타 고급 기법들
 */

import type {
  PromptStrategy,
  PromptStrategyType,
  StrategyContext,
  StrategyResult,
  StrategyExample,
} from '../types/PromptStrategyTypes'

// ============================================================
// 전략 적용 헬퍼 함수
// ============================================================

/**
 * 기본 결과 생성
 */
function createResult(
  prompt: string,
  strategyId: PromptStrategyType,
  options: Partial<StrategyResult> = {}
): StrategyResult {
  return {
    transformedPrompt: prompt,
    systemPrompt: options.systemPrompt,
    examplesUsed: options.examplesUsed || 0,
    additionalTokens: options.additionalTokens || 0,
    metadata: {
      strategyId,
      appliedAt: Date.now(),
      transformationSteps: options.metadata?.transformationSteps || [],
    },
  }
}

/**
 * 예시 포맷팅
 */
function formatExamples(examples: StrategyExample[], maxCount: number = 3): string {
  const selected = examples.slice(0, maxCount)
  return selected
    .map((ex, i) => `예시 ${i + 1}:\n입력: ${ex.input}\n출력: ${ex.output}${ex.explanation ? `\n설명: ${ex.explanation}` : ''}`)
    .join('\n\n')
}

/**
 * 토큰 수 추정
 */
function estimateTokens(text: string): number {
  // 한글은 대략 1.5토큰/글자, 영어는 0.25토큰/단어
  const koreanChars = (text.match(/[가-힣]/g) || []).length
  const otherChars = text.length - koreanChars
  return Math.round(koreanChars * 1.5 + otherChars * 0.4)
}

// ============================================================
// 내장 전략 정의
// ============================================================

/**
 * Simple Strategy - 단순 직접 질문
 */
export const SimpleStrategy: PromptStrategy = {
  id: 'simple',
  name: '단순 프롬프트',
  description: '직접적인 질문으로 최소한의 오버헤드로 빠른 응답을 얻습니다.',
  category: 'basic',
  suitableFor: ['간단한 질문', '사실 확인', '번역', '요약', '단순 변환'],
  notSuitableFor: ['복잡한 추론', '다단계 문제', '창의적 작업'],
  complexityThreshold: { min: 1, max: 4 },
  tokenOverhead: 1.0,
  timeMultiplier: 1.0,
  isBuiltin: true,

  apply: async (prompt: string, context: StrategyContext): Promise<StrategyResult> => {
    // 단순 전략은 프롬프트를 그대로 사용
    return createResult(prompt, 'simple', {
      additionalTokens: 0,
      metadata: {
        strategyId: 'simple',
        appliedAt: Date.now(),
        transformationSteps: ['원본 프롬프트 유지'],
      },
    })
  },
}

/**
 * Few-shot Strategy - 예시 기반 학습
 */
export const FewShotStrategy: PromptStrategy = {
  id: 'few-shot',
  name: 'Few-shot Learning',
  description: '2-5개의 예시를 제공하여 모델이 패턴을 학습하도록 합니다.',
  category: 'learning',
  suitableFor: ['분류', '포맷 변환', '스타일 모방', '패턴 인식', '일관성 있는 출력'],
  notSuitableFor: ['고유한 창의적 작업', '예시가 없는 경우', '실시간 정보 필요'],
  complexityThreshold: { min: 2, max: 7 },
  tokenOverhead: 2.5,
  timeMultiplier: 1.2,
  isBuiltin: true,

  apply: async (prompt: string, context: StrategyContext): Promise<StrategyResult> => {
    const examples = context.examples || []

    if (examples.length === 0) {
      // 예시가 없으면 기본 형식 사용
      const transformed = `다음 작업을 수행해주세요.

${prompt}

형식을 일관되게 유지하며 응답해주세요.`

      return createResult(transformed, 'few-shot', {
        examplesUsed: 0,
        additionalTokens: estimateTokens(transformed) - estimateTokens(prompt),
        metadata: {
          strategyId: 'few-shot',
          appliedAt: Date.now(),
          transformationSteps: ['예시 없음 - 기본 형식 사용'],
        },
      })
    }

    const formattedExamples = formatExamples(examples, 3)
    const transformed = `다음 예시들을 참고하여 작업을 수행해주세요.

${formattedExamples}

---

이제 다음 입력에 대해 같은 방식으로 응답해주세요:
${prompt}`

    return createResult(transformed, 'few-shot', {
      examplesUsed: Math.min(examples.length, 3),
      additionalTokens: estimateTokens(transformed) - estimateTokens(prompt),
      metadata: {
        strategyId: 'few-shot',
        appliedAt: Date.now(),
        transformationSteps: [
          `${Math.min(examples.length, 3)}개 예시 선택`,
          '예시 포맷팅',
          '프롬프트 구성',
        ],
      },
    })
  },
}

/**
 * Zero-shot Chain-of-Thought Strategy
 */
export const ZeroShotCoTStrategy: PromptStrategy = {
  id: 'zero-shot-cot',
  name: 'Zero-shot Chain-of-Thought',
  description: '"단계별로 생각해보면..." 프롬프트를 추가하여 추론 능력을 향상시킵니다.',
  category: 'reasoning',
  suitableFor: ['수학 문제', '논리 추론', '계획 수립', '문제 해결', '분석'],
  notSuitableFor: ['단순 사실 질문', '번역', '간단한 분류'],
  complexityThreshold: { min: 4, max: 9 },
  tokenOverhead: 1.3,
  timeMultiplier: 1.5,
  isBuiltin: true,

  apply: async (prompt: string, context: StrategyContext): Promise<StrategyResult> => {
    const cotTrigger = context.userPreferences?.language === 'en'
      ? "Let's think step by step."
      : '단계별로 생각해보겠습니다.'

    const transformed = `${prompt}

${cotTrigger}

각 단계를 명확히 설명하고, 최종 결론을 도출해주세요.`

    return createResult(transformed, 'zero-shot-cot', {
      additionalTokens: estimateTokens(transformed) - estimateTokens(prompt),
      metadata: {
        strategyId: 'zero-shot-cot',
        appliedAt: Date.now(),
        transformationSteps: ['CoT 트리거 추가', '단계별 설명 요청'],
      },
    })
  },
}

/**
 * Few-shot Chain-of-Thought Strategy
 */
export const FewShotCoTStrategy: PromptStrategy = {
  id: 'few-shot-cot',
  name: 'Few-shot Chain-of-Thought',
  description: '추론 과정이 포함된 예시를 제공하여 복잡한 문제 해결 능력을 향상시킵니다.',
  category: 'reasoning',
  suitableFor: ['복잡한 수학', '다단계 추론', '의사결정', '전략 수립'],
  notSuitableFor: ['간단한 작업', '토큰 제한이 있는 경우'],
  complexityThreshold: { min: 5, max: 10 },
  tokenOverhead: 3.0,
  timeMultiplier: 1.8,
  isBuiltin: true,

  apply: async (prompt: string, context: StrategyContext): Promise<StrategyResult> => {
    const examples = context.examples || []

    // CoT 예시 생성 (도메인에 따라)
    const cotExample = `예시:
질문: 한 상점에서 사과 3개를 1000원에 팔고 있습니다. 15개를 사려면 얼마가 필요할까요?

풀이 과정:
1. 먼저 사과 1개의 가격을 계산합니다: 1000원 ÷ 3 = 약 333.33원
2. 15개의 가격을 계산합니다: 333.33원 × 15 = 5000원
3. 또는 직접 계산: (15 ÷ 3) × 1000 = 5 × 1000 = 5000원

답: 5000원이 필요합니다.`

    const transformed = `다음 예시처럼 단계별로 추론하며 답을 도출해주세요.

${cotExample}

---

이제 다음 문제를 같은 방식으로 풀어주세요:
${prompt}

단계별로 명확하게 설명하고 최종 답을 제시해주세요.`

    return createResult(transformed, 'few-shot-cot', {
      examplesUsed: 1,
      additionalTokens: estimateTokens(transformed) - estimateTokens(prompt),
      metadata: {
        strategyId: 'few-shot-cot',
        appliedAt: Date.now(),
        transformationSteps: ['CoT 예시 생성', '단계별 추론 요청', '프롬프트 구성'],
      },
    })
  },
}

/**
 * Tree-of-Thought Strategy
 */
export const TreeOfThoughtStrategy: PromptStrategy = {
  id: 'tree-of-thought',
  name: 'Tree-of-Thought',
  description: '여러 사고 경로를 탐색하고 평가하여 최적의 해결책을 찾습니다.',
  category: 'advanced',
  suitableFor: ['복잡한 문제 해결', '창의적 발상', '전략 비교', '의사결정'],
  notSuitableFor: ['단순 질문', '시간 제한 있는 경우', '토큰 제한'],
  complexityThreshold: { min: 7, max: 10 },
  tokenOverhead: 4.0,
  timeMultiplier: 2.5,
  isBuiltin: true,

  apply: async (prompt: string, context: StrategyContext): Promise<StrategyResult> => {
    const transformed = `다음 문제에 대해 여러 접근법을 탐색해주세요.

문제: ${prompt}

## 접근법 1
- 아이디어:
- 장점:
- 단점:
- 예상 결과:

## 접근법 2
- 아이디어:
- 장점:
- 단점:
- 예상 결과:

## 접근법 3
- 아이디어:
- 장점:
- 단점:
- 예상 결과:

## 최종 선택
각 접근법을 비교 평가하고, 가장 적합한 접근법을 선택하여 상세히 설명해주세요.
선택 이유도 함께 제시해주세요.`

    return createResult(transformed, 'tree-of-thought', {
      additionalTokens: estimateTokens(transformed) - estimateTokens(prompt),
      metadata: {
        strategyId: 'tree-of-thought',
        appliedAt: Date.now(),
        transformationSteps: ['다중 경로 프레임워크 생성', '비교 평가 요청'],
      },
    })
  },
}

/**
 * Self-Consistency Strategy
 */
export const SelfConsistencyStrategy: PromptStrategy = {
  id: 'self-consistency',
  name: 'Self-Consistency',
  description: '여러 번 독립적으로 추론하고 다수결로 최종 답을 선택합니다.',
  category: 'advanced',
  suitableFor: ['정확도가 중요한 문제', '수학', '논리 퍼즐', '검증 필요한 경우'],
  notSuitableFor: ['창의적 작업', '주관적 평가', '비용 제한'],
  complexityThreshold: { min: 5, max: 10 },
  tokenOverhead: 5.0,
  timeMultiplier: 3.0,
  isBuiltin: true,

  apply: async (prompt: string, context: StrategyContext): Promise<StrategyResult> => {
    const transformed = `다음 문제를 3가지 다른 방식으로 독립적으로 풀어주세요.

문제: ${prompt}

## 풀이 1 (방법 A)
[여기에 첫 번째 접근 방식으로 풀이]

## 풀이 2 (방법 B)
[여기에 두 번째 접근 방식으로 풀이]

## 풀이 3 (방법 C)
[여기에 세 번째 접근 방식으로 풀이]

## 최종 답
각 풀이의 결과를 비교하고, 가장 일관된 답을 최종 답으로 선택해주세요.
불일치가 있다면 왜 그런지 분석해주세요.`

    return createResult(transformed, 'self-consistency', {
      additionalTokens: estimateTokens(transformed) - estimateTokens(prompt),
      metadata: {
        strategyId: 'self-consistency',
        appliedAt: Date.now(),
        transformationSteps: ['다중 풀이 요청', '일관성 검증 요청'],
      },
    })
  },
}

/**
 * ReAct Strategy (Reasoning + Acting)
 */
export const ReActStrategy: PromptStrategy = {
  id: 'react',
  name: 'ReAct (Reasoning + Acting)',
  description: '생각(Thought) → 행동(Action) → 관찰(Observation) 순환을 통해 문제를 해결합니다.',
  category: 'advanced',
  suitableFor: ['도구 사용', '정보 검색', '다단계 작업', '에이전트 태스크'],
  notSuitableFor: ['단순 생성', '도구가 없는 경우'],
  complexityThreshold: { min: 5, max: 10 },
  tokenOverhead: 2.0,
  timeMultiplier: 2.0,
  isBuiltin: true,

  apply: async (prompt: string, context: StrategyContext): Promise<StrategyResult> => {
    const systemPrompt = `당신은 ReAct 에이전트입니다. 다음 형식으로 응답하세요:

Thought: [현재 상황 분석 및 다음 행동 계획]
Action: [수행할 행동] (예: Search, Calculate, Lookup, Finish)
Action Input: [행동에 필요한 입력]
Observation: [행동 결과]

위 과정을 문제가 해결될 때까지 반복하세요.
최종적으로 Action: Finish와 함께 최종 답을 제시하세요.`

    const transformed = `Task: ${prompt}

다음 형식으로 단계별로 진행해주세요:

Thought 1: [현재 무엇을 알고 있고, 무엇을 알아야 하는지 분석]
Action 1: [첫 번째 행동]
Action Input 1: [행동 입력]
Observation 1: [예상 결과]

...

최종적으로 문제가 해결되면:
Action: Finish
Final Answer: [최종 답]`

    return createResult(transformed, 'react', {
      systemPrompt,
      additionalTokens: estimateTokens(transformed) - estimateTokens(prompt),
      metadata: {
        strategyId: 'react',
        appliedAt: Date.now(),
        transformationSteps: ['ReAct 시스템 프롬프트 설정', 'Thought-Action 형식 적용'],
      },
    })
  },
}

/**
 * Decomposition Strategy - 문제 분해
 */
export const DecompositionStrategy: PromptStrategy = {
  id: 'decomposition',
  name: 'Task Decomposition',
  description: '큰 문제를 작은 하위 문제로 분해하여 순차적으로 해결합니다.',
  category: 'reasoning',
  suitableFor: ['복잡한 프로젝트', '다단계 작업', '장문 생성', '계획 수립'],
  notSuitableFor: ['간단한 질문', '원자적 작업'],
  complexityThreshold: { min: 5, max: 10 },
  tokenOverhead: 2.0,
  timeMultiplier: 1.5,
  isBuiltin: true,

  apply: async (prompt: string, context: StrategyContext): Promise<StrategyResult> => {
    const transformed = `다음 작업을 수행해야 합니다:
${prompt}

## 1단계: 문제 분해
이 작업을 완료하기 위해 필요한 하위 작업들을 나열해주세요.

## 2단계: 순서 정렬
하위 작업들을 수행해야 할 순서대로 정렬해주세요.

## 3단계: 순차 실행
각 하위 작업을 순서대로 수행하고, 결과를 기록해주세요.

## 4단계: 통합
모든 하위 작업의 결과를 통합하여 최종 결과물을 제시해주세요.`

    return createResult(transformed, 'decomposition', {
      additionalTokens: estimateTokens(transformed) - estimateTokens(prompt),
      metadata: {
        strategyId: 'decomposition',
        appliedAt: Date.now(),
        transformationSteps: ['문제 분해 프레임워크 적용', '단계별 실행 요청'],
      },
    })
  },
}

/**
 * Role-play Strategy - 역할극 (페르소나)
 */
export const RolePlayStrategy: PromptStrategy = {
  id: 'role-play',
  name: 'Role-play / Persona',
  description: '특정 전문가 역할을 부여하여 해당 관점에서 응답하도록 합니다.',
  category: 'basic',
  suitableFor: ['전문 분야 질문', '다양한 관점 필요', '조언 요청', '시뮬레이션'],
  notSuitableFor: ['객관적 사실 확인', '계산 문제'],
  complexityThreshold: { min: 2, max: 8 },
  tokenOverhead: 1.5,
  timeMultiplier: 1.2,
  isBuiltin: true,

  apply: async (prompt: string, context: StrategyContext): Promise<StrategyResult> => {
    // 도메인에 따라 페르소나 선택
    const personaMap: Record<string, string> = {
      coding: '10년 경력의 시니어 소프트웨어 엔지니어',
      data: '데이터 사이언티스트 및 통계 전문가',
      writing: '베스트셀러 작가이자 편집자',
      rag: 'RAG 시스템 및 정보 검색 전문가',
      workflow: '비즈니스 프로세스 자동화 컨설턴트',
      agent: 'AI 에이전트 시스템 설계 전문가',
      default: '해당 분야의 숙련된 전문가',
    }

    const persona = personaMap[context.domain || 'default'] || personaMap.default

    const systemPrompt = `당신은 ${persona}입니다.
전문 지식과 경험을 바탕으로 사용자의 질문에 답변해주세요.
실제 현장 경험에서 우러나온 실용적인 조언을 제공하세요.`

    const transformed = `[전문가에게 질문]
${prompt}

전문가의 관점에서 구체적이고 실용적인 답변을 부탁드립니다.`

    return createResult(transformed, 'role-play', {
      systemPrompt,
      additionalTokens: estimateTokens(transformed) - estimateTokens(prompt),
      metadata: {
        strategyId: 'role-play',
        appliedAt: Date.now(),
        transformationSteps: [`${persona} 페르소나 적용`, '전문가 관점 요청'],
      },
    })
  },
}

/**
 * Structured Output Strategy - 구조화된 출력
 */
export const StructuredStrategy: PromptStrategy = {
  id: 'structured',
  name: 'Structured Output',
  description: 'JSON, XML 등 구조화된 형식의 출력을 강제합니다.',
  category: 'basic',
  suitableFor: ['API 응답', '데이터 추출', '파싱 필요', '일관된 형식'],
  notSuitableFor: ['자유 형식 글쓰기', '창의적 작업'],
  complexityThreshold: { min: 1, max: 8 },
  tokenOverhead: 1.2,
  timeMultiplier: 1.1,
  isBuiltin: true,

  apply: async (prompt: string, context: StrategyContext): Promise<StrategyResult> => {
    const outputFormat = context.userPreferences?.outputFormat || 'json'
    const requiredFields = context.constraints?.requiredFields || []

    let formatInstruction: string
    if (outputFormat === 'json') {
      formatInstruction = `응답은 반드시 다음 JSON 형식으로 출력해주세요:
\`\`\`json
{
  "result": "결과 내용",
  "confidence": 0.0-1.0,
  "reasoning": "판단 근거",
  ${requiredFields.map(f => `"${f}": "..."`).join(',\n  ')}
}
\`\`\`
JSON 외의 다른 텍스트를 포함하지 마세요.`
    } else {
      formatInstruction = `응답은 구조화된 형식으로 출력해주세요.`
    }

    const transformed = `${prompt}

${formatInstruction}`

    return createResult(transformed, 'structured', {
      additionalTokens: estimateTokens(transformed) - estimateTokens(prompt),
      metadata: {
        strategyId: 'structured',
        appliedAt: Date.now(),
        transformationSteps: [`${outputFormat} 형식 지정`, '출력 제약 추가'],
      },
    })
  },
}

/**
 * Iterative Refinement Strategy - 반복 개선
 */
export const IterativeStrategy: PromptStrategy = {
  id: 'iterative',
  name: 'Iterative Refinement',
  description: '초안 → 비평 → 개선의 반복을 통해 품질을 높입니다.',
  category: 'advanced',
  suitableFor: ['글쓰기', '코드 리뷰', '디자인', '품질이 중요한 경우'],
  notSuitableFor: ['빠른 응답 필요', '단순 질문'],
  complexityThreshold: { min: 4, max: 10 },
  tokenOverhead: 3.0,
  timeMultiplier: 2.0,
  isBuiltin: true,

  apply: async (prompt: string, context: StrategyContext): Promise<StrategyResult> => {
    const transformed = `다음 작업을 반복 개선 방식으로 수행해주세요:

작업: ${prompt}

## 1차 시도 (초안)
[첫 번째 버전을 작성하세요]

## 자기 비평
[초안의 장점과 개선점을 분석하세요]

## 2차 시도 (개선)
[비평을 반영하여 개선된 버전을 작성하세요]

## 최종 검토
[2차 시도가 요구사항을 충족하는지 확인하고, 필요시 추가 수정하세요]

## 최종 결과
[가장 완성도 높은 최종 버전을 제시하세요]`

    return createResult(transformed, 'iterative', {
      additionalTokens: estimateTokens(transformed) - estimateTokens(prompt),
      metadata: {
        strategyId: 'iterative',
        appliedAt: Date.now(),
        transformationSteps: ['반복 개선 프레임워크 적용', '자기 비평 단계 추가'],
      },
    })
  },
}

/**
 * Meta-Prompt Strategy - 메타 프롬프트
 */
export const MetaPromptStrategy: PromptStrategy = {
  id: 'meta-prompt',
  name: 'Meta-Prompt',
  description: '최적의 프롬프트를 먼저 생성한 후, 해당 프롬프트로 작업을 수행합니다.',
  category: 'advanced',
  suitableFor: ['불명확한 요청', '프롬프트 최적화', '복잡한 작업'],
  notSuitableFor: ['명확한 작업', '시간 제한'],
  complexityThreshold: { min: 6, max: 10 },
  tokenOverhead: 2.5,
  timeMultiplier: 2.0,
  isBuiltin: true,

  apply: async (prompt: string, context: StrategyContext): Promise<StrategyResult> => {
    const transformed = `당신은 프롬프트 엔지니어링 전문가입니다.

사용자의 요청:
"${prompt}"

## 1단계: 요청 분석
- 사용자의 진짜 의도는 무엇인가요?
- 누락된 정보는 무엇인가요?
- 모호한 부분은 무엇인가요?

## 2단계: 최적 프롬프트 설계
위 분석을 바탕으로, 이 작업을 가장 잘 수행할 수 있는 최적의 프롬프트를 작성하세요.
구체적이고, 명확하며, 실행 가능해야 합니다.

## 3단계: 프롬프트 실행
설계한 최적 프롬프트를 실제로 실행하여 결과를 제시하세요.

## 최종 결과
[3단계의 실행 결과를 최종 답으로 제시]`

    return createResult(transformed, 'meta-prompt', {
      additionalTokens: estimateTokens(transformed) - estimateTokens(prompt),
      metadata: {
        strategyId: 'meta-prompt',
        appliedAt: Date.now(),
        transformationSteps: ['메타 분석 요청', '프롬프트 설계 단계', '실행 단계'],
      },
    })
  },
}

// ============================================================
// 전략 내보내기
// ============================================================

/**
 * 모든 내장 전략
 */
export const BUILTIN_STRATEGIES: PromptStrategy[] = [
  SimpleStrategy,
  FewShotStrategy,
  ZeroShotCoTStrategy,
  FewShotCoTStrategy,
  TreeOfThoughtStrategy,
  SelfConsistencyStrategy,
  ReActStrategy,
  DecompositionStrategy,
  RolePlayStrategy,
  StructuredStrategy,
  IterativeStrategy,
  MetaPromptStrategy,
]

/**
 * 전략 ID로 조회
 */
export function getBuiltinStrategy(id: PromptStrategyType): PromptStrategy | undefined {
  return BUILTIN_STRATEGIES.find(s => s.id === id)
}

/**
 * 카테고리별 전략 조회
 */
export function getStrategiesByCategory(category: PromptStrategy['category']): PromptStrategy[] {
  return BUILTIN_STRATEGIES.filter(s => s.category === category)
}

/**
 * 복잡도에 적합한 전략 조회
 */
export function getStrategiesForComplexity(complexity: number): PromptStrategy[] {
  return BUILTIN_STRATEGIES.filter(
    s => complexity >= s.complexityThreshold.min && complexity <= s.complexityThreshold.max
  )
}
