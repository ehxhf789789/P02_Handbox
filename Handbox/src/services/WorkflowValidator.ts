/**
 * 워크플로우 검증 및 자동 수정 서비스
 *
 * 타입 호환성 검증, 필수 설정 자동 완성, 자동 변환 노드 삽입을 담당합니다.
 */

import { NodeRegistry } from '../registry/NodeRegistry'
import { ToolRegistry } from '../registry/ToolRegistry'
import type { NodeDefinition } from '../registry/NodeDefinition'
import type { UnifiedToolDefinition } from '../registry/UnifiedToolDefinition'
import type { ConfigField, PortDefinition } from '../engine/types'
import { areTypesCompatible } from '../utils/nodeDescriptionGenerator'

// ============================================================
// 통합 정의 조회 헬퍼
// ============================================================

interface NormalizedDefinition {
  type: string
  category: string
  label: string
  description: string
  ports: { inputs: PortDefinition[]; outputs: PortDefinition[] }
  configSchema: ConfigField[]
}

/**
 * ToolRegistry 또는 NodeRegistry에서 정의를 조회합니다.
 * ToolRegistry를 우선 조회하고, 없으면 NodeRegistry에서 조회합니다.
 */
function getDefinition(type: string): NormalizedDefinition | undefined {
  // 1. ToolRegistry에서 조회
  const toolDef = ToolRegistry.get(type)
  if (toolDef) {
    return {
      type: toolDef.name,
      category: toolDef.meta.category,
      label: toolDef.meta.label,
      description: toolDef.description,
      ports: toolDef.ports as any,
      configSchema: (toolDef.configSchema || []) as ConfigField[],
    }
  }

  // 2. NodeRegistry에서 조회 (레거시 호환)
  const nodeDef = NodeRegistry.get(type)
  if (nodeDef) {
    return {
      type: nodeDef.type,
      category: nodeDef.category,
      label: nodeDef.meta.label,
      description: nodeDef.meta.description,
      ports: nodeDef.ports,
      configSchema: nodeDef.configSchema,
    }
  }

  return undefined
}

// ============================================================
// 타입 정의
// ============================================================

export interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    config: Record<string, any>
    [key: string]: any
  }
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface ValidationIssue {
  type: 'error' | 'warning' | 'info'
  nodeId?: string
  edgeId?: string
  message: string
  autoFixable: boolean
  fix?: () => void
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  fixedNodes: WorkflowNode[]
  fixedEdges: WorkflowEdge[]
  insertedNodes: WorkflowNode[]
}

// ============================================================
// 타입 변환 매트릭스
// ============================================================

const TYPE_CONVERTERS: Record<string, Record<string, string | null>> = {
  // source type → target type → converter node type (null = 직접 호환)
  'json': {
    'text': 'transform.json-stringify',
    'table-data': 'transform.json-query',
    'file-ref': null,  // JSON에서 경로 추출 가능
    'evaluation-result[]': null,  // 구조 호환
    'decision': null,  // 구조 호환
  },
  'text': {
    'json': 'transform.json-parse',
    'text[]': 'transform.text-split',
    'chunk[]': 'transform.text-split',
  },
  'csv': {
    'json': 'transform.csv-parse',
    'table-data': 'transform.csv-parse',
  },
  'table-data': {
    'text': 'transform.csv-stringify',
    'xlsx': 'export.xlsx',
  },
  'llm-response': {
    'text': null,  // 직접 호환
    'json': 'transform.json-parse',
  },
  'ml-result': {
    'json': null,  // 직접 호환
    'table-data': 'transform.json-query',
    'text': 'transform.json-stringify',
  },
  'analysis': {
    'text': null,  // 직접 호환
    'json': 'transform.json-parse',
  },
  'image': {
    'text': 'vision.ocr-advanced',
    'analysis': 'vision.analyze',
    'json': 'vision.extract',
  },
  // 평가/투표 관련 타입
  'agent-output': {
    'json': null,  // 직접 호환
    'text': 'transform.json-stringify',
    'evaluation-result[]': null,  // 구조 호환
  },
  'evaluation-result': {
    'json': null,  // 직접 호환
    'text': 'transform.json-stringify',
  },
  'evaluation-result[]': {
    'json': null,  // 직접 호환
    'text': 'transform.json-stringify',
    'agent-output': null,  // 구조 호환
  },
  'voting-result': {
    'json': null,  // 직접 호환
    'text': 'transform.json-stringify',
    'decision': null,  // 구조 호환
  },
  'decision': {
    'text': null,  // 직접 호환 (decision은 text 기반)
    'json': null,  // 구조 호환
  },
}

