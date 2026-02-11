/**
 * Node Registry — 노드 정의의 중앙 등록소
 *
 * 모든 노드는 여기에 등록되며, NodePalette, WorkflowEditor,
 * PropertyPanel, ExecutionEngine이 이 레지스트리를 참조한다.
 *
 * 노드를 추가하려면:
 *   NodeRegistry.register(definition) 한 번 호출하면 끝.
 */

import type { NodeDefinition, NodeCategory, NodeExecutor } from './NodeDefinition'
import { DEFAULT_CATEGORIES } from './NodeDefinition'

class NodeRegistryImpl {
  private definitions: Map<string, NodeDefinition> = new Map()
  private categories: Map<string, NodeCategory> = new Map()
  private listeners: Set<() => void> = new Set()

  constructor() {
    // 기본 카테고리 등록
    for (const cat of DEFAULT_CATEGORIES) {
      this.categories.set(cat.id, cat)
    }
  }

  // ============================================================
  // 노드 등록
  // ============================================================

  /** 노드 정의 등록 */
  register(definition: NodeDefinition): void {
    if (this.definitions.has(definition.type)) {
      console.warn(`[NodeRegistry] 노드 타입 '${definition.type}' 이미 등록됨. 덮어쓰기.`)
    }
    this.definitions.set(definition.type, definition)
    this.notifyListeners()
  }

  /** 여러 노드 일괄 등록 */
  registerAll(definitions: NodeDefinition[]): void {
    for (const def of definitions) {
      this.definitions.set(def.type, def)
    }
    this.notifyListeners()
  }

  /** 노드 등록 해제 (플러그인 비활성화 시) */
  unregister(type: string): void {
    this.definitions.delete(type)
    this.notifyListeners()
  }

  /** 플러그인의 모든 노드 등록 해제 */
  unregisterPlugin(pluginId: string): void {
    for (const [type, def] of this.definitions) {
      if (def.pluginId === pluginId) {
        this.definitions.delete(type)
      }
    }
    this.notifyListeners()
  }

  // ============================================================
  // 카테고리 관리
  // ============================================================

  /** 커스텀 카테고리 등록 (플러그인 등) */
  registerCategory(category: NodeCategory): void {
    this.categories.set(category.id, category)
    this.notifyListeners()
  }

  /** 카테고리 목록 (정렬됨) */
  getCategories(): NodeCategory[] {
    return Array.from(this.categories.values())
      .sort((a, b) => a.order - b.order)
  }

  // ============================================================
  // 조회
  // ============================================================

  /** 타입으로 노드 정의 조회 */
  get(type: string): NodeDefinition | undefined {
    return this.definitions.get(type)
  }

  /** 타입으로 executor 조회 */
  getExecutor(type: string): NodeExecutor | undefined {
    return this.definitions.get(type)?.executor
  }

  /** 모든 노드 정의 */
  getAll(): NodeDefinition[] {
    return Array.from(this.definitions.values())
  }

  /** 카테고리별 노드 정의 */
  getByCategory(category: string): NodeDefinition[] {
    return this.getAll().filter(d => d.category === category)
  }

  /** 카테고리별 그룹핑 */
  getGroupedByCategory(): Map<string, NodeDefinition[]> {
    const grouped = new Map<string, NodeDefinition[]>()
    for (const def of this.definitions.values()) {
      const existing = grouped.get(def.category) || []
      existing.push(def)
      grouped.set(def.category, existing)
    }
    return grouped
  }

  /** 등록된 노드 타입 목록 */
  getRegisteredTypes(): string[] {
    return Array.from(this.definitions.keys())
  }

  /** 등록된 노드 수 */
  get size(): number {
    return this.definitions.size
  }

  /** 특정 타입이 등록되어 있는지 확인 */
  has(type: string): boolean {
    return this.definitions.has(type)
  }

  // ============================================================
  // 검색
  // ============================================================

  /** 키워드로 노드 검색 (label, description, tags 대상) */
  search(query: string): NodeDefinition[] {
    if (!query.trim()) return this.getAll()
    const q = query.toLowerCase()
    return this.getAll().filter(def =>
      def.meta.label.toLowerCase().includes(q) ||
      def.meta.description.toLowerCase().includes(q) ||
      def.meta.tags.some(tag => tag.toLowerCase().includes(q)) ||
      def.type.toLowerCase().includes(q) ||
      def.category.toLowerCase().includes(q)
    )
  }

  // ============================================================
  // 변경 감지 (React 컴포넌트 리렌더링 트리거)
  // ============================================================

  /** 변경 리스너 등록 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

/** 전역 NodeRegistry 싱글턴 */
export const NodeRegistry = new NodeRegistryImpl()
