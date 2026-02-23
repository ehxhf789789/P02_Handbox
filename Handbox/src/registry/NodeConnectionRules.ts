/**
 * Node Connection Rules
 *
 * 모든 노드의 입출력 포트 타입 호환성 및 연결 규칙을 정의합니다.
 * 통합 워크플로우 생성 에이전트가 이 규칙을 참조하여 올바른 연결을 생성합니다.
 */

// ============================================================
// Port Type Definitions
// ============================================================

/**
 * 시스템에서 사용하는 모든 포트 타입
 */
export type PortType =
  | 'text'           // 텍스트 (문자열)
  | 'text[]'         // 텍스트 배열
  | 'file-ref'       // 단일 파일 참조 (경로)
  | 'file-ref[]'     // 파일 참조 배열
  | 'json'           // JSON 객체
  | 'json[]'         // JSON 배열
  | 'number'         // 숫자
  | 'number[]'       // 숫자 배열
  | 'embedding'      // 벡터 임베딩
  | 'embedding[]'    // 임베딩 배열
  | 'image'          // 이미지 데이터
  | 'any'            // 모든 타입 허용

// ============================================================
// Type Compatibility Matrix
// ============================================================

/**
 * 포트 타입 호환성 매트릭스
 * key: 출력 포트 타입
 * value: 연결 가능한 입력 포트 타입들
 */
export const TYPE_COMPATIBILITY: Record<PortType, PortType[]> = {
  'text': ['text', 'text[]', 'any'],
  'text[]': ['text[]', 'text', 'any'],  // text[]는 text로도 연결 가능 (첫 번째 요소 또는 join)
  'file-ref': ['file-ref', 'file-ref[]', 'text', 'any'],
  'file-ref[]': ['file-ref[]', 'file-ref', 'text', 'any'],  // file-ref[]는 file-ref로도 연결 가능 (반복 처리)
  'json': ['json', 'json[]', 'text', 'any'],
  'json[]': ['json[]', 'json', 'text', 'any'],
  'number': ['number', 'number[]', 'text', 'any'],
  'number[]': ['number[]', 'number', 'text', 'any'],
  'embedding': ['embedding', 'embedding[]', 'any'],
  'embedding[]': ['embedding[]', 'any'],
  'image': ['image', 'any'],
  'any': ['text', 'text[]', 'file-ref', 'file-ref[]', 'json', 'json[]', 'number', 'number[]', 'embedding', 'embedding[]', 'image', 'any'],
}

/**
 * 두 포트 타입이 호환되는지 확인
 */
export function isTypeCompatible(outputType: PortType, inputType: PortType): boolean {
  // 'any' 타입은 모든 것과 호환
  if (outputType === 'any' || inputType === 'any') return true

  // 동일 타입은 항상 호환
  if (outputType === inputType) return true

  // 호환성 매트릭스 확인
  const compatibleTypes = TYPE_COMPATIBILITY[outputType]
  return compatibleTypes?.includes(inputType) ?? false
}

/**
 * 배열 → 단일 타입 변환 필요 여부
 */
export function needsArrayExpansion(outputType: PortType, inputType: PortType): boolean {
  const arrayTypes = ['text[]', 'file-ref[]', 'json[]', 'number[]', 'embedding[]']
  const singleTypes = ['text', 'file-ref', 'json', 'number', 'embedding']

  const outputIndex = arrayTypes.indexOf(outputType)
  const inputIndex = singleTypes.indexOf(inputType)

  return outputIndex !== -1 && outputIndex === inputIndex
}

// ============================================================
// Node Port Definitions (All Registered Nodes)
// ============================================================

export interface NodePortInfo {
  type: string
  label: string
  category: string
  inputs: { name: string; type: PortType; required: boolean }[]
  outputs: { name: string; type: PortType }[]
  canConnectTo: string[]  // 이 노드의 출력이 연결될 수 있는 노드 타입들
  canReceiveFrom: string[]  // 이 노드의 입력에 연결될 수 있는 노드 타입들
}

/**
 * 모든 등록된 노드의 포트 정보
 */
