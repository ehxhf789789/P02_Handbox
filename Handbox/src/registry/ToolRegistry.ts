/**
 * Tool Registry - 통합 도구 레지스트리
 *
 * NodeRegistry + LocalMCPRegistry를 대체하는 단일 진입점.
 * 모든 도구(노드)를 관리하고 MCP 호환 인터페이스를 제공합니다.
 *
 * 주요 기능:
 * - 도구 등록/조회
 * - 레거시 별칭 해결
 * - MCP 스키마 생성
 * - 도구 실행
 * - 카테고리 관리
 */

import {
  UnifiedToolDefinition,
  CategoryDefinition,
  ToolCategory,
  MCPToolSchema,
  MCPToolResult,
  ToolExecutionContext,
  ToolResult,
  ToolExecutor,
  PortDefinition,
  PortType,
  ToolMeta,
  ToolRequirements,
  ToolFlags,
  ConfigField,
  TOOL_CATEGORIES,
  toMCPSchema,
  normalizeToolResult,
} from './UnifiedToolDefinition'

// ============================================================
// Types
// ============================================================

type ToolChangeListener = (tools: UnifiedToolDefinition[]) => void

// ============================================================
// Tool Registry Implementation
// ============================================================

class ToolRegistryImpl {
  /** 도구 저장소 */
  private tools: Map<string, UnifiedToolDefinition> = new Map()

  /** 카테고리 저장소 */
  private categories: Map<ToolCategory, CategoryDefinition> = new Map()

  /** 레거시 별칭 (oldName → newName) */
  private aliases: Map<string, string> = new Map()

  /** 변경 리스너 */
  private listeners: Set<ToolChangeListener> = new Set()

  constructor() {
    // 기본 카테고리 등록
    for (const category of TOOL_CATEGORIES) {
      this.categories.set(category.id, category)
    }
  }

  // ============================================================
  // Registration
  // ============================================================

