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
 * 7. 조건 분기 (if/switch) — 비활성 경로 자동 스킵
 * 8. 루프 서브실행 (forEach/loop/while)
 * 9. 스텝 실행 (디버거 지원)
 */

import type { Node, Edge } from 'reactflow'
import type { ExecutionContext, NodeExecutionStatus } from './types'
import { isTypeCompatible } from './types'
import { NodeRegistry } from '../registry/NodeRegistry'
import { ProviderRegistry } from '../registry/ProviderRegistry'

// ============================================================
// 제어 흐름 노드 타입 상수
// ============================================================

const BRANCH_NODE_TYPES = new Set([
  'control.if', 'control.switch', 'control.gate',
])

const LOOP_NODE_TYPES = new Set([
  'control.loop', 'control.forEach', 'control.while',
])

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
// 다운스트림 서브그래프 탐색
// ============================================================

/**
 * 특정 노드에서 시작하여 도달 가능한 모든 다운스트림 노드 ID를 수집합니다.
 * 루프 노드의 서브실행 범위를 결정하는 데 사용됩니다.
 */
function getDownstreamNodeIds(startNodeId: string, edges: Edge[]): Set<string> {
  const downstream = new Set<string>()
  const queue = [startNodeId]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of edges) {
      if (edge.source === current && !downstream.has(edge.target)) {
        downstream.add(edge.target)
        queue.push(edge.target)
      }
    }
  }

  return downstream
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

  // 선행 노드 출력 수집 (모든 경우에 필요)
  const predecessorOutputs = incomingEdges
    .map(e => context.nodeOutputs[e.source])
    .filter(Boolean)
  inputs._predecessors = predecessorOutputs

  if (inputPorts.length === 0 || incomingEdges.length === 0) {
    // 포트가 없거나 입력 엣지가 없으면 — 선행 노드 출력을 기본 입력으로
    if (predecessorOutputs.length > 0) {
      Object.assign(inputs, predecessorOutputs[0])
    }
    return inputs
  }

  // 포트 기반 입력 수집
  for (const edge of incomingEdges) {
    const sourceOutput = context.nodeOutputs[edge.source]
    if (!sourceOutput) continue

    // sourceHandle/targetHandle이 있으면 포트 매핑
    if (edge.targetHandle && edge.sourceHandle) {
      inputs[edge.targetHandle] = sourceOutput[edge.sourceHandle]
    } else {
      // 핸들이 없으면: 소스 출력을 타겟 입력 포트들에 스마트 매핑
      for (const inputPort of inputPorts) {
        // 이미 값이 설정되어 있으면 스킵
        if (inputs[inputPort.name] !== undefined) continue

        // 1. 동일 이름의 출력 포트가 있는지 확인
        if (sourceOutput[inputPort.name] !== undefined) {
          inputs[inputPort.name] = sourceOutput[inputPort.name]
          continue
        }

        // 2. 타입 기반 매핑 시도
        const portType = inputPort.type
        if (portType === 'text' || portType === 'llm-response') {
          // 텍스트 타입: text, content, response, prompt 순서로 시도
          const textValue = sourceOutput.text
            || sourceOutput.content
            || sourceOutput.response
            || sourceOutput.prompt
            || (typeof sourceOutput === 'string' ? sourceOutput : null)
          if (textValue) {
            inputs[inputPort.name] = textValue
            continue
          }
        } else if (portType === 'json' || portType === 'any') {
          // JSON 타입: data, result, json 순서로 시도
          const jsonValue = sourceOutput.data
            || sourceOutput.result
            || sourceOutput.json
            || sourceOutput
          inputs[inputPort.name] = jsonValue
          continue
        } else if (portType === 'text[]') {
          // 텍스트 배열: chunks 또는 texts
          const arrayValue = sourceOutput.chunks || sourceOutput.texts
          if (Array.isArray(arrayValue)) {
            inputs[inputPort.name] = arrayValue
            continue
          }
        }
      }

      // 3. 첫 번째 입력 포트에 기본값 설정 (아직 없는 경우)
      const firstInputPort = inputPorts[0]
      if (firstInputPort && inputs[firstInputPort.name] === undefined) {
        const outputValue = sourceOutput.text
          || sourceOutput.data
          || sourceOutput.result
          || sourceOutput.content
          || sourceOutput.response
          || Object.values(sourceOutput).find(v => typeof v === 'string' && v.length > 0)
          || sourceOutput

        inputs[firstInputPort.name] = outputValue
      }
    }
  }

  // 디버깅 로그
  console.log(`[collectInputs] Node ${nodeId} (${node.type}):`, {
    inputPorts: inputPorts.map(p => p.name),
    collectedInputs: Object.keys(inputs).filter(k => k !== '_predecessors'),
    hasText: inputs.text !== undefined || inputs.prompt !== undefined,
  })

  return inputs
}

