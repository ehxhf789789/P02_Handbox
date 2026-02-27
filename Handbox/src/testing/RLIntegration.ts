/**
 * RL Integration - 강화학습 시스템과 실제 워크플로우 시스템 통합
 *
 * 현실성 보장:
 * - 실제 LLM 호출 (Claude, GPT, Ollama 등)
 * - 실제 워크플로우 실행 (ExecutionEngine)
 * - 실제 MCP 도구 실행
 * - 실제 파일 I/O 및 API 호출
 *
 * Mock이나 시뮬레이션이 아닌, 실제 사용자 환경과 동일하게 동작
 */

import type { Node, Edge } from 'reactflow'
// UUID 생성 함수 (crypto API 사용)
function uuidv4(): string {
  return crypto.randomUUID()
}
import { RLSimulationSystem, rlSimulationSystem } from './RLSimulationSystem'
import type { WorkflowSnapshot, ExecutionSnapshot, NodeSnapshot, EdgeSnapshot } from '../types/RLTypes'

// ============================================================
// 실제 시스템 임포트 (동적 로드로 순환 참조 방지)
// ============================================================

let IntegratedWorkflowAgent: any = null
let ExecutionEngine: any = null
let ProviderRegistry: any = null
let NodeRegistry: any = null
let useAppStore: any = null

async function loadRealSystems(): Promise<void> {
  if (IntegratedWorkflowAgent) return

  try {
    const agentModule = await import('../services/IntegratedWorkflowAgent')
    IntegratedWorkflowAgent = agentModule.IntegratedWorkflowAgent

    const engineModule = await import('../engine/ExecutionEngine')
    ExecutionEngine = engineModule

    const providerModule = await import('../registry/ProviderRegistry')
    ProviderRegistry = providerModule.ProviderRegistry

    const nodeModule = await import('../registry/NodeRegistry')
    NodeRegistry = nodeModule.NodeRegistry

    const storeModule = await import('../stores/appStore')
    useAppStore = storeModule.useAppStore

    console.log('[RLIntegration] 실제 시스템 로드 완료')
  } catch (error) {
    console.error('[RLIntegration] 시스템 로드 실패:', error)
    throw new Error('실제 워크플로우 시스템 로드 실패')
  }
}

// ============================================================
// 실제 워크플로우 에이전트 어댑터
// ============================================================

/**
 * IntegratedWorkflowAgent를 RLSimulationSystem용 인터페이스로 래핑
 *
 * 이 어댑터는 실제 LLM 호출을 수행합니다:
 * - Claude 3.5/4 via AWS Bedrock
 * - GPT-4 via OpenAI
 * - Local LLM via Ollama
 */
class RealWorkflowAgentAdapter {
  private agent: any = null
  private sessionId: string = ''

  async initialize(): Promise<void> {
    await loadRealSystems()

    // IntegratedWorkflowAgent 인스턴스 생성
    this.sessionId = uuidv4()
    this.agent = IntegratedWorkflowAgent

    console.log('[RLIntegration] 실제 워크플로우 에이전트 초기화 완료')
  }

  /**
   * 워크플로우 생성 (실제 LLM 호출)
   *
   * @param prompt - 사용자 프롬프트
   * @param strategy - 학습 전략 (CoT, Few-shot 등)
   * @returns 생성된 워크플로우와 점수
   */
  async generateWorkflow(prompt: string, strategy: string): Promise<{
    workflow: WorkflowSnapshot | null
    xaiScore: number
    intentScore: number
  }> {
    if (!this.agent) {
      await this.initialize()
    }

    try {
      // 세션 시작 (없으면)
      const session = await this.agent.startSession()

      // 전략에 따른 프롬프트 강화
      const enhancedPrompt = this.enhancePromptWithStrategy(prompt, strategy)

      // 실제 LLM 호출로 워크플로우 생성
      const result = await this.agent.processUserMessage(session.sessionId, enhancedPrompt)

      if (!result.workflow) {
        return { workflow: null, xaiScore: 0, intentScore: 0 }
      }

      // WorkflowDesign → WorkflowSnapshot 변환
      const workflow = this.convertToSnapshot(result.workflow, result.workflowId)

      // XAI 점수 계산 (실제 XAI 서비스 활용)
      const xaiScore = await this.calculateXAIScore(result, prompt)

      // 의도 정렬 점수 계산
      const intentScore = this.calculateIntentScore(result, prompt)

      return { workflow, xaiScore, intentScore }
    } catch (error) {
      console.error('[RLIntegration] 워크플로우 생성 실패:', error)
      return { workflow: null, xaiScore: 0, intentScore: 0 }
    }
  }

