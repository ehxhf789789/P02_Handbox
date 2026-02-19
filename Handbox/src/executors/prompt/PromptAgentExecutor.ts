/**
 * PromptAgentExecutor - AI-powered prompt generation
 *
 * Takes a short command and generates an optimized detailed prompt
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

const PROMPT_GENERATION_TEMPLATES: Record<string, string> = {
  concise: `당신은 프롬프트 엔지니어입니다. 다음 간단한 명령을 명확하고 간결한 프롬프트로 변환하세요.

사용자 명령: {{command}}

간결하지만 명확한 프롬프트를 작성하세요. 불필요한 설명 없이 핵심만 포함합니다.`,

  detailed: `당신은 전문 프롬프트 엔지니어입니다. 다음 간단한 명령을 상세하고 체계적인 프롬프트로 변환하세요.

사용자 명령: {{command}}

다음 요소를 포함하여 상세한 프롬프트를 작성하세요:
1. 역할 정의 (Role)
2. 구체적인 작업 설명
3. 출력 형식 지정
4. 품질 기준`,

  structured: `당신은 프롬프트 아키텍트입니다. 다음 명령을 구조화된 프롬프트로 변환하세요.

사용자 명령: {{command}}

다음 섹션으로 구조화된 프롬프트를 작성하세요:
## 역할
[AI의 역할 정의]

## 작업
[수행할 작업 상세 설명]

## 입력
[예상 입력 형식]

## 출력
[기대 출력 형식]

## 제약조건
[지켜야 할 규칙]`,

  'few-shot': `당신은 Few-shot 프롬프트 전문가입니다. 다음 명령에 대한 few-shot 예제를 포함한 프롬프트를 생성하세요.

사용자 명령: {{command}}

다음 형식으로 few-shot 프롬프트를 작성하세요:
[작업 설명]

예시 1:
입력: [예시 입력]
출력: [예시 출력]

예시 2:
입력: [예시 입력]
출력: [예시 출력]

이제 다음 입력에 대해 동일한 형식으로 처리하세요:
입력: {{input}}`,

  cot: `당신은 Chain-of-Thought 프롬프트 전문가입니다. 다음 명령에 대한 단계별 사고 과정을 유도하는 프롬프트를 생성하세요.

사용자 명령: {{command}}

단계별 추론을 유도하는 프롬프트를 작성하세요. "Let's think step by step" 패턴을 활용하고, 각 단계를 명시적으로 나열하도록 합니다.`,
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const command = (input.command || input.text || config.command) as string
    const style = (config.style as string) || 'detailed'
    const language = (config.language as string) || 'ko'

    if (!command) {
      return {
        prompt: '',
        error: '명령어를 입력하세요.',
      }
    }

    try {
      const template = PROMPT_GENERATION_TEMPLATES[style] || PROMPT_GENERATION_TEMPLATES.detailed
      const metaPrompt = template
        .replace('{{command}}', command)
        .replace('{{input}}', '{{input}}') // Keep placeholder for few-shot

      // Call LLM to generate the prompt
      const result = await invoke<{ response: string; usage?: { inputTokens: number; outputTokens: number } }>('invoke_bedrock', {
        modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        prompt: metaPrompt,
        systemPrompt: language === 'ko'
          ? '당신은 AI 프롬프트 엔지니어링 전문가입니다. 한국어로 응답하세요.'
          : 'You are an expert AI prompt engineer. Respond in English.',
        temperature: 0.7,
        maxTokens: 1000,
      })

      return {
        prompt: result.response,
        original_command: command,
        style,
        language,
        tokens_used: result.usage,
      }
    } catch (error) {
      // Fallback: Return a simple formatted prompt
      const fallbackPrompt = `[${style.toUpperCase()}] ${command}`
      return {
        prompt: fallbackPrompt,
        original_command: command,
        error: error instanceof Error ? error.message : String(error),
        fallback: true,
      }
    }
  },
}

export const PromptAgentDefinition: NodeDefinition = {
  type: 'prompt.agent',
  category: 'prompt',
  meta: {
    label: '프롬프트 생성',
    description: '짧은 명령을 AI가 상세한 프롬프트로 자동 변환합니다',
    icon: 'AutoAwesome',
    color: '#f59e0b',
    tags: ['프롬프트', '자동', 'AI', '생성', '최적화'],
  },
  ports: {
    inputs: [
      { name: 'command', type: 'text', required: true, description: '짧은 명령어' },
    ],
    outputs: [
      { name: 'prompt', type: 'text', required: true, description: '생성된 프롬프트' },
    ],
  },
  configSchema: [
    { key: 'command', label: '명령어 (고정)', type: 'textarea', required: false },
    {
      key: 'style',
      label: '프롬프트 스타일',
      type: 'select',
      required: true,
      default: 'detailed',
      options: [
        { label: '간결한', value: 'concise' },
        { label: '상세한', value: 'detailed' },
        { label: '구조화된', value: 'structured' },
        { label: 'Few-shot', value: 'few-shot' },
        { label: 'Chain-of-Thought', value: 'cot' },
      ],
    },
    {
      key: 'language',
      label: '언어',
      type: 'select',
      required: false,
      default: 'ko',
      options: [
        { label: '한국어', value: 'ko' },
        { label: 'English', value: 'en' },
      ],
    },
  ],
  runtime: 'tauri',
  executor,
}

export default PromptAgentDefinition