// ============================================================
// 기본값 사전
// ============================================================

const DEFAULT_VALUES: Record<string, Record<string, any>> = {
  'io.file-read': {
    path: '/path/to/file',
    encoding: 'utf-8',
  },
  'io.file-write': {
    path: '/path/to/output',
    encoding: 'utf-8',
  },
  'llm.chat': {
    model: 'claude-3-sonnet',
    temperature: 0.7,
    max_tokens: 2000,
    system_prompt: '당신은 도움이 되는 AI 어시스턴트입니다.',
  },
  'llm.embed': {
    model: 'text-embedding-3-small',
  },
  'llm.structured': {
    model: 'claude-3-sonnet',
    json_schema: '{}',
  },
  'vision.analyze': {
    model: 'claude-3-opus-vision',
    detail_level: 'auto',
  },
  'vision.ocr-advanced': {
    language: 'ko',
    preserve_layout: true,
  },
  'ml.classify': {
    algorithm: 'random_forest',
    test_split: 0.2,
  },
  'ml.cluster': {
    algorithm: 'kmeans',
    n_clusters: 3,
  },
  'ml.regression': {
    algorithm: 'linear',
    test_split: 0.2,
  },
  'agent.react': {
    max_iterations: 5,
    tools: [],
  },
  'agent.multi': {
    mode: 'sequential',
    agents: [],
  },
  'export.docx': {
    template: null,
  },
  'export.pptx': {
    template: null,
  },
  'export.pdf': {
    title: '보고서',
  },
  'export.xlsx': {
    sheet_name: 'Sheet1',
  },
  'viz.chart': {
    type: 'bar',
    title: '차트',
  },
  'viz.table': {
    title: '테이블',
  },
  'transform.text-split': {
    chunk_size: 1000,
    overlap: 100,
  },
  'transform.json-query': {
    query: '$',
  },
  'control.if': {
    condition: 'true',
  },
  'control.forEach': {
    variable: 'item',
  },
}

// ============================================================
// 타입 호환성 검증
// ============================================================

export function validateTypeCompatibility(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)

    if (!sourceNode || !targetNode) {
      issues.push({
        type: 'error',
        edgeId: edge.id,
        message: `연결 오류: 존재하지 않는 노드 (${edge.source} → ${edge.target})`,
        autoFixable: true,
      })
      continue
    }

    const sourceDef = getDefinition(sourceNode.type)
    const targetDef = getDefinition(targetNode.type)

    if (!sourceDef || !targetDef) {
      issues.push({
        type: 'error',
        edgeId: edge.id,
        message: `알 수 없는 노드 타입: ${!sourceDef ? sourceNode.type : targetNode.type}`,
        autoFixable: false,
      })
      continue
    }

    // 포트 타입 검사
    const sourcePort = edge.sourceHandle
      ? sourceDef.ports.outputs.find(p => p.name === edge.sourceHandle)
      : sourceDef.ports.outputs[0]

    const targetPort = edge.targetHandle
      ? targetDef.ports.inputs.find(p => p.name === edge.targetHandle)
      : targetDef.ports.inputs[0]

    if (!sourcePort || !targetPort) {
      issues.push({
        type: 'warning',
        edgeId: edge.id,
        message: `포트를 찾을 수 없음: ${edge.source}[${edge.sourceHandle}] → ${edge.target}[${edge.targetHandle}]`,
        autoFixable: false,
      })
      continue
    }

    if (!areTypesCompatible(sourcePort.type, targetPort.type)) {
      // 변환 가능한지 확인
      const converter = TYPE_CONVERTERS[sourcePort.type]?.[targetPort.type]

      issues.push({
        type: 'error',
        edgeId: edge.id,
        message: `타입 불일치: ${sourcePort.type} → ${targetPort.type}${converter ? ' (자동 변환 가능)' : ''}`,
        autoFixable: !!converter,
      })
    }
  }

  return issues
}

