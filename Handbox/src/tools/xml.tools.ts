/**
 * XML 도구 정의 — xml.* (4개 도구)
 * XML 파싱, 생성, 쿼리, 변환
 */
import type { UnifiedToolDefinition } from '../registry/UnifiedToolDefinition'

// ============================================================================
// xml.parse - XML 파싱
// ============================================================================
const xmlParse: UnifiedToolDefinition = {
  name: 'xml.parse',
  version: '1.0.0',
  description: 'XML 문자열을 JSON 객체로 파싱합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      xml: { type: 'string', description: 'XML 문자열' },
    },
    required: ['xml'],
  },
  meta: {
    label: 'XML 파싱',
    icon: 'Code',
    color: '#f97316',
    category: 'xml',
    tags: ['xml', 'parse', 'json', 'convert', '파싱'],
  },
  ports: {
    inputs: [{ name: 'xml', type: 'text', required: true, description: 'XML 문자열' }],
    outputs: [
      { name: 'json', type: 'json', required: true, description: '파싱된 JSON' },
      { name: 'root', type: 'text', required: false, description: '루트 요소 이름' },
    ],
  },
  configSchema: [
    { key: 'preserve_attributes', label: '속성 보존', type: 'toggle', default: true },
    { key: 'array_mode', label: '배열 모드', type: 'select', default: 'auto',
      options: [
        { label: '자동', value: 'auto' },
        { label: '항상 배열', value: 'always' },
        { label: '단일 요소', value: 'never' },
      ] },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const xml = (input.xml || '') as string

      // 간단한 XML 파서 구현
      const parseXml = (xmlStr: string): any => {
        // 태그 추출
        const tagRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>|<(\w+)([^/>]*)\s*\/>/g
        const result: any = {}

        let match
        while ((match = tagRegex.exec(xmlStr)) !== null) {
          const tagName = match[1] || match[4]
          const attrs = match[2] || match[5] || ''
          const content = match[3] || ''

          // 속성 파싱
          const attrObj: any = {}
          if (config.preserve_attributes && attrs) {
            const attrRegex = /(\w+)=["']([^"']*)["']/g
            let attrMatch
            while ((attrMatch = attrRegex.exec(attrs)) !== null) {
              attrObj[`@${attrMatch[1]}`] = attrMatch[2]
            }
          }

          // 내용 파싱
          let value: any
          if (content.includes('<')) {
            value = parseXml(content)
          } else {
            value = content.trim()
          }

          // 속성과 값 결합
          if (Object.keys(attrObj).length > 0) {
            if (typeof value === 'string') {
              value = { ...attrObj, '#text': value }
            } else if (typeof value === 'object') {
              value = { ...attrObj, ...value }
            }
          }

          // 결과에 추가
          if (result[tagName]) {
            if (!Array.isArray(result[tagName])) {
              result[tagName] = [result[tagName]]
            }
            result[tagName].push(value)
          } else {
            result[tagName] = config.array_mode === 'always' ? [value] : value
          }
        }

        return result
      }

      try {
        const json = parseXml(xml)
        const rootKeys = Object.keys(json)
        return {
          json,
          root: rootKeys.length === 1 ? rootKeys[0] : null,
        }
      } catch (e: any) {
        throw new Error(`XML 파싱 실패: ${e.message}`)
      }
    },
  },
}

// ============================================================================
// xml.stringify - JSON → XML 변환
// ============================================================================
const xmlStringify: UnifiedToolDefinition = {
  name: 'xml.stringify',
  version: '1.0.0',
  description: 'JSON 객체를 XML 문자열로 변환합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      json: { type: 'object', description: 'JSON 객체' },
      root: { type: 'string', description: '루트 요소 이름' },
    },
    required: ['json'],
  },
  meta: {
    label: 'XML 생성',
    icon: 'Code',
    color: '#f97316',
    category: 'xml',
    tags: ['xml', 'stringify', 'generate', 'convert', '생성'],
  },
  ports: {
    inputs: [
      { name: 'json', type: 'json', required: true },
      { name: 'root', type: 'text', required: false },
    ],
    outputs: [{ name: 'xml', type: 'text', required: true, description: 'XML 문자열' }],
  },
  configSchema: [
    { key: 'root', label: '루트 요소', type: 'text', default: 'root' },
    { key: 'declaration', label: 'XML 선언 포함', type: 'toggle', default: true },
    { key: 'indent', label: '들여쓰기', type: 'number', default: 2 },
    { key: 'encoding', label: '인코딩', type: 'text', default: 'UTF-8' },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const json = input.json
      const rootName = input.root || config.root || 'root'
      const indent = (config.indent as number) || 2

      const toXml = (obj: any, depth: number = 0): string => {
        const spaces = ' '.repeat(depth * indent)
        let xml = ''

        for (const [key, value] of Object.entries(obj)) {
          if (key.startsWith('@')) continue // 속성 스킵
          if (key === '#text') {
            xml += value
            continue
          }

          // 속성 수집
          const attrs = Object.entries(obj)
            .filter(([k]) => k.startsWith('@'))
            .map(([k, v]) => `${k.slice(1)}="${v}"`)
            .join(' ')

          const attrStr = attrs ? ` ${attrs}` : ''

          if (Array.isArray(value)) {
            for (const item of value) {
              if (typeof item === 'object') {
                xml += `${spaces}<${key}${attrStr}>\n${toXml(item, depth + 1)}${spaces}</${key}>\n`
              } else {
                xml += `${spaces}<${key}${attrStr}>${item}</${key}>\n`
              }
            }
          } else if (typeof value === 'object' && value !== null) {
            xml += `${spaces}<${key}${attrStr}>\n${toXml(value, depth + 1)}${spaces}</${key}>\n`
          } else {
            xml += `${spaces}<${key}${attrStr}>${value ?? ''}</${key}>\n`
          }
        }

        return xml
      }

      let xml = ''
      if (config.declaration) {
        xml += `<?xml version="1.0" encoding="${config.encoding}"?>\n`
      }

      xml += `<${rootName}>\n${toXml(json, 1)}</${rootName}>`

      return { xml }
    },
  },
}

