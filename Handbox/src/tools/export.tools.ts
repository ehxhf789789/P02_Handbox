/**
 * Export 도구 정의 — export.* (10개 도구)
 * 문서 생성: DOCX, PPTX, PDF, XLSX, CSV, JSON, HTML 등
 */
import type { UnifiedToolDefinition } from '../registry/UnifiedToolDefinition'

// ============================================================================
// export.xlsx - Excel 생성
// ============================================================================
const exportXlsx: UnifiedToolDefinition = {
  name: 'export.xlsx',
  version: '1.0.0',
  description: 'Microsoft Excel 파일(.xlsx)을 생성합니다. 여러 시트, 스타일 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: ['array', 'object'], description: '데이터 (배열 또는 {시트명: 배열})' },
      output_path: { type: 'string', description: '출력 경로' },
    },
    required: ['data'],
  },
  meta: {
    label: 'Excel 생성',
    icon: 'TableChart',
    color: '#16a34a',
    category: 'export',
    tags: ['export', 'xlsx', 'excel', 'spreadsheet', '엑셀'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '데이터' },
    ],
    outputs: [
      { name: 'file_path', type: 'file-ref', required: true },
      { name: 'sheet_count', type: 'number', required: false },
    ],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true },
    { key: 'sheet_name', label: '시트 이름', type: 'text', default: 'Sheet1' },
    { key: 'include_header', label: '헤더 포함', type: 'toggle', default: true },
    { key: 'auto_width', label: '열 너비 자동', type: 'toggle', default: true },
    { key: 'freeze_header', label: '헤더 고정', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_export_xlsx', {
        data: input.data,
        outputPath: config.output_path,
        sheetName: config.sheet_name,
        includeHeader: config.include_header,
        autoWidth: config.auto_width,
        freezeHeader: config.freeze_header,
      }) as any
      return { file_path: result.path, sheet_count: result.sheetCount }
    },
  },
}

// ============================================================================
// export.csv - CSV 생성
// ============================================================================
const exportCsv: UnifiedToolDefinition = {
  name: 'export.csv',
  version: '1.0.0',
  description: 'CSV 파일을 생성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: 'array', description: '데이터 배열' },
      output_path: { type: 'string', description: '출력 경로' },
    },
    required: ['data'],
  },
  meta: {
    label: 'CSV 생성',
    icon: 'Description',
    color: '#16a34a',
    category: 'export',
    tags: ['export', 'csv', '데이터', '내보내기'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'json', required: true }],
    outputs: [{ name: 'file_path', type: 'file-ref', required: true }],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true },
    { key: 'delimiter', label: '구분자', type: 'select', default: ',',
      options: [
        { label: '쉼표 (,)', value: ',' },
        { label: '탭 (\\t)', value: '\t' },
        { label: '세미콜론 (;)', value: ';' },
      ] },
    { key: 'include_header', label: '헤더 포함', type: 'toggle', default: true },
    { key: 'encoding', label: '인코딩', type: 'select', default: 'utf-8',
      options: [
        { label: 'UTF-8', value: 'utf-8' },
        { label: 'UTF-8 BOM', value: 'utf-8-bom' },
        { label: 'EUC-KR', value: 'euc-kr' },
      ] },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_export_csv', {
        data: input.data,
        outputPath: config.output_path,
        delimiter: config.delimiter,
        includeHeader: config.include_header,
        encoding: config.encoding,
      }) as any
      return { file_path: result.path }
    },
  },
}