// ============================================================
// 필수 설정 검증 및 자동 완성
// ============================================================

export function validateAndCompleteConfig(nodes: WorkflowNode[]): {
  issues: ValidationIssue[]
  fixedNodes: WorkflowNode[]
} {
  const issues: ValidationIssue[] = []
  const fixedNodes: WorkflowNode[] = []

  for (const node of nodes) {
    const def = getDefinition(node.type)
    if (!def) continue

    let needsFix = false
    const fixedConfig = { ...node.data.config }

    for (const field of def.configSchema) {
      if (field.required && (fixedConfig[field.key] === undefined || fixedConfig[field.key] === '')) {
        // 기본값 찾기
        const defaultValue = DEFAULT_VALUES[node.type]?.[field.key] ?? field.default

        if (defaultValue !== undefined) {
          fixedConfig[field.key] = defaultValue
          needsFix = true
          issues.push({
            type: 'warning',
            nodeId: node.id,
            message: `필수 설정 자동 완성: ${field.key} = ${JSON.stringify(defaultValue)}`,
            autoFixable: true,
          })
        } else {
          issues.push({
            type: 'error',
            nodeId: node.id,
            message: `필수 설정 누락: ${field.key} (기본값 없음)`,
            autoFixable: false,
          })
        }
      }
    }

    if (needsFix) {
      fixedNodes.push({
        ...node,
        data: {
          ...node.data,
          config: fixedConfig,
        },
      })
    } else {
      fixedNodes.push(node)
    }
  }

  return { issues, fixedNodes }
}

// ============================================================
// 자동 변환 노드 삽입
// ============================================================

export function insertTypeConverters(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  insertedNodes: WorkflowNode[]
} {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const newNodes: WorkflowNode[] = [...nodes]
  const newEdges: WorkflowEdge[] = []
  const insertedNodes: WorkflowNode[] = []

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)

    if (!sourceNode || !targetNode) {
      newEdges.push(edge)
      continue
    }

    const sourceDef = getDefinition(sourceNode.type)
    const targetDef = getDefinition(targetNode.type)

    if (!sourceDef || !targetDef) {
      newEdges.push(edge)
      continue
    }

    const sourceType = sourceDef.ports.outputs[0]?.type || 'any'
    const targetType = targetDef.ports.inputs[0]?.type || 'any'

    if (!areTypesCompatible(sourceType, targetType)) {
      const converterType = TYPE_CONVERTERS[sourceType]?.[targetType]

      if (converterType) {
        // 변환 노드 생성
        const converterId = `converter_${edge.source}_${edge.target}_${Date.now()}`
        const converterNode: WorkflowNode = {
          id: converterId,
          type: converterType,
          position: {
            x: (sourceNode.position.x + targetNode.position.x) / 2,
            y: (sourceNode.position.y + targetNode.position.y) / 2,
          },
          data: {
            label: `${sourceType} → ${targetType}`,
            config: DEFAULT_VALUES[converterType] || {},
          },
        }

        newNodes.push(converterNode)
        insertedNodes.push(converterNode)
        nodeMap.set(converterId, converterNode)

        // 엣지 분할
        newEdges.push({
          id: `${edge.id}_1`,
          source: edge.source,
          target: converterId,
          sourceHandle: edge.sourceHandle,
        })
        newEdges.push({
          id: `${edge.id}_2`,
          source: converterId,
          target: edge.target,
          targetHandle: edge.targetHandle,
        })
      } else {
        // 변환 불가능 - 원본 엣지 유지
        newEdges.push(edge)
      }
    } else {
      newEdges.push(edge)
    }
  }

  return { nodes: newNodes, edges: newEdges, insertedNodes }
}

// ============================================================
// 필수 입력 포트 연결 검증 및 자동 수정
// ============================================================

/**
 * 필수 입력 포트가 연결되어 있는지 검증
 */
