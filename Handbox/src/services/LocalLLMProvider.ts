/**
 * Local LLM Provider
 *
 * 로컬 LLM (Ollama, llama.cpp, LM Studio 등)과 연동하여
 * AWS Bedrock 없이 완전히 독립적으로 동작할 수 있도록 합니다.
 *
 * 지원 백엔드:
 * - Ollama (ollama.ai) - 권장
 * - LM Studio (lmstudio.ai)
 * - llama.cpp server
 * - LocalAI
 * - Text Generation WebUI (oobabooga)
 *
 * 이 구성으로 클라우드 API 비용 없이 완전한 LLM 워크플로우 가능
 */

import { invoke } from '@tauri-apps/api/tauri'

// ============================================================
// Types
// ============================================================

export interface LocalLLMConfig {
  /** 백엔드 유형 */
  backend: 'ollama' | 'lmstudio' | 'llamacpp' | 'localai' | 'textgen'
  /** API 엔드포인트 */
  endpoint: string
  /** 사용할 모델 이름 */
  model: string
  /** 기본 온도 */
  defaultTemperature?: number
  /** 기본 max tokens */
  defaultMaxTokens?: number
  /** API 키 (필요한 경우) */
  apiKey?: string
}

export interface LocalLLMRequest {
  prompt: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  stop?: string[]
  stream?: boolean
}

export interface LocalLLMResponse {
  content: string
  model: string
  tokensUsed: {
    prompt: number
    completion: number
    total: number
  }
  processingTime: number
}

export interface LocalEmbeddingRequest {
  texts: string[]
  model?: string
}

export interface LocalEmbeddingResponse {
  embeddings: number[][]
  model: string
  dimensions: number
}

// ============================================================
// Default Configurations
// ============================================================

const DEFAULT_CONFIGS: Record<string, Partial<LocalLLMConfig>> = {
  ollama: {
    endpoint: 'http://localhost:11434',
    model: 'llama3.2',
  },
  lmstudio: {
    endpoint: 'http://localhost:1234/v1',
    model: 'local-model',
  },
  llamacpp: {
    endpoint: 'http://localhost:8080',
    model: 'default',
  },
  localai: {
    endpoint: 'http://localhost:8080/v1',
    model: 'gpt-3.5-turbo',
  },
  textgen: {
    endpoint: 'http://localhost:5000/v1',
    model: 'default',
  },
}

// ============================================================
// Local LLM Provider Class
// ============================================================

class LocalLLMProviderImpl {
  private config: LocalLLMConfig | null = null
  private isConnected: boolean = false

  /**
   * 로컬 LLM 백엔드 설정
   */
  configure(config: LocalLLMConfig): void {
    this.config = {
      ...DEFAULT_CONFIGS[config.backend],
      ...config,
    }
    this.isConnected = false
    console.log(`[LocalLLM] Configured: ${config.backend} @ ${this.config.endpoint}`)
  }

