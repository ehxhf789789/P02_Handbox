/**
 * CLIExtensionExecutor - CLI Extension stub
 *
 * Placeholder for future CLI integrations (Azure, GCP, etc.)
 * Currently disabled
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

const executor: NodeExecutor = {
  async execute(
    _input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const provider = (config.provider as string) || 'azure'

    // This is a stub - not yet implemented
    return {
      success: false,
      error: `${provider.toUpperCase()} CLI 확장은 아직 구현되지 않았습니다. 향후 업데이트에서 지원될 예정입니다.`,
      provider,
      status: 'not_implemented',
    }
  },
}

// Azure CLI Extension (stub)
export const AzureCLIDefinition: NodeDefinition = {
  type: 'ext.azure-cli',
  category: 'extension',
  stub: true,
  meta: {
    label: 'Azure CLI (준비중)',
    description: 'Azure CLI 명령을 실행합니다 (향후 지원)',
    icon: 'Cloud',
    color: '#0078d4',
    tags: ['Azure', 'CLI', '확장', '준비중'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: false, description: '입력 데이터' },
    ],
    outputs: [
      { name: 'result', type: 'json', required: true, description: '실행 결과' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'text', required: false, default: 'azure' },
    { key: 'command', label: '명령어', type: 'textarea', required: false },
  ],
  runtime: 'cli',
  executor,
}

// GCP CLI Extension (stub)
export const GCPCLIDefinition: NodeDefinition = {
  type: 'ext.gcp-cli',
  category: 'extension',
  stub: true,
  meta: {
    label: 'GCP gcloud (준비중)',
    description: 'Google Cloud gcloud 명령을 실행합니다 (향후 지원)',
    icon: 'Cloud',
    color: '#4285f4',
    tags: ['GCP', 'gcloud', 'CLI', '확장', '준비중'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: false, description: '입력 데이터' },
    ],
    outputs: [
      { name: 'result', type: 'json', required: true, description: '실행 결과' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'text', required: false, default: 'gcp' },
    { key: 'command', label: '명령어', type: 'textarea', required: false },
  ],
  runtime: 'cli',
  executor,
}

// Custom CLI Extension (stub)
export const CustomCLIDefinition: NodeDefinition = {
  type: 'ext.custom-cli',
  category: 'extension',
  stub: true,
  meta: {
    label: '사용자 정의 CLI (준비중)',
    description: '사용자 정의 CLI 명령을 실행합니다 (향후 지원)',
    icon: 'Terminal',
    color: '#6b7280',
    tags: ['CLI', '확장', '사용자정의', '준비중'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: false, description: '입력 데이터' },
    ],
    outputs: [
      { name: 'result', type: 'json', required: true, description: '실행 결과' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'text', required: false, default: 'custom' },
    { key: 'command', label: '명령어', type: 'textarea', required: false },
    { key: 'working_dir', label: '작업 디렉토리', type: 'folder', required: false },
  ],
  runtime: 'cli',
  executor,
}

export default {
  AzureCLIDefinition,
  GCPCLIDefinition,
  CustomCLIDefinition,
}
