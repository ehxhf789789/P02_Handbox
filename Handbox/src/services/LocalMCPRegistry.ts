/**
 * Local MCP Registry
 *
 * 서버 기반이 아닌 로컬 내장 MCP (Model Context Protocol) 시스템.
 * Claude Code 스타일의 도구 시스템을 로컬에서 구현합니다.
 *
 * Features:
 * - 내장 도구 (Built-in Tools): 파일 시스템, 계산, 변환 등
 * - 커스텀 도구 등록: 사용자 정의 도구 추가
 * - 도구 실행 엔진: JSON Schema 기반 입력 검증
 * - 실행 추적: XAI 시스템과 통합
 *
 * MCP Protocol: https://modelcontextprotocol.io/
 */

import { invoke } from '@tauri-apps/api/tauri'
import { xaiService } from './XAIService'

// ============================================================
// Types
// ============================================================

/** MCP 도구 정의 */
export interface MCPTool {
  name: string
  description: string
  category: 'builtin' | 'custom' | 'external'
  /** JSON Schema for input validation */
  inputSchema: {
    type: 'object'
    properties: Record<string, SchemaProperty>
    required?: string[]
  }
  /** 도구 실행 핸들러 */
  handler: (args: Record<string, any>) => Promise<MCPToolResult>
  /** XAI 추적 활성화 */
  xaiEnabled?: boolean
  /** 도구 아이콘 (Material Icon 이름) */
  icon?: string
  /** 도구 태그 */
  tags?: string[]
}

interface SchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
  default?: any
  items?: SchemaProperty
}

/** MCP 도구 실행 결과 */
export interface MCPToolResult {
  success: boolean
  content: MCPContent[]
  error?: string
  /** 실행 메타데이터 */
  metadata?: {
    executionTime: number
    tokensUsed?: number
    xaiTrace?: string
  }
}

/** MCP 콘텐츠 */
export interface MCPContent {
  type: 'text' | 'json' | 'image' | 'file' | 'chart'
  text?: string
  data?: any
  mimeType?: string
}

/** 도구 실행 컨텍스트 */
export interface ToolExecutionContext {
  sessionId: string
  workflowId?: string
  userId?: string
  xaiEnabled: boolean
  variables?: Record<string, any>
}

/** 도구 실행 로그 */
export interface ToolExecutionLog {
  id: string
  toolName: string
  timestamp: number
  input: Record<string, any>
  output: MCPToolResult
  executionTime: number
  context: ToolExecutionContext
}

// ============================================================
// Local MCP Registry
// ============================================================

class LocalMCPRegistryImpl {
  private tools: Map<string, MCPTool> = new Map()
  private executionLogs: ToolExecutionLog[] = []
  private maxLogSize = 1000

  constructor() {
    this.registerBuiltinTools()
  }

  // ============================================================
  // Tool Registration
  // ============================================================

