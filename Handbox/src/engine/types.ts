/**
 * Handbox Engine — 핵심 데이터 타입 정의
 *
 * 모든 노드 간 데이터 흐름의 기반이 되는 타입 시스템.
 * 노드의 포트(입력/출력)는 이 타입을 사용하여 호환성을 검증한다.
 */

// ============================================================
// 데이터 타입 시스템
// ============================================================

/** 노드 포트에서 사용하는 데이터 타입 */
export type DataType =
  | 'text'             // 일반 텍스트 문자열
  | 'text[]'           // 텍스트 배열 (청크, 목록 등)
  | 'file-ref'         // 로컬 파일 경로
  | 'file-ref[]'       // 파일 경로 배열
  | 'json'             // 구조화 데이터 (Record<string, any>)
  | 'json[]'           // 구조화 데이터 배열
  | 'vector'           // 임베딩 벡터 (number[])
  | 'vector[]'         // 벡터 배열
  | 'llm-response'     // LLM 응답 (text + usage + metadata)
  | 'search-result[]'  // 검색 결과 배열
  | 'image'            // 이미지 (base64 또는 파일 경로)
  | 'binary'           // 바이너리 데이터
  | 'table-data'       // 테이블 구조 (headers + rows)
  | 'chart-data'       // 차트 데이터 (labels + datasets)
  | 'storage-ref'      // 저장소 참조 (local/cloud path)
  | 'any'              // 타입 무관 (제어 노드, 패스스루 등)

/** 데이터 타입 간 호환성 매트릭스 */
export const TYPE_COMPATIBILITY: Record<DataType, DataType[]> = {
  'text':             ['text', 'json', 'any'],  // text → json 허용 (파싱 가능)
  'text[]':           ['text[]', 'any'],
  'file-ref':         ['file-ref', 'text', 'any'],
  'file-ref[]':       ['file-ref[]', 'any'],
  'json':             ['json', 'text', 'any'],
  'json[]':           ['json[]', 'any'],
  'vector':           ['vector', 'any'],
  'vector[]':         ['vector[]', 'any'],
  'llm-response':     ['llm-response', 'text', 'json', 'any'],
  'search-result[]':  ['search-result[]', 'json[]', 'any'],
  'image':            ['image', 'file-ref', 'any'],
  'binary':           ['binary', 'any'],
  'table-data':       ['table-data', 'json', 'any'],
  'chart-data':       ['chart-data', 'json', 'any'],
  'storage-ref':      ['storage-ref', 'text', 'file-ref', 'any'],
  'any':              ['text', 'text[]', 'file-ref', 'file-ref[]', 'json', 'json[]',
                       'vector', 'vector[]', 'llm-response', 'search-result[]',
                       'image', 'binary', 'table-data', 'chart-data', 'storage-ref', 'any'],
}

/** 출력 타입이 입력 타입에 연결 가능한지 확인 */
export function isTypeCompatible(outputType: DataType, inputType: DataType): boolean {
  if (inputType === 'any' || outputType === 'any') return true
  return TYPE_COMPATIBILITY[outputType]?.includes(inputType) ?? false
}

// ============================================================
// 포트 정의
// ============================================================

/** 노드의 입력/출력 포트 정의 */
export interface PortDefinition {
  name: string
  type: DataType
  required: boolean
  description?: string
  /** 배열 타입일 때 최소/최대 개수 */
  minItems?: number
  maxItems?: number
}

// ============================================================
// 설정 스키마 (PropertyPanel 자동 생성용)
// ============================================================

export type ConfigFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multi-select'
  | 'toggle'
  | 'file'
  | 'folder'
  | 'color'
  | 'slider'
  | 'code'         // 코드 에디터 (프롬프트, JSON 등)
  | 'key-value'    // key-value 쌍 입력
  | 'provider'     // 프로바이더 선택 드롭다운 (특수)
  | 'model'        // 모델 선택 드롭다운 (특수, provider 의존)

export interface ConfigField {
  key: string
  label: string
  type: ConfigFieldType
  default?: any
  required?: boolean
  placeholder?: string
  description?: string
  group?: string

  // 타입별 옵션
  options?: { label: string; value: any }[]   // select, multi-select
  min?: number                                 // number, slider
  max?: number                                 // number, slider
  step?: number                                // number, slider
  rows?: number                                // textarea, code
  language?: string                            // code (e.g., 'json', 'python')
  accept?: string                              // file (e.g., '.pdf,.docx')

  // 조건부 표시 (다른 설정 값에 따라 표시/숨김)
  showWhen?: { key: string; value: any }
}

// ============================================================
// 노드 실행 상태
// ============================================================

export type NodeExecutionStatus = 'idle' | 'running' | 'completed' | 'error' | 'skipped'

export interface NodeExecutionResult {
  status: NodeExecutionStatus
  output?: Record<string, any>
  error?: string
  startTime?: number
  endTime?: number
  duration?: number
}

// ============================================================
// 실행 컨텍스트 (노드 간 공유)
// ============================================================

export interface ExecutionContext {
  /** 워크플로우 실행 ID */
  executionId: string
  /** 각 노드의 출력 (nodeId → output) */
  nodeOutputs: Record<string, Record<string, any>>
  /** 워크플로우 수준 변수 */
  variables: Record<string, any>
  /** 기본 LLM 프로바이더 ID */
  defaultLLMProvider: string
  /** 기본 임베딩 프로바이더 ID */
  defaultEmbeddingProvider: string
  /** 실행 상태 콜백 */
  onNodeStatusChange: (nodeId: string, status: NodeExecutionStatus, output?: Record<string, any>, error?: string) => void
  /** 실행 중단 시그널 */
  abortSignal: AbortSignal
  /** 중단점 노드 ID (설정된 경우 해당 노드에서 중지) */
  breakpointNodeId?: string | null
}

// ============================================================
// 노드 실행 런타임
// ============================================================

/** 노드가 실행되는 런타임 환경 */
export type NodeRuntime =
  | 'tauri'    // Rust 네이티브 Tauri 커맨드
  | 'api'      // HTTP REST/GraphQL 호출
  | 'cli'      // CLI 서브프로세스 (aws, gcloud 등)
  | 'script'   // 스크립트 실행 (Python, Node.js 등)
  | 'mcp'      // MCP 프로토콜
  | 'internal' // 순수 TypeScript 로직 (제어 흐름, 데이터 변환 등)

// ============================================================
// LLM 관련 공통 타입
// ============================================================

export interface LLMRequest {
  model: string
  prompt: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  stopSequences?: string[]
}

export interface LLMResponse {
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
  model: string
  finishReason?: string
}

export interface EmbeddingRequest {
  texts: string[]
  model?: string
}

export interface EmbeddingResponse {
  embeddings: number[][]
  dimension: number
  model: string
}
