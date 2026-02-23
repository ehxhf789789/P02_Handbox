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
    context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const folderPath = config.folder_path || config.path
    if (!folderPath) {
      return { error: '폴더 경로가 설정되지 않았습니다', status: '경로 미설정', files_loaded: 0 }
    }

    // 시뮬레이션 모드: mock 데이터 반환
    const isSimulationPath = folderPath.startsWith('C:/simulation') || folderPath.startsWith('/simulation')
    if (context.isSimulation || isSimulationPath) {
      const mockFiles = [
        { name: 'document1.pdf', path: `${folderPath}/document1.pdf`, size: '1.2 MB', extension: 'pdf' },
        { name: 'document2.txt', path: `${folderPath}/document2.txt`, size: '45 KB', extension: 'txt' },
        { name: 'report.docx', path: `${folderPath}/report.docx`, size: '890 KB', extension: 'docx' },
      ]
      return {
        folder_path: folderPath,
        files_loaded: mockFiles.length,
        total_files: mockFiles.length,
        total_size: '2.1 MB',
        status: `[시뮬레이션] ${mockFiles.length}개 파일 스캔 완료`,
        files: mockFiles,
        text: '[시뮬레이션 모드] 샘플 텍스트 내용입니다.\n\n문서1 내용...\n문서2 내용...',
        file_contents: mockFiles.map(f => ({
          name: f.name,
          path: f.path,
          content: `[시뮬레이션] ${f.name}의 샘플 내용입니다.`,
        })),
      }
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
