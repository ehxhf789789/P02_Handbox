/**
 * Document 도구 정의 — doc.* (10개 도구)
 * 문서 파싱, 변환, OCR, 메타데이터 추출 등
 */
import type { UnifiedToolDefinition } from '../registry/UnifiedToolDefinition'

// ============================================================================
// doc.parse - 문서 파싱
// ============================================================================
const docParse: UnifiedToolDefinition = {
  name: 'doc.parse',
  version: '1.0.0',
  description: '다양한 문서를 텍스트로 변환합니다. PDF, Excel, Word, HWP, HTML, 이미지(OCR) 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '파일 경로' },
    },
    required: ['path'],
  },
  meta: {
    label: '문서 파싱',
    icon: 'Description',
    color: '#10b981',
    category: 'doc',
    tags: ['document', 'parse', 'pdf', 'excel', 'word', 'hwp', 'ocr', '문서', '파싱'],
  },
  ports: {
    inputs: [{ name: 'path', type: 'file-ref', required: false, description: '파일 경로' }],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '추출된 텍스트' },
      { name: 'metadata', type: 'json', required: false, description: '문서 메타데이터' },
      { name: 'structured_data', type: 'json', required: false, description: '구조화 데이터' },
    ],
  },
  configSchema: [
    { key: 'path', label: '파일 경로', type: 'file', required: true },
    { key: 'max_chars', label: '최대 문자 수', type: 'number', default: 0, description: '0이면 전체' },
    { key: 'sheet_index', label: '시트 번호', type: 'number', default: 0 },
    { key: 'ocr', label: 'OCR 사용', type: 'toggle', default: false },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const path = input.path || config.path
      if (!path) throw new Error('파일 경로가 필요합니다')

      const result = await invoke('tool_doc_parse', {
        path,
        maxChars: config.max_chars || null,
        sheetIndex: config.sheet_index,
        ocr: config.ocr,
      }) as any

      return {
        text: result.text || '',
        metadata: result.metadata || {},
        structured_data: result.structured_data || null,
      }
    },
  },
}

// ============================================================================
// doc.pdf-parse - PDF 파싱
// ============================================================================
const docPdfParse: UnifiedToolDefinition = {
  name: 'doc.pdf-parse',
  version: '1.0.0',
  description: 'PDF 문서를 텍스트로 변환합니다. 페이지별 추출, OCR 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'PDF 파일 경로' },
      pages: { type: 'string', description: '페이지 범위 (예: 1-5)' },
    },
    required: ['path'],
  },
  meta: {
    label: 'PDF 파싱',
    icon: 'PictureAsPdf',
    color: '#10b981',
    category: 'doc',
    tags: ['pdf', 'parse', 'document', 'PDF', '파싱'],
  },
  ports: {
    inputs: [{ name: 'path', type: 'file-ref', required: true }],
    outputs: [
      { name: 'text', type: 'text', required: true },
      { name: 'pages', type: 'json', required: false, description: '페이지별 텍스트' },
      { name: 'metadata', type: 'json', required: false },
    ],
  },
  configSchema: [
    { key: 'path', label: 'PDF 경로', type: 'file', required: true },
    { key: 'pages', label: '페이지 범위', type: 'text', description: '예: 1-5, 10' },
    { key: 'ocr', label: 'OCR 사용', type: 'toggle', default: false },
    { key: 'preserve_layout', label: '레이아웃 유지', type: 'toggle', default: false },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_pdf_parse', {
        path: input.path || config.path,
        pages: config.pages,
        ocr: config.ocr,
        preserveLayout: config.preserve_layout,
      }) as any
      return { text: result.text, pages: result.pages, metadata: result.metadata }
    },
  },
}

// ============================================================================
// doc.docx-parse - Word 문서 파싱
// ============================================================================
const docDocxParse: UnifiedToolDefinition = {
  name: 'doc.docx-parse',
  version: '1.0.0',
  description: 'Microsoft Word 문서를 텍스트로 변환합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'DOCX 파일 경로' },
    },
    required: ['path'],
  },
  meta: {
    label: 'Word 파싱',
    icon: 'Description',
    color: '#10b981',
    category: 'doc',
    tags: ['docx', 'word', 'parse', '워드', '파싱'],
  },
  ports: {
    inputs: [{ name: 'path', type: 'file-ref', required: true }],
    outputs: [
      { name: 'text', type: 'text', required: true },
      { name: 'paragraphs', type: 'json', required: false },
      { name: 'tables', type: 'json', required: false },
    ],
  },
  configSchema: [
    { key: 'path', label: 'DOCX 경로', type: 'file', required: true },
    { key: 'include_tables', label: '표 포함', type: 'toggle', default: true },
    { key: 'include_images', label: '이미지 정보 포함', type: 'toggle', default: false },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_docx_parse', {
        path: input.path || config.path,
        includeTables: config.include_tables,
        includeImages: config.include_images,
      }) as any
      return { text: result.text, paragraphs: result.paragraphs, tables: result.tables }
    },
  },
}

