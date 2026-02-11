/**
 * CLI Executor — 로컬 CLI 명령어 실행
 *
 * Tauri 커맨드 execute_cli를 통해 로컬 CLI 도구를 실행.
 * aws, gcloud, az, git, docker 등 허용된 프로그램만 실행 가능.
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
    const program = config.program || ''
    let args: string[] = config.args
      ? (typeof config.args === 'string' ? config.args.split(/\s+/) : config.args)
      : []

    if (!program) {
      return { error: '실행할 프로그램이 지정되지 않았습니다', status: '프로그램 미지정' }
    }

    // 이전 노드 출력에서 인자 치환 ({{input}})
    const inputText = input.text || input._predecessors?.[0]?.text || ''
    args = args.map((arg: string) => arg.replace(/\{\{input\}\}/g, inputText))

    const result = await invoke<CliResult>('execute_cli', {
      program,
      args,
      workingDir: config.working_dir || null,
      timeoutSecs: config.timeout || 30,
    })

    const success = result.exit_code === 0

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exit_code,
      text: success ? result.stdout : result.stderr,
      duration_ms: result.duration_ms,
      command: result.command,
      status: success
        ? `명령어 실행 완료 (${result.duration_ms}ms)`
        : `명령어 실패 (exit code: ${result.exit_code})`,
    }
  },
}

export const CliDefinition: NodeDefinition = {
  type: 'control.cli',
  category: 'control',
  meta: {
    label: 'CLI 실행',
    description: '로컬 CLI 명령어를 실행합니다 (aws, gcloud, git 등)',
    icon: 'Terminal',
    color: '#1e293b',
    tags: ['CLI', '명령어', 'terminal', 'shell', 'command', 'aws', 'gcloud', 'az'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: false, description: '명령어 인자로 전달할 텍스트' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '명령어 stdout 출력' },
    ],
  },
  configSchema: [
    { key: 'program', label: '프로그램', type: 'text', required: true, placeholder: 'aws', description: '허용: aws, gcloud, az, python, node, git, docker, curl' },
    { key: 'args', label: '인자', type: 'text', placeholder: 's3 ls --region ap-northeast-2', description: '공백으로 구분. {{input}}으로 이전 노드 데이터 삽입' },
    { key: 'working_dir', label: '작업 디렉토리', type: 'folder' },
    { key: 'timeout', label: '타임아웃 (초)', type: 'number', default: 30, min: 1, max: 300 },
  ],
  runtime: 'cli',
  executor,
}
