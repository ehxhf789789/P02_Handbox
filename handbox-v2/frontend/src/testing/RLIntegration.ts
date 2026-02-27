// @ts-nocheck
/**
 * RL Integration v2 - 강화학습 시스템과 Handbox v2 통합
 *
 * v2 아키텍처에 맞게 재작성:
 * - @xyflow/react 사용
 * - Zustand stores (workflowStore, executionStore, llmStore)
 * - Tauri backend 연동
 */

import type { Node, Edge } from '@xyflow/react'
import { rlSimulationSystem } from './RLSimulationSystem'
import type { WorkflowSnapshot, ExecutionSnapshot, NodeSnapshot, EdgeSnapshot } from '../types/RLTypes'

// UUID 생성 함수
function uuidv4(): string {
  return crypto.randomUUID()
}

// ============================================================
// v2 시스템 임포트 (동적 로드)
// ============================================================

let workflowStore: any = null
let executionStore: any = null
let llmStore: any = null
let tauriUtils: any = null

async function loadV2Systems(): Promise<void> {
  if (workflowStore) return

  try {
    const wfModule = await import('../stores/workflowStore')
    workflowStore = wfModule.useWorkflowStore

    const execModule = await import('../stores/executionStore')
    executionStore = execModule.useExecutionStore

    const llmModule = await import('../stores/llmStore')
    llmStore = llmModule.useLLMStore

    const tauriModule = await import('../utils/tauri')
    tauriUtils = tauriModule

    console.log('[RLIntegration v2] 시스템 로드 완료')
  } catch (error) {
    console.error('[RLIntegration v2] 시스템 로드 실패:', error)
    throw new Error('v2 시스템 로드 실패')
  }
}

// ============================================================
// 현실성 검증 (Realism Check)
// ============================================================

export interface RealismCheck {
  category: string
  item: string
  status: 'pass' | 'warning' | 'fail'
  details: string
}

export async function verifySimulationRealism(): Promise<RealismCheck[]> {
  const checks: RealismCheck[] = []

  await loadV2Systems()

  // 1. LLM 연결 확인
  const llmState = llmStore?.getState()
  const hasLLMConfig = llmState?.activeProvider && llmState?.selectedModel

  checks.push({
    category: 'LLM',
    item: 'Provider Configuration',
    status: hasLLMConfig ? 'pass' : 'warning',
    details: hasLLMConfig
      ? `${llmState.activeProvider}/${llmState.selectedModel[llmState.activeProvider]}`
      : 'LLM 프로바이더 미설정',
  })

  // 2. Tauri 환경 확인
  const isTauriEnv = tauriUtils?.isTauri?.() ?? false

  checks.push({
    category: 'Environment',
    item: 'Tauri Runtime',
    status: isTauriEnv ? 'pass' : 'warning',
    details: isTauriEnv ? 'Tauri 환경 감지됨' : '브라우저 모드 (일부 기능 제한)',
  })

  // 3. Workflow Store 확인
  const wfState = workflowStore?.getState()

  checks.push({
    category: 'Store',
    item: 'Workflow Store',
    status: wfState ? 'pass' : 'fail',
    details: wfState ? 'Store 초기화됨' : 'Store 로드 실패',
  })

  // 4. Execution Store 확인
  const execState = executionStore?.getState()

  checks.push({
    category: 'Store',
    item: 'Execution Store',
    status: execState ? 'pass' : 'fail',
    details: execState ? 'Store 초기화됨' : 'Store 로드 실패',
  })

  return checks
}

// ============================================================
// 워크플로우 에이전트 어댑터
// ============================================================

export class RealWorkflowAgentAdapter {
  private initialized = false

  async initialize(): Promise<void> {
    await loadV2Systems()
    this.initialized = true
    console.log('[RLIntegration v2] 워크플로우 에이전트 초기화 완료')
  }

  /**
   * LLM을 사용하여 프롬프트에서 워크플로우 생성
   */
  async generateWorkflow(
    prompt: string,
    strategy: string
  ): Promise<{
    workflow: WorkflowSnapshot | null
    xaiScore: number
    intentScore: number
  }> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const llmState = llmStore.getState()

      // LLM을 통해 워크플로우 생성 요청
      const systemPrompt = this.buildSystemPrompt(strategy)
      const response = await llmState.invokeLLM({
        prompt: this.buildWorkflowPrompt(prompt),
        systemPrompt,
        maxTokens: 4096,
        temperature: 0.7,
      })

