/**
 * Process 도구 노드 정의 — shell.exec, code.eval
 */
import { invoke } from '@tauri-apps/api/tauri'
import type { NodeDefinition } from '../registry/NodeDefinition'

export const ShellExecDefinition: NodeDefinition = {
  type: 'process.shell-exec',
  category: 'process',
  meta: {
    label: '쉘 실행',
    description: '시스템 명령을 실행합니다. 보안을 위해 화이트리스트 명령만 허용.',
    icon: 'Terminal',
    color: '#ef4444',
    tags: ['shell', 'exec', 'command', 'cli', 'process', '쉘', '명령', '실행'],
  },
  ports: {
    inputs: [
      { name: 'stdin', type: 'text', required: false, description: '표준 입력' },
    ],
    outputs: [
      { name: 'stdout', type: 'text', required: true, description: '표준 출력' },
      { name: 'stderr', type: 'text', required: false, description: '표준 에러' },
      { name: 'result', type: 'json', required: false, description: '전체 결과 (exit_code 포함)' },
    ],
  },
  configSchema: [
    { key: 'command', label: '명령어', type: 'text', required: true, placeholder: 'python' },
    { key: 'args', label: '인수', type: 'text', description: '쉼표로 구분. 예: -c,print("hello")' },
    { key: 'working_dir', label: '작업 디렉토리', type: 'folder' },
    { key: 'timeout_ms', label: '타임아웃 (ms)', type: 'number', default: 60000 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const args = config.args ? config.args.split(',').map((a: string) => a.trim()) : null
      const result = await invoke('tool_shell_exec', {
        command: config.command, args, workingDir: config.working_dir || null,
        timeoutMs: config.timeout_ms, stdinData: input.stdin || null,
      }) as any
      return { stdout: result.stdout, stderr: result.stderr, result }
    },
  },
}

export const CodeEvalDefinition: NodeDefinition = {
  type: 'process.code-eval',
  category: 'process',
  meta: {
    label: '코드 실행',
    description: 'Python 또는 JavaScript 코드를 실행합니다. 데이터 변환, 계산에 사용.',
    icon: 'PlayArrow',
    color: '#ef4444',
    tags: ['code', 'eval', 'python', 'javascript', 'script', '코드', '실행', '스크립트'],
  },
  ports: {
    inputs: [{ name: 'input_data', type: 'json', required: false, description: '입력 데이터 (INPUT 변수로 접근)' }],
    outputs: [
      { name: 'stdout', type: 'text', required: true, description: '표준 출력' },
      { name: 'result', type: 'json', required: false, description: 'JSON 파싱된 결과' },
    ],
  },
  configSchema: [
    { key: 'language', label: '언어', type: 'select', default: 'python',
      options: [
        { label: 'Python', value: 'python' },
        { label: 'JavaScript (Node.js)', value: 'javascript' },
      ] },
    { key: 'code', label: '코드', type: 'code', required: true, rows: 10,
      description: 'INPUT 변수로 입력 데이터 접근. __result__에 결과를 저장하면 JSON으로 출력.' },
    { key: 'timeout_ms', label: '타임아웃 (ms)', type: 'number', default: 30000 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const result = await invoke('tool_code_eval', {
        code: config.code, language: config.language,
        timeoutMs: config.timeout_ms, inputData: input.input_data || null,
      }) as any
      return { stdout: result.stdout, result: result.result, stderr: result.stderr }
    },
  },
}

export const PROCESS_DEFINITIONS: NodeDefinition[] = [ShellExecDefinition, CodeEvalDefinition]
