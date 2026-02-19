/**
 * CloudStorageExecutor - AWS S3 + embedding storage
 *
 * Upload data to S3 with optional embedding for vector search
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

const executor: NodeExecutor = {
  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const operation = (config.operation as string) || 'upload'
    const bucketName = config.bucket_name as string
    const keyPrefix = (config.key_prefix as string) || ''
    const autoEmbed = config.auto_embed as boolean

    // Get input data
    const predecessors = input._predecessors as unknown[] | undefined
    const inputData = input.data || input.text || (predecessors?.[0])

    if (!bucketName) {
      return {
        success: false,
        error: 'S3 버킷 이름을 지정하세요.',
      }
    }

    try {
      switch (operation) {
        case 'upload':
          // Convert data to string if needed
          const content = typeof inputData === 'string'
            ? inputData
            : JSON.stringify(inputData, null, 2)

          const key = `${keyPrefix}${Date.now()}.json`

          // Upload to S3
          const uploadResult = await invoke<{ success: boolean; key: string }>('upload_to_s3', {
            bucket: bucketName,
            key,
            content,
          })

          let embedding = null
          if (autoEmbed && content) {
            // Create embedding for the content
            try {
              embedding = await invoke<{ embedding: number[] }>('create_embedding', {
                text: content.slice(0, 8000),
                modelId: 'amazon.titan-embed-text-v1',
              })
            } catch (embeddingError) {
              console.warn('Embedding failed:', embeddingError)
            }
          }

          return {
            success: true,
            s3_key: uploadResult.key,
            s3_uri: `s3://${bucketName}/${uploadResult.key}`,
            embedded: !!embedding,
            embedding: embedding?.embedding,
          }

        case 'list':
          const listResult = await invoke<{ keys: string[] }>('list_s3_objects', {
            bucket: bucketName,
            prefix: keyPrefix,
          })
          return {
            success: true,
            keys: listResult.keys,
            count: listResult.keys.length,
          }

        case 'download':
          const downloadKey = config.s3_key as string
          if (!downloadKey) {
            return { success: false, error: 'S3 키를 지정하세요.' }
          }
          const downloadResult = await invoke<{ content: string }>('download_from_s3', {
            bucket: bucketName,
            key: downloadKey,
          })
          try {
            return {
              success: true,
              data: JSON.parse(downloadResult.content),
              text: downloadResult.content,
            }
          } catch {
            return {
              success: true,
              data: downloadResult.content,
              text: downloadResult.content,
            }
          }

        default:
          return {
            success: false,
            error: '알 수 없는 작업입니다.',
          }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

export const CloudStorageDefinition: NodeDefinition = {
  type: 'storage.cloud',
  category: 'storage',
  meta: {
    label: '클라우드 저장소',
    description: 'AWS S3에 데이터를 저장하고 선택적으로 임베딩을 생성합니다',
    icon: 'Cloud',
    color: '#f59e0b',
    tags: ['저장', 'S3', 'AWS', '클라우드', '임베딩'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: false, description: '저장할 데이터' },
    ],
    outputs: [
      { name: 's3_uri', type: 'text', required: true, description: 'S3 URI' },
      { name: 'embedding', type: 'vector', required: false, description: '임베딩 벡터' },
      { name: 'data', type: 'json', required: false, description: '조회 결과' },
    ],
  },
  configSchema: [
    {
      key: 'operation',
      label: '작업',
      type: 'select',
      required: true,
      default: 'upload',
      options: [
        { label: '업로드', value: 'upload' },
        { label: '다운로드', value: 'download' },
        { label: '목록 조회', value: 'list' },
      ],
    },
    { key: 'bucket_name', label: 'S3 버킷 이름', type: 'text', required: true },
    { key: 'key_prefix', label: '키 프리픽스', type: 'text', required: false },
    { key: 's3_key', label: 'S3 키 (다운로드)', type: 'text', required: false },
    { key: 'auto_embed', label: '자동 임베딩', type: 'toggle', required: false, default: false },
  ],
  runtime: 'tauri',
  requirements: { provider: 'aws' },
  executor,
}

export default CloudStorageDefinition
