/**
 * AWS Cloud Provider — AWS 서비스 접근 관리
 *
 * Tauri 백엔드의 AWS 커맨드를 래핑.
 * CLI 인증(aws configure) 및 API 키 인증 모두 지원.
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { CloudProvider, CloudAuthMethod, CloudServiceInfo } from '../../registry/ProviderRegistry'
import { ProviderRegistry } from '../../registry/ProviderRegistry'

export class AWSCloudProvider implements CloudProvider {
  readonly id = 'aws'
  readonly name = 'Amazon Web Services'

  private connected = false

  supportedAuthMethods(): CloudAuthMethod[] {
    return ['api-key', 'cli', 'credentials']
  }

  async authenticate(method: CloudAuthMethod, credentials?: Record<string, any>): Promise<boolean> {
    if (method === 'api-key' || method === 'credentials') {
      if (!credentials?.accessKeyId || !credentials?.secretAccessKey) {
        return false
      }

      try {
        await invoke('set_aws_credentials', {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          region: credentials.region || 'us-east-1',
        })
        return await this.testConnection()
      } catch {
        this.connected = false
        return false
      }
    }

    if (method === 'cli') {
      // CLI 인증은 로컬 ~/.aws/credentials를 사용
      return await this.testConnection()
    }

    return false
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await invoke<{ connected: boolean }>('test_aws_connection')
      this.connected = result.connected

      // AWS 연결 성공 시 BedrockLLMProvider도 자동 연결
      if (this.connected) {
        const bedrockProvider = ProviderRegistry.getLLMProvider('bedrock')
        if (bedrockProvider && !bedrockProvider.isConnected()) {
          console.log('[AWSCloudProvider] BedrockLLMProvider 자동 연결 시도')
          await bedrockProvider.connect({})
        }

        // BedrockEmbeddingProvider도 연결
        const bedrockEmbedding = ProviderRegistry.getEmbeddingProvider('bedrock-embedding')
        if (bedrockEmbedding && !bedrockEmbedding.isConnected()) {
          await bedrockEmbedding.connect({})
        }
      }

      return this.connected
    } catch {
      this.connected = false
      return false
    }
  }

  async listServices(): Promise<CloudServiceInfo[]> {
    if (!this.connected) {
      return []
    }

    try {
      const result = await invoke<{
        connected: boolean
        region: string
        services: Array<{ name: string; available: boolean }>
      }>('test_aws_connection')

      return result.services.map(s => ({
        id: s.name.toLowerCase().replace(/\s+/g, '-'),
        name: s.name,
        available: s.available,
      }))
    } catch {
      return []
    }
  }

  isConnected(): boolean {
    return this.connected
  }
}