  private enhancePromptWithStrategy(prompt: string, strategy: string): string {
    switch (strategy) {
      case 'chain_of_thought':
        return `${prompt}\n\n(단계별로 논리적으로 분석하여 워크플로우를 설계해주세요. 각 단계의 이유를 설명해주세요.)`

      case 'few_shot':
        return `${prompt}\n\n(유사한 작업의 성공 사례를 참고하여 워크플로우를 설계해주세요.)`

      case 'chain_reasoning':
        return `${prompt}\n\n(이전 대화 컨텍스트를 고려하여 워크플로우를 수정/확장해주세요.)`

      case 'template_match':
        return `${prompt}\n\n(기존 템플릿 중 가장 적합한 것을 선택하고 필요시 수정해주세요.)`

      case 'hybrid':
        return `${prompt}\n\n(CoT 추론과 템플릿 매칭을 결합하여 최적의 워크플로우를 설계해주세요.)`

      default:
        return prompt
    }
  }

  private convertToSnapshot(design: any, workflowId: string): WorkflowSnapshot {
    const nodes: NodeSnapshot[] = (design.nodes || []).map((n: any) => ({
      id: n.id || uuidv4(),
      type: n.type,
      config: n.toolConfig || n.config || {},
    }))

    const edges: EdgeSnapshot[] = (design.edges || design.connections || []).map((e: any) => ({
      id: e.id || `edge_${e.source || e.from}_${e.target || e.to}`,
      source: e.source || e.from,
      target: e.target || e.to,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    }))

    return {
      id: workflowId || uuidv4(),
      nodes,
      edges,
      createdAt: new Date(),
    }
  }

  private async calculateXAIScore(result: any, prompt: string): Promise<number> {
    // 실제 XAI 서비스 활용
    try {
      // XAI 세션에서 점수 추출 (있으면)
      if (result.xaiSession) {
        const confidence = result.xaiSession.overallConfidence || 0.5
        const explanationQuality = result.explanation ? 0.3 : 0
        return Math.min(1, confidence + explanationQuality)
      }

      // 기본 휴리스틱
      let score = 0.5

      // 설명이 있으면 가산점
      if (result.explanation && result.explanation.length > 50) {
        score += 0.2
      }

      // 노드 수가 적절하면 가산점
      const nodeCount = result.workflow?.nodes?.length || 0
      if (nodeCount >= 2 && nodeCount <= 10) {
        score += 0.1
      }

      // 연결이 있으면 가산점
      const edgeCount = result.workflow?.edges?.length || result.workflow?.connections?.length || 0
      if (edgeCount >= 1) {
        score += 0.1
      }

      return Math.min(1, score)
    } catch {
      return 0.5
    }
  }

  private calculateIntentScore(result: any, prompt: string): number {
    try {
      // 기본 휴리스틱 기반 의도 정렬 점수
      let score = 0.5

      // 워크플로우가 생성되었으면 기본 점수
      if (result.workflow && result.workflow.nodes?.length > 0) {
        score += 0.2
      }

      // 프롬프트 키워드가 워크플로우에 반영되었는지 확인
      const promptKeywords = this.extractKeywords(prompt)
      const workflowKeywords = this.extractWorkflowKeywords(result.workflow)

      const matchedKeywords = promptKeywords.filter(k =>
        workflowKeywords.some(wk => wk.includes(k) || k.includes(wk))
      )

      const matchRate = promptKeywords.length > 0
        ? matchedKeywords.length / promptKeywords.length
        : 0

      score += matchRate * 0.3

      return Math.min(1, score)
    } catch {
      return 0.5
    }
  }

