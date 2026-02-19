/**
 * Transform 도구 노드 정의 — json.*, csv.*, text.*, xml.*
 */
import { invoke } from '@tauri-apps/api/tauri'
import type { NodeDefinition } from '../registry/NodeDefinition'

export const JsonQueryDefinition: NodeDefinition = {
  type: 'transform.json-query',
  category: 'transform',
  meta: {
    label: 'JSON 쿼리',
    description: 'JSONPath 표현식으로 데이터를 추출, 필터링, 집계합니다. 플랫폼 핵심 도구.',
    icon: 'DataObject',
    color: '#8b5cf6',
    tags: ['json', 'query', 'jsonpath', 'filter', 'extract', '쿼리', '추출', '필터'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'json', required: true, description: '입력 JSON 데이터' }],
    outputs: [{ name: 'result', type: 'json', required: true, description: '쿼리 결과' }],
  },
  configSchema: [
    { key: 'query', label: '쿼리 표현식', type: 'code', language: 'json', required: true, rows: 3,
      description: '예: users[?age > 27].name | sort_by(.name)' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const data = input.data || input.text ? JSON.parse(input.text) : {}
      const result = await invoke('tool_json_query', { data, query: config.query }) as any
      return { result }
    },
  },
}

export const JsonParseDefinition: NodeDefinition = {
  type: 'transform.json-parse',
  category: 'transform',
  meta: {
    label: 'JSON 파싱',
    description: '텍스트를 JSON으로 파싱합니다. 느슨한 모드에서 주석과 trailing comma를 허용.',
    icon: 'Code',
    color: '#8b5cf6',
    tags: ['json', 'parse', '파싱', '변환'],
  },
  ports: {
    inputs: [{ name: 'text', type: 'text', required: true, description: 'JSON 텍스트' }],
    outputs: [{ name: 'data', type: 'json', required: true, description: '파싱된 JSON' }],
  },
  configSchema: [
    { key: 'strict', label: '엄격 모드', type: 'toggle', default: true, description: 'false면 주석, trailing comma 허용' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const data = await invoke('tool_json_parse', { text: input.text, strict: config.strict }) as any
      return { data }
    },
  },
}

export const JsonStringifyDefinition: NodeDefinition = {
  type: 'transform.json-stringify',
  category: 'transform',
  meta: {
    label: 'JSON 문자열화',
    description: 'JSON을 텍스트로 변환합니다.',
    icon: 'TextFields',
    color: '#8b5cf6',
    tags: ['json', 'stringify', 'text', '문자열'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'json', required: true, description: 'JSON 데이터' }],
    outputs: [{ name: 'text', type: 'text', required: true, description: 'JSON 텍스트' }],
  },
  configSchema: [
    { key: 'pretty', label: '들여쓰기', type: 'toggle', default: true },
    { key: 'indent', label: '들여쓰기 크기', type: 'number', default: 2 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const text = await invoke('tool_json_stringify', { data: input.data, pretty: config.pretty, indent: config.indent }) as string
      return { text }
    },
  },
}

export const CsvParseDefinition: NodeDefinition = {
  type: 'transform.csv-parse',
  category: 'transform',
  meta: {
    label: 'CSV 파싱',
    description: 'CSV/TSV 텍스트를 구조화된 데이터로 파싱합니다. 구분자 자동 감지, 타입 추론.',
    icon: 'TableChart',
    color: '#8b5cf6',
    tags: ['csv', 'tsv', 'parse', 'table', '테이블', '파싱'],
  },
  ports: {
    inputs: [{ name: 'text', type: 'text', required: true, description: 'CSV 텍스트' }],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '파싱된 데이터 (rows 배열)' },
      { name: 'headers', type: 'json', required: false, description: '헤더 배열' },
    ],
  },
  configSchema: [
    { key: 'delimiter', label: '구분자', type: 'select', default: 'auto',
      options: [
        { label: '자동 감지', value: 'auto' }, { label: '쉼표 (,)', value: ',' },
        { label: '탭 (\\t)', value: 'tab' }, { label: '파이프 (|)', value: '|' },
        { label: '세미콜론 (;)', value: ';' },
      ] },
    { key: 'has_header', label: '헤더 포함', type: 'toggle', default: true },
    { key: 'type_inference', label: '타입 자동 추론', type: 'toggle', default: true },
    { key: 'max_rows', label: '최대 행 수', type: 'number', default: 0, description: '0이면 전체' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const result = await invoke('tool_csv_parse', {
        text: input.text, delimiter: config.delimiter === 'auto' ? null : config.delimiter,
        hasHeader: config.has_header, typeInference: config.type_inference,
        maxRows: config.max_rows || null,
      }) as any
      return { data: result.rows, headers: result.headers, result }
    },
  },
}

export const CsvStringifyDefinition: NodeDefinition = {
  type: 'transform.csv-stringify',
  category: 'transform',
  meta: {
    label: 'CSV 생성',
    description: 'JSON 배열을 CSV 텍스트로 변환합니다.',
    icon: 'TableRows',
    color: '#8b5cf6',
    tags: ['csv', 'stringify', 'export', '생성'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'json', required: true, description: 'JSON 배열 [{...}, ...]' }],
    outputs: [{ name: 'text', type: 'text', required: true, description: 'CSV 텍스트' }],
  },
  configSchema: [
    { key: 'delimiter', label: '구분자', type: 'select', default: ',',
      options: [{ label: '쉼표', value: ',' }, { label: '탭', value: 'tab' }, { label: '세미콜론', value: ';' }] },
    { key: 'include_header', label: '헤더 포함', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const text = await invoke('tool_csv_stringify', {
        data: input.data, delimiter: config.delimiter, includeHeader: config.include_header,
      }) as string
      return { text }
    },
  },
}

