/**
 * Multi-Turn Handler - 다중 턴 시나리오 처리
 *
 * 워크플로우 수정, 확장, 교체 등 다중 턴 대화에서
 * 이전 컨텍스트를 유지하며 워크플로우를 조작
 */

// UUID 생성 함수 (crypto API 사용)
function uuidv4(): string {
  return crypto.randomUUID()
}
import type {
  ConversationContext,
  ConversationTurn,
  WorkflowModification,
  WorkflowSnapshot,
  NodeSnapshot,
  EdgeSnapshot,
  MultiTurnScenario,
  MultiTurnPrompt,
} from '../types/RLTypes'

// ============================================================
// Types
// ============================================================

interface MultiTurnConfig {
  maxTurns: number              // 최대 턴 수
  contextWindow: number         // 컨텍스트 유지 턴 수
  enableRollback: boolean       // 롤백 기능 활성화
}

type ModificationAction = 'add_node' | 'remove_node' | 'modify_node' |
                          'add_edge' | 'remove_edge' | 'replace_workflow'

const DEFAULT_CONFIG: MultiTurnConfig = {
  maxTurns: 10,
  contextWindow: 5,
  enableRollback: true,
}

// ============================================================
// Multi-Turn Handler Class
// ============================================================

export class MultiTurnHandler {
  private config: MultiTurnConfig
  private sessions: Map<string, ConversationContext> = new Map()

