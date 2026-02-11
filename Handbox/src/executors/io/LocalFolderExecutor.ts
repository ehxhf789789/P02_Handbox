/**
 * LocalFolder Executor — 로컬 폴더 스캔 + 파일 내용 읽기
 *
 * Tauri 커맨드: scan_folder, read_file_content
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

interface FolderScanResult {
  folder_path: string
  total_files: number
  total_size: number
  total_size_formatted: string
  files: FileInfo[]
}

const executor: NodeExecutor = {
  async execute(
    _input: Record<string, any>,
    config: Record<string, any>,
    _context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const folderPath = config.folder_path || config.path
    if (!folderPath) {
      return { error: '폴더 경로가 설정되지 않았습니다', status: '경로 미설정', files_loaded: 0 }
    }

    const extensions = config.file_filter
      ? config.file_filter.split(';').map((e: string) => e.replace('*.', '').trim())
      : undefined

    const result = await invoke<FolderScanResult>('scan_folder', { folderPath, extensions })

    let combinedText = ''
    const fileContents: Array<{ name: string; path: string; content: string }> = []

    if (config.read_content && result.files.length > 0) {
      for (const file of result.files.slice(0, 50)) {
        try {
          const content = await invoke<{ content_preview: string; size: number }>('read_file_content', {
            filePath: file.path,
            maxChars: 30000,
          })
          fileContents.push({ name: file.name, path: file.path, content: content.content_preview })
          combinedText += `\n\n=== ${file.name} ===\n${content.content_preview}`
        } catch {
          // 읽기 실패한 파일은 건너뛰기
        }
      }
    }

    return {
      folder_path: result.folder_path,
      files_loaded: result.total_files,
      total_files: result.total_files,
      total_size: result.total_size_formatted,
      status: config.read_content
        ? `${result.total_files}개 파일 스캔, ${fileContents.length}개 파일 내용 읽기 완료`
        : `${result.total_files}개 파일 스캔 완료`,
      files: result.files.map((f) => ({
        name: f.name,
        path: f.path,
        size: f.size_formatted,
        extension: f.extension,
      })),
      text: combinedText || undefined,
      file_contents: fileContents.length > 0 ? fileContents : undefined,
    }
  },
}

export const LocalFolderDefinition: NodeDefinition = {
  type: 'io.local-folder',
  category: 'io',
  meta: {
    label: '폴더 입력',
    description: '로컬 폴더를 스캔하고 파일 목록 및 내용을 읽습니다',
    icon: 'FolderOpen',
    color: '#4CAF50',
    tags: ['폴더', '파일', '입력', 'folder', 'scan', 'local'],
  },
  ports: {
    inputs: [],
    outputs: [
      { name: 'files', type: 'file-ref[]', required: true, description: '스캔된 파일 목록' },
      { name: 'text', type: 'text', required: false, description: '파일 내용 (read_content 활성 시)' },
    ],
  },
  configSchema: [
    { key: 'folder_path', label: '폴더 경로', type: 'folder', required: true },
    { key: 'file_filter', label: '파일 필터', type: 'text', placeholder: '*.pdf;*.txt;*.docx' },
    { key: 'read_content', label: '파일 내용 읽기', type: 'toggle', default: false },
  ],
  runtime: 'tauri',
  executor,
}
