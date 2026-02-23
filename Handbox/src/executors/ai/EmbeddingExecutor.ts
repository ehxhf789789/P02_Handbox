/**
 * Embedding Executor — 텍스트 임베딩 생성
 *
 * 지원 프로바이더:
 * - bedrock: AWS Bedrock Titan Embeddings (우선)
 * - local: Ollama (nomic-embed-text), LM Studio (OpenAI 호환)
 * - openai: OpenAI Embeddings API
 *
 * 우선순위: bedrock → local → simulation
 */

import { invoke } from '@tauri-apps/api/tauri'
import { LocalLLMProvider, configureOllama } from '../../services/LocalLLMProvider'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

// 프로바이더별 임베딩 생성
async function createLocalEmbedding(texts: string[], modelId: string): Promise<{ embeddings: number[][]; dimension: number }> {
  // LocalLLMProvider 설정 확인
  if (!LocalLLMProvider.getConfig()) {
    configureOllama()
  }

  const response = await LocalLLMProvider.embed({ texts, model: modelId })
  return {
    embeddings: response.embeddings,
    dimension: response.dimensions,
  }
}

async function createBedrockEmbedding(texts: string[], modelId: string, maxChars: number): Promise<{ embeddings: number[][]; dimension: number }> {
  const embeddings: number[][] = []
  let dimension = 0

  for (const text of texts) {
    // 텍스트가 객체일 수 있으므로 문자열로 확실히 변환
    const textStr = typeof text === 'string' ? text : (text as any)?.content || String(text || '')
    // Rust 명령은 request: EmbeddingRequest 래퍼를 기대함
    const result = await invoke<{ embedding: number[]; dimension: number }>('create_embedding', {
      request: {
        text: textStr.slice(0, maxChars),
        model_id: modelId,
      }
    })
    embeddings.push(result.embedding)
    dimension = result.dimension
  }

  return { embeddings, dimension }
}

// 시뮬레이션 임베딩 (폴백)
function createSimulationEmbedding(texts: string[]): { embeddings: number[][]; dimension: number } {
  const dimension = 768
  const embeddings = texts.map(text => {
    const embedding = new Array(dimension).fill(0)
    for (let i = 0; i < text.length; i++) {
      const idx = (text.charCodeAt(i) * (i + 1)) % dimension
      embedding[idx] += 0.01
    }
    // 정규화
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0))
    return embedding.map(v => v / (norm || 1))
  })
  return { embeddings, dimension }
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    _context: ExecutionContext,
  ): Promise<Record<string, any>> {
    // 입력 텍스트 추출: chunks 배열 또는 단일 텍스트
    const chunks: any[] = input.chunks || input._predecessors?.[0]?.chunks || []
    const inputText = input.text || input._predecessors?.[0]?.text || ''

    const textsToEmbed = chunks.length > 0
      ? chunks.map((c: any) => typeof c === 'string' ? c : c.content || c).slice(0, config.batch_limit || 20)
      : inputText ? [inputText] : []

    if (textsToEmbed.length === 0) {
      return { embeddings: [], vectors_created: 0, dimension: 0, status: '임베딩할 텍스트 없음' }
    }

    const provider = config.provider || 'auto'
    const modelId = config.model_id || 'nomic-embed-text'
    const maxCharsPerText = config.max_chars || 8000

    let embeddings: number[][] = []
    let dimension = 0
    let usedProvider = provider

    try {
      if (provider === 'bedrock' || provider === 'auto') {
        // Bedrock 임베딩 시도 (우선)
        try {
          const bedrockModel = config.bedrock_model || 'amazon.titan-embed-text-v1'
          console.log('[EmbeddingExecutor] Bedrock 임베딩 시도:', bedrockModel)
          const result = await createBedrockEmbedding(textsToEmbed, bedrockModel, maxCharsPerText)
          embeddings = result.embeddings
          dimension = result.dimension
          usedProvider = 'bedrock'
        } catch (bedrockError) {
          console.warn('[EmbeddingExecutor] Bedrock 임베딩 실패:', bedrockError)

          if (provider === 'auto') {
            // 로컬 폴백
            try {
              console.log('[EmbeddingExecutor] 로컬 임베딩 폴백 시도:', modelId)
              const result = await createLocalEmbedding(textsToEmbed, modelId)
              embeddings = result.embeddings
              dimension = result.dimension
              usedProvider = 'local'

              // 시뮬레이션 응답 감지
              if (dimension === 768 && embeddings.every(e => e.every(v => Math.abs(v) < 0.1))) {
                throw new Error('시뮬레이션 응답 감지')
              }
            } catch (localError) {
              console.warn('[EmbeddingExecutor] 로컬 임베딩도 실패:', localError)
              throw bedrockError  // 원래 Bedrock 에러 전파
            }
          } else {
            throw bedrockError
          }
        }
      } else if (provider === 'local') {
        console.log('[EmbeddingExecutor] 로컬 임베딩 사용:', modelId)
        const result = await createLocalEmbedding(textsToEmbed, modelId)
        embeddings = result.embeddings
        dimension = result.dimension
        usedProvider = 'local'
      } else {
        throw new Error(`알 수 없는 프로바이더: ${provider}`)
      }
    } catch (error) {
      // ⚠️ 시뮬레이션 폴백 - 버그로 취급됨
      console.warn('[EmbeddingExecutor] 모든 프로바이더 실패, 시뮬레이션 사용:', error)
      const result = createSimulationEmbedding(textsToEmbed)
      embeddings = result.embeddings
      dimension = result.dimension
      usedProvider = 'simulation'

      // _simulation: true 플래그 - WorkflowSimulator가 버그로 감지
      return {
        embeddings,
        vectors_created: embeddings.length,
        dimension,
        model: modelId,
        provider: usedProvider,
        status: `${embeddings.length}개 임베딩 생성 (시뮬레이션 폴백)`,
        _simulation: true,
        _note: '로컬(Ollama) 및 Bedrock 임베딩 모두 실패. 실제 임베딩 서비스 연결 필요.',
      }
    }

    return {
      embeddings,
      vectors_created: embeddings.length,
      dimension,
      model: modelId,
      provider: usedProvider,
      status: `${embeddings.length}개 임베딩 생성 완료 (${usedProvider}, 차원: ${dimension})`,
    }
  },
}