// ============================================================
// 비활성 경로 감지 (조건 분기용)
// ============================================================

/**
 * 노드의 입력이 비활성 경로에서 오는지 확인합니다.
 *
 * IF 노드가 true_out만 반환하면, false_out에 연결된 다운스트림 노드는
 * 실행할 필요가 없습니다.
 *
 * 규칙: 노드의 모든 incoming 엣지 중, sourceHandle이 지정된 것이
 * 해당 소스의 출력에 값이 없으면(undefined) → 비활성 경로
 */
function isOnInactivePath(
  nodeId: string,
  edges: Edge[],
  context: ExecutionContext,
  skippedNodes: Set<string>,
): boolean {
  const incomingEdges = edges.filter(e => e.target === nodeId)
  if (incomingEdges.length === 0) return false

  // 모든 incoming 엣지가 비활성인지 확인
  let allInactive = true

  for (const edge of incomingEdges) {
    // 소스 노드가 스킵됐으면 이 경로도 비활성
    if (skippedNodes.has(edge.source)) continue

    const sourceOutput = context.nodeOutputs[edge.source]
    if (!sourceOutput) continue

    // sourceHandle이 지정되어 있으면, 해당 포트의 값을 확인
    if (edge.sourceHandle) {
      if (sourceOutput[edge.sourceHandle] !== undefined) {
        allInactive = false
        break
      }
    } else {
      // sourceHandle이 없으면 (일반 연결) 활성으로 간주
      allInactive = false
      break
    }
  }

  return allInactive
}

// ============================================================
// 단일 노드 실행
// ============================================================

async function executeSingleNode(
  node: Node,
  edges: Edge[],
  allNodes: Node[],
  context: ExecutionContext,
  onNodeStatusChange: (nodeId: string, status: NodeExecutionStatus, output?: Record<string, any>, error?: string) => void,
): Promise<Record<string, any>> {
  const nodeType = node.type || ''
  const executor = NodeRegistry.getExecutor(nodeType)

  const inputs = collectInputs(node.id, node, edges, context)
  const config = node.data?.config || {}

  // 디버그 로깅: 노드 실행 시작
  console.log(`[ExecutionEngine] 노드 실행 시작: ${node.id} (${nodeType})`)
  console.log(`[ExecutionEngine] 입력:`, {
    inputKeys: Object.keys(inputs).filter(k => k !== '_predecessors'),
    hasText: !!inputs.text || !!inputs.prompt,
    textLength: (inputs.text?.length || 0) + (inputs.prompt?.length || 0),
    config: Object.keys(config),
  })

  if (executor) {
    // 루프 노드인 경우 → 서브실행 컨텍스트 제공
    if (LOOP_NODE_TYPES.has(nodeType)) {
      return executeLoopNode(node, executor, inputs, config, edges, allNodes, context, onNodeStatusChange)
    }
    const result = await executor.execute(inputs, config, context)
    console.log(`[ExecutionEngine] 노드 실행 완료: ${node.id}`, {
      outputKeys: Object.keys(result),
      hasText: !!result.text,
      textLength: result.text?.length || 0,
    })
    return result
  }

  return executeLegacyNode(node, inputs, config, context)
}

// ============================================================
// 루프 노드 서브실행
// ============================================================

/**
 * ForEach/Loop/While 노드의 서브실행을 처리합니다.
 *
 * 동작:
 * 1. 루프 노드의 다운스트림 서브그래프를 식별
 * 2. 각 반복마다 서브그래프를 토폴로지 순서로 실행
 * 3. 각 반복의 결과를 수집하여 배열로 반환
 */
