/**
 * Bedrock LLM Provider — AWS Bedrock을 통한 LLM 호출
 *
 * Tauri 커맨드 invoke_bedrock를 래핑.
 * AWS 자격 증명은 Tauri 백엔드(Rust)에서 관리.
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { LLMRequest, LLMResponse } from '../../engine/types'
import type { LLMProvider, ModelInfo } from '../../registry/ProviderRegistry'

export class BedrockLLMProvider implements LLMProvider {
  readonly id = 'bedrock'
  readonly name = 'AWS Bedrock'
  readonly icon = 'Cloud'

  private connected = false

  async connect(_credentials: Record<string, any>): Promise<boolean> {
    // Bedrock 자격 증명은 Tauri 백엔드에서 이미 관리됨
    // 여기서는 연결 테스트만 수행
    try {
      const result = await invoke<{ connected: boolean }>('test_aws_connection')
      this.connected = result.connected
      return this.connected
    } catch {
      this.connected = false
      return false
    }
  }

  disconnect(): void {
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  async listModels(): Promise<ModelInfo[]> {
    // Bedrock에서 사용 가능한 모델 목록 (정적)
    return [
      {
        id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        name: 'Claude 3.5 Sonnet',
        description: '가장 지능적인 모델. 복잡한 추론, 분석, 코딩에 적합',
        maxTokens: 200000,
        supportsVision: true,
      },
      {
        id: 'anthropic.claude-3-opus-20240229-v1:0',
        name: 'Claude 3 Opus',
        description: '최고 성능 모델. 연구, 전략 분석에 적합',
        maxTokens: 200000,
        supportsVision: true,
      },
      {
        id: 'anthropic.claude-3-haiku-20240307-v1:0',
        name: 'Claude 3 Haiku',
        description: '빠르고 경제적인 모델. 간단한 작업에 적합',
        maxTokens: 200000,
        supportsVision: true,
      },
      {
        id: 'anthropic.claude-3-5-haiku-20241022-v1:0',
        name: 'Claude 3.5 Haiku',
        description: '빠르고 비용 효율적인 최신 모델',
        maxTokens: 200000,
        supportsVision: true,
      },
      {
        id: 'amazon.titan-text-express-v1',
        name: 'Amazon Titan Text Express',
        description: 'Amazon 자체 텍스트 모델',
        maxTokens: 8000,
      },
      {
        id: 'meta.llama3-1-70b-instruct-v1:0',
        name: 'Llama 3.1 70B Instruct',
        description: 'Meta Llama 3.1 오픈소스 모델',
        maxTokens: 128000,
      },
    ]
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    const result = await invoke<{
      response: string
      usage: { input_tokens: number; output_tokens: number }
    }>('invoke_bedrock', {
      request: {
        model_id: request.model || 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        prompt: request.prompt,
        system_prompt: request.systemPrompt || '',
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature || 0.7,
      },
    })

    return {
      text: result.response,
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
      },
      model: request.model || 'anthropic.claude-3-5-sonnet-20240620-v1:0',
    }
  }
}
