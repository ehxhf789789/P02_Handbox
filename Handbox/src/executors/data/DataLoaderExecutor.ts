/**
 * DataLoaderExecutor - Universal file loader
 *
 * Supports: Excel, PDF, CSV, TXT, JSON files
 * Uses Tauri backend for file parsing
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext, PortDefinition } from '../../engine/types'

interface FileParseResult {
  success: boolean
  file_type: string
  text?: string
  data?: {
    headers?: string[]
    rows?: Record<string, unknown>[]
    sheets?: string[]
    page_count?: number
  }
  error?: string
}

const executor: NodeExecutor = {
  async execute(
    _input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const filePath = config.file_path as string
    const fileType = (config.file_type as string) || 'auto'

    if (!filePath) {
      return {
        data: null,
        text: '',
        error: '파일 경로를 지정하세요.',
      }
    }

    try {
      // Detect file type if auto
      let detectedType = fileType
      if (fileType === 'auto') {
        const ext = filePath.split('.').pop()?.toLowerCase() || ''
        if (['xlsx', 'xls'].includes(ext)) detectedType = 'excel'
        else if (ext === 'csv') detectedType = 'csv'
        else if (ext === 'pdf') detectedType = 'pdf'
        else if (ext === 'txt') detectedType = 'txt'
        else if (ext === 'json') detectedType = 'json'
        else detectedType = 'txt'
      }

      let result: FileParseResult

      switch (detectedType) {
        case 'excel':
          result = await invoke<FileParseResult>('parse_excel', {
            filePath,
            sheetIndex: config.sheet_index as number | undefined,
          })
          break

        case 'csv':
          result = await invoke<FileParseResult>('parse_csv', {
            filePath,
            delimiter: (config.delimiter as string) || ',',
          })
          break

        case 'pdf':
          result = await invoke<FileParseResult>('parse_pdf', { path: filePath })
          break

        case 'json':
          const jsonContent = await invoke<string>('read_file_content', {
            path: filePath,
            maxChars: 1000000,
          })
          try {
            const parsed = JSON.parse(jsonContent)
            result = {
              success: true,
              file_type: 'json',
              data: parsed,
              text: jsonContent,
            }
          } catch {
            result = {
              success: false,
              file_type: 'json',
              error: 'JSON 파싱 실패',
            }
          }
          break

        default: // txt
          const textContent = await invoke<string>('read_file_content', {
            path: filePath,
            maxChars: 1000000,
          })
          result = {
            success: true,
            file_type: 'txt',
            text: textContent,
          }
      }

      if (!result.success) {
        return {
          data: null,
          text: '',
          error: result.error || '파일 파싱 실패',
        }
      }

      return {
        data: result.data || null,
        text: result.text || '',
        file_type: result.file_type,
        rows: result.data?.rows || [],
        headers: result.data?.headers || [],
      }
    } catch (error) {
      return {
        data: null,
        text: '',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

export const DataLoaderDefinition: NodeDefinition = {
  type: 'data.file-loader',
  category: 'data',
  meta: {
    label: '파일 로드',
    description: 'Excel, PDF, CSV, TXT, JSON 파일을 불러옵니다',
    icon: 'InsertDriveFile',
    color: '#3b82f6',
    tags: ['파일', '로드', '데이터', 'excel', 'pdf', 'csv'],
  },
  ports: {
    inputs: [] as PortDefinition[],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '파싱된 데이터 (JSON)' },
      { name: 'text', type: 'text', required: false, description: '텍스트 내용' },
      { name: 'rows', type: 'json[]', required: false, description: '테이블 행 데이터' },
    ],
  },
  configSchema: [
    { key: 'file_path', label: '파일 경로', type: 'file', required: true },
    {
      key: 'file_type',
      label: '파일 유형',
      type: 'select',
      required: false,
      default: 'auto',
      options: [
        { label: '자동 감지', value: 'auto' },
        { label: 'Excel (.xlsx, .xls)', value: 'excel' },
        { label: 'CSV', value: 'csv' },
        { label: 'PDF', value: 'pdf' },
        { label: '텍스트', value: 'txt' },
        { label: 'JSON', value: 'json' },
      ],
    },
    { key: 'sheet_index', label: '시트 번호 (Excel)', type: 'number', required: false, default: 0 },
    { key: 'delimiter', label: '구분자 (CSV)', type: 'text', required: false, default: ',' },
  ],
  runtime: 'tauri',
  executor,
}

export default DataLoaderDefinition