export const NODE_PORT_REGISTRY: Record<string, NodePortInfo> = {
  // ============================================================
  // IO 노드
  // ============================================================
  'io.local-folder': {
    type: 'io.local-folder',
    label: '폴더 입력',
    category: 'io',
    inputs: [],
    outputs: [
      { name: 'files', type: 'file-ref[]' },
      { name: 'text', type: 'text' },
    ],
    canConnectTo: [
      'convert.doc-parser',   // 문서 파싱 (반복 처리)
      'text.splitter',        // 텍스트 분할
      'ai.llm-invoke',        // LLM 호출
      'ai.embedding',         // 임베딩
      'data.preprocess',      // 전처리
      'prompt.template',      // 프롬프트 템플릿
      'prompt.cot',           // CoT 프롬프트
      'prompt.few-shot',      // Few-shot 프롬프트
      'prompt.agent',         // 에이전트 프롬프트
      'viz.result-viewer',    // 결과 뷰어
      'viz.table',            // 테이블 뷰어
      'control.merge',        // 병합
      'vision.analyze',       // 이미지 분석
      'rag.retriever',        // RAG 검색
      'rag.context-builder',  // 컨텍스트 빌더
      'agent.persona',        // 페르소나 에이전트
    ],
    canReceiveFrom: [],  // 시작 노드
  },

  'io.local-file': {
    type: 'io.local-file',
    label: '파일 입력',
    category: 'io',
    inputs: [],
    outputs: [
      { name: 'file', type: 'file-ref' },
      { name: 'text', type: 'text' },
    ],
    canConnectTo: [
      'convert.doc-parser',
      'text.splitter',
      'ai.llm-invoke',
      'ai.embedding',
      'data.preprocess',
      'prompt.template',
      'prompt.cot',         // CoT 프롬프트
      'prompt.few-shot',    // Few-shot 프롬프트
      'prompt.agent',       // 에이전트 프롬프트
      'viz.result-viewer',
      'viz.table',  // 파일 → 테이블 표시
      'control.merge',  // 다중 파일 병합
      'vision.analyze',  // 이미지 분석
      'rag.retriever',      // RAG 검색
      'rag.context-builder', // 컨텍스트 빌더
      'agent.persona',      // 페르소나 에이전트
    ],
    canReceiveFrom: [],  // 시작 노드
  },

  // ============================================================
  // Document Processing 노드
  // ============================================================
  'convert.doc-parser': {
    type: 'convert.doc-parser',
    label: '문서 파싱',
    category: 'convert',
    inputs: [
      { name: 'file', type: 'file-ref', required: true },
      // file-ref[] 도 받을 수 있음 (반복 처리)
    ],
    outputs: [
      { name: 'text', type: 'text' },
    ],
    canConnectTo: [
      'text.splitter',
      'ai.llm-invoke',
      'ai.embedding',
      'prompt.template',
      'prompt.cot',
      'prompt.few-shot',
      'rag.context-builder',
      'viz.result-viewer',
      'data.preprocess',
    ],
    canReceiveFrom: [
      'io.local-folder',  // 폴더의 파일들 (반복 처리)
      'io.local-file',    // 단일 파일
      'data.file-loader', // 데이터 로더
    ],
  },

  // ============================================================
  // Text Processing 노드
  // ============================================================
  'text.splitter': {
    type: 'text.splitter',
    label: '텍스트 분할',
    category: 'text',
    inputs: [
      { name: 'text', type: 'text', required: true },
    ],
    outputs: [
      { name: 'chunks', type: 'text[]' },
      { name: 'text', type: 'text' },  // 첫 번째 청크
    ],
    canConnectTo: [
      'ai.llm-invoke',
      'ai.embedding',
      'rag.retriever',
      'prompt.template',
      'viz.result-viewer',
      'agent.persona',  // 페르소나 에이전트
      'control.merge',  // 병합
    ],
    canReceiveFrom: [
      'io.local-folder',
      'io.local-file',
      'convert.doc-parser',
      'data.preprocess',
      'ai.llm-invoke',
      'api.http-request',   // API 응답 분할
      'api.web-search',     // 웹 검색 결과 분할
      'api.data-fetch',     // 데이터 API 결과 분할
    ],
  },

  // ============================================================
  // AI 노드
  // ============================================================
  'ai.llm-invoke': {
    type: 'ai.llm-invoke',
    label: 'LLM 호출',
    category: 'ai',
    inputs: [
      { name: 'prompt', type: 'text', required: true },
      { name: 'context', type: 'text', required: false },
    ],
    outputs: [
      { name: 'text', type: 'text' },
      { name: 'response', type: 'json' },
    ],
    canConnectTo: [
      'viz.result-viewer',
      'viz.chart',
      'viz.table',
      'viz.stats',
      'export.excel',
      'export.pdf',      // PDF 내보내기
      'data.preprocess',
      'ai.llm-invoke',   // 체인 가능
      'control.conditional',
      'control.voting-aggregator',
      'agent.persona',
      'api.http-request',   // LLM이 API 요청 생성
      'api.web-search',     // LLM이 검색 쿼리 생성
      'api.data-fetch',     // LLM이 데이터 요청 생성
    ],
    canReceiveFrom: [
      'io.local-folder',
      'io.local-file',
      'convert.doc-parser',
      'text.splitter',
      'prompt.template',
      'prompt.cot',
      'prompt.few-shot',
      'prompt.agent',
      'rag.retriever',
      'rag.context-builder',
      'data.preprocess',
      'ai.llm-invoke',      // 체인 가능
      'api.http-request',   // API 응답 분석
      'api.web-search',     // 검색 결과 분석
      'api.data-fetch',     // 데이터 분석
      'ai.embedding',       // 임베딩 결과 분석
      'viz.table',          // 테이블 데이터 분석
      'viz.chart',          // 차트 데이터 분석
      'viz.stats',          // 통계 데이터 분석
      'control.merge',      // 병합 결과 분석
      'control.voting-aggregator',  // 투표 결과 분석/후처리
      'agent.persona',      // 페르소나 응답 분석
    ],
  },

  'ai.embedding': {
    type: 'ai.embedding',
    label: '임베딩 생성',
    category: 'ai',
    inputs: [
      { name: 'text', type: 'text', required: true },
    ],
    outputs: [
      { name: 'embedding', type: 'embedding' },
      { name: 'embeddings', type: 'embedding[]' },
    ],
    canConnectTo: [
      'rag.retriever',
      'storage.local',
      'storage.cloud',
      'data.kb_create',       // KB 생성
      'rag.context-builder',  // 컨텍스트 빌더
      'ai.llm-invoke',        // 임베딩 분석/유사도 기반 컨텍스트
      'viz.result-viewer',    // 임베딩 결과 확인
      'control.merge',        // 다중 임베딩 병합
    ],
    canReceiveFrom: [
      'io.local-folder',
      'io.local-file',
      'convert.doc-parser',
      'text.splitter',
      'data.preprocess',
      'api.http-request',     // API 응답 텍스트 임베딩
      'api.web-search',       // 웹 검색 결과 임베딩
    ],
  },

  // ============================================================
  // Prompt Engineering 노드
  // ============================================================
  'prompt.template': {
    type: 'prompt.template',
    label: '프롬프트 템플릿',
    category: 'prompt',
    inputs: [
      { name: 'variables', type: 'any', required: false },
    ],
    outputs: [
      { name: 'prompt', type: 'text' },
    ],
    canConnectTo: [
      'ai.llm-invoke',
      'prompt.cot',
      'prompt.few-shot',
      'agent.persona',
      'rag.retriever',  // 쿼리 생성용 템플릿
      'rag.context-builder',  // 컨텍스트 빌더에 쿼리 전달
      'api.http-request',   // 동적 API 요청 생성
      'api.web-search',     // 동적 검색 쿼리 생성
      'api.data-fetch',     // 동적 데이터 요청 생성
    ],
    canReceiveFrom: [
      'io.local-folder',
      'io.local-file',
      'convert.doc-parser',
      'text.splitter',
      'data.preprocess',
      'rag.retriever',
      'rag.context-builder',
      'data.file-loader',
      'api.http-request',   // API 응답을 템플릿에
      'api.web-search',     // 검색 결과를 템플릿에
      'api.data-fetch',     // 데이터를 템플릿에
    ],
  },

  'prompt.cot': {
    type: 'prompt.cot',
    label: 'Chain of Thought',
    category: 'prompt',
    inputs: [
      { name: 'input', type: 'text', required: true },
    ],
    outputs: [
      { name: 'prompt', type: 'text' },
    ],
    canConnectTo: ['ai.llm-invoke', 'agent.persona'],
    canReceiveFrom: [
      'io.local-file',       // 파일에서 직접 입력
      'io.local-folder',     // 폴더에서 직접 입력
      'data.file-loader',    // 데이터 로더
      'convert.doc-parser',
      'text.splitter',
      'prompt.template',
      'rag.context-builder',
      'data.preprocess',     // 전처리 결과
      'ai.llm-invoke',       // LLM 출력 체인
    ],
  },

  'prompt.few-shot': {
    type: 'prompt.few-shot',
    label: 'Few-Shot',
    category: 'prompt',
    inputs: [
      { name: 'input', type: 'text', required: true },
    ],
    outputs: [
      { name: 'prompt', type: 'text' },
    ],
    canConnectTo: ['ai.llm-invoke', 'agent.persona'],
    canReceiveFrom: [
      'io.local-file',       // 파일에서 직접 입력
      'io.local-folder',     // 폴더에서 직접 입력
      'data.file-loader',    // 데이터 로더
      'convert.doc-parser',
      'text.splitter',
      'prompt.template',
      'rag.context-builder',
      'data.preprocess',     // 전처리 결과
      'ai.llm-invoke',       // LLM 출력 체인
    ],
  },

  // ============================================================
  // RAG 노드
  // ============================================================
  'rag.retriever': {
    type: 'rag.retriever',
    label: 'RAG 검색',
    category: 'rag',
    inputs: [
      { name: 'query', type: 'text', required: true },
    ],
    outputs: [
      { name: 'context', type: 'text' },
      { name: 'results', type: 'json[]' },
    ],
    canConnectTo: [
      'ai.llm-invoke',
      'prompt.template',
      'rag.context-builder',
      'viz.result-viewer',
    ],
    canReceiveFrom: [
      'io.local-file',
      'data.preprocess',
      'prompt.template',  // 쿼리를 템플릿으로 생성할 수 있음
      'ai.llm-invoke',    // LLM이 쿼리를 생성할 수 있음
    ],
  },

  'rag.context-builder': {
    type: 'rag.context-builder',
    label: '컨텍스트 빌더',
    category: 'rag',
    inputs: [
      { name: 'documents', type: 'text[]', required: false },
      { name: 'query', type: 'text', required: false },
    ],
    outputs: [
      { name: 'context', type: 'text' },
    ],
    canConnectTo: ['ai.llm-invoke', 'prompt.template', 'prompt.cot', 'rag.retriever', 'storage.local', 'data.preprocess'],
    canReceiveFrom: [
      'rag.retriever', 'text.splitter', 'convert.doc-parser', 'ai.embedding',
      'prompt.template',    // 프롬프트를 컨텍스트로
      'api.http-request',   // API 응답을 컨텍스트로
      'api.web-search',     // 웹 검색 결과를 컨텍스트로
      'api.data-fetch',     // 데이터 API 결과를 컨텍스트로
    ],
  },

  // LLM이 생성할 수 있는 KB 노드 별칭
  'data.kb_create': {
    type: 'data.kb_create',
    label: 'KB 생성',
    category: 'data',
    inputs: [
      { name: 'data', type: 'any', required: true },
    ],
    outputs: [
      { name: 'kb_id', type: 'text' },
      { name: 'status', type: 'json' },
    ],
    canConnectTo: [
      'rag.retriever', 'viz.result-viewer', 'storage.local',
      'agent.persona',  // KB 기반 페르소나 에이전트
      'ai.llm-invoke',  // KB 기반 LLM 호출
    ],
    canReceiveFrom: ['ai.embedding', 'text.splitter', 'convert.doc-parser'],
  },

  // ============================================================
  // Control Flow 노드
  // ============================================================
  'control.merge': {
    type: 'control.merge',
    label: '병합',
    category: 'control',
    inputs: [
      { name: 'inputs', type: 'any', required: true },
    ],
    outputs: [
      { name: 'merged', type: 'text' },
      { name: 'items', type: 'json[]' },
    ],
    canConnectTo: [
      'ai.llm-invoke', 'viz.result-viewer', 'control.voting-aggregator', 'export.excel',
      'viz.table', 'viz.chart', 'viz.stats', 'storage.local', 'data.preprocess',
      'agent.persona',  // 병합된 결과를 페르소나에게 전달
      'prompt.template',  // 병합된 결과로 프롬프트 생성
    ],
    canReceiveFrom: [
      'io.local-file', 'io.local-folder',  // 파일/폴더 병합
      'ai.llm-invoke', 'agent.persona', 'convert.doc-parser', 'data.preprocess', 'text.splitter', 'vision.analyze',
      'api.http-request', 'api.web-search', 'api.data-fetch', 'ai.embedding',  // API 및 임베딩 결과 병합
      'viz.table', 'viz.chart', 'viz.stats',  // 시각화 결과 병합
    ],
  },

  'control.conditional': {
    type: 'control.conditional',
    label: '조건 분기',
    category: 'control',
    inputs: [
      { name: 'input', type: 'any', required: true },
    ],
    outputs: [
      { name: 'true_branch', type: 'any' },
      { name: 'false_branch', type: 'any' },
    ],
    canConnectTo: ['ai.llm-invoke', 'viz.result-viewer', 'export.excel'],
    canReceiveFrom: ['ai.llm-invoke', 'data.preprocess'],
  },

  'control.voting-aggregator': {
    type: 'control.voting-aggregator',
    label: '투표 집계',
    category: 'control',
    inputs: [
      { name: 'votes', type: 'json[]', required: true },
    ],
    outputs: [
      { name: 'result', type: 'json' },
      { name: 'summary', type: 'text' },
    ],
    canConnectTo: [
      'viz.result-viewer', 'viz.chart', 'viz.stats', 'export.excel',
      'ai.llm-invoke',       // 투표 결과 분석/후처리
      'data.preprocess',     // 결과 전처리
      'prompt.template',     // 결과를 프롬프트에 사용
    ],
    canReceiveFrom: ['ai.llm-invoke', 'agent.persona', 'control.merge'],
  },

  // ============================================================
  // Agent 노드
  // ============================================================
  'agent.persona': {
    type: 'agent.persona',
    label: '페르소나 에이전트',
    category: 'agent',
    inputs: [
      { name: 'input', type: 'text', required: true },
    ],
    outputs: [
      { name: 'response', type: 'text' },
      { name: 'evaluation', type: 'json' },
    ],
    canConnectTo: [
      'control.voting-aggregator', 'control.merge', 'viz.result-viewer', 'ai.llm-invoke',
      'agent.persona',  // 페르소나 체인 (순차 평가)
    ],
    canReceiveFrom: [
      'convert.doc-parser', 'prompt.template', 'prompt.cot', 'rag.context-builder',
      'text.splitter', 'data.preprocess', 'io.local-file',
      'agent.persona',  // 페르소나 체인 (이전 평가 결과 수신)
    ],
  },

  // ============================================================
  // Visualization 노드
  // ============================================================
  'viz.result-viewer': {
    type: 'viz.result-viewer',
    label: '결과 뷰어',
    category: 'viz',
    inputs: [
      { name: 'data', type: 'any', required: true },
    ],
    outputs: [],
    canConnectTo: [],  // 종료 노드
    canReceiveFrom: [
      'ai.llm-invoke',
      'control.voting-aggregator',
      'control.merge',
      'data.preprocess',
      'convert.doc-parser',
      'text.splitter',
      'rag.retriever',
      'viz.chart',
      'viz.stats',
      'viz.table',
      'api.http-request',   // API 결과 표시
      'api.web-search',     // 검색 결과 표시
      'api.data-fetch',     // 데이터 결과 표시
      'ai.embedding',       // 임베딩 결과 표시
    ],
  },

  'viz.chart': {
    type: 'viz.chart',
    label: '차트 뷰어',
    category: 'viz',
    inputs: [
      { name: 'data', type: 'json', required: true },
    ],
    outputs: [
      { name: 'chartData', type: 'json' },  // 차트 데이터/메타 출력 허용
    ],
    canConnectTo: ['viz.result-viewer', 'export.excel', 'viz.stats', 'ai.llm-invoke'],  // 차트 결과를 뷰어/엑셀/통계/LLM으로 전달 가능
    canReceiveFrom: [
      'ai.llm-invoke', 'data.preprocess', 'control.voting-aggregator', 'viz.stats', 'control.merge',
      'api.http-request', 'api.web-search', 'api.data-fetch',  // API 결과 차트 표시
    ],
  },

  'viz.table': {
    type: 'viz.table',
    label: '테이블 뷰어',
    category: 'viz',
    inputs: [
      { name: 'data', type: 'json', required: true },
    ],
    outputs: [
      { name: 'tableData', type: 'json' },  // 테이블 데이터 출력 허용
    ],
    canConnectTo: ['export.excel', 'viz.result-viewer', 'ai.llm-invoke', 'control.merge'],  // 테이블 → 엑셀/뷰어/LLM 분석/병합
    canReceiveFrom: [
      'ai.llm-invoke', 'data.preprocess', 'io.local-folder', 'io.local-file', 'convert.doc-parser', 'control.merge',
      'api.http-request', 'api.web-search', 'api.data-fetch',  // API 결과 테이블 표시
    ],
  },

  'viz.stats': {
    type: 'viz.stats',
    label: '통계 뷰어',
    category: 'viz',
    inputs: [
      { name: 'data', type: 'json', required: true },
    ],
    outputs: [
      { name: 'stats', type: 'json' },
    ],
    canConnectTo: ['viz.chart', 'viz.result-viewer', 'export.excel', 'ai.llm-invoke'],
    canReceiveFrom: ['ai.llm-invoke', 'control.voting-aggregator', 'data.preprocess', 'viz.chart', 'control.merge'],  // 병합 결과 통계
  },

  // ============================================================
  // Export 노드
  // ============================================================
  'export.excel': {
    type: 'export.excel',
    label: 'Excel 내보내기',
    category: 'export',
    inputs: [
      { name: 'data', type: 'json', required: true },
    ],
    outputs: [
      { name: 'file', type: 'file-ref' },
    ],
    canConnectTo: [],  // 종료 노드 (또는 다운로드)
    canReceiveFrom: [
      'ai.llm-invoke', 'viz.stats', 'control.voting-aggregator', 'data.preprocess', 'control.merge',
      'viz.table', 'viz.chart',  // 테이블/차트 결과를 엑셀로
    ],
  },

  'export.pdf': {
    type: 'export.pdf',
    label: 'PDF 내보내기',
    category: 'export',
    inputs: [
      { name: 'data', type: 'any', required: true },
    ],
    outputs: [
      { name: 'file', type: 'file-ref' },
    ],
    canConnectTo: [],  // 종료 노드
    canReceiveFrom: [
      'ai.llm-invoke', 'viz.result-viewer', 'data.preprocess', 'control.merge',
      'viz.table', 'viz.chart', 'viz.stats',  // 시각화 결과를 PDF로
    ],
  },

  // ============================================================
  // Data Processing 노드
  // ============================================================
  'data.file-loader': {
    type: 'data.file-loader',
    label: '데이터 로더',
    category: 'data',
    inputs: [],
    outputs: [
      { name: 'data', type: 'json' },
      { name: 'text', type: 'text' },
      { name: 'file', type: 'file-ref' },
    ],
    canConnectTo: ['convert.doc-parser', 'data.preprocess', 'ai.llm-invoke', 'viz.table', 'prompt.template', 'text.splitter', 'vision.analyze', 'ai.embedding'],
    canReceiveFrom: [],  // 시작 노드
  },

  'data.preprocess': {
    type: 'data.preprocess',
    label: '데이터 전처리',
    category: 'data',
    inputs: [
      { name: 'input', type: 'any', required: true },
    ],
    outputs: [
      { name: 'output', type: 'any' },
    ],
    canConnectTo: [
      'ai.llm-invoke',
      'viz.result-viewer',
      'viz.chart',
      'viz.table',
      'viz.stats',
      'export.excel',
      'text.splitter',
      'api.http-request',   // 전처리 결과로 API 호출
      'api.web-search',     // 전처리 결과로 검색
      'api.data-fetch',     // 전처리 결과로 데이터 요청
      'data.preprocess',    // 전처리 체인 (다단계 전처리)
    ],
    canReceiveFrom: [
      'io.local-folder',
      'io.local-file',
      'convert.doc-parser',
      'ai.llm-invoke',
      'data.file-loader',
      'text.splitter',      // 분할된 텍스트 전처리
      'api.http-request',   // API 응답 전처리
      'api.web-search',     // 검색 결과 전처리
      'api.data-fetch',     // 데이터 전처리
      'data.preprocess',    // 전처리 체인 (이전 전처리 결과)
      'rag.retriever',      // 검색 결과 전처리
      'rag.context-builder', // 컨텍스트 전처리
      'control.merge',      // 병합된 데이터 전처리
    ],
  },

  // ============================================================
  // Vision 노드
  // ============================================================
  'vision.analyze': {
    type: 'vision.analyze',
    label: '이미지 분석',
    category: 'vision',
    inputs: [
      { name: 'image', type: 'file-ref', required: true },
    ],
    outputs: [
      { name: 'text', type: 'text' },
      { name: 'analysis', type: 'json' },
    ],
    canConnectTo: ['ai.llm-invoke', 'viz.result-viewer', 'data.preprocess', 'control.merge', 'prompt.template'],
    canReceiveFrom: ['io.local-file', 'io.local-folder', 'data.file-loader'],  // 데이터 로더에서 이미지 로드
  },

  'vision.generate': {
    type: 'vision.generate',
    label: '이미지 생성',
    category: 'vision',
    inputs: [
      { name: 'prompt', type: 'text', required: true },
    ],
    outputs: [
      { name: 'image', type: 'image' },
    ],
    canConnectTo: ['viz.result-viewer', 'storage.local', 'storage.cloud'],
    canReceiveFrom: ['prompt.template', 'ai.llm-invoke'],
  },

  // ============================================================
  // Storage 노드 (추가)
  // ============================================================
  'storage.local': {
    type: 'storage.local',
    label: '로컬 저장소',
    category: 'storage',
    inputs: [
      { name: 'data', type: 'any', required: true },
    ],
    outputs: [
      { name: 'path', type: 'file-ref' },
      { name: 'success', type: 'json' },
    ],
    canConnectTo: ['viz.result-viewer'],
    canReceiveFrom: [
      'ai.llm-invoke', 'data.preprocess', 'convert.doc-parser',
      'vision.generate', 'export.excel', 'rag.context-builder',
    ],
  },

  'storage.cloud': {
    type: 'storage.cloud',
    label: '클라우드 저장소',
    category: 'storage',
    inputs: [
      { name: 'data', type: 'any', required: true },
    ],
    outputs: [
      { name: 'url', type: 'text' },
      { name: 'success', type: 'json' },
    ],
    canConnectTo: ['viz.result-viewer', 'api.http-request'],
    canReceiveFrom: [
      'ai.llm-invoke', 'data.preprocess', 'convert.doc-parser',
      'vision.generate', 'export.excel', 'storage.local',
    ],
  },

  'storage.unified': {
    type: 'storage.unified',
    label: '통합 저장소',
    category: 'storage',
    inputs: [
      { name: 'data', type: 'any', required: true },
    ],
    outputs: [
      { name: 'location', type: 'text' },
      { name: 'success', type: 'json' },
    ],
    canConnectTo: ['viz.result-viewer'],
    canReceiveFrom: [
      'ai.llm-invoke', 'data.preprocess', 'convert.doc-parser',
      'vision.generate', 'export.excel',
    ],
  },

  // ============================================================
  // Prompt 추가 노드
  // ============================================================
  'prompt.agent': {
    type: 'prompt.agent',
    label: '에이전트 프롬프트',
    category: 'prompt',
    inputs: [
      { name: 'context', type: 'text', required: false },
      { name: 'instruction', type: 'text', required: true },
    ],
    outputs: [
      { name: 'prompt', type: 'text' },
    ],
    canConnectTo: ['ai.llm-invoke', 'agent.persona'],
    canReceiveFrom: [
      'io.local-file', 'io.local-folder', 'convert.doc-parser',
      'text.splitter', 'rag.context-builder', 'data.preprocess',
    ],
  },

  // ============================================================
  // Control 추가 노드
  // ============================================================
  'control.cli': {
    type: 'control.cli',
    label: 'CLI 실행',
    category: 'control',
    inputs: [
      { name: 'command', type: 'text', required: true },
    ],
    outputs: [
      { name: 'stdout', type: 'text' },
      { name: 'stderr', type: 'text' },
      { name: 'exitCode', type: 'number' },
    ],
    canConnectTo: ['viz.result-viewer', 'data.preprocess', 'ai.llm-invoke'],
    canReceiveFrom: ['prompt.template', 'data.preprocess', 'ai.llm-invoke'],
  },

  'control.script': {
    type: 'control.script',
    label: '스크립트 실행',
    category: 'control',
    inputs: [
      { name: 'input', type: 'any', required: false },
    ],
    outputs: [
      { name: 'result', type: 'any' },
    ],
    canConnectTo: [
      'ai.llm-invoke', 'viz.result-viewer', 'data.preprocess',
      'control.merge', 'storage.local',
      'control.script',       // 스크립트 체인 (순차 실행)
      'control.conditional',  // 조건 분기
      'export.excel',         // 결과 내보내기
      'prompt.template',      // 프롬프트 생성
    ],
    canReceiveFrom: [
      'io.local-file', 'io.local-folder', 'convert.doc-parser',
      'data.preprocess', 'ai.llm-invoke', 'rag.retriever',
      'control.script',       // 스크립트 체인 (이전 스크립트 결과)
      'api.http-request',     // API 응답 처리
      'api.data-fetch',       // 데이터 처리
    ],
  },

  'control.sub-workflow': {
    type: 'control.sub-workflow',
    label: '서브 워크플로우',
    category: 'control',
    inputs: [
      { name: 'input', type: 'any', required: false },
    ],
    outputs: [
      { name: 'output', type: 'any' },
    ],
    canConnectTo: [
      'ai.llm-invoke', 'viz.result-viewer', 'control.merge',
      'control.voting-aggregator', 'storage.local',
    ],
    canReceiveFrom: [
      'io.local-file', 'io.local-folder', 'convert.doc-parser',
      'data.preprocess', 'ai.llm-invoke',
    ],
  },

  // ============================================================
  // API 노드
  // ============================================================
  'api.http-request': {
    type: 'api.http-request',
    label: 'HTTP 요청',
    category: 'api',
    inputs: [
      // URL은 toolConfig에서 직접 설정 가능하므로 required: false
      { name: 'url', type: 'text', required: false },
      { name: 'body', type: 'json', required: false },
    ],
    outputs: [
      { name: 'response', type: 'json' },
      { name: 'text', type: 'text' },
    ],
    canConnectTo: [
      'data.preprocess', 'ai.llm-invoke', 'viz.result-viewer',
      'viz.json-viewer', 'viz.table', 'control.merge',
      'ai.embedding',       // API 응답 임베딩
      'text.splitter',      // API 응답 분할
      'prompt.template',    // API 응답을 프롬프트에 사용
      'rag.context-builder', // API 응답을 컨텍스트로
    ],
    canReceiveFrom: [
      'prompt.template',    // 동적 URL/body 생성
      'ai.llm-invoke',      // LLM이 생성한 요청
      'data.preprocess',    // 전처리된 데이터
    ],
  },

  'api.web-search': {
    type: 'api.web-search',
    label: '웹 검색',
    category: 'api',
    inputs: [
      { name: 'query', type: 'text', required: true },
    ],
    outputs: [
      { name: 'results', type: 'json[]' },
      { name: 'text', type: 'text' },
      { name: 'urls', type: 'text[]' },
    ],
    canConnectTo: [
      'ai.llm-invoke',        // 검색 결과 분석
      'ai.embedding',         // 검색 결과 임베딩
      'rag.context-builder',  // 검색 결과를 컨텍스트로
      'prompt.template',      // 검색 결과를 프롬프트에
      'viz.result-viewer',    // 결과 표시
      'viz.table',            // 테이블 표시
      'data.preprocess',      // 전처리
      'control.merge',        // 다중 검색 결과 병합
      'text.splitter',        // 검색 결과 분할
    ],
    canReceiveFrom: [
      'prompt.template',      // 동적 쿼리 생성
      'ai.llm-invoke',        // LLM이 생성한 쿼리
      'data.preprocess',      // 전처리된 쿼리
    ],
  },

  'api.data-fetch': {
    type: 'api.data-fetch',
    label: '데이터 API',
    category: 'api',
    inputs: [
      { name: 'endpoint', type: 'text', required: false },
      { name: 'params', type: 'json', required: false },
    ],
    outputs: [
      { name: 'data', type: 'json' },
      { name: 'text', type: 'text' },
    ],
    canConnectTo: [
      'ai.llm-invoke',        // 데이터 분석
      'ai.embedding',         // 데이터 임베딩
      'data.preprocess',      // 데이터 전처리
      'viz.result-viewer',    // 결과 표시
      'viz.table',            // 테이블 표시
      'viz.chart',            // 차트 표시
      'prompt.template',      // 데이터를 프롬프트에
      'control.merge',        // 다중 API 결과 병합
      'rag.context-builder',  // 데이터를 컨텍스트로
    ],
    canReceiveFrom: [
      'prompt.template',      // 동적 엔드포인트/파라미터
      'ai.llm-invoke',        // LLM이 생성한 요청
      'data.preprocess',      // 전처리된 파라미터
    ],
  },

  // ============================================================
  // Viz 추가 노드
  // ============================================================
  'viz.json-viewer': {
    type: 'viz.json-viewer',
    label: 'JSON 뷰어',
    category: 'viz',
    inputs: [
      { name: 'json', type: 'json', required: true },
    ],
    outputs: [],
    canConnectTo: [],  // 종료 노드
    canReceiveFrom: [
      'api.http-request', 'data.preprocess', 'ai.llm-invoke',
      'rag.retriever', 'control.script',
    ],
  },
}