  constructor(config: Partial<MultiTurnConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ============================================================
  // Session Management
  // ============================================================

  /**
   * 새 세션 시작
   */
  startSession(sessionId?: string): string {
    const id = sessionId || uuidv4()

    const context: ConversationContext = {
      sessionId: id,
      turns: [],
      currentWorkflow: null,
      modificationHistory: [],
    }

    this.sessions.set(id, context)
    return id
  }

  /**
   * 세션 조회
   */
  getSession(sessionId: string): ConversationContext | null {
    return this.sessions.get(sessionId) || null
  }

  /**
   * 세션 종료
   */
  endSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  // ============================================================
  // Turn Processing
  // ============================================================

  /**
   * 새 턴 추가
   */
  addTurn(sessionId: string, role: 'user' | 'assistant', content: string, workflowId?: string): ConversationTurn {
    const context = this.sessions.get(sessionId)
    if (!context) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const turn: ConversationTurn = {
      id: uuidv4(),
      role,
      content,
      timestamp: new Date(),
      workflowId,
    }

    context.turns.push(turn)

    // 컨텍스트 윈도우 유지
    if (context.turns.length > this.config.contextWindow * 2) {
      context.turns = context.turns.slice(-this.config.contextWindow * 2)
    }

    return turn
  }

  /**
   * 최근 컨텍스트 조회
   */
  getRecentContext(sessionId: string): ConversationTurn[] {
    const context = this.sessions.get(sessionId)
    if (!context) return []

    return context.turns.slice(-this.config.contextWindow * 2)
  }

  // ============================================================
  // Modification Intent Detection
  // ============================================================

  /**
   * 프롬프트에서 수정 의도 탐지
   */
  detectModificationIntent(prompt: string): {
    isModification: boolean
    action: ModificationAction | null
    targets: string[]
  } {
    const lower = prompt.toLowerCase()

    // 수정 관련 키워드
    const modifyPatterns = [
      { pattern: /바꿔|변경|수정|교체/, action: 'modify_node' as ModificationAction },
      { pattern: /추가|넣어|삽입/, action: 'add_node' as ModificationAction },
      { pattern: /삭제|제거|빼/, action: 'remove_node' as ModificationAction },
      { pattern: /연결|이어|붙여/, action: 'add_edge' as ModificationAction },
      { pattern: /끊어|분리|연결.*제거/, action: 'remove_edge' as ModificationAction },
      { pattern: /새로.*만들어|다시.*생성|처음부터/, action: 'replace_workflow' as ModificationAction },
    ]

    // 이전 워크플로우 참조 키워드
    const referencePatterns = [
      /아까/,
      /방금/,
      /이전/,
      /만든.*워크플로우/,
      /기존/,
      /거기/,
      /그것/,
    ]

    const hasReference = referencePatterns.some(p => p.test(lower))

    for (const { pattern, action } of modifyPatterns) {
      if (pattern.test(lower) && hasReference) {
        const targets = this.extractTargets(prompt)
        return { isModification: true, action, targets }
      }
    }

    return { isModification: false, action: null, targets: [] }
  }

  /**
   * 수정 대상 추출
   */
  private extractTargets(prompt: string): string[] {
    const targets: string[] = []

    // 노드 타입 추출
    const nodeTypePatterns = [
      /요약\s*노드/,
      /번역\s*노드/,
      /파싱\s*노드/,
      /분석\s*노드/,
      /변환\s*노드/,
      /출력\s*노드/,
      /입력\s*노드/,
      /LLM\s*노드/,
      /RAG\s*노드/,
    ]

    for (const pattern of nodeTypePatterns) {
      const match = prompt.match(pattern)
      if (match) {
        targets.push(match[0])
      }
    }

    // 특정 노드 ID 패턴 (예: node_1, node_2)
    const idMatches = prompt.match(/node[_-]?\d+/gi)
    if (idMatches) {
      targets.push(...idMatches)
    }

    return targets
  }

  // ============================================================
  // Workflow Modification
  // ============================================================

  /**
   * 현재 워크플로우 설정
   */
  setCurrentWorkflow(sessionId: string, workflow: WorkflowSnapshot): void {
    const context = this.sessions.get(sessionId)
    if (!context) return

    context.currentWorkflow = workflow
  }

  /**
   * 워크플로우 수정 기록
   */
  recordModification(
    sessionId: string,
    type: ModificationAction,
    description: string,
    before: WorkflowSnapshot,
    after: WorkflowSnapshot
  ): WorkflowModification {
    const context = this.sessions.get(sessionId)
    if (!context) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const modification: WorkflowModification = {
      type,
      description,
      before,
      after,
      timestamp: new Date(),
    }

    context.modificationHistory.push(modification)
    context.currentWorkflow = after

    return modification
  }

  /**
   * 롤백
   */
  rollback(sessionId: string, steps: number = 1): WorkflowSnapshot | null {
    if (!this.config.enableRollback) return null

    const context = this.sessions.get(sessionId)
    if (!context || context.modificationHistory.length < steps) return null

    // 롤백할 위치 찾기
    const targetIndex = context.modificationHistory.length - steps
    const targetModification = context.modificationHistory[targetIndex]

    // 이력 잘라내기
    context.modificationHistory = context.modificationHistory.slice(0, targetIndex)

    // 이전 워크플로우로 복원
    context.currentWorkflow = targetModification.before

    return targetModification.before
  }

  // ============================================================
  // Workflow Operations
  // ============================================================

  /**
   * 노드 추가
   */
  addNode(
    workflow: WorkflowSnapshot,
    node: NodeSnapshot,
    connectTo?: { nodeId: string; sourceHandle?: string; targetHandle?: string }
  ): WorkflowSnapshot {
    const newWorkflow: WorkflowSnapshot = {
      ...workflow,
      id: workflow.id,
      nodes: [...workflow.nodes, node],
      edges: [...workflow.edges],
      createdAt: workflow.createdAt,
    }

    if (connectTo) {
      const edge: EdgeSnapshot = {
        id: `edge_${connectTo.nodeId}_${node.id}`,
        source: connectTo.nodeId,
        target: node.id,
        sourceHandle: connectTo.sourceHandle,
        targetHandle: connectTo.targetHandle,
      }
      newWorkflow.edges.push(edge)
    }

    return newWorkflow
  }

  /**
   * 노드 제거
   */
  removeNode(workflow: WorkflowSnapshot, nodeId: string): WorkflowSnapshot {
    return {
      ...workflow,
      nodes: workflow.nodes.filter(n => n.id !== nodeId),
      edges: workflow.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
    }
  }

  /**
   * 노드 수정
   */
  modifyNode(
    workflow: WorkflowSnapshot,
    nodeId: string,
    updates: Partial<NodeSnapshot>
  ): WorkflowSnapshot {
    return {
      ...workflow,
      nodes: workflow.nodes.map(n =>
        n.id === nodeId ? { ...n, ...updates } : n
      ),
    }
  }

  /**
   * 노드 교체
   */
  replaceNode(
    workflow: WorkflowSnapshot,
    oldNodeId: string,
    newNode: NodeSnapshot
  ): WorkflowSnapshot {
    return {
      ...workflow,
      nodes: workflow.nodes.map(n =>
        n.id === oldNodeId ? { ...newNode, id: oldNodeId } : n
      ),
    }
  }

  /**
   * 엣지 추가
   */
  addEdge(
    workflow: WorkflowSnapshot,
    source: string,
    target: string,
    sourceHandle?: string,
    targetHandle?: string
  ): WorkflowSnapshot {
    const edge: EdgeSnapshot = {
      id: `edge_${source}_${target}`,
      source,
      target,
      sourceHandle,
      targetHandle,
    }

    return {
      ...workflow,
      edges: [...workflow.edges, edge],
    }
  }

  /**
   * 엣지 제거
   */
  removeEdge(workflow: WorkflowSnapshot, edgeId: string): WorkflowSnapshot {
    return {
      ...workflow,
      edges: workflow.edges.filter(e => e.id !== edgeId),
    }
  }

  // ============================================================
  // Context Building
  // ============================================================

  /**
   * LLM에 전달할 컨텍스트 빌드
   */
  buildContextForLLM(sessionId: string): string {
    const context = this.sessions.get(sessionId)
    if (!context) return ''

    const parts: string[] = []

    // 대화 이력
    if (context.turns.length > 0) {
      parts.push('## 대화 이력')
      for (const turn of context.turns.slice(-this.config.contextWindow * 2)) {
        const role = turn.role === 'user' ? '사용자' : '어시스턴트'
        parts.push(`${role}: ${turn.content}`)
      }
      parts.push('')
    }

    // 현재 워크플로우
    if (context.currentWorkflow) {
      parts.push('## 현재 워크플로우')
      parts.push(`노드 수: ${context.currentWorkflow.nodes.length}`)
      parts.push(`연결 수: ${context.currentWorkflow.edges.length}`)
      parts.push('노드 목록:')
      for (const node of context.currentWorkflow.nodes) {
        parts.push(`  - ${node.id}: ${node.type}`)
      }
      parts.push('')
    }

    // 수정 이력
    if (context.modificationHistory.length > 0) {
      parts.push('## 최근 수정 이력')
      for (const mod of context.modificationHistory.slice(-3)) {
        parts.push(`  - ${mod.type}: ${mod.description}`)
      }
      parts.push('')
    }

    return parts.join('\n')
  }

  // ============================================================
  // Scenario Management
  // ============================================================

  /**
   * 테스트 시나리오 실행
   */
  async executeScenario(
    scenario: MultiTurnScenario,
    executor: (prompt: string, context: ConversationContext) => Promise<WorkflowSnapshot | null>
  ): Promise<{
    success: boolean
    turns: Array<{
      turnNumber: number
      prompt: string
      workflow: WorkflowSnapshot | null
      success: boolean
    }>
  }> {
    const sessionId = this.startSession()
    const results: Array<{
      turnNumber: number
      prompt: string
      workflow: WorkflowSnapshot | null
      success: boolean
    }> = []

    try {
      for (const turn of scenario.turns) {
        const context = this.getSession(sessionId)!

        this.addTurn(sessionId, 'user', turn.prompt)

        const workflow = await executor(turn.prompt, context)

        if (workflow) {
          this.setCurrentWorkflow(sessionId, workflow)
          this.addTurn(sessionId, 'assistant', '워크플로우 생성/수정 완료', workflow.id)
        }

        const turnSuccess = workflow !== null &&
          (turn.expectedAction === 'create' ? workflow.nodes.length > 0 : true)

        results.push({
          turnNumber: turn.turnNumber,
          prompt: turn.prompt,
          workflow,
          success: turnSuccess,
        })

        if (!turnSuccess) break
      }

      const overallSuccess = results.every(r => r.success)

      return { success: overallSuccess, turns: results }
    } finally {
      this.endSession(sessionId)
    }
  }

  // ============================================================
  // Test Scenarios
  // ============================================================

  /**
   * 내장 테스트 시나리오
   */
  static getBuiltinScenarios(): MultiTurnScenario[] {
    return [
      {
        id: 'scenario_1',
        name: '워크플로우 생성 후 노드 교체',
        description: 'PDF 처리 워크플로우를 생성하고 요약 노드를 번역 노드로 교체',
        turns: [
          {
            turnNumber: 1,
            prompt: 'PDF 파일을 읽어서 텍스트를 추출하고 요약해줘',
            expectedAction: 'create',
            expectedChanges: ['doc.pdf-parse', 'llm.summarize'],
          },
          {
            turnNumber: 2,
            prompt: '아까 만든 워크플로우에서 요약 노드를 번역 노드로 바꿔줘',
            expectedAction: 'modify',
            expectedChanges: ['llm.translate'],
          },
        ],
        expectedOutcome: '번역 노드가 포함된 PDF 처리 워크플로우',
      },
      {
        id: 'scenario_2',
        name: '조건부 분기 추가',
        description: '기존 워크플로우에 조건부 분기 추가',
        turns: [
          {
            turnNumber: 1,
            prompt: '텍스트를 분석하는 워크플로우 만들어줘',
            expectedAction: 'create',
            expectedChanges: ['llm.chat'],
          },
          {
            turnNumber: 2,
            prompt: '긍정/부정 분석 결과에 따라 다른 응답을 생성하도록 조건 분기 추가해줘',
            expectedAction: 'extend',
            expectedChanges: ['control.if'],
          },
        ],
        expectedOutcome: '조건부 분기가 있는 감정 분석 워크플로우',
      },
      {
        id: 'scenario_3',
        name: '노드 삭제 및 재연결',
        description: '중간 노드를 삭제하고 연결 복구',
        turns: [
          {
            turnNumber: 1,
            prompt: 'CSV 파일을 읽고, 필터링하고, 변환해서 저장해줘',
            expectedAction: 'create',
            expectedChanges: ['file.read', 'csv.query', 'csv.transform', 'file.write'],
          },
          {
            turnNumber: 2,
            prompt: '필터링 단계는 필요 없으니 삭제해줘',
            expectedAction: 'modify',
            expectedChanges: [],
          },
        ],
        expectedOutcome: '필터링 없이 직접 변환하는 워크플로우',
      },
      {
        id: 'scenario_4',
        name: '출력 형식 변경',
        description: '출력 노드의 형식을 변경',
        turns: [
          {
            turnNumber: 1,
            prompt: '데이터를 분석해서 결과를 보여줘',
            expectedAction: 'create',
            expectedChanges: ['viz.text'],
          },
          {
            turnNumber: 2,
            prompt: '결과를 테이블 형태로 보여줘',
            expectedAction: 'modify',
            expectedChanges: ['viz.table'],
          },
          {
            turnNumber: 3,
            prompt: 'JSON 형식으로 내보낼 수 있게 해줘',
            expectedAction: 'extend',
            expectedChanges: ['export.json'],
          },
        ],
        expectedOutcome: '테이블 출력과 JSON 내보내기가 있는 워크플로우',
      },
      {
        id: 'scenario_5',
        name: '병렬 처리 추가',
        description: '순차 처리를 병렬 처리로 변경',
        turns: [
          {
            turnNumber: 1,
            prompt: '여러 파일을 하나씩 처리하는 워크플로우 만들어줘',
            expectedAction: 'create',
            expectedChanges: ['file.list', 'control.loop'],
          },
          {
            turnNumber: 2,
            prompt: '파일들을 병렬로 처리하도록 바꿔줘',
            expectedAction: 'modify',
            expectedChanges: ['control.parallel'],
          },
        ],
        expectedOutcome: '병렬 파일 처리 워크플로우',
      },
    ]
  }

  // ============================================================
  // Utility
  // ============================================================

  /**
   * 세션 통계
   */
  getSessionStats(sessionId: string): {
    turnCount: number
    modificationCount: number
    hasWorkflow: boolean
    lastActivity: Date | null
  } | null {
    const context = this.sessions.get(sessionId)
    if (!context) return null

    const lastTurn = context.turns[context.turns.length - 1]

    return {
      turnCount: context.turns.length,
      modificationCount: context.modificationHistory.length,
      hasWorkflow: context.currentWorkflow !== null,
      lastActivity: lastTurn?.timestamp || null,
    }
  }

  /**
   * 모든 세션 정리 (오래된 세션)
   */
  cleanupOldSessions(maxAgeMs: number = 3600000): number {
    const now = Date.now()
    let cleaned = 0

    for (const [id, context] of this.sessions) {
      const lastTurn = context.turns[context.turns.length - 1]
      if (lastTurn && now - lastTurn.timestamp.getTime() > maxAgeMs) {
        this.sessions.delete(id)
        cleaned++
      }
    }

    return cleaned
  }
}

// ============================================================
// Singleton Instance
// ============================================================

export const multiTurnHandler = new MultiTurnHandler()
