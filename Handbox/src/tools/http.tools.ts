/**
 * HTTP Tools - HTTP 요청/API 호출
 *
 * 원자화된 HTTP 도구 8개:
 * - http.get       : GET 요청
 * - http.post      : POST 요청
 * - http.put       : PUT 요청
 * - http.patch     : PATCH 요청
 * - http.delete    : DELETE 요청
 * - http.head      : HEAD 요청
 * - http.download  : 파일 다운로드
 * - http.upload    : 파일 업로드
 */

import { invoke } from '@tauri-apps/api/tauri'
import type {
  UnifiedToolDefinition,
  ToolExecutor,
  ToolResult,
  ToolExecutionContext,
} from '../registry/UnifiedToolDefinition'

// ============================================================
// Helper: HTTP Request Executor Factory
// ============================================================

function createHttpExecutor(defaultMethod: string): ToolExecutor {
  return {
    async execute(
      inputs: Record<string, unknown>,
      config: Record<string, unknown>,
      _context: ToolExecutionContext
    ): Promise<ToolResult> {
      const startTime = Date.now()
      const url = (inputs.url || config.url) as string
      const methodStr = ((config.method as string) || defaultMethod)
      const method = methodStr.toUpperCase()

      if (!url) {
        return { success: false, outputs: {}, error: 'URL이 필요합니다' }
      }

      try {
        let headers: Record<string, string> | null = null
        try {
          headers = JSON.parse((config.headers as string) || '{}')
        } catch { /* ignore */ }

        const body = inputs.body || config.body || null
        const timeoutMs = (config.timeout_ms || 30000) as number
        const responseType = (config.response_type || 'text') as string

        const result = await invoke<{
          status: number
          status_text: string
          headers: Record<string, string>
          body: string | Record<string, unknown>
        }>('tool_http_request', {
          url,
          method,
          headers,
          body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null,
          timeoutMs,
          responseType,
        })

        // Parse JSON body if needed
        let responseBody = result.body
        if (responseType === 'json' && typeof responseBody === 'string') {
          try {
            responseBody = JSON.parse(responseBody)
          } catch { /* keep as string */ }
        }

        const success = result.status >= 200 && result.status < 300

        return {
          success,
          outputs: {
            body: typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody),
            data: responseBody,
            status: result.status,
            statusText: result.status_text,
            headers: result.headers,
            response: result,
          },
          metadata: { executionTime: Date.now() - startTime },
        }
      } catch (error) {
        return { success: false, outputs: {}, error: `HTTP 요청 실패: ${error}` }
      }
    },
  }
}

// ============================================================
// http.get - GET 요청
// ============================================================

export const httpGet: UnifiedToolDefinition = {
  name: 'http.get',
  version: '1.0.0',
  description: 'HTTP GET 요청을 보냅니다. API 데이터 조회에 사용.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '요청 URL' },
      headers: { type: 'object', description: '요청 헤더' },
      timeout_ms: { type: 'number', description: '타임아웃 (ms)', default: 30000 },
      response_type: { type: 'string', enum: ['text', 'json', 'binary'], default: 'text' },
    },
    required: ['url'],
  },
  meta: {
    label: 'HTTP GET',
    description: 'GET 요청을 보냅니다',
    icon: 'CloudDownload',
    color: '#8b5cf6',
    category: 'http',
    tags: ['http', 'get', 'api', 'request', 'fetch'],
  },
  ports: {
    inputs: [
      { name: 'url', type: 'text', required: true, description: '요청 URL' },
    ],
    outputs: [
      { name: 'body', type: 'text', required: true, description: '응답 본문' },
      { name: 'data', type: 'json', required: false, description: '파싱된 데이터' },
      { name: 'status', type: 'number', required: false, description: '상태 코드' },
      { name: 'headers', type: 'json', required: false, description: '응답 헤더' },
    ],
  },
  configSchema: [
    { key: 'url', label: 'URL', type: 'text', required: true, description: 'https://api.example.com/data' },
    { key: 'headers', label: '헤더 (JSON)', type: 'code', language: 'json', rows: 3, default: '{}' },
    { key: 'timeout_ms', label: '타임아웃 (ms)', type: 'number', default: 30000 },
    {
      key: 'response_type', label: '응답 타입', type: 'select', default: 'text',
      options: [
        { value: 'text', label: '텍스트' },
        { value: 'json', label: 'JSON' },
        { value: 'binary', label: '바이너리' },
      ],
    },
  ],
  runtime: 'tauri',
  executor: createHttpExecutor('GET'),
}