// ============================================================================
// export.json - JSON 파일 생성
// ============================================================================
const exportJson: UnifiedToolDefinition = {
  name: 'export.json',
  version: '1.0.0',
  description: 'JSON 파일을 생성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { description: 'JSON 데이터' },
      output_path: { type: 'string', description: '출력 경로' },
    },
    required: ['data'],
  },
  meta: {
    label: 'JSON 생성',
    icon: 'DataObject',
    color: '#16a34a',
    category: 'export',
    tags: ['export', 'json', '데이터', '내보내기'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'json', required: true }],
    outputs: [{ name: 'file_path', type: 'file-ref', required: true }],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true },
    { key: 'pretty', label: '들여쓰기', type: 'toggle', default: true },
    { key: 'indent', label: '들여쓰기 크기', type: 'number', default: 2 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const { invoke } = await import('@tauri-apps/api/tauri')
      const indent = (cfg.indent as number) || 2
      const jsonStr = cfg.pretty
        ? JSON.stringify(inp.data, null, indent)
        : JSON.stringify(inp.data)

      await invoke('tool_file_write', {
        path: cfg.output_path,
        content: jsonStr,
      })
      return { file_path: cfg.output_path }
    },
  },
}

// ============================================================================
// export.pdf - PDF 생성
// ============================================================================
const exportPdf: UnifiedToolDefinition = {
  name: 'export.pdf',
  version: '1.0.0',
  description: 'PDF 보고서를 생성합니다. 차트, 표, 이미지 포함 가능.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: '문서 내용 (Markdown)' },
      sections: { type: 'array', description: '섹션 배열' },
    },
  },
  meta: {
    label: 'PDF 생성',
    icon: 'PictureAsPdf',
    color: '#ef4444',
    category: 'export',
    tags: ['export', 'pdf', 'report', 'PDF', '보고서'],
  },
  ports: {
    inputs: [
      { name: 'content', type: 'text', required: false },
      { name: 'sections', type: 'json', required: false },
      { name: 'tables', type: 'json', required: false },
    ],
    outputs: [
      { name: 'file_path', type: 'file-ref', required: true },
      { name: 'page_count', type: 'number', required: false },
    ],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true },
    { key: 'title', label: '제목', type: 'text' },
    { key: 'author', label: '작성자', type: 'text' },
    { key: 'page_size', label: '페이지 크기', type: 'select', default: 'A4',
      options: [
        { label: 'A4', value: 'A4' },
        { label: 'Letter', value: 'letter' },
      ] },
    { key: 'include_toc', label: '목차 포함', type: 'toggle', default: true },
    { key: 'include_page_numbers', label: '페이지 번호', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_export_pdf', {
        content: input.content,
        sections: input.sections,
        tables: input.tables,
        outputPath: config.output_path,
        title: config.title,
        author: config.author,
        pageSize: config.page_size,
        includeToc: config.include_toc,
        includePageNumbers: config.include_page_numbers,
      }) as any
      return { file_path: result.path, page_count: result.pageCount }
    },
  },
}

// ============================================================================
// export.docx - Word 문서 생성
// ============================================================================
const exportDocx: UnifiedToolDefinition = {
  name: 'export.docx',
  version: '1.0.0',
  description: 'Microsoft Word 문서(.docx)를 생성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: '문서 내용' },
      sections: { type: 'array', description: '섹션 배열' },
    },
  },
  meta: {
    label: 'Word 생성',
    icon: 'Description',
    color: '#2563eb',
    category: 'export',
    tags: ['export', 'docx', 'word', '워드', '문서'],
  },
  ports: {
    inputs: [
      { name: 'content', type: 'text', required: false },
      { name: 'sections', type: 'json', required: false },
      { name: 'tables', type: 'json', required: false },
    ],
    outputs: [{ name: 'file_path', type: 'file-ref', required: true }],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true },
    { key: 'title', label: '문서 제목', type: 'text' },
    { key: 'author', label: '작성자', type: 'text' },
    { key: 'template', label: '템플릿', type: 'select', default: 'default',
      options: [
        { label: '기본', value: 'default' },
        { label: '보고서', value: 'report' },
        { label: '논문', value: 'academic' },
      ] },
    { key: 'include_toc', label: '목차 포함', type: 'toggle', default: false },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_export_docx', {
        content: input.content,
        sections: input.sections,
        tables: input.tables,
        outputPath: config.output_path,
        title: config.title,
        author: config.author,
        template: config.template,
        includeToc: config.include_toc,
      }) as any
      return { file_path: result.path }
    },
  },
}

