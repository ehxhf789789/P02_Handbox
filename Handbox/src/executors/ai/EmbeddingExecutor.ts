/**
 * Embedding Executor — 텍스트 임베딩 생성
 *
 * 현재: AWS Bedrock Titan Embeddings (Tauri invoke)
 * 향후: ProviderRegistry 기반 멀티 프로바이더 지원
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

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

    const modelId = config.model_id || 'amazon.titan-embed-text-v1'
    const maxCharsPerText = config.max_chars || 8000
    const embeddings: number[][] = []
    let dimension = 0

    for (const text of textsToEmbed) {
      const result = await invoke<{ embedding: number[]; dimension: number }>('create_embedding', {
        request: {
          text: String(text).slice(0, maxCharsPerText),
          model_id: modelId,
        },
      })
      embeddings.push(result.embedding)
      dimension = result.dimension
    }

    return {
      embeddings,
      vectors_created: embeddings.length,
      dimension,
      model: modelId,
      status: `${embeddings.length}개 임베딩 생성 완료 (차원: ${dimension})`,
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
    { key: 'model_id', label: '임베딩 모델', type: 'select', default: 'amazon.titan-embed-text-v1', options: [
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