export const EmbeddingDefinition: NodeDefinition = {
  type: 'ai.embedding',
  category: 'ai',
  meta: {
    label: '임베딩 생성',
    description: '텍스트를 벡터 임베딩으로 변환합니다',
    icon: 'Layers',
    color: '#009688',
    tags: ['임베딩', '벡터', 'embedding', 'vector', 'titan', 'bedrock'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: false, description: '임베딩할 텍스트' },
      { name: 'chunks', type: 'text[]', required: false, description: '임베딩할 텍스트 청크 배열' },
    ],
    outputs: [
      { name: 'embeddings', type: 'vector[]', required: true, description: '생성된 임베딩 벡터 배열' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'select', default: 'auto', options: [
      { label: '자동 (Bedrock 우선)', value: 'auto' },
      { label: 'AWS Bedrock', value: 'bedrock' },
      { label: '로컬 (Ollama/LM Studio)', value: 'local' },
    ]},
    { key: 'model_id', label: '로컬 모델', type: 'select', default: 'nomic-embed-text', options: [
      { label: 'Nomic Embed Text', value: 'nomic-embed-text' },
      { label: 'mxbai-embed-large', value: 'mxbai-embed-large' },
      { label: 'all-minilm', value: 'all-minilm' },
      { label: 'snowflake-arctic-embed', value: 'snowflake-arctic-embed' },
    ]},
    { key: 'bedrock_model', label: 'Bedrock 모델', type: 'select', default: 'amazon.titan-embed-text-v1', options: [
      { label: 'Amazon Titan Embed V1', value: 'amazon.titan-embed-text-v1' },
      { label: 'Amazon Titan Embed V2', value: 'amazon.titan-embed-text-v2:0' },
      { label: 'Cohere Embed English', value: 'cohere.embed-english-v3' },
      { label: 'Cohere Embed Multilingual', value: 'cohere.embed-multilingual-v3' },
    ]},
    { key: 'batch_limit', label: '배치 제한', type: 'number', default: 20, min: 1, max: 100 },
    { key: 'max_chars', label: '텍스트당 최대 문자', type: 'number', default: 8000, min: 100, max: 25000 },
  ],
  runtime: 'tauri',
  executor,
  requirements: {
    provider: 'aws',
  },
}
