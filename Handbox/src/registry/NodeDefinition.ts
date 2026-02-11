/**
 * Node Definition — 노드의 완전한 정의
 *
 * 하나의 NodeDefinition이 노드의 모든 측면을 정의한다:
 * - 메타데이터 (UI 표시용)
 * - 입출력 포트 (연결 호환성)
 * - 설정 스키마 (PropertyPanel 자동 생성)
 * - 실행기 (실제 로직)
 * - 요구사항 (필요한 프로바이더, CLI 등)
 */

import type {
  PortDefinition,
  ConfigField,
  NodeRuntime,
  ExecutionContext,
} from '../engine/types'

// ============================================================
// Node Executor 인터페이스
// ============================================================

/**
 * 노드 실행기.
 * 모든 노드 타입은 이 인터페이스를 구현하는 executor를 가진다.
 */
export interface NodeExecutor {
  /**
   * 노드 실행
   * @param input  — 입력 포트별 데이터 (포트 name → 값)
   * @param config — 노드 설정 (사용자가 PropertyPanel에서 입력한 값)
   * @param context — 실행 컨텍스트 (공유 상태, 프로바이더 접근 등)
   * @returns 출력 포트별 데이터 (포트 name → 값)
   */
  execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext,
  ): Promise<Record<string, any>>
}

// ============================================================
// Node Definition
// ============================================================

export interface NodeDefinitionMeta {
  label: string
  description: string
  icon: string           // MUI icon 이름 (e.g., 'PictureAsPdf')
  color: string          // hex color
  tags: string[]         // 검색용 태그 (한글/영어 모두)
}

export interface NodeRequirements {
  /** 필요한 프로바이더 ID (e.g., 'aws', 'openai') */
  provider?: string
  /** 필요한 CLI 명령어 (e.g., 'aws', 'gcloud') */
  cli?: string
  /** 필요한 스크립트 런타임 (e.g., 'python3', 'node') */
  scriptRuntime?: string
  /** 필요한 MCP 서버 ID */
  mcpServer?: string
}

export interface NodeDefinition {
  /** 고유 타입 식별자 (e.g., 'file.pdf-to-text', 'ai.llm-invoke') */
  type: string
  /** 카테고리 (e.g., '파일 변환', 'AI 모델', '프롬프트') */
  category: string
  /** 하위 카테고리 (선택) */
  subcategory?: string

  /** UI 메타데이터 */
  meta: NodeDefinitionMeta
  /** 입출력 포트 정의 */
  ports: {
    inputs: PortDefinition[]
    outputs: PortDefinition[]
  }
  /** 설정 스키마 (PropertyPanel 자동 생성) */
  configSchema: ConfigField[]
  /** 실행 런타임 */
  runtime: NodeRuntime
  /** 실행기 */
  executor: NodeExecutor
  /** 요구사항 */
  requirements?: NodeRequirements

  /** 미구현 노드 표시 (UI에서 "준비 중" 뱃지) */
  stub?: boolean
  /** 플러그인 출처 (플러그인 시스템에서 로드된 경우) */
  pluginId?: string
}

// ============================================================
// 카테고리 정의
// ============================================================

export interface NodeCategory {
  id: string
  label: string
  icon: string
  description?: string
  order: number
  /** 기본 펼침 상태 */
  defaultExpanded: boolean
}

/** 기본 카테고리 목록 */
export const DEFAULT_CATEGORIES: NodeCategory[] = [
  { id: 'io',          label: '파일 입출력',        icon: 'FolderOpen',    order: 0,  defaultExpanded: true },
  { id: 'convert',     label: '파일 변환',          icon: 'Transform',     order: 1,  defaultExpanded: true },
  { id: 'text',        label: '텍스트 처리',        icon: 'TextFields',    order: 2,  defaultExpanded: true },
  { id: 'prompt',      label: '프롬프트 엔지니어링', icon: 'Edit',          order: 3,  defaultExpanded: true },
  { id: 'ai',          label: 'AI 모델',            icon: 'Psychology',    order: 4,  defaultExpanded: true },
  { id: 'vector',      label: '벡터/검색',          icon: 'Storage',       order: 5,  defaultExpanded: true },
  { id: 'cloud.aws',   label: 'AWS 서비스',         icon: 'Cloud',         order: 6,  defaultExpanded: false },
  { id: 'cloud.gcp',   label: 'GCP 서비스',         icon: 'Cloud',         order: 7,  defaultExpanded: false },
  { id: 'cloud.azure', label: 'Azure 서비스',       icon: 'Cloud',         order: 8,  defaultExpanded: false },
  { id: 'api',         label: 'API 연동',           icon: 'Api',           order: 9,  defaultExpanded: false },
  { id: 'control',     label: '제어 흐름',          icon: 'Hub',           order: 10, defaultExpanded: false },
  { id: 'data',        label: '데이터 변환',        icon: 'DataObject',    order: 11, defaultExpanded: false },
  { id: 'export',      label: '내보내기',           icon: 'Download',      order: 12, defaultExpanded: true },
  { id: 'viz',         label: '시각화',             icon: 'BarChart',      order: 13, defaultExpanded: false },
  { id: 'plugin',      label: '플러그인',           icon: 'Extension',     order: 99, defaultExpanded: false },
]
