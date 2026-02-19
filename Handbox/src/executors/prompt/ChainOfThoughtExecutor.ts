/**
 * ChainOfThoughtExecutor - Chain-of-Thought prompt builder
 *
 * Generate prompts that encourage step-by-step reasoning
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

const COT_TEMPLATES: Record<string, string> = {
  basic: `다음 문제를 단계별로 생각해서 해결하세요.

문제: {{input}}

단계별로 생각해봅시다:`,

  math: `다음 수학 문제를 단계별로 풀어주세요.

문제: {{input}}

풀이 과정:
1단계: 문제를 이해합니다.
2단계: 필요한 공식이나 개념을 파악합니다.
3단계: 계산을 수행합니다.
4단계: 답을 확인합니다.

이제 위 단계를 따라 풀어보겠습니다:`,

  analysis: `다음 내용을 체계적으로 분석하세요.

분석 대상: {{input}}

분석 프레임워크:
1. 핵심 요소 파악
2. 각 요소 간 관계 분석
3. 강점과 약점 식별
4. 시사점 도출
5. 결론 및 제언

분석을 시작하겠습니다:`,

  decision: `다음 결정 문제를 단계별로 분석하세요.

상황: {{input}}

의사결정 단계:
1. 문제 정의
2. 대안 도출
3. 각 대안의 장단점 분석
4. 최적 대안 선택
5. 실행 계획

분석을 시작합니다:`,

  comparison: `다음 항목들을 체계적으로 비교 분석하세요.

비교 대상: {{input}}

비교 분석 단계:
1. 비교 기준 설정
2. 각 항목별 특성 파악
3. 기준별 비교
4. 종합 평가
5. 결론

비교 분석을 시작합니다:`,

  custom: `{{custom_template}}

입력: {{input}}

단계별로 분석하겠습니다:`,
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const inputText = (input.text || config.input_text) as string
    const templateType = (config.template_type as string) || 'basic'
    const customTemplate = (config.custom_template as string) || ''
    const includeExamples = config.include_examples as boolean

    if (!inputText && !config.input_text) {
      return {
        prompt: '',
        error: '입력 텍스트를 제공하세요.',
      }
    }

    let template = COT_TEMPLATES[templateType] || COT_TEMPLATES.basic

    if (templateType === 'custom' && customTemplate) {
      template = COT_TEMPLATES.custom.replace('{{custom_template}}', customTemplate)
    }

    let prompt = template.replace('{{input}}', inputText || '{{input}}')

    // Add example if requested
    if (includeExamples && templateType !== 'custom') {
      const example = getExampleForTemplate(templateType)
      if (example) {
        prompt = `${example}\n\n---\n\n${prompt}`
      }
    }

    return {
      prompt,
      template_type: templateType,
      input_text: inputText,
    }
  },
}

function getExampleForTemplate(templateType: string): string | null {
  const examples: Record<string, string> = {
    basic: `예시:
문제: 철수가 사과 3개를 가지고 있고, 영희가 2개를 더 주었습니다. 철수가 가진 사과는 총 몇 개인가요?

단계별로 생각해봅시다:
1. 철수가 처음에 가진 사과: 3개
2. 영희가 준 사과: 2개
3. 총 사과 수: 3 + 2 = 5개

따라서 철수가 가진 사과는 총 5개입니다.`,

    math: `예시:
문제: 정가 10,000원인 상품을 20% 할인하면 얼마인가요?

풀이 과정:
1단계: 문제를 이해합니다.
- 정가: 10,000원
- 할인율: 20%

2단계: 필요한 공식을 파악합니다.
- 할인 금액 = 정가 × 할인율
- 판매 가격 = 정가 - 할인 금액

3단계: 계산을 수행합니다.
- 할인 금액 = 10,000 × 0.2 = 2,000원
- 판매 가격 = 10,000 - 2,000 = 8,000원

4단계: 답을 확인합니다.
- 8,000원이 정가의 80%인지 확인: 10,000 × 0.8 = 8,000원 ✓

답: 8,000원`,
  }

  return examples[templateType] || null
}

export const ChainOfThoughtDefinition: NodeDefinition = {
  type: 'prompt.cot',
  category: 'prompt',
  meta: {
    label: 'Chain-of-Thought',
    description: '단계별 추론을 유도하는 CoT 프롬프트를 생성합니다',
    icon: 'Timeline',
    color: '#a855f7',
    tags: ['프롬프트', 'CoT', '추론', '단계별', '분석'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '분석할 입력' },
    ],
    outputs: [
      { name: 'prompt', type: 'text', required: true, description: 'CoT 프롬프트' },
    ],
  },
  configSchema: [
    {
      key: 'template_type',
      label: '템플릿 유형',
      type: 'select',
      required: true,
      default: 'basic',
      options: [
        { label: '기본', value: 'basic' },
        { label: '수학/계산', value: 'math' },
        { label: '분석', value: 'analysis' },
        { label: '의사결정', value: 'decision' },
        { label: '비교분석', value: 'comparison' },
        { label: '사용자 정의', value: 'custom' },
      ],
    },
    { key: 'input_text', label: '입력 텍스트 (고정)', type: 'textarea', required: false },
    { key: 'custom_template', label: '사용자 정의 템플릿', type: 'textarea', required: false },
    { key: 'include_examples', label: '예시 포함', type: 'toggle', required: false, default: false },
  ],
  runtime: 'internal',
  executor,
}

export default ChainOfThoughtDefinition