async function executeLoopNode(
  loopNode: Node,
  executor: { execute: (input: any, config: any, context: any) => Promise<Record<string, any>> },
  inputs: Record<string, any>,
  config: Record<string, any>,
  edges: Edge[],
  allNodes: Node[],
  context: ExecutionContext,
  onNodeStatusChange: (nodeId: string, status: NodeExecutionStatus, output?: Record<string, any>, error?: string) => void,
): Promise<Record<string, any>> {
  const nodeType = loopNode.type || ''

  // 다운스트림 서브그래프 식별
  const downstreamIds = getDownstreamNodeIds(loopNode.id, edges)
  const downstreamNodes = allNodes.filter(n => downstreamIds.has(n.id))
  const downstreamEdges = edges.filter(
    e => downstreamIds.has(e.source) || (e.source === loopNode.id && downstreamIds.has(e.target))
  )

  // 서브그래프가 없으면 → 기존 방식 (결과만 수집)
  if (downstreamNodes.length === 0) {
    return executor.execute(inputs, config, context)
  }

  // 반복 데이터 결정
  const iterations = resolveIterations(nodeType, inputs, config)
  const results: any[] = []
  const maxIterations = config.max_iterations || 1000

  for (let i = 0; i < iterations.length && i < maxIterations; i++) {
    // 중단 확인
    if (context.abortSignal.aborted) break

    const iterItem = iterations[i]

    // 컨텍스트 변수에 현재 반복 정보 설정
    context.variables['__loop_item'] = iterItem
    context.variables['__loop_index'] = i
    context.variables['__loop_count'] = iterations.length

    // 루프 노드의 출력을 현재 반복 아이템으로 설정
    context.nodeOutputs[loopNode.id] = {
      item: iterItem,
      index: i,
      results, // 지금까지의 결과 (누적)
    }

    // 서브그래프 토폴로지 순서로 실행
    const subSorted = topologicalSort(downstreamNodes, downstreamEdges)
    const subSkipped = new Set<string>()

    for (const subNode of subSorted) {
      if (context.abortSignal.aborted) break
      if (subSkipped.has(subNode.id)) continue

      // 비활성 경로 체크
      if (isOnInactivePath(subNode.id, downstreamEdges, context, subSkipped)) {
        subSkipped.add(subNode.id)
        onNodeStatusChange(subNode.id, 'skipped')
        continue
      }

      onNodeStatusChange(subNode.id, 'running')

      try {
        const subInputs = collectInputs(subNode.id, subNode, edges, context)
        const subConfig = subNode.data?.config || {}
        const subExecutor = NodeRegistry.getExecutor(subNode.type || '')

        const subOutput = subExecutor
          ? await subExecutor.execute(subInputs, subConfig, context)
          : { _passthrough: subInputs }

        context.nodeOutputs[subNode.id] = subOutput
        onNodeStatusChange(subNode.id, 'completed', subOutput)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        onNodeStatusChange(subNode.id, 'error', undefined, errMsg)
      }
    }

    // 마지막 서브노드의 출력을 반복 결과로 수집
    const lastSubNode = subSorted[subSorted.length - 1]
    if (lastSubNode) {
      results.push(context.nodeOutputs[lastSubNode.id] || iterItem)
    } else {
      results.push(iterItem)
    }
  }

  return {
    item: iterations[iterations.length - 1],
    index: iterations.length - 1,
    results,
    count: iterations.length,
  }
}

/**
 * 루프 타입별 반복 데이터 결정
 */