// ============================================================
// http.post - POST 요청
// ============================================================

export const httpPost: UnifiedToolDefinition = {
  name: 'http.post',
  version: '1.0.0',
  description: 'HTTP POST 요청을 보냅니다. 데이터 생성에 사용.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '요청 URL' },
      body: { description: '요청 본문' },
      headers: { type: 'object', description: '요청 헤더' },
      timeout_ms: { type: 'number', default: 30000 },
    },
    required: ['url'],
  },
  meta: {
    label: 'HTTP POST',
    description: 'POST 요청을 보냅니다',
    icon: 'CloudUpload',
    color: '#8b5cf6',
    category: 'http',
    tags: ['http', 'post', 'api', 'create', 'send'],
  },
  ports: {
    inputs: [
      { name: 'url', type: 'text', required: true, description: '요청 URL' },
      { name: 'body', type: 'any', required: false, description: '요청 본문' },
    ],
    outputs: [
      { name: 'body', type: 'text', required: true, description: '응답 본문' },
      { name: 'data', type: 'json', required: false, description: '파싱된 데이터' },
      { name: 'status', type: 'number', required: false, description: '상태 코드' },
    ],
  },
  configSchema: [
    { key: 'url', label: 'URL', type: 'text', required: true },
    { key: 'body', label: '요청 본문', type: 'code', language: 'json', rows: 5 },
    { key: 'headers', label: '헤더 (JSON)', type: 'code', language: 'json', rows: 3, default: '{"Content-Type": "application/json"}' },
    { key: 'timeout_ms', label: '타임아웃 (ms)', type: 'number', default: 30000 },
  ],
  runtime: 'tauri',
  executor: createHttpExecutor('POST'),
}

// ============================================================
// http.put - PUT 요청
// ============================================================

export const httpPut: UnifiedToolDefinition = {
  name: 'http.put',
  version: '1.0.0',
  description: 'HTTP PUT 요청을 보냅니다. 리소스 전체 업데이트에 사용.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '요청 URL' },
      body: { description: '요청 본문' },
      headers: { type: 'object' },
    },
    required: ['url'],
  },
  meta: {
    label: 'HTTP PUT',
    description: 'PUT 요청을 보냅니다',
    icon: 'CloudSync',
    color: '#8b5cf6',
    category: 'http',
    tags: ['http', 'put', 'api', 'update', 'replace'],
  },
  ports: {
    inputs: [
      { name: 'url', type: 'text', required: true, description: '요청 URL' },
      { name: 'body', type: 'any', required: false, description: '요청 본문' },
    ],
    outputs: [
      { name: 'body', type: 'text', required: true, description: '응답 본문' },
      { name: 'status', type: 'number', required: false, description: '상태 코드' },
    ],
  },
  configSchema: [
    { key: 'url', label: 'URL', type: 'text', required: true },
    { key: 'body', label: '요청 본문', type: 'code', language: 'json', rows: 5 },
    { key: 'headers', label: '헤더', type: 'code', language: 'json', rows: 3 },
  ],
  runtime: 'tauri',
  executor: createHttpExecutor('PUT'),
}

// ============================================================
// http.patch - PATCH 요청
// ============================================================