  private extractKeywords(text: string): string[] {
    const stopWords = ['을', '를', '이', '가', '에', '의', '로', '와', '과', '해줘', '해주세요', '만들어']
    return text.toLowerCase()
      .replace(/[^\w가-힣\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !stopWords.some(s => w.includes(s)))
  }

  private extractWorkflowKeywords(workflow: any): string[] {
    if (!workflow?.nodes) return []

    const keywords: string[] = []
    for (const node of workflow.nodes) {
      keywords.push(node.type)
      if (node.toolConfig) {
        keywords.push(...Object.values(node.toolConfig).filter(v => typeof v === 'string') as string[])
      }
    }
    return keywords.map(k => k.toLowerCase())
  }
}

// ============================================================
// 실제 실행 엔진 어댑터
// ============================================================

/**
 * ExecutionEngine을 RLSimulationSystem용 인터페이스로 래핑
 *
 * 이 어댑터는 실제 워크플로우 실행을 수행합니다:
 * - 실제 LLM 호출
 * - 실제 파일 I/O
 * - 실제 API 호출
 * - 실제 MCP 도구 실행
 */
class RealExecutionEngineAdapter {
  async initialize(): Promise<void> {
    await loadRealSystems()
    console.log('[RLIntegration] 실제 실행 엔진 초기화 완료')
  }

  /**
   * 워크플로우 실행 (실제 실행)
   *
   * @param workflow - 실행할 워크플로우
   * @returns 실행 결과
   */
  async execute(workflow: WorkflowSnapshot): Promise<ExecutionSnapshot> {
    if (!ExecutionEngine) {
      await this.initialize()
    }

    try {
      // WorkflowSnapshot → ReactFlow Node/Edge 변환
      const { nodes, edges } = this.convertToReactFlow(workflow)

      // 실행 컨텍스트 생성
      const context: any = {
        executionId: uuidv4(),
        workflowId: workflow.id,
        variables: {},
        executionHistory: [],
        startTime: Date.now(),
      }

      // 노드 상태 콜백
      const statusCallback = (nodeId: string, status: any) => {
        // 실행 상태 기록
        context.executionHistory.push({
          nodeId,
          status: status.status,
          timestamp: Date.now(),
        })
      }

      // 실제 실행
      const outputs: Record<string, any> = {}
      const errors: string[] = []
      const startTime = Date.now()

      try {
        // 토폴로지 정렬
        const sortedNodes = ExecutionEngine.topologicalSort(nodes, edges)

        // 순차 실행
        for (const node of sortedNodes) {
          try {
            const result = await this.executeNode(node, edges, outputs, context)
            outputs[node.id] = result
          } catch (nodeError) {
            errors.push(`${node.id}: ${nodeError instanceof Error ? nodeError.message : String(nodeError)}`)
          }
        }

        const duration = Date.now() - startTime

        return {
          status: errors.length === 0 ? 'completed' : 'failed',
          outputs,
          errors,
          duration,
        }
      } catch (error) {
        return {
          status: 'failed',
          outputs,
          errors: [error instanceof Error ? error.message : String(error)],
          duration: Date.now() - startTime,
        }
      }
    } catch (error) {
      return {
        status: 'failed',
        outputs: {},
        errors: [error instanceof Error ? error.message : String(error)],
        duration: 0,
      }
    }
  }

  private convertToReactFlow(workflow: WorkflowSnapshot): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = workflow.nodes.map((n, i) => ({
      id: n.id,
      type: n.type,
      position: { x: i * 200, y: 100 },
      data: {
        type: n.type,
        config: n.config,
        toolConfig: n.config,
      },
    }))

