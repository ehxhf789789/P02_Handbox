/**
 * LocalStorageExecutor - Local SQLite/JSON storage
 *
 * Store and retrieve data from local SQLite database or JSON files
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
    const storageType = (config.storage_type as string) || 'json'
    const operation = (config.operation as string) || 'save'
    const collection = (config.collection as string) || 'default'
    const dbPath = (config.db_path as string) || './handbox-data/storage'

    // Get input data
    const predecessors = input._predecessors as unknown[] | undefined
    const inputData = input.data || input.text || (predecessors?.[0])

    try {
      if (storageType === 'sqlite') {
        // SQLite operations
        switch (operation) {
          case 'save':
            const insertId = await invoke<number>('sqlite_save', {
              dbPath: `${dbPath}/${collection}.db`,
              table: collection,
              data: inputData,
            })
            return {
              success: true,
              id: insertId,
              message: `데이터 저장 완료 (ID: ${insertId})`,
            }

          case 'load':
            const query = (config.query as string) || `SELECT * FROM ${collection}`
            const rows = await invoke<unknown[]>('sqlite_query', {
              dbPath: `${dbPath}/${collection}.db`,
              sql: query,
            })
            return {
              success: true,
              data: rows,
              count: rows.length,
            }

          case 'delete':
            const deleteQuery = (config.query as string) || `DELETE FROM ${collection}`
            await invoke('sqlite_query', {
              dbPath: `${dbPath}/${collection}.db`,
              sql: deleteQuery,
            })
            return {
              success: true,
              message: '삭제 완료',
            }
        }
      } else {
        // JSON file operations
        const filePath = `${dbPath}/${collection}.json`

        switch (operation) {
          case 'save':
            await invoke('json_save', {
              filePath,
              data: inputData,
            })
            return {
              success: true,
              path: filePath,
              message: `JSON 저장 완료: ${filePath}`,
            }

          case 'load':
            const jsonData = await invoke('json_load', { filePath })
            return {
              success: true,
              data: jsonData,
            }

          case 'delete':
            // Delete by setting to null/empty
            await invoke('json_save', {
              filePath,
              data: null,
            })
            return {
              success: true,
              message: 'JSON 삭제 완료',
            }
        }
      }

      return {
        success: false,
        error: '알 수 없는 작업입니다.',
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

export const LocalStorageDefinition: NodeDefinition = {
  type: 'storage.local',
  category: 'storage',
  meta: {
    label: '로컬 저장소',
    description: 'SQLite 또는 JSON 파일로 데이터를 로컬에 저장/조회합니다',
    icon: 'Storage',
    color: '#8b5cf6',
    tags: ['저장', '로컬', 'sqlite', 'json', '데이터베이스'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: false, description: '저장할 데이터' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '조회/저장 결과' },
      { name: 'success', type: 'any', required: false, description: '성공 여부' },
    ],
  },
  configSchema: [
    {
      key: 'storage_type',
      label: '저장소 타입',
      type: 'select',
      required: true,
      default: 'json',
      options: [
        { label: 'JSON 파일', value: 'json' },
        { label: 'SQLite DB', value: 'sqlite' },
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
        { label: '삭제', value: 'delete' },
      ],
    },
    { key: 'collection', label: '컬렉션명', type: 'text', required: true, default: 'default' },
    { key: 'db_path', label: '저장 경로', type: 'folder', required: false, default: './handbox-data/storage' },
    { key: 'query', label: 'SQL 쿼리 (SQLite)', type: 'textarea', required: false },
  ],
  runtime: 'tauri',
  executor,
}

export default LocalStorageDefinition