export const httpPatch: UnifiedToolDefinition = {
  name: 'http.patch',
  version: '1.0.0',
  description: 'HTTP PATCH 요청을 보냅니다. 리소스 부분 업데이트에 사용.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '요청 URL' },
      body: { description: '변경할 필드들' },
      headers: { type: 'object' },
    },
    required: ['url'],
  },
  meta: {
    label: 'HTTP PATCH',
    description: 'PATCH 요청을 보냅니다',
    icon: 'Edit',
    color: '#8b5cf6',
    category: 'http',
    tags: ['http', 'patch', 'api', 'update', 'partial'],
  },
  ports: {
    inputs: [
      { name: 'url', type: 'text', required: true, description: '요청 URL' },
      { name: 'body', type: 'any', required: false, description: '변경 데이터' },
    ],
    outputs: [
      { name: 'body', type: 'text', required: true, description: '응답 본문' },
      { name: 'status', type: 'number', required: false, description: '상태 코드' },
    ],
  },
  configSchema: [
    { key: 'url', label: 'URL', type: 'text', required: true },
    { key: 'body', label: '변경 데이터', type: 'code', language: 'json', rows: 5 },
    { key: 'headers', label: '헤더', type: 'code', language: 'json', rows: 3 },
  ],
  runtime: 'tauri',
  executor: createHttpExecutor('PATCH'),
}

// ============================================================
// http.delete - DELETE 요청
// ============================================================

export const httpDelete: UnifiedToolDefinition = {
  name: 'http.delete',
  version: '1.0.0',
  description: 'HTTP DELETE 요청을 보냅니다. 리소스 삭제에 사용.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '요청 URL' },
      headers: { type: 'object' },
    },
    required: ['url'],
  },
  meta: {
    label: 'HTTP DELETE',
    description: 'DELETE 요청을 보냅니다',
    icon: 'DeleteForever',
    color: '#8b5cf6',
    category: 'http',
    tags: ['http', 'delete', 'api', 'remove'],
  },
  ports: {
    inputs: [
      { name: 'url', type: 'text', required: true, description: '요청 URL' },
    ],
    outputs: [
      { name: 'body', type: 'text', required: true, description: '응답 본문' },
      { name: 'status', type: 'number', required: false, description: '상태 코드' },
    ],
  },
  configSchema: [
    { key: 'url', label: 'URL', type: 'text', required: true },
    { key: 'headers', label: '헤더', type: 'code', language: 'json', rows: 3 },
  ],
  runtime: 'tauri',
  executor: createHttpExecutor('DELETE'),
}

// ============================================================
// http.head - HEAD 요청
// ============================================================

export const httpHead: UnifiedToolDefinition = {
  name: 'http.head',
  version: '1.0.0',
  description: 'HTTP HEAD 요청을 보냅니다. 헤더만 조회합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '요청 URL' },
    },
    required: ['url'],
  },
  meta: {
    label: 'HTTP HEAD',
    description: 'HEAD 요청을 보냅니다',
    icon: 'Info',
    color: '#8b5cf6',
    category: 'http',
    tags: ['http', 'head', 'api', 'metadata'],
  },
  ports: {
    inputs: [
      { name: 'url', type: 'text', required: true, description: '요청 URL' },
    ],
    outputs: [
      { name: 'headers', type: 'json', required: true, description: '응답 헤더' },
      { name: 'status', type: 'number', required: false, description: '상태 코드' },
    ],
  },
  configSchema: [
    { key: 'url', label: 'URL', type: 'text', required: true },
  ],
  runtime: 'tauri',
  executor: createHttpExecutor('HEAD'),
}

// ============================================================
// http.download - 파일 다운로드
// ============================================================

const httpDownloadExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const url = (inputs.url || config.url) as string
    const savePath = (inputs.savePath || config.savePath) as string

    if (!url) {
      return { success: false, outputs: {}, error: 'URL이 필요합니다' }
    }

    try {
      const result = await invoke<{
        path: string
        size: number
        size_human: string
      }>('tool_http_download', {
        url,
        savePath: savePath || null,
        overwrite: config.overwrite !== false,
      })

      return {
        success: true,
        outputs: {
          path: result.path,
          size: result.size,
          sizeHuman: result.size_human,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `다운로드 실패: ${error}` }
    }
  },
}