    const edges: Edge[] = workflow.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    }))

    return { nodes, edges }
  }

  private async executeNode(
    node: Node,
    edges: Edge[],
    outputs: Record<string, any>,
    context: any
  ): Promise<any> {
    // 노드 정의 조회
    const nodeDef = NodeRegistry?.get(node.type)
    if (!nodeDef?.executor) {
      throw new Error(`노드 정의 없음: ${node.type}`)
    }

    // 입력 수집
    const inputs: Record<string, any> = {}
    for (const edge of edges) {
      if (edge.target === node.id) {
        const sourceOutput = outputs[edge.source]
        if (sourceOutput !== undefined) {
          inputs[edge.targetHandle || 'input'] = sourceOutput
        }
      }
    }

    // 실행
    const config = node.data?.config || node.data?.toolConfig || {}
    const result = await nodeDef.executor.execute(inputs, config, context)

    return result
  }
}

// ============================================================
// 현실성 검증 체크리스트
// ============================================================

export interface RealismCheck {
  category: string
  item: string
  status: 'pass' | 'fail' | 'warning'
  details: string
}

export async function verifySimulationRealism(): Promise<RealismCheck[]> {
  const checks: RealismCheck[] = []

  // 1. LLM 연결 확인
  try {
    await loadRealSystems()
    const providers = ProviderRegistry?.getAllProviders() || []

    checks.push({
      category: 'LLM',
      item: 'Provider 등록',
      status: providers.length > 0 ? 'pass' : 'fail',
      details: `${providers.length}개 provider 등록됨`,
    })

    // 활성 provider 확인
    const activeProvider = providers.find((p: any) => p.isConfigured?.() ?? false)
    checks.push({
      category: 'LLM',
      item: 'Provider 설정',
      status: activeProvider ? 'pass' : 'warning',
      details: activeProvider ? `${activeProvider.name} 활성` : 'API 키 미설정 (시뮬레이션 시 실패 가능)',
    })
  } catch (error) {
    checks.push({
      category: 'LLM',
      item: 'Provider 확인',
      status: 'fail',
      details: `로드 실패: ${error}`,
    })
  }

  // 2. 노드 레지스트리 확인
  try {
    const nodeCount = NodeRegistry?.size || 0
    checks.push({
      category: 'Workflow',
      item: '노드 레지스트리',
      status: nodeCount > 50 ? 'pass' : 'warning',
      details: `${nodeCount}개 노드 등록됨`,
    })
  } catch (error) {
    checks.push({
      category: 'Workflow',
      item: '노드 레지스트리',
      status: 'fail',
      details: `로드 실패: ${error}`,
    })
  }

  // 3. 실행 엔진 확인
  try {
    await loadRealSystems()
    checks.push({
      category: 'Execution',
      item: '실행 엔진',
      status: ExecutionEngine ? 'pass' : 'fail',
      details: ExecutionEngine ? '로드됨' : '로드 실패',
    })
  } catch (error) {
    checks.push({
      category: 'Execution',
      item: '실행 엔진',
      status: 'fail',
      details: `로드 실패: ${error}`,
    })
  }

  // 4. 워크플로우 에이전트 확인
  try {
    await loadRealSystems()
    checks.push({
      category: 'Agent',
      item: '워크플로우 에이전트',
      status: IntegratedWorkflowAgent ? 'pass' : 'fail',
      details: IntegratedWorkflowAgent ? '로드됨' : '로드 실패',
    })
  } catch (error) {
    checks.push({
      category: 'Agent',
      item: '워크플로우 에이전트',
      status: 'fail',
      details: `로드 실패: ${error}`,
    })
  }

  // 5. 영속성 확인
  try {
    // IndexedDB 지원 확인
    const idbSupported = typeof indexedDB !== 'undefined'
    checks.push({
      category: 'Persistence',
      item: 'IndexedDB',
      status: idbSupported ? 'pass' : 'warning',
      details: idbSupported ? '지원됨' : '미지원 (메모리 모드로 동작)',
    })
  } catch (error) {
    checks.push({
      category: 'Persistence',
      item: 'IndexedDB',
      status: 'warning',
      details: '확인 불가',
    })
  }

  return checks
}