function resolveIterations(
  nodeType: string,
  inputs: Record<string, any>,
  config: Record<string, any>,
): any[] {
  switch (nodeType) {
    case 'control.forEach': {
      const arr = inputs.array
      return Array.isArray(arr) ? arr : [arr]
    }
    case 'control.loop': {
      const count = config.count || 5
      return Array.from({ length: count }, (_, i) => ({ __index: i, input: inputs.input }))
    }
    case 'control.while': {
      // While 루프: 최대 반복 횟수만큼 반복 (조건 평가는 각 반복에서 처리)
      const max = config.max_iterations || 100
      return Array.from({ length: max }, (_, i) => ({ __index: i, input: inputs.input }))
    }
    default:
      return [inputs.input]
  }
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
  /** 스텝 실행 모드 (한 노드씩 실행 후 대기) */
  stepMode?: boolean
  /** 스텝 실행 시 다음 노드 진행 시그널 */
  stepSignal?: () => Promise<void>
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
    stepMode = false,
    stepSignal,
  } = options

  // 비활성화된 노드 필터링
  const enabledNodes = filterDisabled
    ? nodes.filter(n => n.data?.enabled !== false)
    : nodes

  // 루프 서브그래프에 속하는 노드 식별 (메인 루프에서 스킵)
  const loopBodyNodeIds = new Set<string>()
  for (const node of enabledNodes) {
    if (LOOP_NODE_TYPES.has(node.type || '')) {
      const downstream = getDownstreamNodeIds(node.id, edges)
      for (const id of downstream) loopBodyNodeIds.add(id)
    }
  }

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

  // 스킵된 노드 추적 (분기 비활성 경로)
  const skippedNodes = new Set<string>()

  // 순차 실행
  for (const node of sortedNodes) {
    // 중단 확인
    if (abortController.signal.aborted) break

    // 중단점 도달 확인
    if (breakpointNodeId && node.id === breakpointNodeId) {
      onNodeStatusChange(node.id, 'idle')
      break
    }

    // 루프 서브그래프에 속하는 노드는 메인 루프에서 스킵 (루프 노드가 직접 실행)
    if (loopBodyNodeIds.has(node.id)) {
      continue
    }

    // 비활성 경로 체크 (IF/Switch 분기 스킵)
    if (isOnInactivePath(node.id, edges, context, skippedNodes)) {
      skippedNodes.add(node.id)
      onNodeStatusChange(node.id, 'skipped')
      continue
    }

    // 스텝 모드: 다음 진행 대기
    if (stepMode && stepSignal) {
      await stepSignal()
      if (abortController.signal.aborted) break
    }

    const nodeType = node.type || ''

    // Running 상태로 변경
    onNodeStatusChange(node.id, 'running')

    try {
      const output = await executeSingleNode(node, edges, enabledNodes, context, onNodeStatusChange)

      // 출력 저장
      context.nodeOutputs[node.id] = output
      onNodeStatusChange(node.id, 'completed', output)

      // 분기 노드인 경우: 비활성 포트의 다운스트림을 스킵 마킹
      if (BRANCH_NODE_TYPES.has(nodeType)) {
        markInactiveBranches(node.id, output, edges, skippedNodes)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      onNodeStatusChange(node.id, 'error', undefined, errorMessage)
      console.error(`[ExecutionEngine] Node ${node.id} (${nodeType}) failed:`, error)
    }
  }

  onComplete?.()
}

// ============================================================
// 분기 비활성 경로 마킹
// ============================================================

/**
 * 분기 노드의 출력에서 undefined인 포트를 찾아,
 * 해당 포트에 연결된 다운스트림 노드를 스킵 대상으로 마킹합니다.
 */
function markInactiveBranches(
  branchNodeId: string,
  output: Record<string, any>,
  edges: Edge[],
  skippedNodes: Set<string>,
): void {
  // 이 분기 노드에서 나가는 엣지들
  const outEdges = edges.filter(e => e.source === branchNodeId)

  for (const edge of outEdges) {
    // sourceHandle이 있고, 해당 출력 포트가 undefined이면
    if (edge.sourceHandle && output[edge.sourceHandle] === undefined) {
      // 다운스트림 전체를 스킵 마킹
      const downstream = getDownstreamNodeIds(edge.target, edges)
      skippedNodes.add(edge.target)
      for (const id of downstream) skippedNodes.add(id)
    }
  }
}

// ============================================================
// 레거시 노드 실행 (마이그레이션 기간 동안 사용)
// ============================================================

async function executeLegacyNode(
  node: Node,
  inputs: Record<string, any>,
  _config: Record<string, any>,
  _context: ExecutionContext,
): Promise<Record<string, any>> {
  const nodeType = node.type || ''
  const label = node.data?.label || ''

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
