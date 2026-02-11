/**
 * LocalFile Executor — 로컬 파일 정보 읽기
 *
 * Tauri 커맨드: get_file_info
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

interface FileInfo {
  name: string
  path: string
  size: number
  size_formatted: string
  extension: string
  is_directory: boolean
}

const executor: NodeExecutor = {
  async execute(
    _input: Record<string, any>,
    config: Record<string, any>,
    _context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const filePath = config.file_path || config.path
    if (!filePath) {
      return { error: '파일 경로가 설정되지 않았습니다', status: '경로 미설정', files_loaded: 0 }
    }

    const result = await invoke<FileInfo>('get_file_info', { filePath })
    return {
      file_path: result.path,
      name: result.name,
      files_loaded: 1,
      total_size: result.size_formatted,
      extension: result.extension,
      status: '파일 로드 완료',
    }
  },
}

export const LocalFileDefinition: NodeDefinition = {
  type: 'io.local-file',
  category: 'io',
  meta: {
    label: '파일 입력',
    description: '로컬 파일을 선택하고 정보를 읽습니다',
    icon: 'InsertDriveFile',
    color: '#2196F3',
    tags: ['파일', '입력', 'file', 'input', 'local'],
  },
  ports: {
    inputs: [],
    outputs: [
      { name: 'file', type: 'file-ref', required: true, description: '선택된 파일 경로' },
    ],
  },
  configSchema: [
    { key: 'file_path', label: '파일 경로', type: 'file', required: true },
  ],
  runtime: 'tauri',
  executor,
}
