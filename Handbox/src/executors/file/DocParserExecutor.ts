/**
 * DocParser Executor — 문서 파싱 (PDF, TXT 등)
 *
 * PDF: Tauri 커맨드 parse_pdf (pdf_extract crate)
 * 기타 텍스트 파일: Tauri 커맨드 read_file_content
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
    // 이전 노드에서 파일 경로를 받거나, 직접 설정에서 가져오기
    const filePath = input.file?.file_path || input.file || input._predecessors?.[0]?.file_path || config.file_path
    if (!filePath) {
      return {
        error: '파일 경로가 없습니다. 이전 노드에서 파일을 선택하거나 설정에서 file_path를 지정하세요.',
        status: '파싱 실패 - 경로 없음',
      }
    }

    const ext = String(filePath).toLowerCase().split('.').pop() || ''

    if (ext === 'pdf') {
      const result = await invoke<{ text: string; pages: number; characters: number; file_path: string }>('parse_pdf', {
        filePath,
      })
      return {
        text: result.text,
        file_path: result.file_path,
        pages: result.pages,
        characters: result.characters,
        status: `PDF 파싱 완료 (${result.pages}페이지, ${result.characters}자)`,
      }
    }

    // 기타 텍스트 파일 (TXT, HWP, MD 등)
    const maxChars = config.max_chars || 50000
    const result = await invoke<{ content_preview: string; total_chars: number }>('read_file_content', {
      filePath,
      maxChars,
    })

    return {
      text: result.content_preview,
      file_path: filePath,
      characters: result.total_chars,
      status: '문서 파싱 완료',
    }
  },
}

export const DocParserDefinition: NodeDefinition = {
  type: 'convert.doc-parser',
  category: 'convert',
  meta: {
    label: '문서 파싱',
    description: 'PDF, TXT 등 문서 파일에서 텍스트를 추출합니다',
    icon: 'PictureAsPdf',
    color: '#F44336',
    tags: ['PDF', 'TXT', '문서', '파싱', 'parser', 'document', 'text extraction'],
  },
  ports: {
    inputs: [
      { name: 'file', type: 'file-ref', required: true, description: '파싱할 문서 파일' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '추출된 텍스트' },
    ],
  },
  configSchema: [
    { key: 'file_path', label: '파일 경로 (직접 지정)', type: 'file', accept: '.pdf,.txt,.md,.hwp' },
    { key: 'max_chars', label: '최대 문자 수', type: 'number', default: 50000, min: 1000, max: 500000 },
  ],
  runtime: 'tauri',
  executor,
}
