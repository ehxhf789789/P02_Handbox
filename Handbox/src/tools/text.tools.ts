/**
 * Text Tools - 텍스트 처리/변환
 *
 * 원자화된 텍스트 도구 14개:
 * - text.split       : 텍스트 분할
 * - text.join        : 텍스트 결합
 * - text.trim        : 공백 제거
 * - text.replace     : 문자열 치환
 * - text.regex-match : 정규식 매칭
 * - text.regex-replace: 정규식 치환
 * - text.case        : 대소문자 변환
 * - text.encode      : 인코딩 (base64, url)
 * - text.decode      : 디코딩
 * - text.hash        : 해시 생성
 * - text.template    : 템플릿 렌더링
 * - text.truncate    : 텍스트 자르기
 * - text.pad         : 패딩 추가
 * - text.extract     : 패턴 추출
 */

import type {
  UnifiedToolDefinition,
  ToolExecutor,
  ToolResult,
  ToolExecutionContext,
} from '../registry/UnifiedToolDefinition'

// ============================================================
// text.split - 텍스트 분할
// ============================================================

const textSplitExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || config.text || '') as string
    const delimiter = (config.delimiter || '\n') as string
    const limit = config.limit as number | undefined

    if (!text) {
      return { success: false, outputs: {}, error: '텍스트가 필요합니다' }
    }

    try {
      let parts: string[]

      if (config.useRegex) {
        const regex = new RegExp(delimiter, 'g')
        parts = text.split(regex)
      } else {
        parts = text.split(delimiter)
      }

      if (limit && limit > 0) {
        parts = parts.slice(0, limit)
      }

      // 빈 문자열 제거 옵션
      if (config.removeEmpty) {
        parts = parts.filter(p => p.trim() !== '')
      }

      return {
        success: true,
        outputs: {
          parts,
          count: parts.length,
          first: parts[0] || '',
          last: parts[parts.length - 1] || '',
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const textSplit: UnifiedToolDefinition = {
  name: 'text.split',
  version: '1.0.0',
  description: '텍스트를 구분자로 분할하여 배열로 반환합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '분할할 텍스트' },
      delimiter: { type: 'string', description: '구분자 (기본: 줄바꿈)' },
      limit: { type: 'number', description: '최대 분할 수' },
      useRegex: { type: 'boolean', description: '정규식 구분자 사용' },
      removeEmpty: { type: 'boolean', description: '빈 문자열 제거' },
    },
    required: ['text'],
  },
  meta: {
    label: '텍스트 분할',
    description: '텍스트를 분할합니다',
    icon: 'CallSplit',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'split', 'divide', '텍스트', '분할'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'parts', type: 'json', required: true, description: '분할된 텍스트 배열' },
      { name: 'count', type: 'number', required: false, description: '분할된 개수' },
      { name: 'first', type: 'text', required: false, description: '첫 번째 부분' },
      { name: 'last', type: 'text', required: false, description: '마지막 부분' },
    ],
  },
  configSchema: [
    { key: 'delimiter', label: '구분자', type: 'text', default: '\\n', description: '줄바꿈: \\n, 탭: \\t' },
    { key: 'limit', label: '최대 분할 수', type: 'number', default: 0 },
    { key: 'useRegex', label: '정규식 사용', type: 'toggle', default: false },
    { key: 'removeEmpty', label: '빈 문자열 제거', type: 'toggle', default: false },
  ],
  runtime: 'internal',
  executor: textSplitExecutor,
}

// ============================================================
// text.join - 텍스트 결합
// ============================================================

const textJoinExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const parts = inputs.parts as string[] | unknown[]
    const delimiter = (config.delimiter ?? '\n') as string

    if (!Array.isArray(parts)) {
      return { success: false, outputs: {}, error: '배열이 필요합니다' }
    }

    try {
      const text = parts.map(p => String(p)).join(delimiter)

      return {
        success: true,
        outputs: { text, length: text.length },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const textJoin: UnifiedToolDefinition = {
  name: 'text.join',
  version: '1.0.0',
  description: '문자열 배열을 구분자로 연결하여 하나의 텍스트로 만듭니다.',
  inputSchema: {
    type: 'object',
    properties: {
      parts: { type: 'array', items: { type: 'string' }, description: '결합할 문자열 배열' },
      delimiter: { type: 'string', description: '구분자 (기본: 줄바꿈)' },
    },
    required: ['parts'],
  },
  meta: {
    label: '텍스트 결합',
    description: '문자열 배열을 연결합니다',
    icon: 'CallMerge',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'join', 'merge', 'concat', '텍스트', '결합'],
  },
  ports: {
    inputs: [
      { name: 'parts', type: 'json', required: true, description: '문자열 배열' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '결합된 텍스트' },
      { name: 'length', type: 'number', required: false, description: '결과 길이' },
    ],
  },
  configSchema: [
    { key: 'delimiter', label: '구분자', type: 'text', default: '\\n' },
  ],
  runtime: 'internal',
  executor: textJoinExecutor,
}

// ============================================================
// text.trim - 공백 제거
// ============================================================

const textTrimExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const mode = (config.mode || 'both') as 'both' | 'start' | 'end' | 'all'

    try {
      let result: string

      switch (mode) {
        case 'start':
          result = text.trimStart()
          break
        case 'end':
          result = text.trimEnd()
          break
        case 'all':
          result = text.replace(/\s+/g, ' ').trim()
          break
        default:
          result = text.trim()
      }

      return {
        success: true,
        outputs: { text: result, trimmed: text.length - result.length },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const textTrim: UnifiedToolDefinition = {
  name: 'text.trim',
  version: '1.0.0',
  description: '텍스트의 앞뒤 공백을 제거합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '입력 텍스트' },
      mode: { type: 'string', enum: ['both', 'start', 'end', 'all'], default: 'both' },
    },
    required: ['text'],
  },
  meta: {
    label: '공백 제거',
    description: '텍스트 공백을 제거합니다',
    icon: 'SpaceBar',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'trim', 'whitespace', '텍스트', '공백', '제거'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '결과 텍스트' },
      { name: 'trimmed', type: 'number', required: false, description: '제거된 문자 수' },
    ],
  },
  configSchema: [
    {
      key: 'mode', label: '모드', type: 'select', default: 'both',
      options: [
        { value: 'both', label: '양쪽' },
        { value: 'start', label: '앞쪽만' },
        { value: 'end', label: '뒤쪽만' },
        { value: 'all', label: '모든 연속 공백 압축' },
      ],
    },
  ],
  runtime: 'internal',
  executor: textTrimExecutor,
}

// ============================================================
// text.replace - 문자열 치환
// ============================================================

const textReplaceExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const search = (inputs.search || config.search || '') as string
    const replacement = (inputs.replacement || config.replacement || '') as string
    const replaceAll = config.replaceAll !== false

    if (!search) {
      return { success: true, outputs: { text, count: 0 }, metadata: { executionTime: Date.now() - startTime } }
    }

    try {
      let result: string
      let count = 0

      if (replaceAll) {
        // Count occurrences
        const matches = text.match(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))
        count = matches ? matches.length : 0
        result = text.split(search).join(replacement)
      } else {
        count = text.includes(search) ? 1 : 0
        result = text.replace(search, replacement)
      }

      return {
        success: true,
        outputs: { text: result, count },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const textReplace: UnifiedToolDefinition = {
  name: 'text.replace',
  version: '1.0.0',
  description: '텍스트에서 특정 문자열을 다른 문자열로 치환합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '입력 텍스트' },
      search: { type: 'string', description: '찾을 문자열' },
      replacement: { type: 'string', description: '대체할 문자열' },
      replaceAll: { type: 'boolean', description: '모두 치환', default: true },
    },
    required: ['text', 'search'],
  },
  meta: {
    label: '문자열 치환',
    description: '문자열을 찾아 치환합니다',
    icon: 'FindReplace',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'replace', 'substitute', '텍스트', '치환', '대체'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
      { name: 'search', type: 'text', required: false, description: '찾을 문자열' },
      { name: 'replacement', type: 'text', required: false, description: '대체 문자열' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '결과 텍스트' },
      { name: 'count', type: 'number', required: false, description: '치환된 횟수' },
    ],
  },
  configSchema: [
    { key: 'search', label: '찾을 문자열', type: 'text', required: true },
    { key: 'replacement', label: '대체 문자열', type: 'text', default: '' },
    { key: 'replaceAll', label: '모두 치환', type: 'toggle', default: true },
  ],
  runtime: 'internal',
  executor: textReplaceExecutor,
}