// ============================================================
// RL 시뮬레이션 초기화 및 시작
// ============================================================

let realAgentAdapter: RealWorkflowAgentAdapter | null = null
let realEngineAdapter: RealExecutionEngineAdapter | null = null

/**
 * RL 시뮬레이션 시스템 초기화
 *
 * 실제 워크플로우 에이전트와 실행 엔진을 연결합니다.
 */
export async function initializeRLSimulation(): Promise<{
  success: boolean
  realismChecks: RealismCheck[]
  warnings: string[]
}> {
  const warnings: string[] = []

  // 현실성 검증
  const realismChecks = await verifySimulationRealism()

  const failures = realismChecks.filter(c => c.status === 'fail')
  if (failures.length > 0) {
    return {
      success: false,
      realismChecks,
      warnings: failures.map(f => `${f.category}/${f.item}: ${f.details}`),
    }
  }

  // 경고 수집
  const warningChecks = realismChecks.filter(c => c.status === 'warning')
  warnings.push(...warningChecks.map(w => `${w.category}/${w.item}: ${w.details}`))

  // 어댑터 초기화
  realAgentAdapter = new RealWorkflowAgentAdapter()
  await realAgentAdapter.initialize()

  realEngineAdapter = new RealExecutionEngineAdapter()
  await realEngineAdapter.initialize()

  // RLSimulationSystem에 연결
  rlSimulationSystem.setWorkflowAgent({
    generateWorkflow: async (prompt, strategy) => {
      return realAgentAdapter!.generateWorkflow(prompt, strategy)
    },
  })

  rlSimulationSystem.setExecutionEngine({
    execute: async (workflow) => {
      return realEngineAdapter!.execute(workflow)
    },
  })

  console.log('[RLIntegration] 초기화 완료')

  return {
    success: true,
    realismChecks,
    warnings,
  }
}

/**
 * RL 시뮬레이션 시작 (20,000건 목표)
 */
export async function startRLSimulation(options?: {
  targetSuccesses?: number
  onProgress?: (state: any) => void
  onComplete?: (result: any) => void
  onError?: (error: Error) => void
}): Promise<void> {
  // 초기화 확인
  if (!realAgentAdapter || !realEngineAdapter) {
    const initResult = await initializeRLSimulation()
    if (!initResult.success) {
      throw new Error(`초기화 실패: ${initResult.warnings.join(', ')}`)
    }

    if (initResult.warnings.length > 0) {
      console.warn('[RLSimulation] 경고:', initResult.warnings)
    }
  }

  // 이벤트 핸들러 설정
  rlSimulationSystem.setEventHandlers({
    onProgress: options?.onProgress,
    onError: options?.onError,
    onCheckpoint: (cp) => {
      console.log(`[RLSimulation] 체크포인트: ${cp.successCount}/${cp.totalAttempts}`)
    },
  })

  // 시뮬레이션 시작
  console.log('[RLSimulation] 20,000건 목표 시뮬레이션 시작')
  console.log('[RLSimulation] 실제 LLM 호출, 실제 워크플로우 실행 환경')

  try {
    const result = await rlSimulationSystem.runSimulation()
    options?.onComplete?.(result)
  } catch (error) {
    options?.onError?.(error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * 현재 시뮬레이션 상태 조회
 */
export function getSimulationState(): any {
  return rlSimulationSystem.getState()
}

/**
 * 시뮬레이션 일시정지
 */
export function pauseSimulation(): void {
  rlSimulationSystem.pause()
}

/**
 * 시뮬레이션 재개
 */
export function resumeSimulation(): void {
  rlSimulationSystem.resume()
}

/**
 * 시뮬레이션 중지
 */
export function stopSimulation(): void {
  rlSimulationSystem.stop()
}

// ============================================================
// Export
// ============================================================

export {
  RealWorkflowAgentAdapter,
  RealExecutionEngineAdapter,
  realAgentAdapter,
  realEngineAdapter,
}
