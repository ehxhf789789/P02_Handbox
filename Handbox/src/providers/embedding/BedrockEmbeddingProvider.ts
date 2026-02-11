/**
 * Bedrock Embedding Provider — AWS Bedrock Titan Embeddings
 *
 * Tauri 커맨드 create_embedding을 래핑.
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { EmbeddingRequest, EmbeddingResponse } from '../../engine/types'
import type { EmbeddingProvider, ModelInfo } from '../../registry/ProviderRegistry'

export class BedrockEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'bedrock-embedding'
  readonly name = 'AWS Bedrock Embeddings'

  private connected = false

  async connect(_credentials: Record<string, any>): Promise<boolean> {
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
    return [
      { id: 'amazon.titan-embed-text-v1', name: 'Titan Embed Text V1', description: '1536차원 텍스트 임베딩', maxTokens: 8000 },
      { id: 'amazon.titan-embed-text-v2:0', name: 'Titan Embed Text V2', description: '최신 텍스트 임베딩', maxTokens: 8000 },
      { id: 'cohere.embed-english-v3', name: 'Cohere Embed English', description: '영어 특화 임베딩', maxTokens: 512 },
      { id: 'cohere.embed-multilingual-v3', name: 'Cohere Embed Multilingual', description: '다국어 임베딩', maxTokens: 512 },
    ]
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const modelId = request.model || 'amazon.titan-embed-text-v1'
    const embeddings: number[][] = []
    let dimension = 0

    for (const text of request.texts) {
      const result = await invoke<{ embedding: number[]; dimension: number }>('create_embedding', {
        request: {
          text: text.slice(0, 8000),
          model_id: modelId,
        },
      })
      embeddings.push(result.embedding)
      dimension = result.dimension
    }

    return {
      embeddings,
      dimension,
      model: modelId,
    }
  }
}
