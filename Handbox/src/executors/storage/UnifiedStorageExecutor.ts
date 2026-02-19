/**
 * UnifiedStorageExecutor - Local/Cloud unified storage
 *
 * Single node that can switch between local and cloud storage
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
    const mode = (config.mode as string) || 'local-json'
    const operation = (config.operation as string) || 'save'
    const collection = (config.collection as string) || 'default'
    const autoEmbed = config.auto_embed as boolean

    // Get input data
    const predecessors = input._predecessors as unknown[] | undefined
    const inputData = input.data || input.text || (predecessors?.[0])

    try {
      // Local modes
      if (mode.startsWith('local-')) {
        const storageType = mode === 'local-sqlite' ? 'sqlite' : 'json'
        const dbPath = (config.local_path as string) || './handbox-data/storage'

        if (storageType === 'sqlite') {
          switch (operation) {
            case 'save':
              const insertId = await invoke<number>('sqlite_save', {
                dbPath: `${dbPath}/${collection}.db`,
                table: collection,
                data: inputData,
              })
              return {
                success: true,
                mode: 'local-sqlite',
                id: insertId,
                message: `SQLite 저장 완료 (ID: ${insertId})`,
              }

            case 'load':
              const query = (config.query as string) || `SELECT * FROM ${collection}`
              const rows = await invoke<unknown[]>('sqlite_query', {
                dbPath: `${dbPath}/${collection}.db`,
                sql: query,
              })
              return {
                success: true,
                mode: 'local-sqlite',
                data: rows,
                count: rows.length,
              }
          }
        } else {
          // JSON storage
          const filePath = `${dbPath}/${collection}.json`

          switch (operation) {
            case 'save':
              await invoke('json_save', { filePath, data: inputData })
              return {
                success: true,
                mode: 'local-json',
                path: filePath,
                message: `JSON 저장 완료`,
              }

            case 'load':
              const jsonData = await invoke('json_load', { filePath })
              return {
                success: true,
                mode: 'local-json',
                data: jsonData,
              }
          }
        }
      }

      // Cloud modes
      if (mode.startsWith('cloud-')) {
        const bucketName = config.bucket_name as string
        if (!bucketName) {
          return { success: false, error: 'S3 버킷 이름을 지정하세요.' }
        }

        const content = typeof inputData === 'string'
          ? inputData
          : JSON.stringify(inputData, null, 2)

        switch (operation) {
          case 'save':
            const key = `${collection}/${Date.now()}.json`
            const uploadResult = await invoke<{ success: boolean; key: string }>('upload_to_s3', {
              bucket: bucketName,
              key,
              content,
            })

            let embedding = null
            if (mode === 'cloud-vector' && autoEmbed && content) {
              try {
                embedding = await invoke<{ embedding: number[] }>('create_embedding', {
                  text: content.slice(0, 8000),
                  modelId: 'amazon.titan-embed-text-v1',
                })
              } catch (e) {
                console.warn('Embedding failed:', e)
              }
            }

            return {
              success: true,
              mode,
              s3_uri: `s3://${bucketName}/${uploadResult.key}`,
              embedded: !!embedding,
              embedding: embedding?.embedding,
            }

          case 'load':
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
                mode,
                data: JSON.parse(downloadResult.content),
              }
            } catch {
              return {
                success: true,
                mode,
                data: downloadResult.content,
              }
            }
        }
      }

      return {
        success: false,
        error: '지원하지 않는 저장소 모드입니다.',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

export const UnifiedStorageDefinition: NodeDefinition = {
  type: 'storage.unified',
  category: 'storage',
  meta: {
    label: '통합 저장소',
    description: '로컬(SQLite/JSON) 또는 클라우드(S3/벡터DB)에 데이터를 저장합니다',
    icon: 'Inventory',
    color: '#10b981',
    tags: ['저장', '로컬', '클라우드', 'S3', 'sqlite', '통합'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: false, description: '저장할 데이터' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '결과 데이터' },
      { name: 'success', type: 'any', required: false, description: '성공 여부' },
      { name: 'embedding', type: 'vector', required: false, description: '임베딩 (벡터 모드)' },
    ],
  },
  configSchema: [
    {
      key: 'mode',
      label: '저장 위치',
      type: 'select',
      required: true,
      default: 'local-json',
      options: [
        { label: '로컬 (JSON)', value: 'local-json' },
        { label: '로컬 (SQLite)', value: 'local-sqlite' },
        { label: 'AWS S3', value: 'cloud-s3' },
        { label: 'AWS S3 + 벡터DB', value: 'cloud-vector' },
      ],
    },
    {
      key: 'operation',
      label: '작업',
      type: 'select',
      required: true,
      default: 'save',
      options: [
        { label: '저장', value: 'save' },
        { label: '조회', value: 'load' },
      ],
    },
    { key: 'collection', label: '컬렉션명', type: 'text', required: true, default: 'default' },
    { key: 'local_path', label: '로컬 경로', type: 'folder', required: false, default: './handbox-data/storage' },
    { key: 'bucket_name', label: 'S3 버킷 (클라우드)', type: 'text', required: false },
    { key: 's3_key', label: 'S3 키 (조회)', type: 'text', required: false },
    { key: 'query', label: 'SQL 쿼리 (SQLite)', type: 'textarea', required: false },
    { key: 'auto_embed', label: '자동 임베딩', type: 'toggle', required: false, default: false },
  ],
  runtime: 'tauri',
  executor,
}

export default UnifiedStorageDefinition