  /**
   * 도구 등록
   */
  registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool)
    console.log(`[LocalMCP] Tool registered: ${tool.name}`)
  }

  /**
   * 도구 등록 해제
   */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name)
  }

  /**
   * 등록된 도구 목록 조회
   */
  listTools(category?: 'builtin' | 'custom' | 'external'): MCPTool[] {
    const allTools = Array.from(this.tools.values())
    if (category) {
      return allTools.filter(t => t.category === category)
    }
    return allTools
  }

  /**
   * 도구 조회
   */
  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name)
  }

  // ============================================================
  // Tool Execution
  // ============================================================

  /**
   * 도구 실행
   */
  async executeTool(
    toolName: string,
    args: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<MCPToolResult> {
    const tool = this.tools.get(toolName)
    if (!tool) {
      return {
        success: false,
        content: [{ type: 'text', text: `Tool not found: ${toolName}` }],
        error: `Tool not found: ${toolName}`,
      }
    }

    const startTime = Date.now()

    // 입력 검증
    const validationError = this.validateInput(args, tool.inputSchema)
    if (validationError) {
      return {
        success: false,
        content: [{ type: 'text', text: validationError }],
        error: validationError,
      }
    }

    // XAI 추적 시작
    let xaiTraceId: string | undefined
    if (context.xaiEnabled && tool.xaiEnabled !== false) {
      xaiTraceId = `tool_${toolName}_${Date.now()}`
      xaiService.startTrace(
        xaiTraceId,
        'local-mcp',
        JSON.stringify(args),
        `Tool: ${tool.name} - ${tool.description}`
      )
    }

    try {
      // 도구 실행
      const result = await tool.handler(args)
      const executionTime = Date.now() - startTime

      // XAI 추적 완료
      if (xaiTraceId) {
        xaiService.completeTrace(
          xaiTraceId,
          JSON.stringify(result.content),
          { prompt: 0, completion: 0, total: 0 }
        )
      }

      // 메타데이터 추가
      result.metadata = {
        ...result.metadata,
        executionTime,
        xaiTrace: xaiTraceId,
      }

      // 로그 기록
      this.addExecutionLog({
        id: `log_${Date.now()}`,
        toolName,
        timestamp: startTime,
        input: args,
        output: result,
        executionTime,
        context,
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        content: [{ type: 'text', text: `Execution error: ${errorMessage}` }],
        error: errorMessage,
        metadata: {
          executionTime: Date.now() - startTime,
        },
      }
    }
  }

  /**
   * 입력 검증
   */
  private validateInput(
    args: Record<string, any>,
    schema: MCPTool['inputSchema']
  ): string | null {
    // 필수 필드 검증
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in args)) {
          return `Missing required field: ${field}`
        }
      }
    }

    // 타입 검증
    for (const [key, value] of Object.entries(args)) {
      const propSchema = schema.properties[key]
      if (!propSchema) continue

      const actualType = Array.isArray(value) ? 'array' : typeof value
      if (propSchema.type !== actualType) {
        return `Invalid type for ${key}: expected ${propSchema.type}, got ${actualType}`
      }

      // enum 검증
      if (propSchema.enum && !propSchema.enum.includes(value)) {
        return `Invalid value for ${key}: must be one of ${propSchema.enum.join(', ')}`
      }
    }

    return null
  }

  // ============================================================
  // Execution Logs
  // ============================================================

  /**
   * 실행 로그 추가
   */
  private addExecutionLog(log: ToolExecutionLog): void {
    this.executionLogs.push(log)
    if (this.executionLogs.length > this.maxLogSize) {
      this.executionLogs.shift()
    }
  }

  /**
   * 실행 로그 조회
   */
  getExecutionLogs(filter?: {
    toolName?: string
    startTime?: number
    endTime?: number
    limit?: number
  }): ToolExecutionLog[] {
    let logs = this.executionLogs

    if (filter?.toolName) {
      logs = logs.filter(l => l.toolName === filter.toolName)
    }
    if (filter?.startTime) {
      logs = logs.filter(l => l.timestamp >= filter.startTime!)
    }
    if (filter?.endTime) {
      logs = logs.filter(l => l.timestamp <= filter.endTime!)
    }
    if (filter?.limit) {
      logs = logs.slice(-filter.limit)
    }

    return logs
  }

  // ============================================================
  // Built-in Tools Registration
  // ============================================================

  private registerBuiltinTools(): void {
    // 1. 텍스트 처리 도구
    this.registerTool({
      name: 'text_transform',
      description: '텍스트 변환 (대소문자, 인코딩, 포맷 등)',
      category: 'builtin',
      icon: 'TextFields',
      tags: ['text', 'transform'],
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '변환할 텍스트' },
          operation: {
            type: 'string',
            enum: ['uppercase', 'lowercase', 'titlecase', 'reverse', 'trim', 'base64_encode', 'base64_decode', 'url_encode', 'url_decode'],
            description: '변환 작업',
          },
        },
        required: ['text', 'operation'],
      },
      handler: async (args) => {
        const { text, operation } = args
        let result: string

        switch (operation) {
          case 'uppercase':
            result = text.toUpperCase()
            break
          case 'lowercase':
            result = text.toLowerCase()
            break
          case 'titlecase':
            result = text.replace(/\w\S*/g, (txt: string) =>
              txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
            )
            break
          case 'reverse':
            result = text.split('').reverse().join('')
            break
          case 'trim':
            result = text.trim()
            break
          case 'base64_encode':
            result = btoa(unescape(encodeURIComponent(text)))
            break
          case 'base64_decode':
            result = decodeURIComponent(escape(atob(text)))
            break
          case 'url_encode':
            result = encodeURIComponent(text)
            break
          case 'url_decode':
            result = decodeURIComponent(text)
            break
          default:
            return { success: false, content: [{ type: 'text', text: `Unknown operation: ${operation}` }], error: `Unknown operation: ${operation}` }
        }

        return {
          success: true,
          content: [{ type: 'text', text: result }],
        }
      },
    })

    // 2. JSON 처리 도구
    this.registerTool({
      name: 'json_process',
      description: 'JSON 파싱, 포맷팅, 쿼리, 변환',
      category: 'builtin',
      icon: 'Code',
      tags: ['json', 'data'],
      inputSchema: {
        type: 'object',
        properties: {
          json: { type: 'string', description: 'JSON 문자열 또는 객체' },
          operation: {
            type: 'string',
            enum: ['parse', 'stringify', 'prettify', 'minify', 'query', 'validate'],
            description: 'JSON 작업',
          },
          query: { type: 'string', description: 'JSONPath 쿼리 (query 작업 시)' },
        },
        required: ['json', 'operation'],
      },
      handler: async (args) => {
        const { json, operation, query } = args

        try {
          let data: any
          if (typeof json === 'string') {
            data = JSON.parse(json)
          } else {
            data = json
          }

          let result: any
          switch (operation) {
            case 'parse':
              result = data
              break
            case 'stringify':
              result = JSON.stringify(data)
              break
            case 'prettify':
              result = JSON.stringify(data, null, 2)
              break
            case 'minify':
              result = JSON.stringify(data)
              break
            case 'query':
              result = this.jsonPathQuery(data, query || '$')
              break
            case 'validate':
              result = { valid: true, type: typeof data, isArray: Array.isArray(data) }
              break
            default:
              return { success: false, content: [{ type: 'text', text: `Unknown operation: ${operation}` }], error: `Unknown operation: ${operation}` }
          }

          return {
            success: true,
            content: [{ type: 'json', data: result }],
          }
        } catch (error) {
          return {
            success: false,
            content: [{ type: 'text', text: `JSON error: ${error}` }],
            error: String(error),
          }
        }
      },
    })

    // 3. 수학 계산 도구
    this.registerTool({
      name: 'math_calculate',
      description: '수학 계산 및 통계',
      category: 'builtin',
      icon: 'Calculate',
      tags: ['math', 'calculate'],
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['evaluate', 'statistics', 'percentage', 'convert'],
            description: '계산 유형',
          },
          expression: { type: 'string', description: '수식 (evaluate 시)' },
          numbers: { type: 'array', description: '숫자 배열 (statistics 시)', items: { type: 'number' } },
          value: { type: 'number', description: '값 (percentage, convert 시)' },
          from: { type: 'string', description: '변환 시작 단위' },
          to: { type: 'string', description: '변환 대상 단위' },
        },
        required: ['operation'],
      },
      handler: async (args) => {
        const { operation, expression, numbers, value, from, to } = args

        switch (operation) {
          case 'evaluate': {
            // 안전한 수식 평가 (기본 연산만 허용)
            const safeExpression = expression.replace(/[^0-9+\-*/().%\s]/g, '')
            try {
              const result = Function(`"use strict"; return (${safeExpression})`)()
              return { success: true, content: [{ type: 'json', data: { expression, result } }] }
            } catch {
              return { success: false, content: [{ type: 'text', text: 'Invalid expression' }], error: 'Invalid expression' }
            }
          }
          case 'statistics': {
            if (!Array.isArray(numbers) || numbers.length === 0) {
              return { success: false, content: [{ type: 'text', text: 'Numbers array required' }], error: 'Numbers array required' }
            }
            const sum = numbers.reduce((a, b) => a + b, 0)
            const mean = sum / numbers.length
            const sorted = [...numbers].sort((a, b) => a - b)
            const median = sorted[Math.floor(sorted.length / 2)]
            const variance = numbers.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0) / numbers.length
            const stdDev = Math.sqrt(variance)

            return {
              success: true,
              content: [{
                type: 'json',
                data: {
                  count: numbers.length,
                  sum,
                  mean,
                  median,
                  min: Math.min(...numbers),
                  max: Math.max(...numbers),
                  variance,
                  stdDev,
                },
              }],
            }
          }
          case 'percentage': {
            if (value === undefined) {
              return { success: false, content: [{ type: 'text', text: 'Value required' }], error: 'Value required' }
            }
            return {
              success: true,
              content: [{
                type: 'json',
                data: {
                  percentage: value * 100,
                  decimal: value,
                  fraction: `${Math.round(value * 100)}/100`,
                },
              }],
            }
          }
          case 'convert': {
            const conversions: Record<string, Record<string, number>> = {
              length: { m: 1, km: 0.001, cm: 100, mm: 1000, inch: 39.3701, ft: 3.28084 },
              weight: { kg: 1, g: 1000, mg: 1000000, lb: 2.20462, oz: 35.274 },
              temperature: { c: 1, f: 1, k: 1 }, // 특별 처리 필요
            }

            // 간단한 길이/무게 변환
            for (const [, units] of Object.entries(conversions)) {
              if (from && to && units[from] !== undefined && units[to] !== undefined) {
                const result = (value || 0) * (units[to] / units[from])
                return { success: true, content: [{ type: 'json', data: { from, to, value, result } }] }
              }
            }

            return { success: false, content: [{ type: 'text', text: 'Unsupported conversion' }], error: 'Unsupported conversion' }
          }
          default:
            return { success: false, content: [{ type: 'text', text: `Unknown operation: ${operation}` }], error: `Unknown operation: ${operation}` }
        }
      },
    })

    // 4. 날짜/시간 도구
    this.registerTool({
      name: 'datetime',
      description: '날짜/시간 처리 및 변환',
      category: 'builtin',
      icon: 'Schedule',
      tags: ['date', 'time'],
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['now', 'parse', 'format', 'diff', 'add'],
            description: '작업 유형',
          },
          date: { type: 'string', description: '날짜 문자열' },
          format: { type: 'string', description: '출력 형식' },
          timezone: { type: 'string', description: '타임존' },
          amount: { type: 'number', description: '추가할 양 (add 시)' },
          unit: { type: 'string', enum: ['years', 'months', 'days', 'hours', 'minutes', 'seconds'], description: '단위' },
        },
        required: ['operation'],
      },
      handler: async (args) => {
        const { operation, date, format, amount, unit } = args

        switch (operation) {
          case 'now': {
            const now = new Date()
            return {
              success: true,
              content: [{
                type: 'json',
                data: {
                  iso: now.toISOString(),
                  locale: now.toLocaleString('ko-KR'),
                  timestamp: now.getTime(),
                  year: now.getFullYear(),
                  month: now.getMonth() + 1,
                  day: now.getDate(),
                  hour: now.getHours(),
                  minute: now.getMinutes(),
                  second: now.getSeconds(),
                  dayOfWeek: ['일', '월', '화', '수', '목', '금', '토'][now.getDay()],
                },
              }],
            }
          }
          case 'parse': {
            const parsed = new Date(date)
            if (isNaN(parsed.getTime())) {
              return { success: false, content: [{ type: 'text', text: 'Invalid date' }], error: 'Invalid date' }
            }
            return {
              success: true,
              content: [{
                type: 'json',
                data: {
                  iso: parsed.toISOString(),
                  timestamp: parsed.getTime(),
                  formatted: parsed.toLocaleString('ko-KR'),
                },
              }],
            }
          }
          case 'format': {
            const d = date ? new Date(date) : new Date()
            const fmt = format || 'YYYY-MM-DD HH:mm:ss'
            const formatted = fmt
              .replace('YYYY', String(d.getFullYear()))
              .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
              .replace('DD', String(d.getDate()).padStart(2, '0'))
              .replace('HH', String(d.getHours()).padStart(2, '0'))
              .replace('mm', String(d.getMinutes()).padStart(2, '0'))
              .replace('ss', String(d.getSeconds()).padStart(2, '0'))

            return { success: true, content: [{ type: 'text', text: formatted }] }
          }
          case 'add': {
            const base = date ? new Date(date) : new Date()
            const ms = {
              years: 365 * 24 * 60 * 60 * 1000,
              months: 30 * 24 * 60 * 60 * 1000,
              days: 24 * 60 * 60 * 1000,
              hours: 60 * 60 * 1000,
              minutes: 60 * 1000,
              seconds: 1000,
            }
            const added = new Date(base.getTime() + (amount || 0) * (ms[unit as keyof typeof ms] || 0))
            return {
              success: true,
              content: [{ type: 'json', data: { original: base.toISOString(), result: added.toISOString() } }],
            }
          }
          default:
            return { success: false, content: [{ type: 'text', text: `Unknown operation: ${operation}` }], error: `Unknown operation: ${operation}` }
        }
      },
    })

    // 5. 차트 생성 도구
    this.registerTool({
      name: 'chart_generate',
      description: '데이터 시각화 차트 생성',
      category: 'builtin',
      icon: 'BarChart',
      tags: ['chart', 'visualization'],
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['bar', 'line', 'pie', 'scatter', 'area'],
            description: '차트 유형',
          },
          data: {
            type: 'object',
            description: '차트 데이터 { labels: string[], datasets: { label: string, data: number[] }[] }',
          },
          options: {
            type: 'object',
            description: '차트 옵션',
          },
          title: { type: 'string', description: '차트 제목' },
        },
        required: ['type', 'data'],
      },
      handler: async (args) => {
        const { type, data, options, title } = args

        // Chart.js 호환 형식으로 데이터 반환
        const chartConfig = {
          type,
          data: {
            labels: data.labels || [],
            datasets: (data.datasets || []).map((ds: any, idx: number) => ({
              label: ds.label || `Dataset ${idx + 1}`,
              data: ds.data || [],
              backgroundColor: ds.backgroundColor || this.generateColors(ds.data?.length || 1),
              borderColor: ds.borderColor,
              fill: type === 'area',
            })),
          },
          options: {
            ...options,
            plugins: {
              title: title ? { display: true, text: title } : undefined,
            },
          },
        }

        return {
          success: true,
          content: [{ type: 'chart', data: chartConfig }],
        }
      },
    })

    // 6. 파일 시스템 도구 (Tauri 백엔드 연동)
    this.registerTool({
      name: 'file_read',
      description: '파일 읽기',
      category: 'builtin',
      icon: 'Description',
      tags: ['file', 'read'],
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '파일 경로' },
          encoding: { type: 'string', enum: ['utf8', 'base64'], description: '인코딩' },
        },
        required: ['path'],
      },
      handler: async (args) => {
        try {
          const content = await invoke<string>('read_file', {
            path: args.path,
            encoding: args.encoding || 'utf8',
          })
          return {
            success: true,
            content: [{ type: 'text', text: content }],
          }
        } catch (error) {
          return {
            success: false,
            content: [{ type: 'text', text: `File read error: ${error}` }],
            error: String(error),
          }
        }
      },
    })

    // 7. HTTP 요청 도구
    this.registerTool({
      name: 'http_request',
      description: 'HTTP API 요청',
      category: 'builtin',
      icon: 'Http',
      tags: ['http', 'api'],
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], description: 'HTTP 메서드' },
          headers: { type: 'object', description: '헤더' },
          body: { type: 'object', description: '요청 본문' },
        },
        required: ['url'],
      },
      handler: async (args) => {
        try {
          const response = await fetch(args.url, {
            method: args.method || 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...args.headers,
            },
            body: args.body ? JSON.stringify(args.body) : undefined,
          })

          const contentType = response.headers.get('content-type')
          let data: any
          if (contentType?.includes('application/json')) {
            data = await response.json()
          } else {
            data = await response.text()
          }

          return {
            success: response.ok,
            content: [{
              type: 'json',
              data: {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: data,
              },
            }],
          }
        } catch (error) {
          return {
            success: false,
            content: [{ type: 'text', text: `HTTP error: ${error}` }],
            error: String(error),
          }
        }
      },
    })

    // 8. 정규식 도구
    this.registerTool({
      name: 'regex',
      description: '정규식 매칭 및 치환',
      category: 'builtin',
      icon: 'FindReplace',
      tags: ['regex', 'text'],
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '대상 텍스트' },
          pattern: { type: 'string', description: '정규식 패턴' },
          flags: { type: 'string', description: '플래그 (g, i, m 등)' },
          operation: { type: 'string', enum: ['match', 'test', 'replace', 'split'], description: '작업' },
          replacement: { type: 'string', description: '치환 문자열 (replace 시)' },
        },
        required: ['text', 'pattern', 'operation'],
      },
      handler: async (args) => {
        const { text, pattern, flags, operation, replacement } = args
        try {
          const regex = new RegExp(pattern, flags || 'g')

          let result: any
          switch (operation) {
            case 'match':
              result = text.match(regex)
              break
            case 'test':
              result = regex.test(text)
              break
            case 'replace':
              result = text.replace(regex, replacement || '')
              break
            case 'split':
              result = text.split(regex)
              break
          }

          return {
            success: true,
            content: [{ type: 'json', data: { operation, pattern, result } }],
          }
        } catch (error) {
          return {
            success: false,
            content: [{ type: 'text', text: `Regex error: ${error}` }],
            error: String(error),
          }
        }
      },
    })

    // 9. UUID 및 해시 도구
    this.registerTool({
      name: 'crypto_utils',
      description: 'UUID 생성, 해시 계산',
      category: 'builtin',
      icon: 'VpnKey',
      tags: ['crypto', 'hash', 'uuid'],
      inputSchema: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['uuid', 'hash', 'random'], description: '작업' },
          text: { type: 'string', description: '해시할 텍스트' },
          algorithm: { type: 'string', enum: ['SHA-256', 'SHA-384', 'SHA-512'], description: '해시 알고리즘' },
          length: { type: 'number', description: '랜덤 문자열 길이' },
        },
        required: ['operation'],
      },
      handler: async (args) => {
        const { operation, text, algorithm, length } = args

        switch (operation) {
          case 'uuid': {
            const uuid = crypto.randomUUID()
            return { success: true, content: [{ type: 'text', text: uuid }] }
          }
          case 'hash': {
            if (!text) {
              return { success: false, content: [{ type: 'text', text: 'Text required for hashing' }], error: 'Text required' }
            }
            const encoder = new TextEncoder()
            const data = encoder.encode(text)
            const hashBuffer = await crypto.subtle.digest(algorithm || 'SHA-256', data)
            const hashArray = Array.from(new Uint8Array(hashBuffer))
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
            return { success: true, content: [{ type: 'text', text: hashHex }] }
          }
          case 'random': {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
            const len = length || 16
            let result = ''
            const array = new Uint8Array(len)
            crypto.getRandomValues(array)
            for (let i = 0; i < len; i++) {
              result += chars[array[i] % chars.length]
            }
            return { success: true, content: [{ type: 'text', text: result }] }
          }
          default:
            return { success: false, content: [{ type: 'text', text: `Unknown operation: ${operation}` }], error: `Unknown operation: ${operation}` }
        }
      },
    })

    // 10. 데이터 변환 도구
    this.registerTool({
      name: 'data_transform',
      description: 'CSV, XML, YAML 등 데이터 형식 변환',
      category: 'builtin',
      icon: 'Transform',
      tags: ['data', 'convert', 'csv', 'xml'],
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'string', description: '변환할 데이터' },
          from: { type: 'string', enum: ['json', 'csv', 'xml', 'yaml', 'table'], description: '원본 형식' },
          to: { type: 'string', enum: ['json', 'csv', 'xml', 'yaml', 'table', 'markdown'], description: '대상 형식' },
          options: { type: 'object', description: '변환 옵션' },
        },
        required: ['data', 'from', 'to'],
      },
      handler: async (args) => {
        const { data, from, to } = args

        try {
          // 먼저 JSON으로 파싱
          let jsonData: any
          switch (from) {
            case 'json':
              jsonData = typeof data === 'string' ? JSON.parse(data) : data
              break
            case 'csv':
              jsonData = this.parseCSV(data)
              break
            default:
              return { success: false, content: [{ type: 'text', text: `Unsupported input format: ${from}` }], error: `Unsupported input format: ${from}` }
          }

          // 대상 형식으로 변환
          let result: string
          switch (to) {
            case 'json':
              result = JSON.stringify(jsonData, null, 2)
              break
            case 'csv':
              result = this.toCSV(jsonData)
              break
            case 'markdown':
              result = this.toMarkdownTable(jsonData)
              break
            default:
              return { success: false, content: [{ type: 'text', text: `Unsupported output format: ${to}` }], error: `Unsupported output format: ${to}` }
          }

          return { success: true, content: [{ type: 'text', text: result }] }
        } catch (error) {
          return { success: false, content: [{ type: 'text', text: `Transform error: ${error}` }], error: String(error) }
        }
      },
    })

    console.log(`[LocalMCP] ${this.tools.size} builtin tools registered`)
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  private jsonPathQuery(obj: any, path: string): any {
    // 간단한 JSONPath 구현
    const parts = path.replace(/^\$\.?/, '').split('.')
    let current = obj

    for (const part of parts) {
      if (!part) continue
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/)
      if (arrayMatch) {
        current = current?.[arrayMatch[1]]?.[parseInt(arrayMatch[2])]
      } else {
        current = current?.[part]
      }
    }

    return current
  }

  private generateColors(count: number): string[] {
    const colors = [
      '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
      '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
    ]
    return Array.from({ length: count }, (_, i) => colors[i % colors.length])
  }

  private parseCSV(csv: string): any[] {
    const lines = csv.trim().split('\n')
    if (lines.length === 0) return []

    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))
    const rows: any[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''))
      const row: any = {}
      headers.forEach((header, idx) => {
        row[header] = values[idx]
      })
      rows.push(row)
    }

    return rows
  }

  private toCSV(data: any[]): string {
    if (!Array.isArray(data) || data.length === 0) return ''

    const headers = Object.keys(data[0])
    const lines = [headers.join(',')]

    for (const row of data) {
      const values = headers.map(h => {
        const v = row[h]
        return typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v ?? '')
      })
      lines.push(values.join(','))
    }

    return lines.join('\n')
  }

  private toMarkdownTable(data: any[]): string {
    if (!Array.isArray(data) || data.length === 0) return ''

    const headers = Object.keys(data[0])
    const headerRow = `| ${headers.join(' | ')} |`
    const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`
    const dataRows = data.map(row =>
      `| ${headers.map(h => String(row[h] ?? '')).join(' | ')} |`
    )

    return [headerRow, separatorRow, ...dataRows].join('\n')
  }
}

// 싱글톤 인스턴스
export const LocalMCPRegistry = new LocalMCPRegistryImpl()