  /**
   * 도구 등록
   */
  register(tool: UnifiedToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  /**
   * 여러 도구 일괄 등록
   */
  registerAll(tools: UnifiedToolDefinition[]): void {
    for (const tool of tools) {
      this.tools.set(tool.name, tool)
    }
    this.notifyListeners()
  }

  /**
   * 도구 등록 해제
   */
  unregister(name: string): boolean {
    const result = this.tools.delete(name)
    if (result) {
      this.notifyListeners()
    }
    return result
  }

  /**
   * 레거시 별칭 등록
   * @param oldName 레거시 이름 (e.g., 'io.file-read')
   * @param newName 새 이름 (e.g., 'file.read')
   */
  registerAlias(oldName: string, newName: string): void {
    this.aliases.set(oldName, newName)
  }

  /**
   * 여러 별칭 일괄 등록
   */
  registerAliases(aliases: Record<string, string>): void {
    for (const [oldName, newName] of Object.entries(aliases)) {
      this.aliases.set(oldName, newName)
    }
  }

  /**
   * 카테고리 등록
   */
  registerCategory(category: CategoryDefinition): void {
    this.categories.set(category.id, category)
  }

  // ============================================================
  // Query
  // ============================================================

  /**
   * 도구 조회 (별칭 자동 해결)
   */
  get(name: string): UnifiedToolDefinition | undefined {
    // 1. 직접 조회
    const direct = this.tools.get(name)
    if (direct) return direct

    // 2. 별칭 해결
    const aliasedName = this.aliases.get(name)
    if (aliasedName) {
      return this.tools.get(aliasedName)
    }

    return undefined
  }

  /**
   * 도구 존재 확인
   */
  has(name: string): boolean {
    return this.tools.has(name) || this.aliases.has(name)
  }

  /**
   * 별칭 해결 (레거시 이름 → 새 이름)
   */
  resolveAlias(name: string): string | undefined {
    return this.aliases.get(name)
  }

  /**
   * 모든 도구 조회
   */
  getAll(): UnifiedToolDefinition[] {
    return Array.from(this.tools.values())
  }

  /**
   * 모든 도구 이름 조회
   */
  getAllNames(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * 카테고리별 도구 조회
   */
  getByCategory(category: ToolCategory): UnifiedToolDefinition[] {
    return this.getAll().filter(tool => tool.meta.category === category)
  }

  /**
   * 태그로 검색
   */
  searchByTag(tag: string): UnifiedToolDefinition[] {
    const lowerTag = tag.toLowerCase()
    return this.getAll().filter(tool =>
      tool.meta.tags.some(t => t.toLowerCase().includes(lowerTag))
    )
  }

  /**
   * 도구 검색 (이름, 라벨, 설명, 태그)
   */
  search(query: string): UnifiedToolDefinition[] {
    const q = query.toLowerCase()
    return this.getAll().filter(tool =>
      tool.name.toLowerCase().includes(q) ||
      tool.meta.label.toLowerCase().includes(q) ||
      tool.description.toLowerCase().includes(q) ||
      tool.meta.tags.some(tag => tag.toLowerCase().includes(q))
    )
  }

  /**
   * 카테고리 조회
   */
  getCategories(): CategoryDefinition[] {
    return Array.from(this.categories.values())
      .sort((a, b) => a.order - b.order)
  }

  /**
   * 카테고리 정보 조회
   */
  getCategory(id: ToolCategory): CategoryDefinition | undefined {
    return this.categories.get(id)
  }

  /**
   * 등록된 도구 수
   */
  get size(): number {
    return this.tools.size
  }

  // ============================================================
  // MCP Compatibility
  // ============================================================

  /**
   * MCP 도구 스키마 목록 생성
   */
  toMCPTools(): MCPToolSchema[] {
    return this.getAll().map(toMCPSchema)
  }

  /**
   * MCP 도구 호출
   */
  async executeMCPTool(
    name: string,
    args: Record<string, unknown>,
    context?: Partial<ToolExecutionContext>
  ): Promise<MCPToolResult> {
    const tool = this.get(name)

    if (!tool) {
      return {
        success: false,
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        error: `Tool not found: ${name}`,
      }
    }

    try {
      const fullContext: ToolExecutionContext = {
        executionId: context?.executionId || `mcp_${Date.now()}`,
        sessionId: context?.sessionId || 'mcp',
        variables: context?.variables || new Map(),
        xaiEnabled: context?.xaiEnabled ?? false,
        ...context,
      }

      const rawResult = await tool.executor.execute(args, {}, fullContext)
      const result = normalizeToolResult(rawResult)

      return {
        success: result.success,
        content: [{ type: 'json', data: result.outputs }],
        error: result.error,
        metadata: result.metadata,
      }
    } catch (error) {
      return {
        success: false,
        content: [{ type: 'text', text: `Execution error: ${error}` }],
        error: String(error),
      }
    }
  }

  /**
   * 워크플로우 노드로 실행
   */
  async executeNode(
    name: string,
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const tool = this.get(name)

    if (!tool) {
      return {
        success: false,
        outputs: {},
        error: `Tool not found: ${name}`,
      }
    }

    const rawResult = await tool.executor.execute(inputs, config, context)
    return normalizeToolResult(rawResult)
  }

  // ============================================================
  // NodeRegistry API 호환
  // ============================================================

  /**
   * NodeRegistry.get() 호환
   * @deprecated ToolRegistry.get() 사용 권장
   */
  getNodeDefinition(type: string): UnifiedToolDefinition | undefined {
    return this.get(type)
  }

  /**
   * NodeRegistry.getAll() 호환
   * @deprecated ToolRegistry.getAll() 사용 권장
   */
  getAllNodeDefinitions(): UnifiedToolDefinition[] {
    return this.getAll()
  }

  // ============================================================
  // LLM Prompt Generation
  // ============================================================

  /**
   * LLM 시스템 프롬프트용 도구 카탈로그 생성
   */
  generateToolCatalog(): string {
    const categories = this.getCategories()
    let catalog = `# 사용 가능한 도구 (${this.size}개)\n\n`

    for (const category of categories) {
      const tools = this.getByCategory(category.id)
      if (tools.length === 0) continue

      catalog += `## ${category.label} (${tools.length}개)\n`
      catalog += `${category.description || ''}\n\n`

      for (const tool of tools) {
        catalog += `### \`${tool.name}\`\n`
        catalog += `${tool.description}\n`

        // 입력 포트
        if (tool.ports.inputs.length > 0) {
          catalog += `- **입력**: ${tool.ports.inputs.map(p => `${p.name}(${p.type}${p.required ? '*' : ''})`).join(', ')}\n`
        }

        // 출력 포트
        if (tool.ports.outputs.length > 0) {
          catalog += `- **출력**: ${tool.ports.outputs.map(p => `${p.name}(${p.type})`).join(', ')}\n`
        }

        catalog += '\n'
      }
    }

    return catalog
  }

  /**
   * LLM용 간단한 도구 요약 생성
   */
  generateToolSummary(): string {
    const categories = this.getCategories()
    let summary = ''

    for (const category of categories) {
      const tools = this.getByCategory(category.id)
      if (tools.length === 0) continue

      summary += `**${category.label}**: ${tools.map(t => `\`${t.name}\``).join(', ')}\n`
    }

    return summary
  }

  // ============================================================
  // Listeners
  // ============================================================

  /**
   * 변경 리스너 등록
   */
  addChangeListener(listener: ToolChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 변경 리스너 등록 (별칭)
   * @alias addChangeListener
   */
  onChange(listener: ToolChangeListener): () => void {
    return this.addChangeListener(listener)
  }

  /**
   * 리스너에 변경 알림
   */
  private notifyListeners(): void {
    const tools = this.getAll()
    for (const listener of this.listeners) {
      listener(tools)
    }
  }

  // ============================================================
  // Debug
  // ============================================================

  /**
   * 디버그 정보 출력
   */
  debug(): void {
    console.group('[ToolRegistry] Debug Info')
    console.log(`Total tools: ${this.size}`)
    console.log(`Total aliases: ${this.aliases.size}`)
    console.log(`Categories:`)
    for (const category of this.getCategories()) {
      const count = this.getByCategory(category.id).length
      console.log(`  - ${category.id}: ${count} tools`)
    }
    console.groupEnd()
  }

  /**
   * 레지스트리 초기화 (테스트용)
   */
  clear(): void {
    this.tools.clear()
    this.aliases.clear()
    this.notifyListeners()
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const ToolRegistry = new ToolRegistryImpl()

// ============================================================
// Re-exports
// ============================================================

export type {
  UnifiedToolDefinition,
  CategoryDefinition,
  ToolCategory,
  MCPToolSchema,
  MCPToolResult,
  ToolExecutionContext,
  ToolResult,
  ToolExecutor,
  PortDefinition,
  PortType,
  ToolMeta,
  ToolRequirements,
  ToolFlags,
  ConfigField,
}

export {
  TOOL_CATEGORIES,
  TYPE_COMPATIBILITY,
  isTypeCompatible,
  toMCPSchema,
  getCategoryFromName,
  getCategoryColor,
} from './UnifiedToolDefinition'