export const httpDownload: UnifiedToolDefinition = {
  name: 'http.download',
  version: '1.0.0',
  description: 'URL에서 파일을 다운로드합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '다운로드 URL' },
      savePath: { type: 'string', description: '저장 경로 (생략 시 임시 디렉토리)' },
      overwrite: { type: 'boolean', default: true },
    },
    required: ['url'],
  },
  meta: {
    label: '파일 다운로드',
    description: 'URL에서 파일을 다운로드합니다',
    icon: 'FileDownload',
    color: '#8b5cf6',
    category: 'http',
    tags: ['http', 'download', 'file', '다운로드'],
  },
  ports: {
    inputs: [
      { name: 'url', type: 'text', required: true, description: '다운로드 URL' },
      { name: 'savePath', type: 'text', required: false, description: '저장 경로' },
    ],
    outputs: [
      { name: 'path', type: 'text', required: true, description: '저장된 파일 경로' },
      { name: 'size', type: 'number', required: false, description: '파일 크기 (bytes)' },
      { name: 'sizeHuman', type: 'text', required: false, description: '파일 크기 (읽기 쉬운 형식)' },
    ],
  },
  configSchema: [
    { key: 'url', label: 'URL', type: 'text', required: true },
    { key: 'savePath', label: '저장 경로', type: 'text' },
    { key: 'overwrite', label: '덮어쓰기', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: httpDownloadExecutor,
}

// ============================================================
// http.upload - 파일 업로드
// ============================================================

const httpUploadExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const url = (inputs.url || config.url) as string
    const filePath = (inputs.filePath || config.filePath) as string
    const fieldName = (config.fieldName || 'file') as string

    if (!url || !filePath) {
      return { success: false, outputs: {}, error: 'URL과 파일 경로가 필요합니다' }
    }

    try {
      let headers: Record<string, string> | null = null
      try {
        headers = JSON.parse((config.headers as string) || '{}')
      } catch { /* ignore */ }

      const result = await invoke<{
        status: number
        body: string
      }>('tool_http_upload', {
        url,
        filePath,
        fieldName,
        headers,
        method: config.method || 'POST',
      })

      return {
        success: result.status >= 200 && result.status < 300,
        outputs: {
          status: result.status,
          body: result.body,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `업로드 실패: ${error}` }
    }
  },
}

export const httpUpload: UnifiedToolDefinition = {
  name: 'http.upload',
  version: '1.0.0',
  description: '파일을 HTTP 멀티파트로 업로드합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '업로드 URL' },
      filePath: { type: 'string', description: '업로드할 파일 경로' },
      fieldName: { type: 'string', description: '폼 필드 이름', default: 'file' },
      headers: { type: 'object' },
    },
    required: ['url', 'filePath'],
  },
  meta: {
    label: '파일 업로드',
    description: '파일을 업로드합니다',
    icon: 'FileUpload',
    color: '#8b5cf6',
    category: 'http',
    tags: ['http', 'upload', 'file', 'multipart', '업로드'],
  },
  ports: {
    inputs: [
      { name: 'url', type: 'text', required: true, description: '업로드 URL' },
      { name: 'filePath', type: 'text', required: true, description: '파일 경로' },
    ],
    outputs: [
      { name: 'status', type: 'number', required: true, description: '상태 코드' },
      { name: 'body', type: 'text', required: false, description: '응답 본문' },
    ],
  },
  configSchema: [
    { key: 'url', label: 'URL', type: 'text', required: true },
    { key: 'filePath', label: '파일 경로', type: 'file', required: true },
    { key: 'fieldName', label: '필드 이름', type: 'text', default: 'file' },
    { key: 'headers', label: '헤더', type: 'code', language: 'json', rows: 3 },
  ],
  runtime: 'tauri',
  executor: httpUploadExecutor,
}

// ============================================================
// Export All HTTP Tools
// ============================================================

export const HTTP_TOOLS: UnifiedToolDefinition[] = [
  httpGet,
  httpPost,
  httpPut,
  httpPatch,
  httpDelete,
  httpHead,
  httpDownload,
  httpUpload,
]