  /**
   * 연결 테스트
   */
  async testConnection(): Promise<{ success: boolean; models?: string[]; error?: string }> {
    if (!this.config) {
      return { success: false, error: 'Not configured' }
    }

    try {
      switch (this.config.backend) {
        case 'ollama': {
          const response = await fetch(`${this.config.endpoint}/api/tags`)
          if (response.ok) {
            const data = await response.json()
            const models = data.models?.map((m: any) => m.name) || []
            this.isConnected = true
            return { success: true, models }
          }
          return { success: false, error: `HTTP ${response.status}` }
        }

        case 'lmstudio':
        case 'localai':
        case 'textgen': {
          const response = await fetch(`${this.config.endpoint}/models`)
          if (response.ok) {
            const data = await response.json()
            const models = data.data?.map((m: any) => m.id) || []
            this.isConnected = true
            return { success: true, models }
          }
          return { success: false, error: `HTTP ${response.status}` }
        }

        case 'llamacpp': {
          const response = await fetch(`${this.config.endpoint}/health`)
          if (response.ok) {
            this.isConnected = true
            return { success: true, models: [this.config.model] }
          }
          return { success: false, error: `HTTP ${response.status}` }
        }

        default:
          return { success: false, error: 'Unknown backend' }
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  /**
   * LLM 추론 실행
   */
  async generate(request: LocalLLMRequest): Promise<LocalLLMResponse> {
    if (!this.config) {
      throw new Error('LocalLLM not configured. Call configure() first.')
    }

    const startTime = Date.now()

    try {
      switch (this.config.backend) {
        case 'ollama':
          return await this.generateOllama(request, startTime)

        case 'lmstudio':
        case 'localai':
        case 'textgen':
          return await this.generateOpenAICompatible(request, startTime)

        case 'llamacpp':
          return await this.generateLlamaCpp(request, startTime)

        default:
          throw new Error(`Unsupported backend: ${this.config.backend}`)
      }
    } catch (error) {
      // 로컬 LLM 연결 실패 시 시뮬레이션 모드
      console.warn('[LocalLLM] Connection failed, using simulation:', error)
      return this.simulateResponse(request, startTime)
    }
  }

  /**
   * 임베딩 생성 (RAG용)
   */
  async embed(request: LocalEmbeddingRequest): Promise<LocalEmbeddingResponse> {
    if (!this.config) {
      throw new Error('LocalLLM not configured. Call configure() first.')
    }

    try {
      switch (this.config.backend) {
        case 'ollama': {
          const embeddings: number[][] = []
          for (const text of request.texts) {
            const response = await fetch(`${this.config.endpoint}/api/embeddings`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: request.model || 'nomic-embed-text',
                prompt: text,
              }),
            })
            const data = await response.json()
            embeddings.push(data.embedding)
          }
          return {
            embeddings,
            model: request.model || 'nomic-embed-text',
            dimensions: embeddings[0]?.length || 768,
          }
        }

        case 'lmstudio':
        case 'localai': {
          const response = await fetch(`${this.config.endpoint}/embeddings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {}),
            },
            body: JSON.stringify({
              model: request.model || 'text-embedding-ada-002',
              input: request.texts,
            }),
          })
          const data = await response.json()
          return {
            embeddings: data.data.map((d: any) => d.embedding),
            model: request.model || 'text-embedding-ada-002',
            dimensions: data.data[0]?.embedding?.length || 1536,
          }
        }

        default:
          // 시뮬레이션
          return this.simulateEmbedding(request)
      }
    } catch (error) {
      console.warn('[LocalLLM] Embedding failed, trying Bedrock fallback:', error)

      // Bedrock 임베딩 폴백 시도
      try {
        const { invoke } = await import('@tauri-apps/api/tauri')
        const embeddings: number[][] = []

        for (const text of request.texts) {
          // 텍스트가 객체일 수 있으므로 문자열로 확실히 변환
          const textStr = typeof text === 'string' ? text : (text as any)?.content || String(text || '')
          // Rust 명령은 request: EmbeddingRequest 래퍼를 기대함
          const result = await invoke<{ embedding: number[]; dimension: number }>('create_embedding', {
            request: {
              text: textStr,
              model_id: 'amazon.titan-embed-text-v1',
            }
          })
          embeddings.push(result.embedding)
        }

        console.log('[LocalLLM] Bedrock 임베딩 폴백 성공')
        return {
          embeddings,
          model: 'amazon.titan-embed-text-v1',
          dimensions: embeddings[0]?.length || 1536,
        }
      } catch (bedrockError) {
        console.warn('[LocalLLM] Bedrock 임베딩도 실패, 시뮬레이션 사용:', bedrockError)
        return this.simulateEmbedding(request)
      }
    }
  }

  // ============================================================
  // Backend-specific implementations
  // ============================================================

  private async generateOllama(request: LocalLLMRequest, startTime: number): Promise<LocalLLMResponse> {
    const response = await fetch(`${this.config!.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config!.model,
        prompt: request.systemPrompt
          ? `${request.systemPrompt}\n\nUser: ${request.prompt}\n\nAssistant:`
          : request.prompt,
        stream: false,
        options: {
          temperature: request.temperature ?? this.config!.defaultTemperature ?? 0.7,
          num_predict: request.maxTokens ?? this.config!.defaultMaxTokens ?? 1024,
          stop: request.stop,
        },
      }),
    })

    const data = await response.json()

    return {
      content: data.response,
      model: this.config!.model,
      tokensUsed: {
        prompt: data.prompt_eval_count || 0,
        completion: data.eval_count || 0,
        total: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      processingTime: Date.now() - startTime,
    }
  }

  private async generateOpenAICompatible(request: LocalLLMRequest, startTime: number): Promise<LocalLLMResponse> {
    const messages = []
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt })
    }
    messages.push({ role: 'user', content: request.prompt })

