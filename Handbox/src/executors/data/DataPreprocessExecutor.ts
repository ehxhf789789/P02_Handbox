/**
 * DataPreprocessExecutor - Script-based data preprocessing
 *
 * Execute JavaScript or Python scripts for data transformation
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

const executor: NodeExecutor = {
  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const scriptType = (config.script_type as string) || 'javascript'
    const inlineCode = config.inline_code as string
    const scriptPath = config.script_path as string

    // Get input data
    const predecessors = input._predecessors as unknown[] | undefined
    const inputData = input.data || input.text || (predecessors?.[0]) || {}

    if (!inlineCode && !scriptPath) {
      return {
        data: inputData,
        text: typeof inputData === 'string' ? inputData : JSON.stringify(inputData, null, 2),
        error: '스크립트 코드 또는 경로를 입력하세요.',
      }
    }

    try {
      if (scriptType === 'javascript') {
        // Execute inline JavaScript using Function constructor
        // Note: This runs in browser context, limited to data transformation
        const fn = new Function('data', 'input', `
          ${inlineCode}
          return typeof result !== 'undefined' ? result : data;
        `)
        const result = fn(inputData, input)

        return {
          data: result,
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        }
      } else if (scriptType === 'python') {
        // Execute Python script via Tauri
        const inputJson = JSON.stringify(inputData)
        const script = scriptPath || inlineCode

        const result = await invoke<string>('execute_python_script', {
          script,
          args: [],
          input: inputJson,
          inline: !scriptPath,
          timeout: (config.timeout as number) || 30000,
        })

        // Try to parse result as JSON
        try {
          const parsed = JSON.parse(result)
          return {
            data: parsed,
            text: result,
          }
        } catch {
          return {
            data: result,
            text: result,
          }
        }
      }

      return {
        data: inputData,
        text: '',
        error: '지원하지 않는 스크립트 타입입니다.',
      }
    } catch (error) {
      return {
        data: inputData,
        text: '',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

export const DataPreprocessDefinition: NodeDefinition = {
  type: 'data.preprocess',
  category: 'data',
  meta: {
    label: '데이터 전처리',
    description: 'JavaScript 또는 Python 스크립트로 데이터를 변환합니다',
    icon: 'Code',
    color: '#8b5cf6',
    tags: ['전처리', '스크립트', 'javascript', 'python', '변환'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: false, description: '입력 데이터' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '처리된 데이터' },
      { name: 'text', type: 'text', required: false, description: '텍스트 출력' },
    ],
  },
  configSchema: [
    {
      key: 'script_type',
      label: '스크립트 유형',
      type: 'select',
      required: true,
      default: 'javascript',
      options: [
        { label: 'JavaScript (브라우저)', value: 'javascript' },
        { label: 'Python', value: 'python' },
      ],
    },
    {
      key: 'inline_code',
      label: '인라인 코드',
      type: 'code',
      required: false,
      default: `// 입력: data (JSON 또는 텍스트)
// 결과를 result 변수에 저장하세요

const result = data;`,
    },
    { key: 'script_path', label: '스크립트 파일 경로 (Python)', type: 'file', required: false },
    { key: 'timeout', label: '타임아웃 (ms)', type: 'number', required: false, default: 30000 },
  ],
  runtime: 'script',
  executor,
}

export default DataPreprocessDefinition
