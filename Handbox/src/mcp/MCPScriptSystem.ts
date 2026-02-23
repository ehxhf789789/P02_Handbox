/**
 * MCP Script System
 *
 * 로컬에 저장된 스크립트 기반 MCP 도구 시스템.
 * LLM이 필요할 때 로컬 도구를 호출할 수 있는 환경 제공.
 *
 * 특징:
 * - 스크립트 파일(.js, .ts, .py, .sh)을 MCP 도구로 등록
 * - JSON Schema 기반 입력/출력 정의
 * - 도구 버전 관리
 * - 실행 로깅 및 성능 추적
 * - 사용자 정의 도구 추가 지원
 */

import { invoke } from '@tauri-apps/api/tauri'
import { readDir, readTextFile, writeTextFile, createDir, exists } from '@tauri-apps/api/fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import { MemoryAgent } from '../agents/MemoryAgent'

// ============================================================
// Types
// ============================================================

export interface MCPScript {
  /** 스크립트 ID */
  id: string
  /** 도구 이름 (MCP 프로토콜용) */
  name: string
  /** 설명 */
  description: string
  /** 상세 설명 (LLM용) */
  detailedDescription: string
  /** 버전 */
  version: string
  /** 카테고리 */
  category: MCPScriptCategory
  /** 스크립트 언어 */
  language: 'typescript' | 'javascript' | 'python' | 'shell' | 'rust'
  /** 스크립트 코드 */
  code: string
  /** 입력 스키마 */
  inputSchema: MCPInputSchema
  /** 출력 스키마 */
  outputSchema: MCPOutputSchema
  /** 메타데이터 */
  metadata: MCPScriptMetadata
  /** 활성화 여부 */
  enabled: boolean
  /** 생성일 */
  createdAt: number
  /** 수정일 */
  updatedAt: number
}

export type MCPScriptCategory =
  | 'file'       // 파일 시스템 작업
  | 'data'       // 데이터 처리
  | 'api'        // 외부 API 호출
  | 'llm'        // LLM 관련
  | 'memory'     // 기억 시스템
  | 'workflow'   // 워크플로우 관리
  | 'system'     // 시스템 작업
  | 'user'       // 사용자 정의
  | 'analysis'   // 분석
  | 'transform'  // 변환
  | 'validation' // 검증

export interface MCPInputSchema {
  type: 'object'
  properties: Record<string, MCPSchemaProperty>
  required?: string[]
}

export interface MCPOutputSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array'
  properties?: Record<string, MCPSchemaProperty>
  items?: MCPSchemaProperty
  description?: string
}

export interface MCPSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
  default?: any
  items?: MCPSchemaProperty
  properties?: Record<string, MCPSchemaProperty>
  required?: string[]
}

export interface MCPScriptMetadata {
  /** 작성자 */
  author: string
  /** 태그 */
  tags: string[]
  /** 의존성 */
  dependencies: string[]
  /** 예상 실행 시간 (ms) */
  estimatedDuration?: number
  /** 위험 수준 (1-5) */
  riskLevel: number
  /** 사용 횟수 */
  usageCount: number
  /** 평균 실행 시간 */
  avgExecutionTime: number
  /** 성공률 */
  successRate: number
  /** 예시 */
  examples: MCPScriptExample[]
}

export interface MCPScriptExample {
  name: string
  input: Record<string, any>
  expectedOutput: any
  description?: string
}

export interface MCPScriptExecutionResult {
  success: boolean
  output: any
  error?: string
  executionTime: number
  logs: string[]
}

// ============================================================
// MCP Script System Implementation
// ============================================================

class MCPScriptSystemImpl {
  private scripts: Map<string, MCPScript> = new Map()
  private scriptsDir: string = ''
  private initialized = false

  // ── 초기화 ──

  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      const dataDir = await appDataDir()
      this.scriptsDir = await join(dataDir, 'mcp_scripts')

      // 디렉토리 생성
      if (!(await exists(this.scriptsDir))) {
        await createDir(this.scriptsDir, { recursive: true })
      }

      // 기본 스크립트 로드
      await this.loadBuiltinScripts()