// ============================================================================
// xml.query - XPath 쿼리
// ============================================================================
const xmlQuery: UnifiedToolDefinition = {
  name: 'xml.query',
  version: '1.0.0',
  description: 'XPath 또는 CSS 선택자로 XML 요소를 쿼리합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      xml: { type: 'string', description: 'XML 문자열' },
      query: { type: 'string', description: 'XPath 또는 CSS 선택자' },
    },
    required: ['xml', 'query'],
  },
  meta: {
    label: 'XML 쿼리',
    icon: 'Search',
    color: '#f97316',
    category: 'xml',
    tags: ['xml', 'xpath', 'query', 'select', '쿼리'],
  },
  ports: {
    inputs: [
      { name: 'xml', type: 'text', required: true },
      { name: 'query', type: 'text', required: false },
    ],
    outputs: [
      { name: 'results', type: 'json', required: true, description: '쿼리 결과' },
      { name: 'count', type: 'number', required: false },
    ],
  },
  configSchema: [
    { key: 'query', label: '쿼리', type: 'text', required: true },
    { key: 'mode', label: '모드', type: 'select', default: 'xpath',
      options: [
        { label: 'XPath', value: 'xpath' },
        { label: 'CSS 선택자', value: 'css' },
        { label: '태그 이름', value: 'tag' },
      ] },
    { key: 'return_text', label: '텍스트만 반환', type: 'toggle', default: false },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')

      // Tauri 백엔드에서 XPath 실행
      const result = await invoke('tool_xml_query', {
        xml: input.xml,
        query: input.query || config.query,
        mode: config.mode,
        returnText: config.return_text,
      }) as any

      return {
        results: result.results,
        count: result.results?.length || 0,
      }
    },
  },
}

// ============================================================================
// xml.transform - XSLT 변환
// ============================================================================
const xmlTransform: UnifiedToolDefinition = {
  name: 'xml.transform',
  version: '1.0.0',
  description: 'XSLT 스타일시트를 사용하여 XML을 변환합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      xml: { type: 'string', description: 'XML 문자열' },
      xslt: { type: 'string', description: 'XSLT 스타일시트' },
    },
    required: ['xml', 'xslt'],
  },
  meta: {
    label: 'XSLT 변환',
    icon: 'Transform',
    color: '#f97316',
    category: 'xml',
    tags: ['xml', 'xslt', 'transform', '변환'],
  },
  ports: {
    inputs: [
      { name: 'xml', type: 'text', required: true },
      { name: 'xslt', type: 'text', required: true },
    ],
    outputs: [{ name: 'result', type: 'text', required: true, description: '변환 결과' }],
  },
  configSchema: [
    { key: 'xslt_path', label: 'XSLT 파일', type: 'file' },
    { key: 'output_format', label: '출력 형식', type: 'select', default: 'xml',
      options: [
        { label: 'XML', value: 'xml' },
        { label: 'HTML', value: 'html' },
        { label: '텍스트', value: 'text' },
      ] },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const { invoke } = await import('@tauri-apps/api/tauri')

      let xslt = input.xslt
      if (!xslt && config.xslt_path) {
        const file = await invoke('tool_file_read', { path: config.xslt_path }) as any
        xslt = file.content
      }

      const result = await invoke('tool_xml_transform', {
        xml: input.xml,
        xslt,
        outputFormat: config.output_format,
      }) as any

      return { result: result.output }
    },
  },
}

// ============================================================================
// Export
// ============================================================================
export const XML_TOOLS: UnifiedToolDefinition[] = [
  xmlParse,
  xmlStringify,
  xmlQuery,
  xmlTransform,
]