      // 응답 파싱
      const workflow = this.parseWorkflowFromResponse(response.content)

      // 품질 점수 계산
      const xaiScore = this.calculateXAIScore(workflow, prompt)
      const intentScore = this.calculateIntentScore(workflow, prompt)

      return { workflow, xaiScore, intentScore }
    } catch (error) {
      console.error('[RLIntegration v2] 워크플로우 생성 실패:', error)
      return { workflow: null, xaiScore: 0, intentScore: 0 }
    }
  }

  private buildSystemPrompt(strategy: string): string {
    const basePrompt = `당신은 Handbox v2 워크플로우 설계 전문가입니다.
사용자의 요청을 분석하여 노드 기반 워크플로우를 JSON 형식으로 생성합니다.

출력 형식:
{
  "nodes": [
    { "id": "node_1", "type": "tool_name", "label": "설명", "config": {} }
  ],
  "edges": [
    { "source": "node_1", "target": "node_2" }
  ]
}`

    const strategyPrompts: Record<string, string> = {
      chain_of_thought: '\n\n전략: 단계별로 논리적 추론을 거쳐 워크플로우를 설계하세요.',
      few_shot: '\n\n전략: 유사한 예제를 참고하여 워크플로우를 설계하세요.',
      chain_reasoning: '\n\n전략: 각 단계의 이유를 명시하며 워크플로우를 설계하세요.',
      template_match: '\n\n전략: 기존 템플릿을 매칭하여 워크플로우를 설계하세요.',
      hybrid: '\n\n전략: 복합적인 접근법을 사용하여 워크플로우를 설계하세요.',
    }

    return basePrompt + (strategyPrompts[strategy] || '')
  }

  private buildWorkflowPrompt(userPrompt: string): string {
    return `다음 요청에 맞는 워크플로우를 생성해주세요:

${userPrompt}

JSON 형식으로만 응답하세요.`
  }

  private parseWorkflowFromResponse(content: string): WorkflowSnapshot | null {
    try {
      // JSON 블록 추출
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null

      const parsed = JSON.parse(jsonMatch[0])

      const nodes: NodeSnapshot[] = (parsed.nodes || []).map((n: any, i: number) => ({
        id: n.id || `node_${i}`,
        type: n.type || 'unknown',
        label: n.label || n.type,
        position: { x: i * 200, y: 100 },
        config: n.config || {},
      }))

      const edges: EdgeSnapshot[] = (parsed.edges || []).map((e: any, i: number) => ({
        id: `edge_${i}`,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      }))

      return {
        id: uuidv4(),
        nodes,
        edges,
        metadata: {
          createdAt: new Date(),
          version: '2.0',
        },
      }
    } catch (error) {
      console.error('[RLIntegration v2] 워크플로우 파싱 실패:', error)
      return null
    }
  }

  private calculateXAIScore(workflow: WorkflowSnapshot | null, _prompt: string): number {
    if (!workflow) return 0
    // 간단한 XAI 점수 계산 (0-1)
    const nodeCount = workflow.nodes.length
    const hasLabels = workflow.nodes.every(n => n.label && n.label.length > 0)
    const hasConnections = workflow.edges.length >= nodeCount - 1

    let score = 0
    if (nodeCount > 0) score += 0.3
    if (hasLabels) score += 0.3
    if (hasConnections) score += 0.4

    return score
  }

  private calculateIntentScore(workflow: WorkflowSnapshot | null, prompt: string): number {
    if (!workflow) return 0
    // 간단한 의도 정렬 점수 (0-1)
    const promptWords = prompt.toLowerCase().split(/\s+/)
    const workflowText = workflow.nodes.map(n => `${n.type} ${n.label}`).join(' ').toLowerCase()

    let matches = 0
    for (const word of promptWords) {
      if (word.length > 3 && workflowText.includes(word)) {
        matches++
      }
    }

    return Math.min(1, matches / Math.max(1, promptWords.length / 3))
  }
}

// ============================================================
// 실행 엔진 어댑터
// ============================================================

export class RealExecutionEngineAdapter {
  private initialized = false

  async initialize(): Promise<void> {
    await loadV2Systems()
    this.initialized = true
  }

