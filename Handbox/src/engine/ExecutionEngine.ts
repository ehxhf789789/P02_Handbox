/**
 * Execution Engine — 워크플로우 실행 오케스트레이터
 *
 * 역할:
 * 1. 토폴로지 정렬 (실행 순서 결정)
 * 2. 노드 간 데이터 전달
 * 3. 순차 실행 + 에러 핸들링
 * 4. 실행 상태 콜백
 * 5. 중단점 지원
 * 6. 포트 타입 검증
 */

import type { Node, Edge } from 'reactflow'
import type { ExecutionContext, NodeExecutionStatus } from './types'
import { isTypeCompatible } from './types'
import { NodeRegistry } from '../registry/NodeRegistry'
import { ProviderRegistry } from '../registry/ProviderRegistry'

// ============================================================
// 토폴로지 정렬 (Kahn's Algorithm)
// ============================================================

export function topologicalSort(nodes: Node[], edges: Edge[]): Node[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  for (const edge of edges) {
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
      adjacency.get(edge.source)?.push(edge.target)
    }
  }

  const queue: string[] = []
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId)
  }

  const result: Node[] = []
  while (queue.length > 0) {
    const currentId = queue.shift()!
    const currentNode = nodeMap.get(currentId)
    if (currentNode) result.push(currentNode)

    for (const neighborId of adjacency.get(currentId) || []) {
      const newDegree = (inDegree.get(neighborId) || 0) - 1
      inDegree.set(neighborId, newDegree)
      if (newDegree === 0) queue.push(neighborId)
    }
  }

  return result
}

// ============================================================
// 선행 노드 출력 수집
// ============================================================

function collectInputs(
  nodeId: string,
  node: Node,
  edges: Edge[],
  context: ExecutionContext,
): Record<string, any> {
  // 이 노드로 들어오는 모든 엣지 찾기
  const incomingEdges = edges.filter(e => e.target === nodeId)

  // 노드 정의에서 입력 포트 확인
  const definition = NodeRegistry.get(node.type || '')
  const inputPorts = definition?.ports.inputs || []

  const inputs: Record<string, any> = {}

  if (inputPorts.length === 0 || incomingEdges.length === 0) {
    // 포트가 없거나 입력 엣지가 없으면 — 선행 노드 출력을 배열로 전달 (레거시 호환)
    const predecessorOutputs = incomingEdges
      .map(e => context.nodeOutputs[e.source])
      .filter(Boolean)

    inputs._predecessors = predecessorOutputs
    // 첫 번째 선행 노드의 출력을 기본 입력으로
    if (predecessorOutputs.length > 0) {
      Object.assign(inputs, predecessorOutputs[0])
    }
    return inputs
  }

  // 포트 기반 입력 수집
  // 현재는 단순화: 첫 번째 입력 포트에 모든 선행 노드 출력을 매핑
  // 향후: 엣지에 sourceHandle/targetHandle로 포트 매핑
  for (const edge of incomingEdges) {
    const sourceOutput = context.nodeOutputs[edge.source]
    if (sourceOutput) {
      // sourceHandle/targetHandle이 있으면 포트 매핑
      if (edge.targetHandle && edge.sourceHandle) {
        inputs[edge.targetHandle] = sourceOutput[edge.sourceHandle]
      } else {
        // 없으면 전체 출력을 첫 번째 포트에 매핑
        const firstPort = inputPorts[0]
        if (firstPort) {
          // 출력에서 적절한 데이터 추출
          inputs[firstPort.name] = sourceOutput[firstPort.name]
            || sourceOutput.text
            || sourceOutput.file
            || sourceOutput
        }
      }
    }
  }

  // _predecessors도 항상 포함 (레거시 호환)
  inputs._predecessors = incomingEdges
    .map(e => context.nodeOutputs[e.source])
    .filter(Boolean)

  return inputs
}

// ============================================================
// 워크플로우 실행
// ============================================================

export interface ExecuteWorkflowOptions {
  nodes: Node[]
  edges: Edge[]
  /** 실행 상태 변경 콜백 */
  onNodeStatusChange: (nodeId: string, status: NodeExecutionStatus, output?: Record<string, any>, error?: string) => void
  /** 전체 실행 완료 콜백 */
  onComplete?: () => void
  /** 중단점 노드 ID */
  breakpointNodeId?: string | null
  /** 비활성화된 노드 필터링 */
  filterDisabled?: boolean
  /** 외부 중단 시그널 */
  abortController?: AbortController
}