// ============================================================
// Connection Validation Functions
// ============================================================

/**
 * 두 노드가 연결 가능한지 확인
 */
export function canConnect(sourceNodeType: string, targetNodeType: string): {
  canConnect: boolean
  reason: string
  expansionNeeded?: boolean  // 배열 → 단일 변환 필요 여부
} {
  const sourceInfo = NODE_PORT_REGISTRY[sourceNodeType]
  const targetInfo = NODE_PORT_REGISTRY[targetNodeType]

  if (!sourceInfo) {
    return { canConnect: false, reason: `알 수 없는 소스 노드 타입: ${sourceNodeType}` }
  }
  if (!targetInfo) {
    return { canConnect: false, reason: `알 수 없는 타겟 노드 타입: ${targetNodeType}` }
  }

  // canConnectTo 목록 확인
  if (sourceInfo.canConnectTo.includes(targetNodeType)) {
    // 배열 → 단일 변환 필요 여부 확인
    const sourceOutputTypes = sourceInfo.outputs.map(o => o.type)
    const targetInputTypes = targetInfo.inputs.map(i => i.type)

    const expansionNeeded = sourceOutputTypes.some(sType =>
      targetInputTypes.some(tType => needsArrayExpansion(sType, tType))
    )

    return {
      canConnect: true,
      reason: '연결 가능',
      expansionNeeded,
    }
  }

  // canReceiveFrom 목록 확인 (역방향)
  if (targetInfo.canReceiveFrom.includes(sourceNodeType)) {
    return { canConnect: true, reason: '연결 가능' }
  }

  return {
    canConnect: false,
    reason: `${sourceInfo.label}의 출력을 ${targetInfo.label}의 입력에 연결할 수 없습니다`
  }
}