  /**
   * 워크플로우 실행
   */
  async execute(workflow: WorkflowSnapshot): Promise<ExecutionSnapshot> {
    if (!this.initialized) {
      await this.initialize()
    }

    const executionId = uuidv4()
    const startTime = Date.now()

    try {
      const isTauri = tauriUtils?.isTauri?.() ?? false

      if (isTauri) {
        // Tauri 백엔드를 통한 실제 실행
        const result = await tauriUtils.safeInvoke('execute_workflow', {
          workflow: {
            nodes: workflow.nodes.map(n => ({
              id: n.id,
              tool_ref: n.type,
              label: n.label,
              config: n.config,
            })),
            edges: workflow.edges.map(e => ({
              id: e.id,
              source: e.source,
              target: e.target,
            })),
          },
        })

        return {
          id: executionId,
          workflowId: workflow.id,
          startTime: new Date(startTime),
          endTime: new Date(),
          status: result?.status === 'completed' ? 'completed' : 'failed',
          nodeResults: result?.nodeResults || {},
          outputs: result?.outputs || {},
          error: result?.error,
        }
      } else {
        // 브라우저 모드: 시뮬레이션 실행
        return this.simulateExecution(workflow, executionId, startTime)
      }
    } catch (error) {
      return {
        id: executionId,
        workflowId: workflow.id,
        startTime: new Date(startTime),
        endTime: new Date(),
        status: 'failed',
        nodeResults: {},
        outputs: {},
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private simulateExecution(
    workflow: WorkflowSnapshot,
    executionId: string,
    startTime: number
  ): ExecutionSnapshot {
    // 시뮬레이션: 각 노드의 결과를 생성
    const nodeResults: Record<string, { status: string; output: unknown }> = {}

    for (const node of workflow.nodes) {
      nodeResults[node.id] = {
        status: 'completed',
        output: { simulated: true, nodeType: node.type },
      }
    }

    return {
      id: executionId,
      workflowId: workflow.id,
      startTime: new Date(startTime),
      endTime: new Date(),
      status: 'completed',
      nodeResults,
      outputs: { finalResult: 'Simulated execution completed' },
    }
  }
}

// ============================================================
// 시뮬레이션 상태 관리
// ============================================================

let simulationState: {
  initialized: boolean
  agentAdapter: RealWorkflowAgentAdapter | null
  engineAdapter: RealExecutionEngineAdapter | null
} = {
  initialized: false,
  agentAdapter: null,
  engineAdapter: null,
}

export async function initializeRLSimulation(): Promise<{
  success: boolean
  realismChecks?: RealismCheck[]
  warnings: string[]
}> {
  const warnings: string[] = []

  try {
    await loadV2Systems()

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

    simulationState.agentAdapter = new RealWorkflowAgentAdapter()
    await simulationState.agentAdapter.initialize()

    simulationState.engineAdapter = new RealExecutionEngineAdapter()
    await simulationState.engineAdapter.initialize()

    // LLM 설정 확인
    const llmState = llmStore?.getState()
    if (!llmState?.activeProvider) {
      warnings.push('LLM 프로바이더가 설정되지 않았습니다. 설정에서 LLM을 구성하세요.')
    }

    // Tauri 환경 확인
    if (!tauriUtils?.isTauri?.()) {
      warnings.push('브라우저 모드에서 실행 중입니다. 일부 기능이 시뮬레이션됩니다.')
    }

    // RL 시스템에 어댑터 등록
    rlSimulationSystem.setWorkflowAgent(simulationState.agentAdapter)
    rlSimulationSystem.setExecutionEngine(simulationState.engineAdapter)

    simulationState.initialized = true

    return { success: true, realismChecks, warnings }
  } catch (error) {
    return {
      success: false,
      warnings: [error instanceof Error ? error.message : String(error)],
    }
  }
}

export async function startRLSimulation(): Promise<void> {
  if (!simulationState.initialized) {
    const init = await initializeRLSimulation()
    if (!init.success) {
      throw new Error('RL 시뮬레이션 초기화 실패: ' + init.warnings.join(', '))
    }
  }

  await rlSimulationSystem.runSimulation()
}

export function getSimulationState() {
  return rlSimulationSystem.getState()
}

export function pauseSimulation() {
  rlSimulationSystem.pause()
}

export function resumeSimulation() {
  rlSimulationSystem.resume()
}

export function stopSimulation() {
  rlSimulationSystem.stop()
}
