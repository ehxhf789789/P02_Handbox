/**
 * HTTP Request Executor — 범용 REST API 호출
 *
 * fetch()로 외부 REST API를 호출.
 * GET/POST/PUT/DELETE 지원.
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

const executor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    _context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const url = config.url || ''
    const method = (config.method || 'GET').toUpperCase()
    const headers: Record<string, string> = {}

    if (!url) {
      return { error: 'URL이 지정되지 않았습니다', status: 'URL 미지정' }
    }

    // 헤더 설정
    if (config.headers) {
      try {
        const parsed = typeof config.headers === 'string' ? JSON.parse(config.headers) : config.headers
        Object.assign(headers, parsed)
      } catch {
        // 파싱 실패 시 무시
      }
    }

    if (config.content_type) {
      headers['Content-Type'] = config.content_type
    }

    if (config.auth_token) {
      headers['Authorization'] = `Bearer ${config.auth_token}`
    }

    // 바디 구성
    let body: string | undefined
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const inputText = input.text || input._predecessors?.[0]?.text || ''
      body = config.body || inputText || undefined

      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json'
      }
    }

    const startTime = Date.now()

    const response = await fetch(url, {
      method,
      headers,
      body,
    })

    const duration = Date.now() - startTime
    const responseText = await response.text()

    // JSON 파싱 시도
    let responseJson: any = null
    try {
      responseJson = JSON.parse(responseText)
    } catch {
      // JSON 아님
    }

    return {
      ...(responseJson && typeof responseJson === 'object' ? responseJson : {}),
      text: responseText,
      response_status: response.status,
      response_headers: Object.fromEntries(response.headers.entries()),
      duration_ms: duration,
      url,
      method,
      status: response.ok
        ? `API 호출 성공 (${response.status}, ${duration}ms)`
        : `API 호출 실패 (${response.status})`,
    }
  },
}

export const HttpRequestDefinition: NodeDefinition = {
  type: 'api.http-request',
  category: 'api',
  meta: {
    label: 'HTTP 요청',
    description: '외부 REST API에 HTTP 요청을 보냅니다',
    icon: 'Api',
    color: '#0ea5e9',
    tags: ['HTTP', 'API', 'REST', 'fetch', 'request', 'GET', 'POST'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: false, description: 'POST 요청 바디로 전달할 데이터' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: 'API 응답 텍스트' },
      { name: 'json', type: 'json', required: false, description: '파싱된 JSON 응답' },
    ],
  },
  configSchema: [
    { key: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://api.example.com/endpoint' },
    { key: 'method', label: 'HTTP 메서드', type: 'select', default: 'GET', options: [
      { label: 'GET', value: 'GET' },
      { label: 'POST', value: 'POST' },
      { label: 'PUT', value: 'PUT' },
      { label: 'DELETE', value: 'DELETE' },
      { label: 'PATCH', value: 'PATCH' },
    ]},
    { key: 'headers', label: '헤더 (JSON)', type: 'code', language: 'json', rows: 3, placeholder: '{"Authorization": "Bearer ..."}' },
    { key: 'body', label: '요청 바디', type: 'code', rows: 5, description: 'POST/PUT 요청 바디. 비워두면 이전 노드 출력 사용' },
    { key: 'auth_token', label: 'Bearer 토큰', type: 'text', placeholder: 'API 키 또는 토큰' },
    { key: 'content_type', label: 'Content-Type', type: 'text', default: 'application/json' },
  ],
  runtime: 'api',
  executor,
}