// ============================================================
// text.regex-match - 정규식 매칭
// ============================================================

const textRegexMatchExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const pattern = (inputs.pattern || config.pattern || '') as string
    const flags = (config.flags || 'g') as string

    if (!pattern) {
      return { success: false, outputs: {}, error: '정규식 패턴이 필요합니다' }
    }

    try {
      const regex = new RegExp(pattern, flags)
      const matches = [...text.matchAll(new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'))]

      const results = matches.map(m => ({
        match: m[0],
        groups: m.slice(1),
        index: m.index,
      }))

      return {
        success: true,
        outputs: {
          matches: results.map(r => r.match),
          groups: results.map(r => r.groups),
          count: results.length,
          found: results.length > 0,
          first: results[0]?.match || null,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `정규식 오류: ${error}` }
    }
  },
}

export const textRegexMatch: UnifiedToolDefinition = {
  name: 'text.regex-match',
  version: '1.0.0',
  description: '정규식 패턴과 일치하는 모든 부분을 찾습니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '검색할 텍스트' },
      pattern: { type: 'string', description: '정규식 패턴' },
      flags: { type: 'string', description: '정규식 플래그 (기본: g)', default: 'g' },
    },
    required: ['text', 'pattern'],
  },
  meta: {
    label: '정규식 매칭',
    description: '정규식으로 패턴을 찾습니다',
    icon: 'Search',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'regex', 'match', 'pattern', '정규식', '매칭'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
      { name: 'pattern', type: 'text', required: false, description: '정규식 패턴' },
    ],
    outputs: [
      { name: 'matches', type: 'json', required: true, description: '일치하는 문자열 배열' },
      { name: 'groups', type: 'json', required: false, description: '캡처 그룹 배열' },
      { name: 'count', type: 'number', required: false, description: '일치 개수' },
      { name: 'found', type: 'boolean', required: false, description: '일치 여부' },
      { name: 'first', type: 'text', required: false, description: '첫 번째 일치' },
    ],
  },
  configSchema: [
    { key: 'pattern', label: '정규식 패턴', type: 'text', required: true, description: '예: \\d{3}-\\d{4}' },
    { key: 'flags', label: '플래그', type: 'text', default: 'g', description: 'g=전역, i=대소문자무시, m=다중행' },
  ],
  runtime: 'internal',
  executor: textRegexMatchExecutor,
}

// ============================================================
// text.regex-replace - 정규식 치환
// ============================================================

const textRegexReplaceExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const pattern = (inputs.pattern || config.pattern || '') as string
    const replacement = (inputs.replacement || config.replacement || '') as string
    const flags = (config.flags || 'g') as string

    if (!pattern) {
      return { success: false, outputs: {}, error: '정규식 패턴이 필요합니다' }
    }

    try {
      const regex = new RegExp(pattern, flags)
      const matches = text.match(new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'))
      const count = matches ? matches.length : 0
      const result = text.replace(regex, replacement)

      return {
        success: true,
        outputs: { text: result, count },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `정규식 오류: ${error}` }
    }
  },
}

export const textRegexReplace: UnifiedToolDefinition = {
  name: 'text.regex-replace',
  version: '1.0.0',
  description: '정규식 패턴과 일치하는 부분을 치환합니다. $1, $2 등으로 캡처 그룹 참조 가능.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '입력 텍스트' },
      pattern: { type: 'string', description: '정규식 패턴' },
      replacement: { type: 'string', description: '대체 문자열 ($1 등 사용 가능)' },
      flags: { type: 'string', description: '정규식 플래그', default: 'g' },
    },
    required: ['text', 'pattern'],
  },
  meta: {
    label: '정규식 치환',
    description: '정규식으로 패턴을 치환합니다',
    icon: 'FindReplace',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'regex', 'replace', '정규식', '치환'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
      { name: 'pattern', type: 'text', required: false, description: '정규식 패턴' },
      { name: 'replacement', type: 'text', required: false, description: '대체 문자열' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '결과 텍스트' },
      { name: 'count', type: 'number', required: false, description: '치환된 횟수' },
    ],
  },
  configSchema: [
    { key: 'pattern', label: '정규식 패턴', type: 'text', required: true },
    { key: 'replacement', label: '대체 문자열', type: 'text', default: '', description: '$1, $2 등 캡처 그룹 참조' },
    { key: 'flags', label: '플래그', type: 'text', default: 'g' },
  ],
  runtime: 'internal',
  executor: textRegexReplaceExecutor,
}