/**
 * 특정 노드의 출력에 연결 가능한 모든 노드 타입 반환
 */
export function getConnectableTargets(sourceNodeType: string): string[] {
  const sourceInfo = NODE_PORT_REGISTRY[sourceNodeType]
  if (!sourceInfo) return []
  return sourceInfo.canConnectTo
}

/**
 * 특정 노드의 입력에 연결 가능한 모든 노드 타입 반환
 */
export function getConnectableSources(targetNodeType: string): string[] {
  const targetInfo = NODE_PORT_REGISTRY[targetNodeType]
  if (!targetInfo) return []
  return targetInfo.canReceiveFrom
}

/**
 * 연결 규칙 요약 (통합 에이전트용)
 */
export function getConnectionRulesSummary(): string {
  const rules: string[] = []

  rules.push('## 노드 연결 규칙 (필수 준수)')
  rules.push('')
  rules.push('### 시작 노드 (입력이 없는 노드)')
  rules.push('- `io.local-folder`: 폴더의 파일들 로드 → 출력: file-ref[], text')
  rules.push('- `io.local-file`: 단일 파일 로드 → 출력: file-ref, text')
  rules.push('- `data.file-loader`: 데이터 파일 로드 → 출력: json, text')
  rules.push('')

  rules.push('### 문서 처리 체인')
  rules.push('- `io.local-folder` → `convert.doc-parser`: 폴더 파일들을 순차 파싱 (배열→단일 자동 변환)')
  rules.push('- `convert.doc-parser` → `text.splitter`: 텍스트 청킹')
  rules.push('- `text.splitter` → `ai.embedding`: 벡터화')
  rules.push('- `text.splitter` → `ai.llm-invoke`: LLM 분석')
  rules.push('')

  rules.push('### LLM 체인')
  rules.push('- 프롬프트 노드 → `ai.llm-invoke`: prompt.template, prompt.cot, prompt.few-shot')
  rules.push('- `ai.llm-invoke` → 출력 노드: viz.result-viewer, viz.chart, viz.table')
  rules.push('- `ai.llm-invoke` → `ai.llm-invoke`: 체인 연결 가능')
  rules.push('')

  rules.push('### 다중 에이전트 패턴')
  rules.push('- 입력 → `agent.persona` (병렬 N개) → `control.voting-aggregator` → 출력')
  rules.push('- `agent.persona` → `control.merge`: 결과 병합')
  rules.push('')

  rules.push('### RAG 패턴')
  rules.push('- `rag.retriever` → `rag.context-builder` → `ai.llm-invoke`')
  rules.push('- 또는 `rag.retriever` → `prompt.template` → `ai.llm-invoke`')
  rules.push('')

  rules.push('### API 및 웹 검색 패턴')
  rules.push('- `api.web-search` → `ai.llm-invoke`: 웹 검색 결과 분석')
  rules.push('- `api.web-search` → `rag.context-builder` → `ai.llm-invoke`: 검색 결과를 컨텍스트로')
  rules.push('- `api.http-request` → `data.preprocess` → `ai.llm-invoke`: API 데이터 분석')
  rules.push('- `api.data-fetch` → `viz.chart`: 데이터 API 시각화')
  rules.push('- `ai.llm-invoke` → `api.web-search`: LLM이 검색 쿼리 생성')
  rules.push('')

  rules.push('### 임베딩 패턴')
  rules.push('- `ai.embedding` → `ai.llm-invoke`: 임베딩 결과 분석 가능')
  rules.push('- `api.web-search` → `ai.embedding`: 검색 결과 임베딩')
  rules.push('')

  rules.push('### 종료 노드 (출력이 없는 노드)')
  rules.push('- `viz.result-viewer`: 텍스트/JSON 결과 표시')
  rules.push('- `viz.chart`: 차트 시각화')
  rules.push('- `viz.table`: 테이블 표시')
  rules.push('- `export.excel`: Excel 파일 생성')
  rules.push('')

  rules.push('### 타입 변환 규칙')
  rules.push('- `file-ref[]` → `file-ref`: 배열의 각 요소를 순차 처리 (자동 반복)')
  rules.push('- `text[]` → `text`: 배열을 join하거나 첫 번째 요소 사용')
  rules.push('- `any` 타입: 모든 타입과 호환')

  return rules.join('\n')
}

// ============================================================
// Export Default
// ============================================================

export default {
  NODE_PORT_REGISTRY,
  TYPE_COMPATIBILITY,
  isTypeCompatible,
  needsArrayExpansion,
  canConnect,
  getConnectableTargets,
  getConnectableSources,
  getConnectionRulesSummary,
}
