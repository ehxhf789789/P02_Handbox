/**
 * WorkflowFile — 표준화된 워크플로우 파일 포맷
 *
 * JSON 직렬화/역직렬화를 위한 타입 정의.
 * 내보내기/가져오기, 서브워크플로우 참조 등에 사용.
 */

// ============================================================
// 워크플로우 파일 포맷
// ============================================================

/** 파일 포맷 버전 */
export const WORKFLOW_FILE_VERSION = '2.0.0'

/** 직렬화된 노드 */
export interface SerializedNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    color?: string
    description?: string
    config: Record<string, any>
    enabled?: boolean
  }
  /** 부모 노드 ID (그룹/서브워크플로우 내부 노드) */
  parentNode?: string
  extent?: 'parent'
}

/** 직렬화된 엣지 */
export interface SerializedEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  animated?: boolean
}

/** 워크플로우 메타데이터 */
export interface WorkflowMeta {
  name: string
  description: string
  author?: string
  tags?: string[]
  category?: string
  /** 생성 시각 (ISO 8601) */
  createdAt: string
  /** 수정 시각 (ISO 8601) */
  updatedAt: string
}

/** 워크플로우 변수 (실행 시 외부에서 주입 가능) */
export interface WorkflowVariable {
  key: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'json'
  default?: any
  description?: string
}

/** 전체 워크플로우 파일 */
export interface WorkflowFile {
  /** 파일 포맷 버전 */
  version: string
  /** 워크플로우 고유 ID */
  id: string
  /** 메타데이터 */
  meta: WorkflowMeta
  /** 노드 목록 */
  nodes: SerializedNode[]
  /** 엣지 목록 */
  edges: SerializedEdge[]
  /** 워크플로우 변수 정의 (외부 주입용) */
  variables?: WorkflowVariable[]
  /** 서브워크플로우 참조 (인라인 포함 시) */
  subWorkflows?: Record<string, WorkflowFile>
}

// ============================================================
// 서브워크플로우 설정
// ============================================================

/** 서브워크플로우 노드에서 사용하는 설정 */
export interface SubWorkflowConfig {
  /** 참조 방식 */
  source: 'saved' | 'file' | 'inline'
  /** 저장된 워크플로우 ID (source='saved') */
  workflowId?: string
  /** 파일 경로 (source='file') */
  filePath?: string
  /** 인라인 워크플로우 데이터 (source='inline') */
  inlineWorkflow?: WorkflowFile
  /** 입력 매핑: 외부 입력 포트 → 서브워크플로우 시작 노드 */
  inputMapping?: Record<string, string>
  /** 출력 매핑: 서브워크플로우 종료 노드 → 외부 출력 포트 */
  outputMapping?: Record<string, string>
  /** 변수 오버라이드 */
  variableOverrides?: Record<string, any>
}