export async function executeWorkflow(options: ExecuteWorkflowOptions): Promise<void> {
  const {
    nodes,
    edges,
    onNodeStatusChange,
    onComplete,
    breakpointNodeId,
    filterDisabled = true,
    abortController = new AbortController(),
  } = options

  // 비활성화된 노드 필터링
  const enabledNodes = filterDisabled
    ? nodes.filter(n => n.data?.enabled !== false)
    : nodes

  // 토폴로지 정렬
  const sortedNodes = topologicalSort(enabledNodes, edges)

  // 실행 컨텍스트 생성
  const context: ExecutionContext = {
    executionId: `exec_${Date.now()}`,
    nodeOutputs: {},
    variables: {},
    defaultLLMProvider: ProviderRegistry.getActiveLLMProviderId() || 'bedrock',
    defaultEmbeddingProvider: 'titan',
    onNodeStatusChange,
    abortSignal: abortController.signal,
    breakpointNodeId,
  }

  // 순차 실행
  for (const node of sortedNodes) {
    // 중단 확인
    if (abortController.signal.aborted) {
      break
    }

    // 중단점 도달 확인
    if (breakpointNodeId && node.id === breakpointNodeId) {
      onNodeStatusChange(node.id, 'idle')
      break
    }

    const nodeType = node.type || ''
    const executor = NodeRegistry.getExecutor(nodeType)

    // Running 상태로 변경
    onNodeStatusChange(node.id, 'running')

    try {
      // 입력 데이터 수집
      const inputs = collectInputs(node.id, node, edges, context)
      const config = node.data?.config || {}

      let output: Record<string, any>

      if (executor) {
        // 신규 레지스트리 기반 실행
        output = await executor.execute(inputs, config, context)
      } else {
        // 레거시: 등록되지 않은 노드 타입 → 레거시 실행기에 위임
        output = await executeLegacyNode(node, inputs, config, context)
      }

      // 출력 저장
      context.nodeOutputs[node.id] = output
      onNodeStatusChange(node.id, 'completed', output)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      onNodeStatusChange(node.id, 'error', undefined, errorMessage)
      console.error(`[ExecutionEngine] Node ${node.id} (${nodeType}) failed:`, error)
      // 에러 발생해도 계속 진행 (다른 노드 실행)
    }
  }

  onComplete?.()
}

// ============================================================
// 레거시 노드 실행 (마이그레이션 기간 동안 사용)
// ============================================================

/**
 * NodeRegistry에 등록되지 않은 노드 타입을 실행.
 * 기존 workflowStore.ts의 executeNodeReal() 로직을 점진적으로 여기로 이동.
 * 마이그레이션이 완료되면 이 함수는 제거된다.
 */
async function executeLegacyNode(
  node: Node,
  inputs: Record<string, any>,
  _config: Record<string, any>,
  _context: ExecutionContext,
): Promise<Record<string, any>> {
  const nodeType = node.type || ''
  const label = node.data?.label || ''

  // 레거시 실행기가 없으면 패스스루
  console.warn(`[ExecutionEngine] 레거시 노드: ${nodeType} (${label}) — 등록된 executor 없음`)
  return {
    _legacy: true,
    _warning: `노드 타입 '${nodeType}'에 대한 executor가 등록되지 않았습니다.`,
    status: 'executor 미등록',
    ...inputs,
  }
}

// ============================================================
// 포트 호환성 검증
// ============================================================

export interface ConnectionValidation {
  valid: boolean
  reason?: string
}

/** 두 노드의 연결이 유효한지 검증 */
export function validateConnection(
  sourceNodeType: string,
  sourceHandle: string | null,
  targetNodeType: string,
  targetHandle: string | null,
): ConnectionValidation {
  const sourceDef = NodeRegistry.get(sourceNodeType)
  const targetDef = NodeRegistry.get(targetNodeType)

  // 정의가 없으면 (레거시 노드) 연결 허용
  if (!sourceDef || !targetDef) {
    return { valid: true }
  }

  // 출력 포트 타입 확인
  const outputPort = sourceHandle
    ? sourceDef.ports.outputs.find(p => p.name === sourceHandle)
    : sourceDef.ports.outputs[0]

  // 입력 포트 타입 확인
  const inputPort = targetHandle
    ? targetDef.ports.inputs.find(p => p.name === targetHandle)
    : targetDef.ports.inputs[0]

  if (!outputPort || !inputPort) {
    return { valid: true }  // 포트가 없으면 연결 허용 (레거시 호환)
  }

  const compatible = isTypeCompatible(outputPort.type, inputPort.type)
  if (!compatible) {
    return {
      valid: false,
      reason: `타입 불일치: ${outputPort.type} → ${inputPort.type}`,
    }
  }

  return { valid: true }
}