export const TextSplitDefinition: NodeDefinition = {
  type: 'transform.text-split',
  category: 'transform',
  meta: {
    label: '텍스트 분할',
    description: '텍스트를 청크로 분할합니다. RAG 파이프라인의 핵심 도구. 5가지 분할 방법 지원.',
    icon: 'ContentCut',
    color: '#8b5cf6',
    tags: ['text', 'split', 'chunk', 'rag', '분할', '청킹', '텍스트'],
  },
  ports: {
    inputs: [{ name: 'text', type: 'text', required: true, description: '분할할 텍스트' }],
    outputs: [
      { name: 'chunks', type: 'text[]', required: true, description: '분할된 청크 배열' },
      { name: 'result', type: 'json', required: false, description: '상세 결과 (위치 정보 포함)' },
    ],
  },
  configSchema: [
    { key: 'method', label: '분할 방법', type: 'select', default: 'recursive', required: true,
      options: [
        { label: '재귀 분할 (권장)', value: 'recursive' },
        { label: '문장 단위', value: 'sentences' },
        { label: '구분자', value: 'separator' },
        { label: '토큰 수', value: 'tokens' },
        { label: '슬라이딩 윈도우', value: 'sliding_window' },
      ] },
    { key: 'chunk_size', label: '청크 크기 (문자)', type: 'number', default: 1000 },
    { key: 'chunk_overlap', label: '오버랩 (문자)', type: 'number', default: 200 },
    { key: 'separator', label: '구분자', type: 'text', default: '\\n\\n', showWhen: { key: 'method', value: 'separator' } },
    { key: 'preserve_sentences', label: '문장 보존', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const result = await invoke('tool_text_split', {
        text: input.text, method: config.method, chunkSize: config.chunk_size,
        chunkOverlap: config.chunk_overlap, separator: config.separator,
        preserveSentences: config.preserve_sentences,
      }) as any
      const chunks = result.chunks.map((c: any) => c.text)
      return { chunks, result }
    },
  },
}

export const TextRegexDefinition: NodeDefinition = {
  type: 'transform.text-regex',
  category: 'transform',
  meta: {
    label: '정규식',
    description: '정규식으로 텍스트를 검색, 추출, 치환, 분할합니다.',
    icon: 'FindReplace',
    color: '#8b5cf6',
    tags: ['regex', 'text', 'search', 'replace', 'extract', '정규식', '검색', '치환'],
  },
  ports: {
    inputs: [{ name: 'text', type: 'text', required: true, description: '입력 텍스트' }],
    outputs: [{ name: 'result', type: 'json', required: true, description: '연산 결과' }],
  },
  configSchema: [
    { key: 'pattern', label: '정규식 패턴', type: 'text', required: true },
    { key: 'operation', label: '연산', type: 'select', default: 'match_all',
      options: [
        { label: '존재 확인', value: 'test' }, { label: '첫 매치', value: 'match' },
        { label: '모든 매치', value: 'match_all' }, { label: '그룹 추출', value: 'extract' },
        { label: '치환', value: 'replace' }, { label: '분할', value: 'split' },
      ] },
    { key: 'replacement', label: '치환 문자열', type: 'text', showWhen: { key: 'operation', value: 'replace' } },
    { key: 'flags', label: '플래그', type: 'text', default: '', description: 'i(대소문자), m(멀티라인), s(dotall)' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const result = await invoke('tool_text_regex', {
        text: input.text, pattern: config.pattern, operation: config.operation,
        replacement: config.replacement || null, flags: config.flags || null,
      }) as any
      return { result }
    },
  },
}

export const TextTemplateDefinition: NodeDefinition = {
  type: 'transform.text-template',
  category: 'transform',
  meta: {
    label: '템플릿 엔진',
    description: '변수, 조건문, 반복문, 필터를 지원하는 템플릿 엔진. 프롬프트 생성에 핵심.',
    icon: 'DynamicForm',
    color: '#8b5cf6',
    tags: ['template', 'text', 'handlebars', 'prompt', '템플릿', '프롬프트'],
  },
  ports: {
    inputs: [
      { name: 'variables', type: 'json', required: false, description: '변수 맵' },
    ],
    outputs: [{ name: 'text', type: 'text', required: true, description: '렌더링된 텍스트' }],
  },
  configSchema: [
    { key: 'template', label: '템플릿', type: 'code', language: 'handlebars', required: true, rows: 8,
      description: '{{변수}}, {{#if}}, {{#each}}, {{필터}} 지원' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const variables = input.variables || input
      const text = await invoke('tool_text_template', { template: config.template, variables }) as string
      return { text }
    },
  },
}

export const XmlParseDefinition: NodeDefinition = {
  type: 'transform.xml-parse',
  category: 'transform',
  meta: {
    label: 'XML 파싱',
    description: 'XML을 JSON으로 변환합니다.',
    icon: 'Code',
    color: '#8b5cf6',
    tags: ['xml', 'parse', 'json', '변환'],
  },
  ports: {
    inputs: [{ name: 'text', type: 'text', required: true, description: 'XML 텍스트' }],
    outputs: [{ name: 'data', type: 'json', required: true, description: '변환된 JSON' }],
  },
  configSchema: [],
  runtime: 'tauri',
  executor: {
    async execute(input) {
      const data = await invoke('tool_xml_parse', { text: input.text }) as any
      return { data }
    },
  },
}

export const TRANSFORM_DEFINITIONS: NodeDefinition[] = [
  JsonQueryDefinition, JsonParseDefinition, JsonStringifyDefinition,
  CsvParseDefinition, CsvStringifyDefinition,
  TextSplitDefinition, TextRegexDefinition, TextTemplateDefinition,
  XmlParseDefinition,
]