    const response = await fetch(`${this.config!.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config!.apiKey ? { 'Authorization': `Bearer ${this.config!.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config!.model,
        messages,
        temperature: request.temperature ?? this.config!.defaultTemperature ?? 0.7,
        max_tokens: request.maxTokens ?? this.config!.defaultMaxTokens ?? 1024,
        stop: request.stop,
        stream: false,
      }),
    })

    const data = await response.json()
    const choice = data.choices?.[0]

    return {
      content: choice?.message?.content || '',
      model: this.config!.model,
      tokensUsed: {
        prompt: data.usage?.prompt_tokens || 0,
        completion: data.usage?.completion_tokens || 0,
        total: data.usage?.total_tokens || 0,
      },
      processingTime: Date.now() - startTime,
    }
  }

  private async generateLlamaCpp(request: LocalLLMRequest, startTime: number): Promise<LocalLLMResponse> {
    const response = await fetch(`${this.config!.endpoint}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: request.systemPrompt
          ? `${request.systemPrompt}\n\nUser: ${request.prompt}\n\nAssistant:`
          : request.prompt,
        temperature: request.temperature ?? this.config!.defaultTemperature ?? 0.7,
        n_predict: request.maxTokens ?? this.config!.defaultMaxTokens ?? 1024,
        stop: request.stop || ['User:', '\n\n'],
        stream: false,
      }),
    })

    const data = await response.json()

    return {
      content: data.content,
      model: this.config!.model,
      tokensUsed: {
        prompt: data.tokens_evaluated || 0,
        completion: data.tokens_predicted || 0,
        total: (data.tokens_evaluated || 0) + (data.tokens_predicted || 0),
      },
      processingTime: Date.now() - startTime,
    }
  }

  // ============================================================
  // No LLM Available Response (replaces fake simulation)
  // ============================================================

  private simulateResponse(request: LocalLLMRequest, startTime: number): LocalLLMResponse {
    // 시뮬레이션은 가짜 콘텐츠를 생성하지 않음
    // 대신 LLM 연결이 필요하다는 명확한 메시지만 반환
    // IntegratedWorkflowAgent에서 이를 감지하고 Bedrock 등 다른 프로바이더로 폴백
    const content = `[시뮬레이션] 로컬 LLM(Ollama)이 연결되지 않았습니다.

실제 AI 응답을 받으려면:
1. Ollama 실행: ollama run llama3.2
2. 또는 AI 설정에서 API 키 입력 (OpenAI, Anthropic, AWS Bedrock 등)

요청 내용: "${request.prompt.slice(0, 50)}..."`

    return {
      content,
      model: 'simulation',
      tokensUsed: {
        prompt: Math.ceil(request.prompt.length / 4),
        completion: Math.ceil(content.length / 4),
        total: Math.ceil((request.prompt.length + content.length) / 4),
      },
      processingTime: Date.now() - startTime,
    }
  }

  private simulateEmbedding(request: LocalEmbeddingRequest): LocalEmbeddingResponse {
    // 간단한 해시 기반 시뮬레이션 임베딩
    const dimensions = 768
    const embeddings = request.texts.map(text => {
      const embedding = new Array(dimensions).fill(0)
      for (let i = 0; i < text.length; i++) {
        const idx = (text.charCodeAt(i) * (i + 1)) % dimensions
        embedding[idx] += 0.01
      }
      // 정규화
      const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0))
      return embedding.map(v => v / (norm || 1))
    })

    return {
      embeddings,
      model: 'simulation',
      dimensions,
    }
  }

  // ============================================================
  // Utilities
  // ============================================================

  /**
   * 현재 설정 조회
   */
  getConfig(): LocalLLMConfig | null {
    return this.config
  }

  /**
   * 연결 상태 확인
   */
  isReady(): boolean {
    return this.config !== null && this.isConnected
  }

  /**
   * 지원 백엔드 목록
   */
  getSupportedBackends(): string[] {
    return ['ollama', 'lmstudio', 'llamacpp', 'localai', 'textgen']
  }

  /**
   * 권장 모델 목록
   */
  getRecommendedModels(backend: string): string[] {
    const recommendations: Record<string, string[]> = {
      ollama: [
        'llama3.2',           // 최신 Meta LLaMA
        'llama3.2:1b',        // 경량 버전
        'mistral',            // Mistral 7B
        'mixtral',            // Mixtral 8x7B
        'codellama',          // 코드 특화
        'nomic-embed-text',   // 임베딩용
      ],
      lmstudio: [
        'TheBloke/Llama-2-7B-Chat-GGUF',
        'TheBloke/Mistral-7B-Instruct-v0.2-GGUF',
      ],
      llamacpp: [
        'llama-2-7b-chat.Q4_K_M.gguf',
        'mistral-7b-instruct-v0.2.Q4_K_M.gguf',
      ],
    }
    return recommendations[backend] || []
  }
}

// 싱글톤 인스턴스
export const LocalLLMProvider = new LocalLLMProviderImpl()

// ============================================================
// 편의 함수
// ============================================================

/**
 * 빠른 설정 - Ollama 기본 설정
 */
export function configureOllama(model: string = 'llama3.2'): void {
  LocalLLMProvider.configure({
    backend: 'ollama',
    endpoint: 'http://localhost:11434',
    model,
  })
}

/**
 * 빠른 설정 - LM Studio 기본 설정
 */
export function configureLMStudio(model: string = 'local-model'): void {
  LocalLLMProvider.configure({
    backend: 'lmstudio',
    endpoint: 'http://localhost:1234/v1',
    model,
  })
}

/**
 * 로컬 LLM으로 간단히 생성
 */
export async function generateLocal(prompt: string, systemPrompt?: string): Promise<string> {
  if (!LocalLLMProvider.getConfig()) {
    configureOllama()
  }
  const response = await LocalLLMProvider.generate({ prompt, systemPrompt })
  return response.content
}

/**
 * 로컬 임베딩 생성
 */
export async function embedLocal(texts: string[]): Promise<number[][]> {
  if (!LocalLLMProvider.getConfig()) {
    configureOllama()
  }
  const response = await LocalLLMProvider.embed({ texts })
  return response.embeddings
}
