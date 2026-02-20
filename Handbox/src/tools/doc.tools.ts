/**
 * Document 도구 노드 정의 — doc.parse, doc.convert
 */
import { invoke } from '@tauri-apps/api/tauri'
import type { NodeDefinition } from '../registry/NodeDefinition'

export const DocParseDefinition: NodeDefinition = {
  type: 'doc.parse',
  category: 'doc',
  meta: {
    label: '문서 파싱',
    description: '모든 확장자의 문서를 텍스트로 변환합니다. PDF, Excel, Word, HWP, HTML, 이미지(OCR) 등.',
    icon: 'Description',
    color: '#10b981',
    tags: ['document', 'parse', 'pdf', 'excel', 'word', 'hwp', 'ocr', '문서', '파싱', '변환'],
  },
  ports: {
    inputs: [{ name: 'path', type: 'file-ref', required: false, description: '파일 경로' }],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '추출된 텍스트' },
      { name: 'metadata', type: 'json', required: false, description: '문서 메타데이터' },
      { name: 'structured_data', type: 'json', required: false, description: '구조화 데이터 (스프레드시트)' },
    ],
  },
  configSchema: [
    { key: 'path', label: '파일 경로', type: 'file', required: true },
    { key: 'max_chars', label: '최대 문자 수', type: 'number', default: 0, description: '0이면 전체' },
    { key: 'sheet_index', label: '시트 번호 (스프레드시트)', type: 'number', default: 0 },
    { key: 'ocr', label: 'OCR 사용 (이미지)', type: 'toggle', default: false,
      description: '이미지 파일에서 텍스트를 추출합니다. tesseract 필요.' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const path = input.path || config.path
      console.log(`[doc.parse] 문서 파싱 시작: ${path}`)

      if (!path) {
        throw new Error('파일 경로가 지정되지 않았습니다. config.path 또는 input.path를 확인하세요.')
      }

      const result = await invoke('tool_doc_parse', {
        path, maxChars: config.max_chars || null,
        sheetIndex: config.sheet_index, ocr: config.ocr,
      }) as any

      const textLength = result.text?.length || 0
      console.log(`[doc.parse] 문서 파싱 완료: ${textLength}자 추출`, result.metadata)

      if (textLength === 0) {
        console.warn(`[doc.parse] 경고: 추출된 텍스트가 없습니다. 파일: ${path}`)
      }

      return {
        text: result.text || '',
        metadata: result.metadata || {},
        structured_data: result.structured_data || null,
      }
    },
  },
}

export const DocConvertDefinition: NodeDefinition = {
  type: 'doc.convert',
  category: 'doc',
  meta: {
    label: '문서 변환',
    description: '문서를 다른 형식으로 변환합니다. pandoc, LibreOffice 기반.',
    icon: 'Transform',
    color: '#10b981',
    tags: ['document', 'convert', 'format', 'pdf', 'docx', 'csv', '문서', '변환'],
  },
  ports: {
    inputs: [{ name: 'input_path', type: 'file-ref', required: false, description: '입력 파일 경로' }],
    outputs: [{ name: 'result', type: 'json', required: true, description: '변환 결과 (output_path)' }],
  },
  configSchema: [
    { key: 'input_path', label: '입력 파일', type: 'file', required: true },
    { key: 'output_format', label: '출력 형식', type: 'select', required: true,
      options: [
        { label: 'PDF', value: 'pdf' }, { label: 'DOCX', value: 'docx' },
        { label: 'HTML', value: 'html' }, { label: 'Markdown', value: 'md' },
        { label: '텍스트', value: 'txt' }, { label: 'CSV', value: 'csv' },
        { label: 'JSON', value: 'json' }, { label: 'XLSX', value: 'xlsx' },
        { label: 'EPUB', value: 'epub' },
      ] },
    { key: 'output_path', label: '출력 경로', type: 'text', description: '비워두면 자동 생성' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const inputPath = input.input_path || config.input_path
      const result = await invoke('tool_doc_convert', {
        inputPath, outputFormat: config.output_format, outputPath: config.output_path || null,
      }) as any
      return { result }
    },
  },
}

export const DOC_DEFINITIONS: NodeDefinition[] = [DocParseDefinition, DocConvertDefinition]
