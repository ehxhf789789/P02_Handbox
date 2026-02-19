/**
 * IO 도구 노드 정의 — file.read, file.write, file.list, file.info, http.request
 */
import { invoke } from '@tauri-apps/api/tauri'
import type { NodeDefinition } from '../registry/NodeDefinition'

export const FileReadDefinition: NodeDefinition = {
  type: 'io.file-read',
  category: 'io',
  meta: {
    label: '파일 읽기',
    description: '텍스트/바이너리 파일을 읽습니다. 인코딩 자동 감지, 대용량 부분 읽기 지원.',
    icon: 'FileOpen',
    color: '#3b82f6',
    tags: ['file', 'read', 'io', 'text', 'binary', '파일', '읽기'],
  },
  ports: {
    inputs: [
      { name: 'path', type: 'text', required: false, description: '파일 경로 (config에서도 설정 가능)' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '파일 내용 (텍스트)' },
      { name: 'metadata', type: 'json', required: false, description: '파일 메타데이터' },
    ],
  },
  configSchema: [
    { key: 'path', label: '파일 경로', type: 'file', required: true, description: '읽을 파일을 선택하세요' },
    { key: 'encoding', label: '인코딩', type: 'select', default: 'auto',
      options: [
        { label: '자동 감지', value: 'auto' },
        { label: 'UTF-8', value: 'utf-8' },
        { label: 'EUC-KR (한국어)', value: 'euc-kr' },
        { label: 'Shift-JIS (일본어)', value: 'shift-jis' },
      ] },
    { key: 'limit', label: '최대 읽기 크기 (bytes)', type: 'number', default: 0, description: '0이면 전체 읽기' },
    { key: 'as_binary', label: '바이너리 모드', type: 'toggle', default: false, description: 'base64로 반환' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const path = input.path || config.path
      if (!path) throw new Error('파일 경로가 필요합니다')
      const result = await invoke('tool_file_read', {
        path,
        encoding: config.encoding === 'auto' ? null : config.encoding,
        limit: config.limit || null,
        asBinary: config.as_binary || null,
      }) as any
      return {
        text: result.data,
        metadata: { size: result.size, sizeHuman: result.size_human, mime: result.mime_type, encoding: result.encoding_detected, ...result.metadata },
      }
    },
  },
}

export const FileWriteDefinition: NodeDefinition = {
  type: 'io.file-write',
  category: 'io',
  meta: {
    label: '파일 쓰기',
    description: '텍스트를 파일로 저장합니다. 덮어쓰기, 추가, 원자적 쓰기 모드 지원.',
    icon: 'SaveAlt',
    color: '#3b82f6',
    tags: ['file', 'write', 'save', 'io', '파일', '쓰기', '저장'],
  },
  ports: {
    inputs: [
      { name: 'content', type: 'text', required: true, description: '저장할 텍스트' },
      { name: 'path', type: 'text', required: false, description: '저장 경로' },
    ],
    outputs: [
      { name: 'result', type: 'json', required: true, description: '저장 결과' },
    ],
  },
  configSchema: [
    { key: 'path', label: '파일 경로', type: 'text', required: true },
    { key: 'mode', label: '쓰기 모드', type: 'select', default: 'overwrite',
      options: [
        { label: '덮어쓰기', value: 'overwrite' },
        { label: '추가 (Append)', value: 'append' },
        { label: '원자적 (Atomic)', value: 'atomic' },
      ] },
    { key: 'encoding', label: '인코딩', type: 'select', default: 'utf-8',
      options: [{ label: 'UTF-8', value: 'utf-8' }, { label: 'EUC-KR', value: 'euc-kr' }] },
    { key: 'backup', label: '백업 생성', type: 'toggle', default: false },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const path = input.path || config.path
      const content = input.content || ''
      const result = await invoke('tool_file_write', {
        path, content, encoding: config.encoding, mode: config.mode,
        createDirs: true, backup: config.backup,
      }) as any
      return { result }
    },
  },
}

