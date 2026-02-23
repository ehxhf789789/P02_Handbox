/**
 * LocalLLMProviderAdapter
 *
 * LocalLLMProvider를 ProviderRegistry의 LLMProvider 인터페이스에 맞게 래핑.
 * 이를 통해 ProviderRegistry에서 로컬 LLM을 통합 관리할 수 있습니다.
 */

import { LocalLLMProvider, configureOllama, configureLMStudio } from '../services/LocalLLMProvider'
import type { LLMProvider, ModelInfo, EmbeddingProvider } from '../registry/ProviderRegistry'
import type { LLMRequest, LLMResponse, EmbeddingRequest, EmbeddingResponse } from '../engine/types'

// ============================================================
// LocalLLM LLMProvider 어댑터
// ============================================================

class LocalLLMProviderAdapterImpl implements LLMProvider {
  readonly id = 'local'
  readonly name = '로컬 LLM'
  readonly icon = 'Computer'

  private connected: boolean = false

  async connect(credentials: Record<string, any>): Promise<boolean> {
    const backend = credentials.backend || 'ollama'
    const model = credentials.model || (backend === 'ollama' ? 'llama3.2' : 'local-model')
    const endpoint = credentials.endpoint

    if (backend === 'ollama') {
      configureOllama(model)
    } else if (backend === 'lmstudio') {
      configureLMStudio(model)
    } else {
      LocalLLMProvider.configure({
        backend,
        endpoint: endpoint || 'http://localhost:11434',
        model,
      })
    }

    const result = await LocalLLMProvider.testConnection()
    this.connected = result.success
    return result.success
  }

  disconnect(): void {
    this.connected = false
  }

  isConnected(): boolean {
    // 실제 연결 테스트 결과 반환 (connect() 성공 시에만 true)
    // 단순 설정 존재 여부가 아닌 실제 연결 상태 확인
    return this.connected
  }

  async listModels(): Promise<ModelInfo[]> {
    const config = LocalLLMProvider.getConfig()
    if (!config) {
      return []
    }

    const result = await LocalLLMProvider.testConnection()
    if (!result.success || !result.models) {
      return []
    }

    return result.models.map(name => ({
      id: name,
      name,
      description: `로컬 모델: ${name}`,
    }))
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    const response = await LocalLLMProvider.generate({
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    })

    return {
      text: response.content,
      model: response.model,
      usage: {
        inputTokens: response.tokensUsed.prompt,
        outputTokens: response.tokensUsed.completion,
      },
    }
  }
}

// ============================================================
// LocalLLM EmbeddingProvider 어댑터
// ============================================================

class LocalEmbeddingProviderAdapterImpl implements EmbeddingProvider {
  readonly id = 'local-embedding'
  readonly name = '로컬 임베딩'

  private connected: boolean = false

  async connect(credentials: Record<string, any>): Promise<boolean> {
    const backend = credentials.backend || 'ollama'
    const model = credentials.model || 'nomic-embed-text'

    if (backend === 'ollama') {
      configureOllama(model)
    } else {
      LocalLLMProvider.configure({
        backend,
        endpoint: credentials.endpoint || 'http://localhost:11434',
        model,
      })
    }

    const result = await LocalLLMProvider.testConnection()
    this.connected = result.success
    return result.success
  }

  disconnect(): void {
    this.connected = false
  }

  isConnected(): boolean {
    // 실제 연결 테스트 결과 반환
    return this.connected
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: 'nomic-embed-text', name: 'Nomic Embed Text', description: 'Ollama 임베딩 모델 (768 차원)' },
      { id: 'mxbai-embed-large', name: 'mxbai-embed-large', description: '대형 임베딩 모델 (1024 차원)' },
      { id: 'all-minilm', name: 'all-minilm', description: '경량 임베딩 모델 (384 차원)' },
      { id: 'snowflake-arctic-embed', name: 'Snowflake Arctic Embed', description: '다국어 임베딩' },
    ]
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const response = await LocalLLMProvider.embed({
      texts: request.texts,
      model: request.model,
    })

    return {
      embeddings: response.embeddings,
      model: response.model,
      dimension: response.dimensions,
    }
  }
}

// ============================================================
// 싱글톤 인스턴스
// ============================================================

export const LocalLLMProviderAdapter = new LocalLLMProviderAdapterImpl()
export const LocalEmbeddingProviderAdapter = new LocalEmbeddingProviderAdapterImpl()
