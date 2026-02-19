// Universal CLI Adapter
// 다양한 CLI 도구 통합 관리

import { invoke } from '@tauri-apps/api/tauri'

// ========================================
// 타입 정의
// ========================================

/** CLI 프로바이더 타입 */
export type CLIProviderType = 'aws' | 'azure' | 'gcloud' | 'ollama' | 'docker' | 'kubectl' | 'custom'

/** CLI 실행 결과 */
export interface CLIResult {
  stdout: string
  stderr: string
  exit_code: number
  duration_ms: number
  command: string
}

/** CLI 프로바이더 정보 */
export interface CLIProviderInfo {
  provider_type: CLIProviderType
  name: string
  installed: boolean
  version?: string
  executable_path?: string
  profiles: string[]
  current_profile?: string
  region?: string
  error?: string
}

/** CLI 감지 결과 */
export interface CLIDetectionResult {
  providers: CLIProviderInfo[]
  total_installed: number
}

/** AWS 자격증명 테스트 결과 */
export interface AWSCallerIdentity {
  UserId: string
  Account: string
  Arn: string
}

// ========================================
// CLI 감지 함수
// ========================================

/**
 * 설치된 CLI 프로바이더 감지
 */
export async function detectCLIProviders(): Promise<CLIDetectionResult> {
  return invoke<CLIDetectionResult>('detect_cli_providers')
}

/**
 * 특정 CLI 프로바이더 정보 조회
 */
export async function getCLIProviderInfo(provider: CLIProviderType): Promise<CLIProviderInfo> {
  return invoke<CLIProviderInfo>('get_cli_provider_info', { provider })
}

// ========================================
// AWS CLI 함수
// ========================================

/**
 * AWS CLI 자격증명 테스트
 */
export async function testAWSCLICredentials(profile?: string): Promise<AWSCallerIdentity> {
  return invoke<AWSCallerIdentity>('test_aws_cli_credentials', { profile })
}

// ========================================
// Ollama 함수
// ========================================

/**
 * Ollama 모델로 채팅
 */
export async function ollamaChat(
  model: string,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  return invoke<string>('ollama_chat', {
    model,
    prompt,
    system_prompt: systemPrompt,
  })
}

// ========================================
// 범용 CLI 실행 함수
// ========================================

/**
 * CLI 명령어 실행
 */
export async function executeCLI(
  program: string,
  args: string[],
  options?: {
    workingDir?: string
    timeoutSecs?: number
  }
): Promise<CLIResult> {
  return invoke<CLIResult>('execute_cli', {
    program,
    args,
    working_dir: options?.workingDir,
    timeout_secs: options?.timeoutSecs,
  })
}

/**
 * CLI 명령어 실행 (환경변수 포함)
 */
export async function executeCLIWithEnv(
  program: string,
  args: string[],
  env?: Record<string, string>,
  options?: {
    workingDir?: string
    timeoutSecs?: number
  }
): Promise<CLIResult> {
  return invoke<CLIResult>('execute_cli_with_env', {
    program,
    args,
    env,
    working_dir: options?.workingDir,
    timeout_secs: options?.timeoutSecs,
  })
}

/**
 * Python 스크립트 실행
 */
export async function executePythonScript(
  scriptPath: string,
  args: string[],
  workingDir?: string
): Promise<CLIResult> {
  return invoke<CLIResult>('execute_python_script', {
    script_path: scriptPath,
    args,
    working_dir: workingDir,
  })
}

// ========================================
// 프로바이더 메타데이터
// ========================================

/** 프로바이더 표시 정보 */
export const CLI_PROVIDER_META: Record<
  CLIProviderType,
  {
    name: string
    description: string
    icon: string
    color: string
    docsUrl: string
  }
> = {
  aws: {
    name: 'AWS CLI',
    description: 'Amazon Web Services 명령줄 인터페이스',
    icon: 'Cloud',
    color: '#FF9900',
    docsUrl: 'https://docs.aws.amazon.com/cli/',
  },
  azure: {
    name: 'Azure CLI',
    description: 'Microsoft Azure 명령줄 인터페이스',
    icon: 'Cloud',
    color: '#0078D4',
    docsUrl: 'https://docs.microsoft.com/cli/azure/',
  },
  gcloud: {
    name: 'Google Cloud CLI',
    description: 'Google Cloud Platform 명령줄 인터페이스',
    icon: 'Cloud',
    color: '#4285F4',
    docsUrl: 'https://cloud.google.com/sdk/gcloud',
  },
  ollama: {
    name: 'Ollama',
    description: '로컬 LLM 실행 도구',
    icon: 'Psychology',
    color: '#000000',
    docsUrl: 'https://ollama.ai/',
  },
  docker: {
    name: 'Docker',
    description: '컨테이너 관리 도구',
    icon: 'Dns',
    color: '#2496ED',
    docsUrl: 'https://docs.docker.com/engine/reference/commandline/cli/',
  },
  kubectl: {
    name: 'kubectl',
    description: 'Kubernetes 명령줄 도구',
    icon: 'Hub',
    color: '#326CE5',
    docsUrl: 'https://kubernetes.io/docs/reference/kubectl/',
  },
  custom: {
    name: 'Custom CLI',
    description: '사용자 정의 CLI',
    icon: 'Terminal',
    color: '#6B7280',
    docsUrl: '',
  },
}
