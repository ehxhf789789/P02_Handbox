/**
 * CLI Runtime — CLI 명령 실행을 위한 런타임 유틸리티
 *
 * Tauri를 통한 CLI 명령 실행을 추상화하고
 * 프로그램별 실행, 환경 변수 관리, 출력 파싱 등을 제공한다.
 */

import { invoke } from '@tauri-apps/api/tauri'

export interface CLICallOptions {
  program: string
  args: string[]
  /** 작업 디렉토리 */
  cwd?: string
  /** 환경 변수 */
  env?: Record<string, string>
  /** 타임아웃 (초) */
  timeout?: number
  /** 중단 시그널 */
  abortSignal?: AbortSignal
}

export interface CLICallResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
  command: string
  duration: number
  error?: string
}

/** Tauri CLI 실행 결과 */
interface TauriCliResult {
  stdout: string
  stderr: string
  exit_code: number
  duration_ms: number
  command: string
}

/**
 * CLI 명령 실행
 */
export async function executeCLI(options: CLICallOptions): Promise<CLICallResult> {
  const { program, args, cwd, env, timeout = 30, abortSignal } = options
  const startTime = Date.now()

  // 중단 확인
  if (abortSignal?.aborted) {
    return {
      success: false,
      stdout: '',
      stderr: '',
      exitCode: -1,
      command: `${program} ${args.join(' ')}`,
      duration: Date.now() - startTime,
      error: 'CLI call aborted',
    }
  }

  try {
    // 환경 변수가 있는 경우 별도 커맨드 사용
    let result: TauriCliResult

    if (env && Object.keys(env).length > 0) {
      result = await invoke<TauriCliResult>('execute_cli_with_env', {
        program,
        args,
        workingDir: cwd || null,
        timeoutSecs: timeout,
        env,
      })
    } else {
      result = await invoke<TauriCliResult>('execute_cli', {
        program,
        args,
        workingDir: cwd || null,
        timeoutSecs: timeout,
      })
    }

    const success = result.exit_code === 0

    return {
      success,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exit_code,
      command: result.command,
      duration: result.duration_ms,
      error: success ? undefined : result.stderr || `Exit code: ${result.exit_code}`,
    }
  } catch (error) {
    return {
      success: false,
      stdout: '',
      stderr: '',
      exitCode: -1,
      command: `${program} ${args.join(' ')}`,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * AWS CLI 명령 실행 (편의 함수)
 */
export async function executeAWSCLI(
  subcommand: string,
  args: string[] = [],
  options: Partial<CLICallOptions> = {}
): Promise<CLICallResult> {
  return executeCLI({
    program: 'aws',
    args: [subcommand, ...args],
    ...options,
  })
}

/**
 * GCloud CLI 명령 실행 (편의 함수)
 */
export async function executeGCloudCLI(
  subcommand: string,
  args: string[] = [],
  options: Partial<CLICallOptions> = {}
): Promise<CLICallResult> {
  return executeCLI({
    program: 'gcloud',
    args: [subcommand, ...args],
    ...options,
  })
}

/**
 * Azure CLI 명령 실행 (편의 함수)
 */
export async function executeAzureCLI(
  subcommand: string,
  args: string[] = [],
  options: Partial<CLICallOptions> = {}
): Promise<CLICallResult> {
  return executeCLI({
    program: 'az',
    args: [subcommand, ...args],
    ...options,
  })
}

/**
 * Docker CLI 명령 실행 (편의 함수)
 */
export async function executeDockerCLI(
  subcommand: string,
  args: string[] = [],
  options: Partial<CLICallOptions> = {}
): Promise<CLICallResult> {
  return executeCLI({
    program: 'docker',
    args: [subcommand, ...args],
    ...options,
  })
}

/**
 * kubectl 명령 실행 (편의 함수)
 */
export async function executeKubectlCLI(
  subcommand: string,
  args: string[] = [],
  options: Partial<CLICallOptions> = {}
): Promise<CLICallResult> {
  return executeCLI({
    program: 'kubectl',
    args: [subcommand, ...args],
    ...options,
  })
}

/**
 * Ollama 명령 실행 (편의 함수)
 */
export async function executeOllamaCLI(
  subcommand: string,
  args: string[] = [],
  options: Partial<CLICallOptions> = {}
): Promise<CLICallResult> {
  return executeCLI({
    program: 'ollama',
    args: [subcommand, ...args],
    ...options,
  })
}

/**
 * JSON 출력 파싱 시도
 */
export function parseJSONOutput(output: string): unknown | null {
  try {
    return JSON.parse(output)
  } catch {
    // JSON 아닌 경우 줄 단위로 JSON 파싱 시도 (NDJSON 등)
    const lines = output.trim().split('\n')
    const jsonObjects: unknown[] = []

    for (const line of lines) {
      try {
        jsonObjects.push(JSON.parse(line))
      } catch {
        // 무시
      }
    }

    return jsonObjects.length > 0 ? jsonObjects : null
  }
}

/**
 * AWS CLI JSON 출력 파싱
 */
export function parseAWSOutput<T = unknown>(result: CLICallResult): T | null {
  if (!result.success) return null
  return parseJSONOutput(result.stdout) as T | null
}