// ============================================================
// text.case - 대소문자 변환
// ============================================================

const textCaseExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const mode = (config.mode || 'lower') as string

    try {
      let result: string

      switch (mode) {
        case 'upper':
          result = text.toUpperCase()
          break
        case 'lower':
          result = text.toLowerCase()
          break
        case 'title':
          result = text.replace(/\b\w/g, c => c.toUpperCase())
          break
        case 'sentence':
          result = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
          break
        case 'camel':
          result = text.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
          break
        case 'snake':
          result = text.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_').toLowerCase()
          break
        case 'kebab':
          result = text.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase()
          break
        case 'pascal':
          result = text.replace(/\b\w/g, c => c.toUpperCase()).replace(/[\s_-]+/g, '')
          break
        default:
          result = text
      }

      return {
        success: true,
        outputs: { text: result },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const textCase: UnifiedToolDefinition = {
  name: 'text.case',
  version: '1.0.0',
  description: '텍스트의 대소문자를 변환합니다 (소문자, 대문자, 제목, camelCase, snake_case 등).',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '입력 텍스트' },
      mode: {
        type: 'string',
        enum: ['upper', 'lower', 'title', 'sentence', 'camel', 'snake', 'kebab', 'pascal'],
        default: 'lower',
      },
    },
    required: ['text'],
  },
  meta: {
    label: '대소문자 변환',
    description: '텍스트 대소문자를 변환합니다',
    icon: 'TextFormat',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'case', 'upper', 'lower', 'camel', 'snake', '대소문자'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '변환된 텍스트' },
    ],
  },
  configSchema: [
    {
      key: 'mode', label: '변환 모드', type: 'select', default: 'lower',
      options: [
        { value: 'lower', label: '소문자 (hello world)' },
        { value: 'upper', label: '대문자 (HELLO WORLD)' },
        { value: 'title', label: '제목 (Hello World)' },
        { value: 'sentence', label: '문장 (Hello world)' },
        { value: 'camel', label: 'camelCase' },
        { value: 'snake', label: 'snake_case' },
        { value: 'kebab', label: 'kebab-case' },
        { value: 'pascal', label: 'PascalCase' },
      ],
    },
  ],
  runtime: 'internal',
  executor: textCaseExecutor,
}

// ============================================================
// text.encode - 인코딩
// ============================================================

const textEncodeExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const format = (config.format || 'base64') as string

    try {
      let result: string

      switch (format) {
        case 'base64':
          result = btoa(unescape(encodeURIComponent(text)))
          break
        case 'url':
          result = encodeURIComponent(text)
          break
        case 'html':
          result = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
          break
        case 'hex':
          result = Array.from(new TextEncoder().encode(text))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
          break
        default:
          result = text
      }

      return {
        success: true,
        outputs: { text: result, format },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const textEncode: UnifiedToolDefinition = {
  name: 'text.encode',
  version: '1.0.0',
  description: '텍스트를 base64, URL, HTML 엔티티, hex 등으로 인코딩합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '입력 텍스트' },
      format: { type: 'string', enum: ['base64', 'url', 'html', 'hex'], default: 'base64' },
    },
    required: ['text'],
  },
  meta: {
    label: '텍스트 인코딩',
    description: '텍스트를 인코딩합니다',
    icon: 'EnhancedEncryption',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'encode', 'base64', 'url', 'html', '인코딩'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '인코딩된 텍스트' },
      { name: 'format', type: 'text', required: false, description: '인코딩 형식' },
    ],
  },
  configSchema: [
    {
      key: 'format', label: '인코딩 형식', type: 'select', default: 'base64',
      options: [
        { value: 'base64', label: 'Base64' },
        { value: 'url', label: 'URL 인코딩' },
        { value: 'html', label: 'HTML 엔티티' },
        { value: 'hex', label: 'Hex' },
      ],
    },
  ],
  runtime: 'internal',
  executor: textEncodeExecutor,
}