// ============================================================================
// doc.xlsx-parse - Excel 파싱
// ============================================================================
const docXlsxParse: UnifiedToolDefinition = {
  name: 'doc.xlsx-parse',
  version: '1.0.0',
  description: 'Microsoft Excel 파일을 파싱합니다. 여러 시트 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'XLSX 파일 경로' },
      sheet: { type: ['string', 'number'], description: '시트 이름 또는 인덱스' },
    },
    required: ['path'],
  },
  meta: {
    label: 'Excel 파싱',
    icon: 'TableChart',
    color: '#10b981',
    category: 'doc',
    tags: ['xlsx', 'excel', 'parse', 'spreadsheet', '엑셀', '파싱'],
  },
  ports: {
    inputs: [{ name: 'path', type: 'file-ref', required: true }],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '시트 데이터' },
      { name: 'sheets', type: 'json', required: false, description: '시트 목록' },
    ],
  },
  configSchema: [
    { key: 'path', label: 'XLSX 경로', type: 'file', required: true },
    { key: 'sheet', label: '시트', type: 'text', description: '이름 또는 인덱스' },
    { key: 'header_row', label: '헤더 행', type: 'number', default: 0 },
    { key: 'skip_rows', label: '건너뛸 행 수', type: 'number', default: 0 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_xlsx_parse', {
        path: input.path || config.path,
        sheet: config.sheet,
        headerRow: config.header_row,
        skipRows: config.skip_rows,
      }) as any
      return { data: result.data, sheets: result.sheets }
    },
  },
}

// ============================================================================
// doc.hwp-parse - HWP 파싱
// ============================================================================
const docHwpParse: UnifiedToolDefinition = {
  name: 'doc.hwp-parse',
  version: '1.0.0',
  description: '한글 문서(.hwp, .hwpx)를 텍스트로 변환합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'HWP 파일 경로' },
    },
    required: ['path'],
  },
  meta: {
    label: 'HWP 파싱',
    icon: 'Description',
    color: '#10b981',
    category: 'doc',
    tags: ['hwp', 'hangeul', 'parse', '한글', '파싱'],
  },
  ports: {
    inputs: [{ name: 'path', type: 'file-ref', required: true }],
    outputs: [
      { name: 'text', type: 'text', required: true },
      { name: 'metadata', type: 'json', required: false },
    ],
  },
  configSchema: [
    { key: 'path', label: 'HWP 경로', type: 'file', required: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_hwp_parse', {
        path: input.path || config.path,
      }) as any
      return { text: result.text, metadata: result.metadata }
    },
  },
}

// ============================================================================
// doc.html-parse - HTML 파싱
// ============================================================================
const docHtmlParse: UnifiedToolDefinition = {
  name: 'doc.html-parse',
  version: '1.0.0',
  description: 'HTML 문서에서 텍스트를 추출합니다. 선택자 지정 가능.',
  inputSchema: {
    type: 'object',
    properties: {
      html: { type: 'string', description: 'HTML 문자열' },
      url: { type: 'string', description: 'URL (html 대신)' },
      selector: { type: 'string', description: 'CSS 선택자' },
    },
  },
  meta: {
    label: 'HTML 파싱',
    icon: 'Code',
    color: '#10b981',
    category: 'doc',
    tags: ['html', 'parse', 'web', 'scrape', 'HTML', '파싱'],
  },
  ports: {
    inputs: [
      { name: 'html', type: 'text', required: false },
      { name: 'url', type: 'text', required: false },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true },
      { name: 'elements', type: 'json', required: false },
    ],
  },
  configSchema: [
    { key: 'selector', label: 'CSS 선택자', type: 'text', default: 'body' },
    { key: 'remove_tags', label: '제거할 태그', type: 'text', description: 'script,style,nav' },
    { key: 'preserve_links', label: '링크 유지', type: 'toggle', default: false },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      let html = input.html
      if (!html && input.url) {
        const { invoke } = await import('@tauri-apps/api/tauri')
        const response = await invoke('tool_http_request', {
          method: 'GET',
          url: input.url,
        }) as any
        html = response.body
      }

      if (!html) return { text: '', elements: [] }

      // 간단한 HTML -> 텍스트 변환
      const htmlStr = html as string
      let text = htmlStr
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      return { text, elements: [] }
    },
  },
}

// ============================================================================
// doc.convert - 문서 변환
// ============================================================================
const docConvert: UnifiedToolDefinition = {
  name: 'doc.convert',
  version: '1.0.0',
  description: '문서를 다른 형식으로 변환합니다. pandoc, LibreOffice 기반.',
  inputSchema: {
    type: 'object',
    properties: {
      input_path: { type: 'string', description: '입력 파일' },
      output_format: { type: 'string', description: '출력 형식' },
    },
    required: ['input_path', 'output_format'],
  },
  meta: {
    label: '문서 변환',
    icon: 'Transform',
    color: '#10b981',
    category: 'doc',
    tags: ['document', 'convert', 'format', 'pdf', 'docx', '변환'],
  },
  ports: {
    inputs: [{ name: 'input_path', type: 'file-ref', required: false }],
    outputs: [{ name: 'output_path', type: 'file-ref', required: true }],
  },
  configSchema: [
    { key: 'input_path', label: '입력 파일', type: 'file', required: true },
    { key: 'output_format', label: '출력 형식', type: 'select', required: true,
      options: [
        { label: 'PDF', value: 'pdf' },
        { label: 'DOCX', value: 'docx' },
        { label: 'HTML', value: 'html' },
        { label: 'Markdown', value: 'md' },
        { label: '텍스트', value: 'txt' },
        { label: 'XLSX', value: 'xlsx' },
      ] },
    { key: 'output_path', label: '출력 경로', type: 'text' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_doc_convert', {
        inputPath: input.input_path || config.input_path,
        outputFormat: config.output_format,
        outputPath: config.output_path || null,
      }) as any
      return { output_path: result.outputPath }
    },
  },
}