export const FileListDefinition: NodeDefinition = {
  type: 'io.file-list',
  category: 'io',
  meta: {
    label: '파일 목록',
    description: '디렉토리의 파일 목록을 조회합니다. 글로브 패턴, 재귀 탐색 지원.',
    icon: 'FolderOpen',
    color: '#3b82f6',
    tags: ['file', 'list', 'directory', 'folder', 'glob', '파일', '목록', '폴더'],
  },
  ports: {
    inputs: [
      { name: 'path', type: 'text', required: false, description: '디렉토리 경로' },
    ],
    outputs: [
      { name: 'files', type: 'json', required: true, description: '파일 목록 배열' },
      { name: 'count', type: 'json', required: false, description: '파일 수' },
    ],
  },
  configSchema: [
    { key: 'path', label: '디렉토리 경로', type: 'folder', required: true },
    { key: 'pattern', label: '패턴 (glob)', type: 'text', placeholder: '**/*.pdf' },
    { key: 'recursive', label: '하위 폴더 포함', type: 'toggle', default: false },
    { key: 'sort_by', label: '정렬 기준', type: 'select', default: 'name',
      options: [
        { label: '이름', value: 'name' }, { label: '크기', value: 'size' },
        { label: '수정일', value: 'modified' }, { label: '타입', value: 'type' },
      ] },
    { key: 'limit', label: '최대 개수', type: 'number', default: 0 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const path = input.path || config.path
      const result = await invoke('tool_file_list', {
        path, pattern: config.pattern || null, recursive: config.recursive,
        includeHidden: false, sortBy: config.sort_by, limit: config.limit || null,
      }) as any
      return { files: result.files, count: result.total_count }
    },
  },
}

export const FileInfoDefinition: NodeDefinition = {
  type: 'io.file-info',
  category: 'io',
  meta: {
    label: '파일 정보',
    description: '파일의 메타데이터를 조회합니다 (크기, MIME, 수정일, 텍스트/바이너리 여부).',
    icon: 'Info',
    color: '#3b82f6',
    tags: ['file', 'info', 'metadata', 'size', 'mime', '파일', '정보'],
  },
  ports: {
    inputs: [{ name: 'path', type: 'text', required: true, description: '파일 경로' }],
    outputs: [{ name: 'info', type: 'json', required: true, description: '파일 정보' }],
  },
  configSchema: [
    { key: 'path', label: '파일 경로', type: 'file' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const path = input.path || config.path
      const info = await invoke('tool_file_info', { path }) as any
      return { info }
    },
  },
}

export const HttpRequestDefinition: NodeDefinition = {
  type: 'io.http-request',
  category: 'io',
  meta: {
    label: 'HTTP 요청',
    description: 'HTTP/HTTPS 요청을 보내고 응답을 받습니다. REST API 호출에 사용.',
    icon: 'Http',
    color: '#3b82f6',
    tags: ['http', 'request', 'api', 'rest', 'fetch', 'web', 'url', '요청'],
  },
  ports: {
    inputs: [
      { name: 'url', type: 'text', required: false, description: 'URL' },
      { name: 'body', type: 'text', required: false, description: '요청 본문' },
    ],
    outputs: [
      { name: 'body', type: 'text', required: true, description: '응답 본문' },
      { name: 'response', type: 'json', required: false, description: '전체 응답 (헤더, 상태 등)' },
    ],
  },
  configSchema: [
    { key: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://api.example.com/data' },
    { key: 'method', label: '메서드', type: 'select', default: 'GET',
      options: [
        { label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' },
        { label: 'PUT', value: 'PUT' }, { label: 'DELETE', value: 'DELETE' },
        { label: 'PATCH', value: 'PATCH' },
      ] },
    { key: 'headers', label: '헤더 (JSON)', type: 'code', language: 'json', rows: 3, default: '{}' },
    { key: 'timeout_ms', label: '타임아웃 (ms)', type: 'number', default: 30000 },
    { key: 'response_type', label: '응답 타입', type: 'select', default: 'text',
      options: [
        { label: '텍스트', value: 'text' }, { label: 'JSON', value: 'json' }, { label: '바이너리', value: 'binary' },
      ] },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const url = input.url || config.url
      let headers: Record<string, string> | null = null
      try { headers = JSON.parse(config.headers || '{}') } catch { /* ignore */ }
      const result = await invoke('tool_http_request', {
        url, method: config.method, headers, body: input.body || null,
        timeoutMs: config.timeout_ms, responseType: config.response_type,
      }) as any
      return { body: typeof result.body === 'string' ? result.body : JSON.stringify(result.body), response: result }
    },
  },
}

export const IO_DEFINITIONS: NodeDefinition[] = [
  FileReadDefinition, FileWriteDefinition, FileListDefinition,
  FileInfoDefinition, HttpRequestDefinition,
]
