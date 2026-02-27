/**
 * WorkflowMigrator - 레거시 워크플로우를 새 도구 체계로 자동 마이그레이션
 *
 * 기능:
 * 1. 레거시 노드 타입 → 새 도구 이름 변환
 * 2. 설정값 마이그레이션
 * 3. 포트 연결 유지
 * 4. 마이그레이션 보고서 생성
 */

import { ToolRegistry } from '../registry/ToolRegistry'
import { LEGACY_ALIASES, migrateLegacyType, isLegacyType } from '../registry/legacyAliases'
import type { WorkflowFile, WorkflowNode, WorkflowEdge } from '../types/WorkflowFile'

export interface MigrationResult {
  success: boolean
  originalVersion: string
  migratedVersion: string
  nodesUpdated: number
  nodesMigrated: { oldType: string; newType: string; nodeId: string }[]
  warnings: string[]
  errors: string[]
}

export interface MigrationOptions {
  /** 레거시 노드를 새 타입으로 변환 */
  migrateNodeTypes?: boolean
  /** 설정값 마이그레이션 */
  migrateConfigs?: boolean
  /** 변환 불가능한 노드 제거 */
  removeUnmappedNodes?: boolean
  /** 상세 로그 */
  verbose?: boolean
}

const DEFAULT_OPTIONS: MigrationOptions = {
  migrateNodeTypes: true,
  migrateConfigs: true,
  removeUnmappedNodes: false,
  verbose: false,
}

/**
 * 노드 설정값 마이그레이션 맵
 * 레거시 설정 키 → 새 설정 키
 */
const CONFIG_MIGRATIONS: Record<string, Record<string, string>> = {
  // io.* → file.*
  'file.read': {
    'filePath': 'path',
    'file_path': 'path',
    'inputPath': 'path',
  },
  'file.write': {
    'filePath': 'path',
    'file_path': 'path',
    'outputPath': 'path',
  },
  // ai.* → llm.*
  'llm.chat': {
    'llm_provider': 'provider',
    'llm_model': 'model',
    'systemPrompt': 'system_prompt',
    'maxTokens': 'max_tokens',
  },
  'llm.embed': {
    'embeddingModel': 'model',
    'embedding_model': 'model',
  },
  // transform.* → text.*, json.*
  'text.split': {
    'splitBy': 'separator',
    'split_by': 'separator',
    'delimiter': 'separator',
  },
  'json.query': {
    'jsonPath': 'path',
    'json_path': 'path',
    'query': 'path',
  },
  // rag.*
  'rag.search': {
    'collectionName': 'collection',
    'collection_name': 'collection',
    'topK': 'top_k',
    'top_k': 'top_k',
  },
  // viz.*
  'viz.table': {
    'maxRows': 'max_rows',
    'max_rows': 'max_rows',
  },
  'viz.chart': {
    'chartType': 'type',
    'chart_type': 'type',
    'xField': 'x_field',
    'yField': 'y_field',
  },
}

/**
 * 워크플로우를 새 도구 체계로 마이그레이션
 */
export function migrateWorkflow(
  workflow: WorkflowFile,
  options: MigrationOptions = {}
): { workflow: WorkflowFile; result: MigrationResult } {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const result: MigrationResult = {
    success: true,
    originalVersion: workflow.version || '1.0.0',
    migratedVersion: '2.0.0',
    nodesUpdated: 0,
    nodesMigrated: [],
    warnings: [],
    errors: [],
  }

  // 워크플로우 복사 (원본 보존)
  const migratedWorkflow: WorkflowFile = JSON.parse(JSON.stringify(workflow))
  const nodesToRemove: string[] = []

  // 노드 마이그레이션
  for (const node of migratedWorkflow.nodes) {
    try {
      const migrationInfo = migrateNode(node, opts, result)

      if (migrationInfo.shouldRemove) {
        nodesToRemove.push(node.id)
      }
    } catch (err: any) {
      result.errors.push(`노드 ${node.id} 마이그레이션 실패: ${err.message}`)
      result.success = false
    }
  }

  // 제거 대상 노드 처리
  if (opts.removeUnmappedNodes && nodesToRemove.length > 0) {
    migratedWorkflow.nodes = migratedWorkflow.nodes.filter(n => !nodesToRemove.includes(n.id))
    // 연결된 엣지도 제거
    migratedWorkflow.edges = migratedWorkflow.edges.filter(
      e => !nodesToRemove.includes(e.source) && !nodesToRemove.includes(e.target)
    )
    result.warnings.push(`${nodesToRemove.length}개 노드가 매핑되지 않아 제거됨`)
  }

  // 버전 업데이트
  migratedWorkflow.version = result.migratedVersion
  // @ts-ignore - meta 확장 (마이그레이션 정보 추가)
  migratedWorkflow.meta = {
    ...migratedWorkflow.meta,
    migratedAt: new Date().toISOString(),
    migratedFrom: result.originalVersion,
  } as any

  if (opts.verbose) {
    console.log('[WorkflowMigrator] 마이그레이션 완료:', result)
  }

  return { workflow: migratedWorkflow, result }
}

