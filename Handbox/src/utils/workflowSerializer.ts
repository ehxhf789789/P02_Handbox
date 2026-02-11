/**
 * Workflow Serializer — 워크플로우 직렬화/역직렬화 유틸리티
 *
 * ReactFlow 노드/엣지 ←→ WorkflowFile 변환,
 * 유효성 검증, 버전 마이그레이션을 담당.
 */

import type { Node, Edge } from 'reactflow'
import type {
  WorkflowFile,
  SerializedNode,
  SerializedEdge,
  WorkflowMeta,
} from '../types/WorkflowFile'
import { WORKFLOW_FILE_VERSION } from '../types/WorkflowFile'

// ============================================================
// 직렬화 (ReactFlow → WorkflowFile)
// ============================================================

export interface SerializeOptions {
  name: string
  description?: string
  id?: string
  author?: string
  tags?: string[]
  category?: string
}

/**
 * ReactFlow 노드/엣지를 WorkflowFile로 직렬화
 */
export function serializeWorkflow(
  nodes: Node[],
  edges: Edge[],
  options: SerializeOptions,
): WorkflowFile {
  const now = new Date().toISOString()

  const serializedNodes: SerializedNode[] = nodes.map(n => ({
    id: n.id,
    type: n.type || 'unknown',
    position: { x: n.position.x, y: n.position.y },
    data: {
      label: n.data?.label || '',
      color: n.data?.color,
      description: n.data?.description,
      config: n.data?.config || {},
      enabled: n.data?.enabled,
    },
    ...(n.parentNode ? { parentNode: n.parentNode, extent: 'parent' as const } : {}),
  }))

  const serializedEdges: SerializedEdge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || null,
    targetHandle: e.targetHandle || null,
    animated: e.animated,
  }))

  const meta: WorkflowMeta = {
    name: options.name,
    description: options.description || '',
    author: options.author,
    tags: options.tags,
    category: options.category,
    createdAt: now,
    updatedAt: now,
  }

  return {
    version: WORKFLOW_FILE_VERSION,
    id: options.id || `workflow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    meta,
    nodes: serializedNodes,
    edges: serializedEdges,
  }
}

// ============================================================
// 역직렬화 (WorkflowFile → ReactFlow)
// ============================================================

export interface DeserializeResult {
  nodes: Node[]
  edges: Edge[]
  meta: WorkflowMeta
  id: string
}

/**
 * WorkflowFile을 ReactFlow 노드/엣지로 역직렬화
 */
export function deserializeWorkflow(workflow: WorkflowFile): DeserializeResult {
  const nodes: Node[] = workflow.nodes.map(n => ({
    id: n.id,
    type: n.type,
    position: { x: n.position.x, y: n.position.y },
    data: {
      label: n.data.label,
      color: n.data.color || '#64748b',
      description: n.data.description,
      config: n.data.config || {},
      enabled: n.data.enabled ?? true,
    },
    ...(n.parentNode ? { parentNode: n.parentNode, extent: 'parent' as const } : {}),
  }))

  const edges: Edge[] = workflow.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || undefined,
    targetHandle: e.targetHandle || undefined,
    animated: e.animated ?? true,
    style: { stroke: '#10b981', strokeWidth: 2 },
  }))

  return {
    nodes,
    edges,
    meta: workflow.meta,
    id: workflow.id,
  }
}

// ============================================================
// 유효성 검증
// ============================================================

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * WorkflowFile의 유효성 검증
 */
export function validateWorkflowFile(data: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['유효한 JSON 객체가 아닙니다'], warnings }
  }

  const wf = data as Record<string, any>

  // 필수 필드 검증
  if (!wf.nodes || !Array.isArray(wf.nodes)) {
    errors.push('nodes 배열이 없습니다')
  }
  if (!wf.edges || !Array.isArray(wf.edges)) {
    errors.push('edges 배열이 없습니다')
  }

  // 버전 확인
  if (!wf.version) {
    warnings.push('version 필드가 없습니다. v1 포맷으로 간주합니다.')
  }

  // 노드 검증
  if (Array.isArray(wf.nodes)) {
    const nodeIds = new Set<string>()
    for (let i = 0; i < wf.nodes.length; i++) {
      const n = wf.nodes[i]
      if (!n.id) errors.push(`노드[${i}]: id가 없습니다`)
      if (!n.type && !n.node_type) warnings.push(`노드[${i}]: type이 없습니다`)
      if (!n.position) errors.push(`노드[${i}]: position이 없습니다`)
      if (n.id && nodeIds.has(n.id)) errors.push(`노드[${i}]: 중복 ID "${n.id}"`)
      if (n.id) nodeIds.add(n.id)
    }

    // 엣지 검증 (노드 ID 참조 확인)
    if (Array.isArray(wf.edges)) {
      for (let i = 0; i < wf.edges.length; i++) {
        const e = wf.edges[i]
        if (!e.source) errors.push(`엣지[${i}]: source가 없습니다`)
        if (!e.target) errors.push(`엣지[${i}]: target가 없습니다`)
        if (e.source && !nodeIds.has(e.source)) {
          warnings.push(`엣지[${i}]: source "${e.source}"가 노드 목록에 없습니다`)
        }
        if (e.target && !nodeIds.has(e.target)) {
          warnings.push(`엣지[${i}]: target "${e.target}"가 노드 목록에 없습니다`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ============================================================
// 레거시 포맷 변환 (v1 → v2)
// ============================================================

/**
 * 레거시 JSON 포맷(v1)을 WorkflowFile(v2)로 변환.
 * v1 포맷: { name, description, nodes: [{ node_type, ... }], edges }
 */
export function migrateV1ToV2(data: Record<string, any>): WorkflowFile {
  const now = new Date().toISOString()

  const nodes: SerializedNode[] = (data.nodes || []).map((n: any) => ({
    id: n.id,
    type: n.type || n.node_type || 'unknown',
    position: n.position || { x: 0, y: 0 },
    data: n.data || {
      label: n.label || '',
      config: {},
    },
  }))

  const edges: SerializedEdge[] = (data.edges || []).map((e: any) => ({
    id: e.id || `edge_${e.source}_${e.target}`,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || e.source_handle || null,
    targetHandle: e.targetHandle || e.target_handle || null,
    animated: e.animated,
  }))

  return {
    version: WORKFLOW_FILE_VERSION,
    id: data.id || `migrated_${Date.now()}`,
    meta: {
      name: data.name || 'Untitled Workflow',
      description: data.description || '',
      createdAt: data.created_at || now,
      updatedAt: data.updated_at || now,
    },
    nodes,
    edges,
  }
}

// ============================================================
// 파일 파싱 (자동 버전 감지)
// ============================================================

/**
 * JSON 문자열을 파싱하여 WorkflowFile로 변환.
 * v1/v2 포맷 자동 감지.
 */
export function parseWorkflowJSON(jsonString: string): {
  workflow: WorkflowFile
  validation: ValidationResult
} {
  const data = JSON.parse(jsonString)

  // 유효성 검증
  const validation = validateWorkflowFile(data)

  // 버전 감지 및 변환
  let workflow: WorkflowFile
  if (data.version && data.meta) {
    // v2 포맷
    workflow = data as WorkflowFile
  } else {
    // v1 포맷 → 마이그레이션
    workflow = migrateV1ToV2(data)
  }

  return { workflow, validation }
}

// ============================================================
// 내보내기 헬퍼
// ============================================================

/**
 * WorkflowFile을 정리된 JSON 문자열로 변환
 */
export function stringifyWorkflow(workflow: WorkflowFile): string {
  return JSON.stringify(workflow, null, 2)
}

/**
 * WorkflowFile을 Blob으로 변환 (다운로드용)
 */
export function workflowToBlob(workflow: WorkflowFile): Blob {
  return new Blob([stringifyWorkflow(workflow)], { type: 'application/json' })
}

/**
 * 브라우저 다운로드 트리거
 */
export function downloadWorkflow(workflow: WorkflowFile, filename?: string): void {
  const name = filename || `${workflow.meta.name || 'workflow'}.json`
  const blob = workflowToBlob(workflow)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
