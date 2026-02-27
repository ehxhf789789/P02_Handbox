/**
 * Unified Tool Definition
 *
 * MCP 호환 + 워크플로우 노드 통합 스키마.
 * 모든 도구는 이 인터페이스를 구현하여 단일 시스템으로 관리됩니다.
 *
 * Claude Code 스타일의 원자화된 도구 네이밍:
 * - file.read, file.write, file.delete
 * - text.split, text.join, text.trim
 * - json.parse, json.query, json.set
 */

import type { JSONSchema7 } from 'json-schema'

// ============================================================
// Port Types (워크플로우 연결용)
// ============================================================

/** 포트 데이터 타입 */
export type PortType =
  | 'text'           // 텍스트
  | 'text[]'         // 텍스트 배열
  | 'number'         // 숫자
  | 'boolean'        // 불리언
  | 'json'           // JSON 객체/배열
  | 'file'           // 파일 참조 (경로)
  | 'file-ref'       // 파일 참조 (별칭)
  | 'file-ref[]'     // 파일 참조 배열
  | 'image'          // 이미지 (base64 또는 경로)
  | 'image[]'        // 이미지 배열
  | 'vector'         // 임베딩 벡터
  | 'vector[]'       // 임베딩 벡터 배열
  | 'table'          // 테이블 데이터
  | 'chart'          // 차트 데이터
  | 'llm-response'   // LLM 응답
  | 'chunk[]'        // 텍스트 청크 배열
  | 'search-result'  // 검색 결과
  | 'search-result[]'// 검색 결과 배열
  | 'agent-output'   // 에이전트 출력
  | 'plan'           // 계획
  | 'document'       // 문서
  | 'any'            // 모든 타입

/** 포트 정의 */
export interface PortDefinition {
  /** 포트 이름 */
  name: string
  /** 포트 타입 */
  type: PortType
  /** 필수 여부 */
  required: boolean
  /** 포트 설명 */
  description?: string
  /** 상세 JSON Schema (선택) */
  schema?: JSONSchema7
  /** 기본값 */
  default?: unknown
}

// ============================================================
// Tool Metadata
// ============================================================

/** 도구 UI 메타데이터 */
export interface ToolMeta {
  /** 사용자에게 표시되는 라벨 */
  label: string
  /** 상세 설명 (선택 - 없으면 최상위 description 사용) */
  description?: string
  /** Material Icon 이름 */
  icon: string
  /** 노드 색상 (hex) */
  color: string
  /** 카테고리 ID */
  category: ToolCategory
  /** 검색용 태그 (한글/영어) */
  tags: string[]
}

/** 도구 카테고리 */
export type ToolCategory =
  | 'file'
  | 'text'
  | 'json'
  | 'csv'
  | 'xml'
  | 'http'
  | 'storage'
  | 'doc'
  | 'llm'
  | 'prompt'
  | 'rag'
  | 'vision'
  | 'agent'
  | 'control'
  | 'variable'
  | 'viz'
  | 'export'

/** 카테고리 정의 */
export interface CategoryDefinition {
  id: ToolCategory
  label: string
  icon: string
  color: string
  order: number
  description?: string
}

// ============================================================
// Tool Execution
// ============================================================

/** 실행 컨텍스트 */
export interface ToolExecutionContext {
  /** 실행 ID */
  executionId: string
  /** 워크플로우 ID (있으면) */
  workflowId?: string
  /** 세션 ID */
  sessionId?: string
  /** 변수 저장소 */
  variables: Map<string, unknown>
  /** XAI 추적 활성화 */
  xaiEnabled: boolean
  /** 프로바이더 접근 */
  getProvider?: (id: string) => unknown
}

/** 도구 실행 결과 (MCP 호환) */
export interface ToolResult {
  /** 성공 여부 */
  success: boolean
  /** 출력 데이터 (포트명 → 값) */
  outputs: Record<string, unknown>
  /** 에러 메시지 (실패 시) */
  error?: string
  /** 메타데이터 */
  metadata?: {
    executionTime: number
    tokensUsed?: number
    xaiTrace?: string
  }
}

/**
 * 도구 실행 결과 - 유연한 형식
 * ToolResult 형식 또는 직접 데이터 반환 모두 허용
 */
export type FlexibleToolResult = ToolResult | Record<string, unknown>