// ============================================================================
// export.pptx - PowerPoint 생성
// ============================================================================
const exportPptx: UnifiedToolDefinition = {
  name: 'export.pptx',
  version: '1.0.0',
  description: 'Microsoft PowerPoint 프레젠테이션(.pptx)을 생성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      slides: { type: 'array', description: '슬라이드 배열 [{title, content, layout}]' },
      title: { type: 'string', description: '프레젠테이션 제목' },
    },
    required: ['slides'],
  },
  meta: {
    label: 'PowerPoint 생성',
    icon: 'Slideshow',
    color: '#dc2626',
    category: 'export',
    tags: ['export', 'pptx', 'powerpoint', '파워포인트'],
  },
  ports: {
    inputs: [
      { name: 'slides', type: 'json', required: true },
      { name: 'title', type: 'text', required: false },
    ],
    outputs: [
      { name: 'file_path', type: 'file-ref', required: true },
      { name: 'slide_count', type: 'number', required: false },
    ],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true },
    { key: 'template', label: '템플릿', type: 'select', default: 'default',
      options: [
        { label: '기본', value: 'default' },
        { label: '비즈니스', value: 'business' },
        { label: '미니멀', value: 'minimal' },
      ] },
    { key: 'slide_size', label: '슬라이드 크기', type: 'select', default: '16:9',
      options: [
        { label: '16:9 (와이드)', value: '16:9' },
        { label: '4:3 (표준)', value: '4:3' },
      ] },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_export_pptx', {
        slides: input.slides,
        title: input.title,
        outputPath: config.output_path,
        template: config.template,
        slideSize: config.slide_size,
      }) as any
      return { file_path: result.path, slide_count: result.slideCount }
    },
  },
}

// ============================================================================
// export.html - HTML 생성
// ============================================================================
const exportHtml: UnifiedToolDefinition = {
  name: 'export.html',
  version: '1.0.0',
  description: 'HTML 문서를 생성합니다. Markdown → HTML 변환 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'HTML 또는 Markdown 내용' },
      title: { type: 'string', description: '페이지 제목' },
    },
    required: ['content'],
  },
  meta: {
    label: 'HTML 생성',
    icon: 'Code',
    color: '#f97316',
    category: 'export',
    tags: ['export', 'html', 'web', 'HTML'],
  },
  ports: {
    inputs: [{ name: 'content', type: 'text', required: true }],
    outputs: [{ name: 'file_path', type: 'file-ref', required: true }],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true },
    { key: 'title', label: '페이지 제목', type: 'text' },
    { key: 'from_markdown', label: 'Markdown 변환', type: 'toggle', default: true },
    { key: 'include_styles', label: '기본 스타일 포함', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_export_html', {
        content: input.content,
        outputPath: config.output_path,
        title: config.title,
        fromMarkdown: config.from_markdown,
        includeStyles: config.include_styles,
      }) as any
      return { file_path: result.path }
    },
  },
}

// ============================================================================
// export.markdown - Markdown 생성
// ============================================================================
const exportMarkdown: UnifiedToolDefinition = {
  name: 'export.markdown',
  version: '1.0.0',
  description: 'Markdown 파일을 생성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'Markdown 내용' },
      sections: { type: 'array', description: '섹션 배열' },
    },
  },
  meta: {
    label: 'Markdown 생성',
    icon: 'Description',
    color: '#64748b',
    category: 'export',
    tags: ['export', 'markdown', 'md', '마크다운'],
  },
  ports: {
    inputs: [
      { name: 'content', type: 'text', required: false },
      { name: 'sections', type: 'json', required: false },
    ],
    outputs: [{ name: 'file_path', type: 'file-ref', required: true }],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true },
    { key: 'include_toc', label: '목차 포함', type: 'toggle', default: false },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const { invoke } = await import('@tauri-apps/api/tauri')
      let content = (inp.content || '') as string

      // 섹션을 Markdown으로 변환
      if (inp.sections && Array.isArray(inp.sections)) {
        for (const section of inp.sections) {
          if (section.title) content += `\n\n## ${section.title}\n`
          if (section.content) content += `\n${section.content}`
        }
      }

      // 목차 생성
      if (cfg.include_toc) {
        const headings = content.match(/^##?\s+.+$/gm) || []
        const toc = headings.map((h: string) => {
          const level = h.startsWith('## ') ? 1 : 0
          const text = h.replace(/^##?\s+/, '')
          const anchor = text.toLowerCase().replace(/\s+/g, '-')
          return `${'  '.repeat(level)}- [${text}](#${anchor})`
        }).join('\n')
        content = `## 목차\n\n${toc}\n\n${content}`
      }

      await invoke('tool_file_write', {
        path: cfg.output_path,
        content,
      })
      return { file_path: cfg.output_path }
    },
  },
}