// ============================================================
// text.decode - 디코딩
// ============================================================

const textDecodeExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const format = (config.format || 'base64') as string

    try {
      let result: string

      switch (format) {
        case 'base64':
          result = decodeURIComponent(escape(atob(text)))
          break
        case 'url':
          result = decodeURIComponent(text)
          break
        case 'html':
          const doc = new DOMParser().parseFromString(text, 'text/html')
          result = doc.documentElement.textContent || ''
          break
        case 'hex':
          result = new TextDecoder().decode(
            new Uint8Array(text.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [])
          )
          break
        default:
          result = text
      }

      return {
        success: true,
        outputs: { text: result, format },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const textDecode: UnifiedToolDefinition = {
  name: 'text.decode',
  version: '1.0.0',
  description: 'base64, URL, HTML 엔티티, hex 인코딩된 텍스트를 디코딩합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '인코딩된 텍스트' },
      format: { type: 'string', enum: ['base64', 'url', 'html', 'hex'], default: 'base64' },
    },
    required: ['text'],
  },
  meta: {
    label: '텍스트 디코딩',
    description: '텍스트를 디코딩합니다',
    icon: 'NoEncryption',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'decode', 'base64', 'url', 'html', '디코딩'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '인코딩된 텍스트' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '디코딩된 텍스트' },
      { name: 'format', type: 'text', required: false, description: '디코딩 형식' },
    ],
  },
  configSchema: [
    {
      key: 'format', label: '디코딩 형식', type: 'select', default: 'base64',
      options: [
        { value: 'base64', label: 'Base64' },
        { value: 'url', label: 'URL 인코딩' },
        { value: 'html', label: 'HTML 엔티티' },
        { value: 'hex', label: 'Hex' },
      ],
    },
  ],
  runtime: 'internal',
  executor: textDecodeExecutor,
}

// ============================================================
// text.hash - 해시 생성
// ============================================================

const textHashExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const algorithm = (config.algorithm || 'SHA-256') as string

    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(text)
      const hashBuffer = await crypto.subtle.digest(algorithm, data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      return {
        success: true,
        outputs: { hash, algorithm },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const textHash: UnifiedToolDefinition = {
  name: 'text.hash',
  version: '1.0.0',
  description: '텍스트의 해시값을 계산합니다 (SHA-256, SHA-384, SHA-512, SHA-1, MD5).',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '입력 텍스트' },
      algorithm: { type: 'string', enum: ['SHA-256', 'SHA-384', 'SHA-512', 'SHA-1'], default: 'SHA-256' },
    },
    required: ['text'],
  },
  meta: {
    label: '해시 생성',
    description: '텍스트 해시를 계산합니다',
    icon: 'Fingerprint',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'hash', 'sha', 'md5', 'checksum', '해시'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'hash', type: 'text', required: true, description: '해시값' },
      { name: 'algorithm', type: 'text', required: false, description: '알고리즘' },
    ],
  },
  configSchema: [
    {
      key: 'algorithm', label: '알고리즘', type: 'select', default: 'SHA-256',
      options: [
        { value: 'SHA-256', label: 'SHA-256' },
        { value: 'SHA-384', label: 'SHA-384' },
        { value: 'SHA-512', label: 'SHA-512' },
        { value: 'SHA-1', label: 'SHA-1 (비권장)' },
      ],
    },
  ],
  runtime: 'internal',
  executor: textHashExecutor,
}

// ============================================================
// text.template - 템플릿 렌더링
// ============================================================

const textTemplateExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const template = (inputs.template || config.template || '') as string
    const data = (inputs.data || config.data || {}) as Record<string, unknown>

    try {
      // Simple template engine: {{variable}}, {{nested.path}}
      let result = template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
        const keys = path.trim().split('.')
        let value: unknown = data
        for (const key of keys) {
          if (value && typeof value === 'object' && key in value) {
            value = (value as Record<string, unknown>)[key]
          } else {
            return `{{${path}}}` // Keep original if not found
          }
        }
        return String(value ?? '')
      })

      return {
        success: true,
        outputs: { text: result },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const textTemplate: UnifiedToolDefinition = {
  name: 'text.template',
  version: '1.0.0',
  description: '템플릿 문자열에 데이터를 렌더링합니다. {{variable}} 형식 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      template: { type: 'string', description: '템플릿 문자열 ({{변수}} 형식)' },
      data: { type: 'object', description: '템플릿에 주입할 데이터' },
    },
    required: ['template'],
  },
  meta: {
    label: '템플릿 렌더링',
    description: '템플릿에 데이터를 렌더링합니다',
    icon: 'Article',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'template', 'render', 'mustache', '템플릿', '렌더링'],
  },
  ports: {
    inputs: [
      { name: 'template', type: 'text', required: true, description: '템플릿 문자열' },
      { name: 'data', type: 'json', required: false, description: '데이터 객체' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '렌더링된 텍스트' },
    ],
  },
  configSchema: [
    { key: 'template', label: '템플릿', type: 'textarea', rows: 5, description: '{{변수}} 형식으로 변수 삽입' },
  ],
  runtime: 'internal',
  executor: textTemplateExecutor,
}

// ============================================================
// text.truncate - 텍스트 자르기
// ============================================================

const textTruncateExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const maxLength = (config.maxLength || 100) as number
    const suffix = (config.suffix ?? '...') as string
    const mode = (config.mode || 'end') as 'end' | 'start' | 'middle'

    try {
      let result: string
      const originalLength = text.length

      if (text.length <= maxLength) {
        result = text
      } else {
        const availableLength = maxLength - suffix.length

        switch (mode) {
          case 'start':
            result = suffix + text.slice(-availableLength)
            break
          case 'middle':
            const halfLength = Math.floor(availableLength / 2)
            result = text.slice(0, halfLength) + suffix + text.slice(-halfLength)
            break
          default: // end
            result = text.slice(0, availableLength) + suffix
        }
      }

      return {
        success: true,
        outputs: {
          text: result,
          truncated: originalLength > maxLength,
          originalLength,
          newLength: result.length,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const textTruncate: UnifiedToolDefinition = {
  name: 'text.truncate',
  version: '1.0.0',
  description: '텍스트를 지정된 길이로 자르고 말줄임 표시를 추가합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '입력 텍스트' },
      maxLength: { type: 'number', description: '최대 길이', default: 100 },
      suffix: { type: 'string', description: '말줄임 표시', default: '...' },
      mode: { type: 'string', enum: ['end', 'start', 'middle'], default: 'end' },
    },
    required: ['text'],
  },
  meta: {
    label: '텍스트 자르기',
    description: '텍스트를 지정 길이로 자릅니다',
    icon: 'ContentCut',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'truncate', 'cut', 'ellipsis', '텍스트', '자르기'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '결과 텍스트' },
      { name: 'truncated', type: 'boolean', required: false, description: '잘렸는지 여부' },
      { name: 'originalLength', type: 'number', required: false, description: '원본 길이' },
    ],
  },
  configSchema: [
    { key: 'maxLength', label: '최대 길이', type: 'number', default: 100 },
    { key: 'suffix', label: '말줄임 표시', type: 'text', default: '...' },
    {
      key: 'mode', label: '자르기 위치', type: 'select', default: 'end',
      options: [
        { value: 'end', label: '끝에서 자르기' },
        { value: 'start', label: '앞에서 자르기' },
        { value: 'middle', label: '중간 생략' },
      ],
    },
  ],
  runtime: 'internal',
  executor: textTruncateExecutor,
}

// ============================================================
// text.pad - 패딩 추가
// ============================================================

const textPadExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = String(inputs.text ?? '')
    const targetLength = (config.targetLength || 10) as number
    const padChar = (config.padChar || ' ') as string
    const position = (config.position || 'start') as 'start' | 'end' | 'both'

    try {
      let result: string

      switch (position) {
        case 'end':
          result = text.padEnd(targetLength, padChar)
          break
        case 'both':
          const totalPadding = targetLength - text.length
          if (totalPadding > 0) {
            const leftPad = Math.floor(totalPadding / 2)
            const rightPad = totalPadding - leftPad
            result = padChar.repeat(leftPad) + text + padChar.repeat(rightPad)
          } else {
            result = text
          }
          break
        default: // start
          result = text.padStart(targetLength, padChar)
      }

      return {
        success: true,
        outputs: { text: result, length: result.length },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const textPad: UnifiedToolDefinition = {
  name: 'text.pad',
  version: '1.0.0',
  description: '텍스트를 지정된 길이까지 패딩 문자로 채웁니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '입력 텍스트' },
      targetLength: { type: 'number', description: '목표 길이', default: 10 },
      padChar: { type: 'string', description: '패딩 문자', default: ' ' },
      position: { type: 'string', enum: ['start', 'end', 'both'], default: 'start' },
    },
    required: ['text'],
  },
  meta: {
    label: '패딩 추가',
    description: '텍스트에 패딩을 추가합니다',
    icon: 'FormatIndentIncrease',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'pad', 'padding', 'fill', '패딩'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '결과 텍스트' },
      { name: 'length', type: 'number', required: false, description: '결과 길이' },
    ],
  },
  configSchema: [
    { key: 'targetLength', label: '목표 길이', type: 'number', default: 10 },
    { key: 'padChar', label: '패딩 문자', type: 'text', default: ' ' },
    {
      key: 'position', label: '패딩 위치', type: 'select', default: 'start',
      options: [
        { value: 'start', label: '앞' },
        { value: 'end', label: '뒤' },
        { value: 'both', label: '양쪽' },
      ],
    },
  ],
  runtime: 'internal',
  executor: textPadExecutor,
}

// ============================================================
// text.extract - 패턴 추출
// ============================================================

const textExtractExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const extractType = (config.extractType || 'emails') as string

    try {
      const patterns: Record<string, RegExp> = {
        emails: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        urls: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g,
        phones: /(\+?[\d\s\-()]{7,})/g,
        numbers: /-?\d+\.?\d*/g,
        hashtags: /#[\w가-힣]+/g,
        mentions: /@[\w가-힣]+/g,
        dates: /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/g,
        ips: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
      }

      const regex = patterns[extractType]
      if (!regex) {
        return { success: false, outputs: {}, error: `Unknown extract type: ${extractType}` }
      }

      const matches = text.match(regex) || []
      const unique = [...new Set(matches)]

      return {
        success: true,
        outputs: {
          matches,
          unique,
          count: matches.length,
          uniqueCount: unique.length,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: String(error) }
    }
  },
}

export const textExtract: UnifiedToolDefinition = {
  name: 'text.extract',
  version: '1.0.0',
  description: '텍스트에서 이메일, URL, 전화번호, 숫자, 해시태그 등을 추출합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '입력 텍스트' },
      extractType: {
        type: 'string',
        enum: ['emails', 'urls', 'phones', 'numbers', 'hashtags', 'mentions', 'dates', 'ips'],
        default: 'emails',
      },
    },
    required: ['text'],
  },
  meta: {
    label: '패턴 추출',
    description: '텍스트에서 특정 패턴을 추출합니다',
    icon: 'FilterList',
    color: '#10b981',
    category: 'text',
    tags: ['text', 'extract', 'email', 'url', 'phone', '추출'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'matches', type: 'json', required: true, description: '추출된 항목 배열' },
      { name: 'unique', type: 'json', required: false, description: '중복 제거된 항목' },
      { name: 'count', type: 'number', required: false, description: '추출된 개수' },
    ],
  },
  configSchema: [
    {
      key: 'extractType', label: '추출 유형', type: 'select', default: 'emails',
      options: [
        { value: 'emails', label: '이메일 주소' },
        { value: 'urls', label: 'URL' },
        { value: 'phones', label: '전화번호' },
        { value: 'numbers', label: '숫자' },
        { value: 'hashtags', label: '해시태그' },
        { value: 'mentions', label: '멘션 (@)' },
        { value: 'dates', label: '날짜' },
        { value: 'ips', label: 'IP 주소' },
      ],
    },
  ],
  runtime: 'internal',
  executor: textExtractExecutor,
}

// ============================================================
// Export All Text Tools
// ============================================================

export const TEXT_TOOLS: UnifiedToolDefinition[] = [
  textSplit,
  textJoin,
  textTrim,
  textReplace,
  textRegexMatch,
  textRegexReplace,
  textCase,
  textEncode,
  textDecode,
  textHash,
  textTemplate,
  textTruncate,
  textPad,
  textExtract,
]