// ============================================================================
// doc.ocr - OCR 텍스트 추출
// ============================================================================
const docOcr: UnifiedToolDefinition = {
  name: 'doc.ocr',
  version: '1.0.0',
  description: '이미지에서 OCR로 텍스트를 추출합니다. Tesseract 기반.',
  inputSchema: {
    type: 'object',
    properties: {
      image: { type: 'string', description: '이미지 파일 경로' },
      language: { type: 'string', description: '언어 코드' },
    },
    required: ['image'],
  },
  meta: {
    label: 'OCR 추출',
    icon: 'DocumentScanner',
    color: '#10b981',
    category: 'doc',
    tags: ['ocr', 'image', 'text', 'extract', '텍스트', '추출'],
  },
  ports: {
    inputs: [{ name: 'image', type: 'file-ref', required: true }],
    outputs: [
      { name: 'text', type: 'text', required: true },
      { name: 'confidence', type: 'number', required: false },
    ],
  },
  configSchema: [
    { key: 'image', label: '이미지 경로', type: 'file', required: true },
    { key: 'language', label: '언어', type: 'select', default: 'kor+eng',
      options: [
        { label: '한국어 + 영어', value: 'kor+eng' },
        { label: '한국어', value: 'kor' },
        { label: '영어', value: 'eng' },
        { label: '일본어', value: 'jpn' },
        { label: '중국어 간체', value: 'chi_sim' },
      ] },
    { key: 'psm', label: '페이지 분할 모드', type: 'number', default: 3 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_ocr', {
        imagePath: input.image || config.image,
        language: config.language,
        psm: config.psm,
      }) as any
      return { text: result.text, confidence: result.confidence }
    },
  },
}

// ============================================================================
// doc.metadata - 메타데이터 추출
// ============================================================================
const docMetadata: UnifiedToolDefinition = {
  name: 'doc.metadata',
  version: '1.0.0',
  description: '문서의 메타데이터를 추출합니다. 작성자, 날짜, 페이지 수 등.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '파일 경로' },
    },
    required: ['path'],
  },
  meta: {
    label: '메타데이터 추출',
    icon: 'Info',
    color: '#10b981',
    category: 'doc',
    tags: ['metadata', 'info', 'document', '메타데이터', '정보'],
  },
  ports: {
    inputs: [{ name: 'path', type: 'file-ref', required: true }],
    outputs: [{ name: 'metadata', type: 'json', required: true }],
  },
  configSchema: [
    { key: 'path', label: '파일 경로', type: 'file', required: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_doc_metadata', {
        path: input.path || config.path,
      }) as any
      return { metadata: result }
    },
  },
}

// ============================================================================
// doc.split - 문서 분할
// ============================================================================
const docSplit: UnifiedToolDefinition = {
  name: 'doc.split',
  version: '1.0.0',
  description: 'PDF를 페이지별로 분할하거나 텍스트를 청크로 나눕니다.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '파일 경로' },
      pages: { type: 'string', description: '분할할 페이지 (예: 1-3,5,7-10)' },
    },
    required: ['path'],
  },
  meta: {
    label: '문서 분할',
    icon: 'ContentCut',
    color: '#10b981',
    category: 'doc',
    tags: ['split', 'pdf', 'chunk', '분할', '페이지'],
  },
  ports: {
    inputs: [{ name: 'path', type: 'file-ref', required: true }],
    outputs: [
      { name: 'files', type: 'json', required: true, description: '분할된 파일 경로' },
      { name: 'count', type: 'number', required: false },
    ],
  },
  configSchema: [
    { key: 'path', label: '파일 경로', type: 'file', required: true },
    { key: 'pages', label: '페이지 범위', type: 'text' },
    { key: 'output_dir', label: '출력 디렉토리', type: 'text' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_doc_split', {
        path: input.path || config.path,
        pages: config.pages,
        outputDir: config.output_dir,
      }) as any
      return { files: result.files, count: result.files?.length || 0 }
    },
  },
}

// ============================================================================
// Export
// ============================================================================
export const DOC_TOOLS: UnifiedToolDefinition[] = [
  docParse,
  docPdfParse,
  docDocxParse,
  docXlsxParse,
  docHwpParse,
  docHtmlParse,
  docConvert,
  docOcr,
  docMetadata,
  docSplit,
]

// Legacy export
export const DOC_DEFINITIONS = DOC_TOOLS