/**
 * 단일 노드 마이그레이션
 */
function migrateNode(
  node: WorkflowNode,
  opts: MigrationOptions,
  result: MigrationResult
): { shouldRemove: boolean } {
  const originalType = node.type

  // 1. 노드 타입 마이그레이션
  if (opts.migrateNodeTypes && isLegacyType(originalType)) {
    const newType = migrateLegacyType(originalType)

    // 새 타입이 ToolRegistry에 존재하는지 확인
    const toolDef = ToolRegistry.get(newType)

    if (toolDef) {
      node.type = newType
      result.nodesMigrated.push({
        oldType: originalType,
        newType,
        nodeId: node.id,
      })
      result.nodesUpdated++
    } else {
      // 매핑됐지만 도구가 없는 경우
      result.warnings.push(`노드 ${node.id}: ${originalType} → ${newType} 매핑됨, 하지만 도구가 등록되지 않음`)
      return { shouldRemove: opts.removeUnmappedNodes || false }
    }
  }

  // 2. 설정값 마이그레이션
  if (opts.migrateConfigs && node.data?.config) {
    const configMap = CONFIG_MIGRATIONS[node.type]
    if (configMap) {
      const newConfig: Record<string, any> = {}

      for (const [oldKey, value] of Object.entries(node.data.config)) {
        const newKey = configMap[oldKey] || oldKey
        newConfig[newKey] = value
      }

      node.data.config = newConfig
    }
  }

  // 3. 레이블 업데이트 (선택적)
  if (node.type !== originalType) {
    const toolDef = ToolRegistry.get(node.type)
    if (toolDef && node.data?.label === originalType) {
      node.data.label = toolDef.meta.label
    }
  }

  return { shouldRemove: false }
}

/**
 * 워크플로우가 마이그레이션이 필요한지 확인
 */
export function needsMigration(workflow: WorkflowFile): boolean {
  return workflow.nodes.some(node => isLegacyType(node.type))
}

/**
 * 워크플로우의 마이그레이션 대상 노드 목록 반환
 */
export function getLegacyNodes(workflow: WorkflowFile): { nodeId: string; type: string; suggestedType: string }[] {
  return workflow.nodes
    .filter(node => isLegacyType(node.type))
    .map(node => ({
      nodeId: node.id,
      type: node.type,
      suggestedType: migrateLegacyType(node.type),
    }))
}

/**
 * 마이그레이션 프리뷰 생성 (실제 변경 없이 결과만 확인)
 */
export function previewMigration(workflow: WorkflowFile): MigrationResult {
  const { result } = migrateWorkflow(workflow, { verbose: false })
  return result
}

/**
 * 배치 마이그레이션 - 여러 워크플로우를 한 번에 마이그레이션
 */
export async function batchMigrate(
  workflows: WorkflowFile[],
  options?: MigrationOptions
): Promise<{ migrated: WorkflowFile[]; results: MigrationResult[] }> {
  const migrated: WorkflowFile[] = []
  const results: MigrationResult[] = []

  for (const workflow of workflows) {
    const { workflow: migratedWf, result } = migrateWorkflow(workflow, options)
    migrated.push(migratedWf)
    results.push(result)
  }

  return { migrated, results }
}

// 싱글톤 인스턴스 (선택적)
export const workflowMigrator = {
  migrate: migrateWorkflow,
  needsMigration,
  getLegacyNodes,
  preview: previewMigration,
  batchMigrate,
}

export default workflowMigrator