      // 사용자 스크립트 로드
      await this.loadUserScripts()

      this.initialized = true
      console.log(`[MCPScriptSystem] 초기화 완료: ${this.scripts.size}개 스크립트 로드`)
    } catch (error) {
      console.error('[MCPScriptSystem] 초기화 실패:', error)
      throw error
    }
  }

  // ── 내장 스크립트 로드 ──

  private async loadBuiltinScripts(): Promise<void> {
    const builtins = this.getBuiltinScripts()
    for (const script of builtins) {
      this.scripts.set(script.id, script)
    }
  }

  // ── 사용자 스크립트 로드 ──

  private async loadUserScripts(): Promise<void> {
    try {
      const indexPath = await join(this.scriptsDir, 'index.json')
      if (await exists(indexPath)) {
        const indexContent = await readTextFile(indexPath)
        const index = JSON.parse(indexContent) as { scripts: string[] }

        for (const scriptId of index.scripts) {
          try {
            const scriptPath = await join(this.scriptsDir, `${scriptId}.json`)
            const content = await readTextFile(scriptPath)
            const script = JSON.parse(content) as MCPScript
            this.scripts.set(script.id, script)
          } catch (e) {
            console.warn(`[MCPScriptSystem] 스크립트 로드 실패: ${scriptId}`, e)
          }
        }
      }
    } catch (error) {
      console.warn('[MCPScriptSystem] 사용자 스크립트 로드 중 오류:', error)
    }
  }

  // ── 스크립트 등록 ──

  async registerScript(script: Omit<MCPScript, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    await this.initialize()

    const id = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()

    const fullScript: MCPScript = {
      ...script,
      id,
      createdAt: now,
      updatedAt: now,
    }

    this.scripts.set(id, fullScript)

    // 파일로 저장
    await this.saveScript(fullScript)

    // 인덱스 업데이트
    await this.updateIndex()

    console.log(`[MCPScriptSystem] 스크립트 등록: ${fullScript.name} (${id})`)
    return id
  }

  // ── 스크립트 업데이트 ──

  async updateScript(id: string, updates: Partial<MCPScript>): Promise<void> {
    await this.initialize()

    const script = this.scripts.get(id)
    if (!script) throw new Error(`스크립트를 찾을 수 없음: ${id}`)

    const updatedScript = {
      ...script,
      ...updates,
      updatedAt: Date.now(),
    }

    this.scripts.set(id, updatedScript)
    await this.saveScript(updatedScript)
  }

  // ── 스크립트 삭제 ──

  async deleteScript(id: string): Promise<void> {
    await this.initialize()

    const script = this.scripts.get(id)
    if (!script) throw new Error(`스크립트를 찾을 수 없음: ${id}`)

    // 내장 스크립트는 삭제 불가
    if (script.metadata.author === 'system') {
      throw new Error('내장 스크립트는 삭제할 수 없습니다')
    }

    this.scripts.delete(id)
    await this.updateIndex()

    console.log(`[MCPScriptSystem] 스크립트 삭제: ${id}`)
  }

  // ── 스크립트 실행 ──

  async executeScript(
    idOrName: string,
    input: Record<string, any>
  ): Promise<MCPScriptExecutionResult> {
    await this.initialize()

    // ID 또는 이름으로 스크립트 찾기
    let script = this.scripts.get(idOrName)
    if (!script) {
      script = Array.from(this.scripts.values()).find(s => s.name === idOrName)
    }
    if (!script) {
      return {
        success: false,
        output: null,
        error: `스크립트를 찾을 수 없음: ${idOrName}`,
        executionTime: 0,
        logs: [],
      }
    }

    if (!script.enabled) {
      return {
        success: false,
        output: null,
        error: `스크립트가 비활성화됨: ${script.name}`,
        executionTime: 0,
        logs: [],
      }
    }

    const startTime = Date.now()
    const logs: string[] = []

    try {
      // 입력 검증
      this.validateInput(input, script.inputSchema)

      // 실행
      const output = await this.runScript(script, input, logs)

      const executionTime = Date.now() - startTime

      // 통계 업데이트
      await this.updateScriptStats(script.id, true, executionTime)

      // 활동 로깅
      await MemoryAgent.logActivity({
        timestamp: Date.now(),
        type: 'agent_invoke',
        action: `MCP Script: ${script.name}`,
        input,
        output,
        metadata: { scriptId: script.id, executionTime },
      })

      return {
        success: true,
        output,
        executionTime,
        logs,
      }
    } catch (error) {
      const executionTime = Date.now() - startTime

      // 통계 업데이트
      await this.updateScriptStats(script.id, false, executionTime)

      return {
        success: false,
        output: null,
        error: String(error),
        executionTime,
        logs,
      }
    }
  }

  // ── 스크립트 실행 (내부) ──

  private async runScript(
    script: MCPScript,
    input: Record<string, any>,
    logs: string[]
  ): Promise<any> {
    switch (script.language) {
      case 'typescript':
      case 'javascript':
        return this.runJavaScript(script.code, input, logs)

      case 'python':
        return this.runPython(script.code, input, logs)

      case 'shell':
        return this.runShell(script.code, input, logs)

      default:
        throw new Error(`지원되지 않는 스크립트 언어: ${script.language}`)
    }
  }

  private async runJavaScript(code: string, input: Record<string, any>, logs: string[]): Promise<any> {
    // 안전한 실행 환경 구성
    const sandbox = {
      input,
      console: {
        log: (...args: any[]) => logs.push(`[LOG] ${args.join(' ')}`),
        warn: (...args: any[]) => logs.push(`[WARN] ${args.join(' ')}`),
        error: (...args: any[]) => logs.push(`[ERROR] ${args.join(' ')}`),
      },
      // Tauri API 접근
      invoke,
      // 유틸리티
      JSON,
      Date,
      Math,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Promise,
      // Fetch (제한적)
      fetch: typeof fetch !== 'undefined' ? fetch : undefined,
    }

    // 코드 래핑
    const wrappedCode = `
      (async function(sandbox) {
        const { input, console, invoke, JSON, Date, Math, Array, Object, String, Number, Boolean, Promise, fetch } = sandbox;
        ${code}
      })(this)
    `

    try {
      const fn = new Function('return ' + wrappedCode)
      const result = await fn.call(sandbox)
      return result
    } catch (error) {
      logs.push(`[ERROR] JavaScript 실행 오류: ${error}`)
      throw error
    }
  }

  private async runPython(code: string, input: Record<string, any>, logs: string[]): Promise<any> {
    // Tauri 백엔드에서 Python 실행
    try {
      const result = await invoke<any>('execute_python_script', {
        code,
        inputJson: JSON.stringify(input),
      })
      return result
    } catch (error) {
      logs.push(`[ERROR] Python 실행 오류: ${error}`)
      throw error
    }
  }

  private async runShell(code: string, input: Record<string, any>, logs: string[]): Promise<any> {
    // Tauri 백엔드에서 Shell 실행
    try {
      const result = await invoke<any>('execute_shell_script', {
        code,
        inputJson: JSON.stringify(input),
      })
      return result
    } catch (error) {
      logs.push(`[ERROR] Shell 실행 오류: ${error}`)
      throw error
    }
  }

  // ── 입력 검증 ──

  private validateInput(input: Record<string, any>, schema: MCPInputSchema): void {
    for (const field of schema.required || []) {
      if (!(field in input)) {
        throw new Error(`필수 입력 누락: ${field}`)
      }
    }

    for (const [key, value] of Object.entries(input)) {
      const propSchema = schema.properties[key]
      if (!propSchema) continue

      const actualType = Array.isArray(value) ? 'array' : typeof value
      if (actualType !== propSchema.type) {
        throw new Error(`입력 타입 불일치: ${key} (예상: ${propSchema.type}, 실제: ${actualType})`)
      }
    }
  }

  // ── 통계 업데이트 ──

  private async updateScriptStats(id: string, success: boolean, executionTime: number): Promise<void> {
    const script = this.scripts.get(id)
    if (!script) return

    const { usageCount, avgExecutionTime, successRate } = script.metadata

    script.metadata.usageCount = usageCount + 1
    script.metadata.avgExecutionTime = (avgExecutionTime * usageCount + executionTime) / (usageCount + 1)
    script.metadata.successRate = (successRate * usageCount + (success ? 1 : 0)) / (usageCount + 1)

    this.scripts.set(id, script)
    // 비동기로 저장 (성능)
    this.saveScript(script).catch(e => console.warn('스크립트 저장 실패:', e))
  }

  // ── 파일 저장 ──

  private async saveScript(script: MCPScript): Promise<void> {
    if (script.metadata.author === 'system') return // 내장 스크립트는 저장하지 않음

    const path = await join(this.scriptsDir, `${script.id}.json`)
    await writeTextFile(path, JSON.stringify(script, null, 2))
  }

  private async updateIndex(): Promise<void> {
    const userScripts = Array.from(this.scripts.values())
      .filter(s => s.metadata.author !== 'system')
      .map(s => s.id)

    const indexPath = await join(this.scriptsDir, 'index.json')
    await writeTextFile(indexPath, JSON.stringify({ scripts: userScripts }, null, 2))
  }

  // ── 조회 ──

  getScript(idOrName: string): MCPScript | undefined {
    let script = this.scripts.get(idOrName)
    if (!script) {
      script = Array.from(this.scripts.values()).find(s => s.name === idOrName)
    }
    return script
  }

  getAllScripts(): MCPScript[] {
    return Array.from(this.scripts.values())
  }

  getScriptsByCategory(category: MCPScriptCategory): MCPScript[] {
    return Array.from(this.scripts.values()).filter(s => s.category === category && s.enabled)
  }

  searchScripts(query: string): MCPScript[] {
    const q = query.toLowerCase()
    return Array.from(this.scripts.values()).filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.metadata.tags.some(t => t.toLowerCase().includes(q))
    )
  }

  // ── LLM용 도구 스키마 ──

  getToolsForLLM(): any[] {
    return Array.from(this.scripts.values())
      .filter(s => s.enabled)
      .map(s => ({
        name: s.name,
        description: s.detailedDescription || s.description,
        input_schema: s.inputSchema,
      }))
  }

  // ── 내장 스크립트 정의 ──

  private getBuiltinScripts(): MCPScript[] {
    const now = Date.now()
    const baseMetadata = {
      author: 'system',
      riskLevel: 1,
      usageCount: 0,
      avgExecutionTime: 0,
      successRate: 1,
    }

    return [
      // ── 파일 시스템 ──
      {
        id: 'builtin_read_file',
        name: 'read_file',
        description: '파일 내용을 읽습니다',
        detailedDescription: '지정된 경로의 파일 내용을 텍스트로 읽어 반환합니다. 텍스트 파일에 적합합니다.',
        version: '1.0.0',
        category: 'file',
        language: 'javascript',
        code: `
          const { path, encoding = 'utf-8' } = input;
          const content = await invoke('read_text_file', { path, encoding });
          return { content, path, size: content.length };
        `,
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '파일 경로' },
            encoding: { type: 'string', description: '인코딩', default: 'utf-8' },
          },
          required: ['path'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: '파일 내용' },
            path: { type: 'string', description: '파일 경로' },
            size: { type: 'number', description: '내용 길이' },
          },
        },
        metadata: { ...baseMetadata, tags: ['file', 'read', 'text'], dependencies: [], examples: [] },
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'builtin_write_file',
        name: 'write_file',
        description: '파일에 내용을 씁니다',
        detailedDescription: '지정된 경로에 텍스트 내용을 파일로 저장합니다. 기존 파일은 덮어씁니다.',
        version: '1.0.0',
        category: 'file',
        language: 'javascript',
        code: `
          const { path, content } = input;
          await invoke('write_text_file', { path, content });
          return { success: true, path, size: content.length };
        `,
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '파일 경로' },
            content: { type: 'string', description: '저장할 내용' },
          },
          required: ['path', 'content'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            path: { type: 'string' },
            size: { type: 'number' },
          },
        },
        metadata: { ...baseMetadata, tags: ['file', 'write', 'text'], riskLevel: 3, dependencies: [], examples: [] },
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'builtin_list_directory',
        name: 'list_directory',
        description: '디렉토리 내용을 나열합니다',
        detailedDescription: '지정된 디렉토리의 파일과 하위 디렉토리 목록을 반환합니다.',
        version: '1.0.0',
        category: 'file',
        language: 'javascript',
        code: `
          const { path, recursive = false } = input;
          const entries = await invoke('list_directory', { path, recursive });
          return { entries, count: entries.length };
        `,
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '디렉토리 경로' },
            recursive: { type: 'boolean', description: '하위 디렉토리 포함', default: false },
          },
          required: ['path'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            entries: { type: 'array', items: { type: 'object' } },
            count: { type: 'number' },
          },
        },
        metadata: { ...baseMetadata, tags: ['file', 'directory', 'list'], dependencies: [], examples: [] },
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },

      // ── 기억 시스템 ──
      {
        id: 'builtin_memory_store',
        name: 'memory_store',
        description: '정보를 장기 기억에 저장합니다',
        detailedDescription: '중요한 정보를 로컬 데이터베이스에 저장하여 나중에 검색할 수 있게 합니다.',
        version: '1.0.0',
        category: 'memory',
        language: 'javascript',
        code: `
          const { key, value, category = 'general', importance = 0.5, tags = [] } = input;
          const { MemoryAgent } = await import('../agents/MemoryAgent');
          const id = await MemoryAgent.store({
            type: 'semantic',
            category,
            key,
            value,
            metadata: { source: 'mcp_script', context: '', tags, verified: false },
            importance,
            relatedMemories: [],
          });
          return { success: true, memoryId: id };
        `,
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: '기억 키' },
            value: { type: 'object', description: '저장할 값' },
            category: { type: 'string', description: '카테고리', default: 'general' },
            importance: { type: 'number', description: '중요도 (0-1)', default: 0.5 },
            tags: { type: 'array', items: { type: 'string' }, description: '태그' },
          },
          required: ['key', 'value'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            memoryId: { type: 'string' },
          },
        },
        metadata: { ...baseMetadata, tags: ['memory', 'store', 'learning'], dependencies: [], examples: [] },
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'builtin_memory_recall',
        name: 'memory_recall',
        description: '기억에서 정보를 검색합니다',
        detailedDescription: '저장된 기억에서 관련 정보를 검색하여 반환합니다.',
        version: '1.0.0',
        category: 'memory',
        language: 'javascript',
        code: `
          const { query, category, limit = 10 } = input;
          const { MemoryAgent } = await import('../agents/MemoryAgent');
          const memories = await MemoryAgent.search(query, limit);
          return { memories, count: memories.length };
        `,
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '검색어' },
            category: { type: 'string', description: '카테고리 필터' },
            limit: { type: 'number', description: '최대 결과 수', default: 10 },
          },
          required: ['query'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            memories: { type: 'array' },
            count: { type: 'number' },
          },
        },
        metadata: { ...baseMetadata, tags: ['memory', 'recall', 'search'], dependencies: [], examples: [] },
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },

      // ── LLM 호출 ──
      {
        id: 'builtin_llm_invoke',
        name: 'llm_invoke',
        description: 'LLM 모델을 호출합니다',
        detailedDescription: 'Claude, GPT 등의 LLM 모델에 프롬프트를 전송하고 응답을 받습니다.',
        version: '1.0.0',
        category: 'llm',
        language: 'javascript',
        code: `
          const { prompt, systemPrompt, model = 'claude-3.5-sonnet', temperature = 0.7, maxTokens = 4096 } = input;
          const response = await invoke('invoke_bedrock', {
            request: {
              model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
              prompt,
              system_prompt: systemPrompt || '당신은 유용한 AI 어시스턴트입니다.',
              max_tokens: maxTokens,
              temperature,
            },
          });
          return { response: response.response, tokensUsed: response.usage };
        `,
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: '사용자 프롬프트' },
            systemPrompt: { type: 'string', description: '시스템 프롬프트' },
            model: { type: 'string', description: '모델 ID', default: 'claude-3.5-sonnet' },
            temperature: { type: 'number', description: '온도 (0-1)', default: 0.7 },
            maxTokens: { type: 'number', description: '최대 토큰', default: 4096 },
          },
          required: ['prompt'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            response: { type: 'string' },
            tokensUsed: { type: 'object' },
          },
        },
        metadata: { ...baseMetadata, tags: ['llm', 'ai', 'generate'], dependencies: [], examples: [] },
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },

      // ── 데이터 처리 ──
      {
        id: 'builtin_json_parse',
        name: 'json_parse',
        description: 'JSON 문자열을 파싱합니다',
        detailedDescription: 'JSON 형식의 문자열을 JavaScript 객체로 변환합니다.',
        version: '1.0.0',
        category: 'data',
        language: 'javascript',
        code: `
          const { text } = input;
          const data = JSON.parse(text);
          return { data, type: typeof data, keys: typeof data === 'object' ? Object.keys(data) : [] };
        `,
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'JSON 문자열' },
          },
          required: ['text'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            data: { type: 'object' },
            type: { type: 'string' },
            keys: { type: 'array', items: { type: 'string' } },
          },
        },
        metadata: { ...baseMetadata, tags: ['json', 'parse', 'data'], dependencies: [], examples: [] },
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'builtin_text_split',
        name: 'text_split',
        description: '텍스트를 청크로 분할합니다',
        detailedDescription: '긴 텍스트를 지정된 크기의 청크로 분할합니다. RAG 파이프라인에서 유용합니다.',
        version: '1.0.0',
        category: 'data',
        language: 'javascript',
        code: `
          const { text, chunkSize = 1000, overlap = 100, separator = '\\n' } = input;
          const chunks = [];
          let start = 0;
          while (start < text.length) {
            const end = Math.min(start + chunkSize, text.length);
            chunks.push(text.slice(start, end));
            start = end - overlap;
          }
          return { chunks, count: chunks.length, avgSize: chunks.reduce((a, c) => a + c.length, 0) / chunks.length };
        `,
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '분할할 텍스트' },
            chunkSize: { type: 'number', description: '청크 크기', default: 1000 },
            overlap: { type: 'number', description: '오버랩 크기', default: 100 },
            separator: { type: 'string', description: '구분자', default: '\n' },
          },
          required: ['text'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            chunks: { type: 'array', items: { type: 'string' } },
            count: { type: 'number' },
            avgSize: { type: 'number' },
          },
        },
        metadata: { ...baseMetadata, tags: ['text', 'split', 'chunk', 'rag'], dependencies: [], examples: [] },
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },

      // ── 워크플로우 ──
      {
        id: 'builtin_workflow_list',
        name: 'workflow_list',
        description: '저장된 워크플로우 목록을 조회합니다',
        detailedDescription: 'Handbox에 저장된 모든 워크플로우의 목록을 반환합니다.',
        version: '1.0.0',
        category: 'workflow',
        language: 'javascript',
        code: `
          const workflows = await invoke('list_workflows');
          return { workflows, count: workflows.length };
        `,
        inputSchema: {
          type: 'object',
          properties: {},
        },
        outputSchema: {
          type: 'object',
          properties: {
            workflows: { type: 'array' },
            count: { type: 'number' },
          },
        },
        metadata: { ...baseMetadata, tags: ['workflow', 'list'], dependencies: [], examples: [] },
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },

      // ── 사용자 프로필 ──
      {
        id: 'builtin_user_profile_get',
        name: 'user_profile_get',
        description: '사용자 프로필을 조회합니다',
        detailedDescription: '현재 사용자의 선호도, 행동 패턴, 도메인 전문성 등을 반환합니다.',
        version: '1.0.0',
        category: 'user',
        language: 'javascript',
        code: `
          const { MemoryAgent } = await import('../agents/MemoryAgent');
          const profile = await MemoryAgent.getUserProfile();
          return { profile };
        `,
        inputSchema: {
          type: 'object',
          properties: {},
        },
        outputSchema: {
          type: 'object',
          properties: {
            profile: { type: 'object' },
          },
        },
        metadata: { ...baseMetadata, tags: ['user', 'profile', 'preferences'], dependencies: [], examples: [] },
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ]
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const MCPScriptSystem = new MCPScriptSystemImpl()