/** 도구 실행기 인터페이스 */
export interface ToolExecutor {
  /**
   * 도구 실행
   * @param inputs - 입력 데이터 (포트명 → 값)
   * @param config - 도구 설정
   * @param context - 실행 컨텍스트
   * @returns ToolResult 형식 또는 직접 outputs 데이터
   */
  execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<FlexibleToolResult>
}

/**
 * FlexibleToolResult를 ToolResult로 정규화
 */
export function normalizeToolResult(result: FlexibleToolResult): ToolResult {
  // 이미 ToolResult 형식인 경우
  if ('success' in result && 'outputs' in result) {
    return result as ToolResult
  }

  // 직접 데이터 반환인 경우 - ToolResult로 래핑
  return {
    success: true,
    outputs: result as Record<string, unknown>,
  }
}

// ============================================================
// Tool Requirements
// ============================================================

/** 도구 요구사항 */
export interface ToolRequirements {
  /** 필요한 프로바이더 ID (e.g., 'aws', 'openai') */
  providers?: string[]
  /** 필요한 권한 */
  permissions?: string[]
  /** 최소 버전 */
  minVersion?: string
  /** Tauri 명령어 (있으면) */
  tauriCommand?: string
}

/** 도구 플래그 */
export interface ToolFlags {
  /** 실험적 기능 */
  experimental?: boolean
  /** 더 이상 사용하지 않음 */
  deprecated?: boolean
  /** UI에서 숨김 */
  hidden?: boolean
  /** 스텁 (미구현) */
  stub?: boolean
}

// ============================================================
// Unified Tool Definition
// ============================================================

/**
 * 통합 도구 정의
 *
 * MCP Tool + NodeDefinition + Executor 통합
 */
export interface UnifiedToolDefinition {
  // === 식별자 ===
  /** 도구 이름 (e.g., 'file.read', 'json.parse') */
  name: string
  /** 버전 */
  version: string

  // === MCP 호환 ===
  /** 도구 설명 */
  description: string
  /** 입력 스키마 (JSON Schema 7) */
  inputSchema: JSONSchema7

  // === UI 메타데이터 ===
  meta: ToolMeta

  // === 워크플로우 연결 ===
  ports: {
    inputs: PortDefinition[]
    outputs: PortDefinition[]
  }

  // === 설정 스키마 (PropertyPanel용) ===
  configSchema?: ConfigField[]

  // === 실행 ===
  /** 런타임 환경 */
  runtime: 'tauri' | 'internal' | 'wasm' | 'mcp-server'
  /** 실행기 */
  executor: ToolExecutor

  // === 요구사항 ===
  requirements?: ToolRequirements

  // === 플래그 ===
  flags?: ToolFlags
}

/** 설정 필드 정의 */
export interface ConfigField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'slider' | 'toggle' | 'select' | 'code' | 'file' | 'folder' | 'provider' | 'model'
  required?: boolean
  default?: unknown
  description?: string
  options?: Array<{ value: string; label: string }>
  min?: number
  max?: number
  step?: number
  rows?: number
  language?: string
}

// ============================================================
// MCP Compatibility
// ============================================================

/** MCP 도구 스키마 (표준) */
export interface MCPToolSchema {
  name: string
  description: string
  inputSchema: JSONSchema7
}

/** MCP 도구 결과 (표준) */
export interface MCPToolResult {
  success: boolean
  content: MCPContent[]
  error?: string
  metadata?: Record<string, unknown>
}

/** MCP 콘텐츠 */
export interface MCPContent {
  type: 'text' | 'json' | 'image' | 'file' | 'chart'
  text?: string
  data?: unknown
  mimeType?: string
}

// ============================================================
// Type Compatibility Matrix
// ============================================================