export function validateRequiredInputs(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // 각 노드의 incoming edges 계산
  const incomingEdgesMap = new Map<string, WorkflowEdge[]>()
  for (const edge of edges) {
    if (!incomingEdgesMap.has(edge.target)) {
      incomingEdgesMap.set(edge.target, [])
    }
    incomingEdgesMap.get(edge.target)!.push(edge)
  }

  for (const node of nodes) {
    const def = getDefinition(node.type)
    if (!def) continue

    // 필수 입력 포트 확인
    const requiredInputs = def.ports.inputs.filter(p => p.required)
    if (requiredInputs.length === 0) continue

    // 이 노드로 들어오는 엣지 확인
    const incomingEdges = incomingEdgesMap.get(node.id) || []

    if (incomingEdges.length === 0) {
      issues.push({
        type: 'error',
        nodeId: node.id,
        message: `필수 입력 포트에 연결된 엣지 없음: ${node.type} (필수: ${requiredInputs.map(p => p.name).join(', ')})`,
        autoFixable: true,  // 소스 노드 자동 추가 가능
      })
    } else {
      // 각 필수 포트에 연결이 있는지 확인 (핸들 기반)
      for (const reqPort of requiredInputs) {
        const hasConnection = incomingEdges.some(e =>
          !e.targetHandle || e.targetHandle === reqPort.name
        )
        if (!hasConnection) {
          issues.push({
            type: 'warning',
            nodeId: node.id,
            message: `필수 포트 '${reqPort.name}'에 명시적 연결 없음 (기본 연결 사용 가능)`,
            autoFixable: false,
          })
        }
      }
    }
  }

  return issues
}

/**
 * 필수 입력이 없는 노드에 소스 노드 자동 추가
 */
export function fixRequiredInputs(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  insertedNodes: WorkflowNode[]
} {
  const newNodes = [...nodes]
  const newEdges = [...edges]
  const insertedNodes: WorkflowNode[] = []

  // 각 노드의 incoming edges 계산
  const incomingEdgesMap = new Map<string, WorkflowEdge[]>()
  for (const edge of edges) {
    if (!incomingEdgesMap.has(edge.target)) {
      incomingEdgesMap.set(edge.target, [])
    }
    incomingEdgesMap.get(edge.target)!.push(edge)
  }

  // 소스 노드 타입 매핑 (입력 타입에 따라)
  const SOURCE_NODE_MAP: Record<string, string> = {
    'file-ref': 'io.local-file',
    'file-ref[]': 'io.local-folder',
    'text': 'io.local-file',
    'json': 'data.file-loader',
    'any': 'io.local-file',
  }

  for (const node of nodes) {
    const def = getDefinition(node.type)
    if (!def) continue

    const requiredInputs = def.ports.inputs.filter(p => p.required)
    if (requiredInputs.length === 0) continue

    const incomingEdges = incomingEdgesMap.get(node.id) || []
    if (incomingEdges.length > 0) continue  // 이미 연결됨

    // 첫 번째 필수 입력 타입에 맞는 소스 노드 추가
    const firstRequired = requiredInputs[0]
    const sourceType = SOURCE_NODE_MAP[firstRequired.type] || 'io.local-file'

    const sourceId = `auto_source_${node.id}_${Date.now()}`
    const sourceNode: WorkflowNode = {
      id: sourceId,
      type: sourceType,
      position: {
        x: node.position.x - 250,
        y: node.position.y,
      },
      data: {
        label: `자동 추가: ${sourceType.split('.')[1]}`,
        config: DEFAULT_VALUES[sourceType] || {},
      },
    }

    newNodes.push(sourceNode)
    insertedNodes.push(sourceNode)

    // 연결 생성
    newEdges.push({
      id: `auto_edge_${sourceId}_${node.id}`,
      source: sourceId,
      target: node.id,
      targetHandle: firstRequired.name,
    })

    console.log(`[WorkflowValidator] 자동 소스 노드 추가: ${sourceType} → ${node.type}`)
  }

  return { nodes: newNodes, edges: newEdges, insertedNodes }
}

// ============================================================
// DAG 검증 (사이클 감지)
// ============================================================

