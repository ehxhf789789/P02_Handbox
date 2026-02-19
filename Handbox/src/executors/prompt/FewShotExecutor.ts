/**
 * FewShotExecutor - Few-shot prompt builder
 *
 * Build few-shot prompts with example input/output pairs
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

interface Example {
  input: string
  output: string
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const inputText = (input.text || config.input_text) as string
    const taskDescription = (config.task_description as string) || ''
    const examplesJson = config.examples as string | Example[]
    const outputFormat = (config.output_format as string) || ''

    let examples: Example[] = []

    // Parse examples
    if (typeof examplesJson === 'string') {
      try {
        examples = JSON.parse(examplesJson)
      } catch {
        // Try to parse as simple format: input:output\ninput:output
        const lines = examplesJson.split('\n').filter(l => l.trim())
        examples = lines.map(line => {
          const [inp, out] = line.split(':').map(s => s.trim())
          return { input: inp || '', output: out || '' }
        }).filter(e => e.input && e.output)
      }
    } else if (Array.isArray(examplesJson)) {
      examples = examplesJson
    }

    if (examples.length === 0) {
      return {
        prompt: taskDescription ? `${taskDescription}\n\n입력: ${inputText}` : inputText,
        error: 'Few-shot 예제가 없습니다. 예제를 추가하세요.',
      }
    }

    // Build few-shot prompt
    const parts: string[] = []

    if (taskDescription) {
      parts.push(`## 작업\n${taskDescription}\n`)
    }

    parts.push('## 예시')
    examples.forEach((ex, i) => {
      parts.push(`\n예시 ${i + 1}:`)
      parts.push(`입력: ${ex.input}`)
      parts.push(`출력: ${ex.output}`)
    })

    if (outputFormat) {
      parts.push(`\n## 출력 형식\n${outputFormat}`)
    }

    parts.push(`\n## 실제 입력`)
    parts.push(`입력: ${inputText || '{{input}}'}`)
    parts.push(`출력:`)

    const prompt = parts.join('\n')

    return {
      prompt,
      example_count: examples.length,
      input_text: inputText,
    }
  },
}

export const FewShotDefinition: NodeDefinition = {
  type: 'prompt.few-shot',
  category: 'prompt',
  meta: {
    label: 'Few-Shot 프롬프트',
    description: '입력/출력 예시를 포함한 Few-shot 프롬프트를 구성합니다',
    icon: 'ListAlt',
    color: '#ec4899',
    tags: ['프롬프트', 'few-shot', '예시', '학습'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: false, description: '실제 입력 텍스트' },
    ],
    outputs: [
      { name: 'prompt', type: 'text', required: true, description: 'Few-shot 프롬프트' },
    ],
  },
  configSchema: [
    { key: 'task_description', label: '작업 설명', type: 'textarea', required: false },
    {
      key: 'examples',
      label: '예시 (JSON 또는 input:output 형식)',
      type: 'code',
      required: true,
      default: `[
  {"input": "안녕하세요", "output": "반갑습니다"},
  {"input": "감사합니다", "output": "천만에요"}
]`,
    },
    { key: 'input_text', label: '입력 텍스트 (고정)', type: 'textarea', required: false },
    { key: 'output_format', label: '출력 형식 설명', type: 'textarea', required: false },
  ],
  runtime: 'internal',
  executor,
}

export default FewShotDefinition
