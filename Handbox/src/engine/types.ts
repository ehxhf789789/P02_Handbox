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
  | 'array'            // 범용 배열 타입 (json[] 별칭)
  | 'vector'           // 임베딩 벡터 (number[])
  | 'vector[]'         // 벡터 배열
  | 'llm-response'     // LLM 응답 (text + usage + metadata)
  | 'search-result[]'  // 검색 결과 배열
  | 'image'            // 이미지 (base64 또는 파일 경로)
  | 'binary'           // 바이너리 데이터
  | 'table-data'       // 테이블 구조 (headers + rows)
  | 'chart-data'       // 차트 데이터 (labels + datasets)
  | 'storage-ref'      // 저장소 참조 (local/cloud path)
  | 'document'         // 문서 (PDF, DOCX 등)
  | 'chunk[]'          // 청크 배열 (텍스트 분할 결과)
  | 'agent-output'     // 에이전트 출력
  | 'evaluation-result'    // 단일 평가 결과
  | 'evaluation-result[]'  // 평가 결과 배열
  | 'voting-result'    // 투표 집계 결과
  | 'decision'         // 최종 결정/판정
  | 'boolean'          // 불리언 값
  | 'xai-result'       // XAI 분석 결과
  | 'any'              // 타입 무관 (제어 노드, 패스스루 등)

/** 데이터 타입 간 호환성 매트릭스 */
export const TYPE_COMPATIBILITY: Record<DataType, DataType[]> = {
  // 기본 타입
  'text':             ['text', 'json', 'any'],
  'text[]':           ['text[]', 'chunk[]', 'any', 'json', 'array'],
  'file-ref':         ['file-ref', 'text', 'any', 'document'],
  'file-ref[]':       ['file-ref[]', 'any', 'json', 'array'],
  'json':             ['json', 'text', 'any', 'table-data', 'chart-data', 'search-result[]',
                       'agent-output', 'file-ref', 'evaluation-result[]', 'decision', 'xai-result'],
  'json[]':           ['json[]', 'any', 'array'],
  'array':            ['array', 'json[]', 'text[]', 'any'],
  'vector':           ['vector', 'vector[]', 'any'],
  'vector[]':         ['vector[]', 'any', 'array'],
  'llm-response':     ['llm-response', 'text', 'json', 'any'],
  'search-result[]':  ['search-result[]', 'json[]', 'json', 'any', 'text', 'array'],
  'image':            ['image', 'file-ref', 'any'],
  'binary':           ['binary', 'any'],
  'table-data':       ['table-data', 'json', 'any'],
  'chart-data':       ['chart-data', 'json', 'any'],
  'storage-ref':      ['storage-ref', 'text', 'file-ref', 'any'],
  // 새 타입
  'document':         ['document', 'file-ref', 'any', 'text'],
  'chunk[]':          ['chunk[]', 'text[]', 'any', 'json', 'array'],
  'agent-output':     ['agent-output', 'json', 'text', 'any', 'evaluation-result[]'],
  'evaluation-result':    ['evaluation-result', 'json', 'any'],
  'evaluation-result[]':  ['evaluation-result[]', 'json', 'any', 'agent-output', 'array'],
  'voting-result':    ['voting-result', 'json', 'any', 'decision'],
  'decision':         ['decision', 'text', 'json', 'any'],
  'boolean':          ['boolean', 'json', 'any', 'text'],
  'xai-result':       ['xai-result', 'json', 'any'],
  'any':              ['text', 'text[]', 'file-ref', 'file-ref[]', 'json', 'json[]', 'array',
                       'vector', 'vector[]', 'llm-response', 'search-result[]',
                       'image', 'binary', 'table-data', 'chart-data', 'storage-ref',
                       'document', 'chunk[]', 'agent-output', 'evaluation-result',
                       'evaluation-result[]', 'voting-result', 'decision', 'boolean', 'xai-result', 'any'],
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
  | 'code'           // 코드 에디터 (프롬프트, JSON 등)
  | 'key-value'      // key-value 쌍 입력
  | 'provider'       // 프로바이더 선택 드롭다운 (특수)
  | 'model'          // 모델 선택 드롭다운 (특수, provider 의존)
  | 'persona-select' // 페르소나 선택 드롭다운
  | 'tags'           // 태그 입력 (다중 문자열)

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
  /** 시뮬레이션 모드 플래그 - true면 mock 데이터 반환 */
  isSimulation?: boolean
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
  | 'browser'  // 브라우저 전용 실행 (Web API, IndexedDB 등)

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
  /** Vision 모델용 이미지 입력 */
  images?: Array<{
    data?: string        // base64 데이터
    base64?: string      // base64 별칭
    url?: string         // 이미지 URL
    mimeType?: string
    detail?: 'low' | 'high' | 'auto'  // Vision API 상세도
  }>
  /** 에이전트용 도구 정의 */
  tools?: Array<{
    name: string
    description: string
    inputSchema: Record<string, any>
  }>
}

export interface LLMToolCall {
  id: string
  name: string
  arguments: Record<string, any>
}

export interface LLMResponse {
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens?: number
  }
  model: string
  finishReason?: string
  /** 도구 호출 결과 (에이전트 모드) */
  toolCalls?: LLMToolCall[]
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