export function validateDAG(nodes: WorkflowNode[], edges: WorkflowEdge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const nodeIds = new Set(nodes.map(n => n.id))

  // 인접 리스트 생성
  const adj = new Map<string, string[]>()
  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, [])
    adj.get(edge.source)!.push(edge.target)
  }

  // DFS로 사이클 감지
  const visited = new Map<string, number>() // 0: unvisited, 1: visiting, 2: visited

  function dfs(nodeId: string, path: string[]): boolean {
    visited.set(nodeId, 1)

    for (const neighbor of adj.get(nodeId) || []) {
      const state = visited.get(neighbor) ?? 0
      if (state === 1) {
        // 사이클 발견
        const cycleStart = path.indexOf(neighbor)
        const cycle = path.slice(cycleStart).concat(neighbor)
        issues.push({
          type: 'error',
          message: `순환 참조 감지: ${cycle.join(' → ')}`,
          autoFixable: false,
        })
        return true
      }
      if (state === 0 && dfs(neighbor, [...path, neighbor])) {
        return true
      }
    }

    visited.set(nodeId, 2)
    return false
  }

  for (const nodeId of nodeIds) {
    if ((visited.get(nodeId) ?? 0) === 0) {
      dfs(nodeId, [nodeId])
    }
  }

  return issues
}

// ============================================================
// 메인 검증 함수
// ============================================================

export function validateWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  autoFix: boolean = true
): ValidationResult {
  let currentNodes = [...nodes]
  let currentEdges = [...edges]
  const allIssues: ValidationIssue[] = []
  let insertedNodes: WorkflowNode[] = []

  // 1. 필수 설정 검증 및 자동 완성
  if (autoFix) {
    const configResult = validateAndCompleteConfig(currentNodes)
    allIssues.push(...configResult.issues)
    currentNodes = configResult.fixedNodes
  } else {
    const configResult = validateAndCompleteConfig(currentNodes)
    allIssues.push(...configResult.issues)
  }

  // 2. 필수 입력 포트 연결 검증 및 자동 수정
  const inputIssues = validateRequiredInputs(currentNodes, currentEdges)
  allIssues.push(...inputIssues)

  if (autoFix && inputIssues.some(i => i.type === 'error' && i.autoFixable)) {
    const inputFixResult = fixRequiredInputs(currentNodes, currentEdges)
    currentNodes = inputFixResult.nodes
    currentEdges = inputFixResult.edges
    insertedNodes.push(...inputFixResult.insertedNodes)
  }

  // 3. 타입 호환성 검증
  const typeIssues = validateTypeCompatibility(currentNodes, currentEdges)
  allIssues.push(...typeIssues)

  // 4. 자동 변환 노드 삽입 (타입 불일치가 있고 autoFix가 true인 경우)
  if (autoFix && typeIssues.some(i => i.type === 'error' && i.autoFixable)) {
    const converterResult = insertTypeConverters(currentNodes, currentEdges)
    currentNodes = converterResult.nodes
    currentEdges = converterResult.edges
    insertedNodes.push(...converterResult.insertedNodes)
  }

  // 5. DAG 검증
  const dagIssues = validateDAG(currentNodes, currentEdges)
  allIssues.push(...dagIssues)

  // 유효성 판단
  const hasErrors = allIssues.some(i => i.type === 'error' && !i.autoFixable)

  return {
    valid: !hasErrors,
    issues: allIssues,
    fixedNodes: currentNodes,
    fixedEdges: currentEdges,
    insertedNodes,
  }
}

// ============================================================
// 검증 결과 요약 생성
// ============================================================

export function generateValidationSummary(result: ValidationResult): string {
  const errors = result.issues.filter(i => i.type === 'error')
  const warnings = result.issues.filter(i => i.type === 'warning')

  let summary = `## 워크플로우 검증 결과\n\n`
  summary += `- 상태: ${result.valid ? '✅ 유효' : '❌ 오류 있음'}\n`
  summary += `- 오류: ${errors.length}개\n`
  summary += `- 경고: ${warnings.length}개\n`
  summary += `- 자동 수정: ${result.insertedNodes.length}개 노드 추가\n\n`

  if (errors.length > 0) {
    summary += `### 오류\n`
    for (const error of errors) {
      summary += `- ❌ ${error.message}\n`
    }
    summary += '\n'
  }

  if (warnings.length > 0) {
    summary += `### 경고 (자동 수정됨)\n`
    for (const warning of warnings) {
      summary += `- ⚠️ ${warning.message}\n`
    }
    summary += '\n'
  }

  if (result.insertedNodes.length > 0) {
    summary += `### 추가된 변환 노드\n`
    for (const node of result.insertedNodes) {
      summary += `- 🔄 ${node.type}: ${node.data.label}\n`
    }
  }

  return summary
}