// ============================================================================
// export.image - 이미지 저장
// ============================================================================
const exportImage: UnifiedToolDefinition = {
  name: 'export.image',
  version: '1.0.0',
  description: '이미지를 파일로 저장합니다. Base64 → 파일 변환.',
  inputSchema: {
    type: 'object',
    properties: {
      image_base64: { type: 'string', description: 'Base64 인코딩 이미지' },
      image_url: { type: 'string', description: '이미지 URL' },
    },
  },
  meta: {
    label: '이미지 저장',
    icon: 'Image',
    color: '#8b5cf6',
    category: 'export',
    tags: ['export', 'image', '이미지', '저장'],
  },
  ports: {
    inputs: [
      { name: 'image_base64', type: 'text', required: false },
      { name: 'image_url', type: 'text', required: false },
    ],
    outputs: [{ name: 'file_path', type: 'file-ref', required: true }],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true },
    { key: 'format', label: '형식', type: 'select', default: 'png',
      options: [
        { label: 'PNG', value: 'png' },
        { label: 'JPEG', value: 'jpeg' },
        { label: 'WebP', value: 'webp' },
      ] },
    { key: 'quality', label: '품질 (JPEG)', type: 'slider', min: 1, max: 100, default: 85 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_export_image', {
        imageBase64: input.image_base64,
        imageUrl: input.image_url,
        outputPath: config.output_path,
        format: config.format,
        quality: config.quality,
      }) as any
      return { file_path: result.path }
    },
  },
}

// ============================================================================
// export.zip - ZIP 아카이브 생성
// ============================================================================
const exportZip: UnifiedToolDefinition = {
  name: 'export.zip',
  version: '1.0.0',
  description: '여러 파일을 ZIP 아카이브로 압축합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      files: { type: 'array', description: '파일 경로 배열' },
      folder: { type: 'string', description: '폴더 경로' },
    },
  },
  meta: {
    label: 'ZIP 생성',
    icon: 'FolderZip',
    color: '#64748b',
    category: 'export',
    tags: ['export', 'zip', 'archive', '압축'],
  },
  ports: {
    inputs: [
      { name: 'files', type: 'json', required: false },
      { name: 'folder', type: 'file-ref', required: false },
    ],
    outputs: [
      { name: 'file_path', type: 'file-ref', required: true },
      { name: 'file_count', type: 'number', required: false },
    ],
  },
  configSchema: [
    { key: 'output_path', label: '출력 경로', type: 'file', required: true },
    { key: 'compression', label: '압축 레벨', type: 'select', default: 'normal',
      options: [
        { label: '저장만', value: 'store' },
        { label: '빠름', value: 'fast' },
        { label: '보통', value: 'normal' },
        { label: '최대', value: 'best' },
      ] },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')
      const result = await invoke('tool_export_zip', {
        files: input.files,
        folder: input.folder,
        outputPath: config.output_path,
        compression: config.compression,
      }) as any
      return { file_path: result.path, file_count: result.fileCount }
    },
  },
}

// ============================================================================
// Export
// ============================================================================
export const EXPORT_TOOLS: UnifiedToolDefinition[] = [
  exportXlsx,
  exportCsv,
  exportJson,
  exportPdf,
  exportDocx,
  exportPptx,
  exportHtml,
  exportMarkdown,
  exportImage,
  exportZip,
]

// Legacy export
export const EXPORT_DEFINITIONS = EXPORT_TOOLS