/** 포트 타입 호환성 */
export const TYPE_COMPATIBILITY: Record<PortType, PortType[]> = {
  'text': ['text', 'any', 'llm-response'],
  'text[]': ['text[]', 'text', 'any', 'chunk[]'],
  'number': ['number', 'any'],
  'boolean': ['boolean', 'any'],
  'json': ['json', 'any', 'table', 'chart'],
  'file': ['file', 'text', 'any', 'file-ref'],
  'file-ref': ['file-ref', 'file', 'text', 'any'],
  'file-ref[]': ['file-ref[]', 'file-ref', 'any'],
  'image': ['image', 'file', 'any'],
  'image[]': ['image[]', 'image', 'any'],
  'vector': ['vector', 'json', 'any'],
  'vector[]': ['vector[]', 'vector', 'any'],
  'table': ['table', 'json', 'any'],
  'chart': ['chart', 'json', 'any'],
  'llm-response': ['llm-response', 'text', 'any'],
  'chunk[]': ['chunk[]', 'text[]', 'any'],
  'search-result': ['search-result', 'json', 'any'],
  'search-result[]': ['search-result[]', 'json', 'any'],
  'agent-output': ['agent-output', 'json', 'any'],
  'plan': ['plan', 'json', 'any'],
  'document': ['document', 'file', 'file-ref', 'any'],
  'any': ['any', 'text', 'number', 'boolean', 'json', 'file', 'image', 'vector', 'table', 'chart', 'file-ref', 'llm-response', 'document'],
}

/**
 * 두 포트 타입이 호환되는지 확인
 */
export function isTypeCompatible(sourceType: PortType, targetType: PortType): boolean {
  if (sourceType === targetType) return true
  if (targetType === 'any') return true
  if (sourceType === 'any') return true
  return TYPE_COMPATIBILITY[sourceType]?.includes(targetType) ?? false
}

// ============================================================
// Category Definitions
// ============================================================

export const TOOL_CATEGORIES: CategoryDefinition[] = [
  { id: 'file', label: 'File', icon: 'Folder', color: '#3b82f6', order: 1, description: '파일 읽기/쓰기/관리' },
  { id: 'text', label: 'Text', icon: 'TextFields', color: '#10b981', order: 2, description: '텍스트 처리/변환' },
  { id: 'json', label: 'JSON', icon: 'Code', color: '#f59e0b', order: 3, description: 'JSON 파싱/쿼리/변환' },
  { id: 'csv', label: 'CSV', icon: 'TableChart', color: '#84cc16', order: 4, description: 'CSV 처리' },
  { id: 'xml', label: 'XML', icon: 'Schema', color: '#06b6d4', order: 5, description: 'XML 처리' },
  { id: 'http', label: 'HTTP', icon: 'Http', color: '#8b5cf6', order: 6, description: 'HTTP 요청/API 호출' },
  { id: 'storage', label: 'Storage', icon: 'Storage', color: '#ec4899', order: 7, description: 'KV/벡터/SQL 저장소' },
  { id: 'doc', label: 'Document', icon: 'Description', color: '#f97316', order: 8, description: '문서 파싱 (PDF/DOCX/XLSX)' },
  { id: 'llm', label: 'LLM', icon: 'Psychology', color: '#6366f1', order: 9, description: 'LLM 호출/임베딩' },
  { id: 'prompt', label: 'Prompt', icon: 'Edit', color: '#14b8a6', order: 10, description: '프롬프트 엔지니어링' },
  { id: 'rag', label: 'RAG', icon: 'Search', color: '#a855f7', order: 11, description: 'RAG 파이프라인' },
  { id: 'vision', label: 'Vision', icon: 'Image', color: '#ef4444', order: 12, description: '이미지 분석/생성' },
  { id: 'agent', label: 'Agent', icon: 'SmartToy', color: '#22c55e', order: 13, description: 'AI 에이전트' },
  { id: 'control', label: 'Control', icon: 'AccountTree', color: '#64748b', order: 14, description: '흐름 제어' },
  { id: 'variable', label: 'Variable', icon: 'DataObject', color: '#78716c', order: 15, description: '변수 관리' },
  { id: 'viz', label: 'Visualization', icon: 'BarChart', color: '#0ea5e9', order: 16, description: '결과 시각화' },
  { id: 'export', label: 'Export', icon: 'Download', color: '#71717a', order: 17, description: '파일 내보내기' },
]

// ============================================================
// Helper Functions
// ============================================================

/**
 * UnifiedToolDefinition → MCP Tool Schema 변환
 */
export function toMCPSchema(tool: UnifiedToolDefinition): MCPToolSchema {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }
}

/**
 * 도구 이름에서 카테고리 추출
 */
export function getCategoryFromName(name: string): ToolCategory | null {
  const parts = name.split('.')
  if (parts.length >= 2) {
    return parts[0] as ToolCategory
  }
  return null
}

/**
 * 카테고리별 색상 가져오기
 */
export function getCategoryColor(category: ToolCategory): string {
  return TOOL_CATEGORIES.find(c => c.id === category)?.color ?? '#64748b'
}
