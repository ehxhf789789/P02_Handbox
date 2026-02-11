/**
 * PromptTemplate Executor — 프롬프트 템플릿 변수 치환
 *
 * {{input}}, {{variable_name}} 등의 플레이스홀더를 실제 데이터로 치환.
 * 순수 TypeScript 구현.
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

/** 선행 노드 출력에서 텍스트를 추출 */
function extractInputText(input: Record<string, any>): string {
  // 포트 기반 입력
  if (input.text && typeof input.text === 'string') {
    return input.text
  }

  // _predecessors에서 텍스트 수집 (레거시 호환)
  const predecessors: Record<string, any>[] = input._predecessors || []
  const parts: string[] = []

  for (const pred of predecessors) {
    if (pred?.text) {
      parts.push(pred.text)
    } else if (pred?.content) {
      parts.push(pred.content)
    } else if (pred?.result) {
      parts.push(typeof pred.result === 'string' ? pred.result : JSON.stringify(pred.result))
    } else if (pred?.chunks && Array.isArray(pred.chunks)) {
      parts.push(pred.chunks.map((c: any) => c.content || c).join('\n\n'))
    } else if (typeof pred === 'string') {
      parts.push(pred)
    }
  }

  return parts.join('\n').trim()
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const template = config.template || '{{input}}'
    const inputText = extractInputText(input)

    // {{input}} 플레이스홀더 치환
    let processedPrompt = template.replace(/\{\{input\}\}/g, inputText.trim())

    // {{variable_name}} 형태의 추가 변수 치환
    // context.variables 에서 값을 가져옴
    processedPrompt = processedPrompt.replace(/\{\{(\w+)\}\}/g, (match: string, varName: string) => {
      if (varName === 'input') return match // 이미 처리됨
      return context.variables[varName] ?? config[varName] ?? match
    })

    return {
      text: processedPrompt,
      content: processedPrompt,
      prompt: processedPrompt,
      template_chars: template.length,
      input_chars: inputText.length,
      output_chars: processedPrompt.length,
      status: '프롬프트 처리 완료',
    }
  },
}

export const PromptTemplateDefinition: NodeDefinition = {
  type: 'prompt.template',
  category: 'prompt',
  meta: {
    label: '프롬프트 템플릿',
    description: '템플릿의 {{input}} 등 플레이스홀더를 실제 데이터로 치환합니다',
    icon: 'Edit',
    color: '#9C27B0',
    tags: ['프롬프트', '템플릿', 'prompt', 'template', 'placeholder'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: false, description: '{{input}}에 대입될 텍스트' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '치환 완료된 프롬프트 텍스트' },
    ],
  },
  configSchema: [
    {
      key: 'template',
      label: '프롬프트 템플릿',
      type: 'code',
      language: 'markdown',
      rows: 10,
      default: '다음 내용을 분석해주세요:\n\n{{input}}',
      description: '{{input}}은 이전 노드의 출력으로 치환됩니다. {{변수명}}으로 추가 변수도 사용 가능합니다.',
    },
  ],
  runtime: 'internal',
  executor,
}
