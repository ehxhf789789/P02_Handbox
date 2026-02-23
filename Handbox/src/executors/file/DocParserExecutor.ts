/**
 * DocParser Executor — 문서 파싱 (PDF, TXT 등)
 *
 * PDF: Tauri 커맨드 parse_pdf (pdf_extract crate)
 * 기타 텍스트 파일: Tauri 커맨드 read_file_content
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

/**
 * 단일 파일 파싱 로직
 */
async function parseSingleFile(filePath: string, maxChars: number): Promise<Record<string, any>> {
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
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const maxChars = config.max_chars || 50000

    // 시뮬레이션 모드 감지
    const isSimulation = context.isSimulation ||
      (config.file_path && (config.file_path.includes('/simulation') || config.file_path.includes('\\simulation'))) ||
      (input.files && input.files[0]?.path?.includes('simulation'))

    if (isSimulation) {
      const mockText = `[시뮬레이션 모드] 문서 파싱 결과

이것은 시뮬레이션 환경에서 생성된 샘플 텍스트입니다.

## 섹션 1: 개요
Lorem ipsum dolor sit amet, consectetur adipiscing elit.

## 섹션 2: 상세 내용
Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

## 섹션 3: 결론
Ut enim ad minim veniam, quis nostrud exercitation ullamco.`

      return {
        text: mockText,
        file_path: config.file_path || input.files?.[0]?.path || '/simulation/document.pdf',
        pages: 5,
        characters: mockText.length,
        files_processed: input.files?.length || 1,
        status: '[시뮬레이션] 문서 파싱 완료',
      }
    }

    // 파일 경로 추출 - 다양한 입력 형식 지원
    // 1. 직접 설정된 경로
    // 2. 이전 노드에서 전달된 단일 파일
    // 3. 이전 노드에서 전달된 파일 배열 (폴더 스캔 결과)
    let filePaths: string[] = []

    // 설정에서 직접 지정된 경로
    if (config.file_path) {
      filePaths = [config.file_path]
    }
    // 이전 노드에서 전달된 파일 목록 (io.local-folder)
    else if (input.files && Array.isArray(input.files)) {
      filePaths = input.files.map((f: any) => f.path || f.file_path || f).filter(Boolean)
    }
    // 이전 노드에서 전달된 file_contents (이미 읽은 내용)
    else if (input.file_contents && Array.isArray(input.file_contents)) {
      // 이미 내용이 읽혀진 경우 바로 반환
      const combinedText = input.file_contents.map((f: any) => f.content || '').join('\n\n---\n\n')
      return {
        text: combinedText,
        files_processed: input.file_contents.length,
        status: `${input.file_contents.length}개 파일 처리 완료 (이전 노드에서 내용 전달됨)`,
      }
    }
    // 단일 파일 참조
    else if (input.file) {
      const path = input.file.path || input.file.file_path || input.file
      if (typeof path === 'string') {
        filePaths = [path]
      }
    }
    // _predecessors에서 파일 정보 추출
    else if (input._predecessors) {
      for (const pred of input._predecessors) {
        if (pred.files && Array.isArray(pred.files)) {
          filePaths = pred.files.map((f: any) => f.path || f.file_path || f).filter(Boolean)
          break
        }
        if (pred.file_path) {
          filePaths.push(pred.file_path)
        }
      }
    }

    if (filePaths.length === 0) {
      return {
        error: '파일 경로가 없습니다. 이전 노드에서 파일을 선택하거나 설정에서 file_path를 지정하세요.',
        status: '파싱 실패 - 경로 없음',
      }
    }

    // 단일 파일 처리
    if (filePaths.length === 1) {
      return parseSingleFile(filePaths[0], maxChars)
    }

    // 다중 파일 처리 (배열)
    const results: { file: string; text: string; status: string }[] = []
    let combinedText = ''
    let totalChars = 0

    for (const filePath of filePaths.slice(0, 50)) {  // 최대 50개 파일
      try {
        const result = await parseSingleFile(filePath, maxChars)
        const fileName = filePath.split(/[/\\]/).pop() || filePath
        results.push({
          file: fileName,
          text: result.text || '',
          status: result.status || '완료',
        })
        combinedText += `\n\n=== ${fileName} ===\n${result.text || ''}`
        totalChars += result.characters || 0
      } catch (error) {
        const fileName = filePath.split(/[/\\]/).pop() || filePath
        results.push({
          file: fileName,
          text: '',
          status: `오류: ${error}`,
        })
      }
    }

    return {
      text: combinedText.trim(),
      files_processed: results.length,
      total_characters: totalChars,
      results,
      status: `${results.length}개 파일 파싱 완료`,
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
      { name: 'file', type: 'file-ref', required: false, description: '파싱할 단일 문서 파일' },
      { name: 'files', type: 'file-ref[]', required: false, description: '파싱할 문서 파일 목록 (폴더 스캔 결과)' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '추출된 텍스트 (다중 파일 시 병합)' },
      { name: 'files_processed', type: 'any', required: false, description: '처리된 파일 수' },
    ],
  },
  configSchema: [
    { key: 'file_path', label: '파일 경로 (직접 지정)', type: 'file', accept: '.pdf,.txt,.md,.hwp' },
    { key: 'max_chars', label: '최대 문자 수', type: 'number', default: 50000, min: 1000, max: 500000 },
  ],
  runtime: 'tauri',
  executor,
}
