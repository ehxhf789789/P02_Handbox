/**
 * Script Executor — Python/Node.js 스크립트 실행
 *
 * Tauri 커맨드 execute_python_script 또는 execute_cli를 통해
 * 로컬 스크립트를 실행하고 결과를 반환.
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

interface CliResult {
  stdout: string
  stderr: string
  exit_code: number
  duration_ms: number
  command: string
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    _context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const runtime = config.runtime || 'python'
    const scriptPath = config.script_path || ''
    const inlineCode = config.inline_code || ''
    const args: string[] = config.args ? config.args.split(/\s+/) : []

    if (!scriptPath && !inlineCode) {
      return { error: '스크립트 경로 또는 인라인 코드를 지정하세요', status: '스크립트 미지정' }
    }

    // 이전 노드 출력을 환경변수로 전달
    const inputText = input.text || input._predecessors?.[0]?.text || ''

    let result: CliResult

    if (runtime === 'python') {
      if (scriptPath) {
        result = await invoke<CliResult>('execute_python_script', {
          scriptPath,
          args: [...args, inputText].filter(Boolean),
          workingDir: config.working_dir || null,
        })
      } else {
        // 인라인 Python 코드
        result = await invoke<CliResult>('execute_cli', {
          program: 'python',
          args: ['-c', inlineCode],
          workingDir: config.working_dir || null,
          timeoutSecs: config.timeout || 60,
        })
      }
    } else {
      // Node.js
      const program = 'node'
      const nodeArgs = scriptPath ? [scriptPath, ...args] : ['-e', inlineCode]
      result = await invoke<CliResult>('execute_cli', {
        program,
        args: nodeArgs,
        workingDir: config.working_dir || null,
        timeoutSecs: config.timeout || 60,
      })
    }

    const success = result.exit_code === 0

    // stdout에서 JSON 파싱 시도
    let parsedOutput: Record<string, any> | null = null
    if (success && result.stdout.trim().startsWith('{')) {
      try {
        parsedOutput = JSON.parse(result.stdout.trim())
      } catch {
        // JSON 아님 — 텍스트로 처리
      }
    }

    return {
      ...(parsedOutput || {}),
      stdout: result.stdout,
      stderr: result.stderr,
      text: success ? result.stdout : result.stderr,
      exit_code: result.exit_code,
      duration_ms: result.duration_ms,
      status: success
        ? `${runtime} 스크립트 실행 완료 (${result.duration_ms}ms)`
        : `스크립트 실패 (exit code: ${result.exit_code})`,
    }
  },
}

export const ScriptDefinition: NodeDefinition = {
  type: 'control.script',
  category: 'control',
  meta: {
    label: '스크립트 실행',
    description: 'Python 또는 Node.js 스크립트를 실행합니다',
    icon: 'Code',
    color: '#3776AB',
    tags: ['스크립트', 'Python', 'Node', 'script', 'code', 'execute'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: false, description: '스크립트에 전달할 입력 데이터' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '스크립트 stdout 출력' },
    ],
  },
  configSchema: [
    { key: 'runtime', label: '런타임', type: 'select', default: 'python', options: [
      { label: 'Python', value: 'python' },
      { label: 'Node.js', value: 'node' },
    ]},
    { key: 'script_path', label: '스크립트 파일', type: 'file', accept: '.py,.js,.ts', description: '파일 경로 (인라인 코드와 택 1)' },
    { key: 'inline_code', label: '인라인 코드', type: 'code', rows: 8, language: 'python', description: '직접 실행할 코드 (파일 경로와 택 1)' },
    { key: 'args', label: '추가 인자', type: 'text', placeholder: '--output json' },
    { key: 'working_dir', label: '작업 디렉토리', type: 'folder' },
    { key: 'timeout', label: '타임아웃 (초)', type: 'number', default: 60, min: 1, max: 600 },
  ],
  runtime: 'script',
  executor,
  requirements: {
    scriptRuntime: 'python3',
  },
}
