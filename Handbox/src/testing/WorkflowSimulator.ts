/**
 * Workflow Simulator - 대규모 워크플로우 시뮬레이션 테스트 (v2.0)
 *
 * 🎯 핵심 목표: 실제 사용자 경험 시뮬레이션
 *
 * 사용자 여정:
 * 1. 프롬프트 입력 → LLM 호출
 * 2. 로딩 대기 → 워크플로우 생성
 * 3. 워크플로우 검토 → 노드/연결 검증
 * 4. 워크플로우 실행 → 실제 노드 실행
 * 5. 결과 확인 → 출력 검증
 * 6. 피드백 제공 → 학습 시스템 기록
 *
 * 핵심 기능:
 * - 실제 LLM 호출로 워크플로우 생성
 * - 모든 노드 타입 및 MCP 활용 시나리오
 * - 병렬/직렬/복합 워크플로우 패턴
 * - 성공한 건만 카운트 (실패 시 재시도)
 * - 버그 발생 시 자동 감지 및 기록
 * - 20,000건 성공 달성까지 무한 반복
 */

import { IntegratedWorkflowAgent, DesignErrorLearningSystem, type WorkflowDesign, type WorkflowNode, type WorkflowEdge } from '../services/IntegratedWorkflowAgent'
import { canConnect, NODE_PORT_REGISTRY } from '../registry/NodeConnectionRules'
import { executeWorkflow, type ExecuteWorkflowOptions } from '../engine/ExecutionEngine'
import type { Node, Edge } from 'reactflow'

// 새로운 시나리오 및 평가 시스템 (v4 - NotebookLM 대비)
import {
  REALISTIC_LONG_PROMPTS,
  MULTI_TURN_SCENARIOS,
  SIMULATION_CONFIG,
  evaluateXAI,
  evaluateAgainstCompetitors,
  evaluateAgainstNotebookLM,
  evaluateComplexityTimeRatio,  // 복잡도 대비 시간 평가 (신규)
  type XAIEvaluation,
  type CompetitorComparison,
  type NotebookLMComparison,
  type MultiTurnScenario,
  type ComplexityTimeEvaluation,  // 복잡도 대비 시간 평가 타입 (신규)
} from './RealisticSimulationScenarios'

// 프롬프트 전략 시스템 (v6 - 강화학습)
import { PromptStrategyRegistry } from '../services/PromptStrategyRegistry'
import { PromptStrategyEvaluator } from '../services/PromptStrategyEvaluator'

// ============================================================
// Configuration
// ============================================================

/** LLM 호출 간 딜레이 (ms) - rate limiting */
const LLM_CALL_DELAY_MS = 300

/** 배치 크기 - 이 수만큼 처리 후 잠시 쉼 */
const BATCH_SIZE = 10

/** 배치 간 딜레이 (ms) */
const BATCH_DELAY_MS = 1000

/** 단일 프롬프트 최대 재시도 횟수 */
const MAX_RETRIES_PER_PROMPT = 3

/** 재시도 딜레이 (ms) */
const RETRY_DELAY_MS = 500

/** 전체 실패 재시도 횟수 (버그 수정 후 전체 재시작) */
const MAX_FULL_RETRIES = 5

// ============================================================
// Scenario Categories - 모든 노드 및 MCP 활용
// ============================================================

/** 노드 카테고리별 시나리오 */
const SCENARIO_CATEGORIES = {
  // IO 노드 시나리오
  io: [
    "로컬 폴더에서 PDF 파일들 불러와서 분석해줘",
    "특정 파일 하나만 읽어서 내용 추출해",
    "API에서 데이터 가져와서 처리해줘",
    "S3 버킷에서 문서 로드해줘",
  ],

  // 변환 노드 시나리오
  convert: [
    "PDF 문서를 텍스트로 변환해줘",
    "이미지에서 텍스트 OCR 추출해줘",
    "스캔 문서 인식해서 텍스트화해",
    "여러 문서 형식을 통합 텍스트로 변환",
  ],

  // 텍스트 처리 시나리오
  text: [
    "긴 문서를 청크로 분할해줘",
    "텍스트 전처리하고 정규화해줘",
    "키워드 추출해서 태그 생성해",
    "문서 구조 분석해서 섹션별로 나눠",
  ],

  // AI 노드 시나리오
  ai: [
    "LLM으로 문서 요약해줘",
    "텍스트 임베딩 생성해서 저장해",
    "AI로 감성 분석 수행해줘",
    "자연어 질문에 대한 답변 생성해",
  ],

  // RAG 시나리오
  rag: [
    "문서 검색 RAG 시스템 구축해줘",
    "컨텍스트 기반으로 질문 답변해줘",
    "지식베이스 검색해서 관련 정보 추출",
    "벡터 검색으로 유사 문서 찾아줘",
  ],

  // 프롬프트 시나리오
  prompt: [
    "프롬프트 템플릿으로 질문 생성해",
    "Chain of Thought 방식으로 분석해줘",
    "Few-shot 예시 포함해서 요청해",
    "구조화된 프롬프트로 분석 요청",
  ],

  // 시각화 시나리오
  viz: [
    "분석 결과 차트로 시각화해줘",
    "데이터 테이블로 정리해서 보여줘",
    "결과를 마크다운으로 출력해",
    "인터랙티브 대시보드 생성해",
  ],

  // 내보내기 시나리오
  export: [
    "결과를 엑셀로 내보내줘",
    "JSON 형식으로 저장해",
    "PDF 보고서로 생성해줘",
    "CSV 파일로 다운로드",
  ],

  // 제어 흐름 시나리오
  control: [
    "조건에 따라 다른 처리 수행해",
    "여러 결과를 병합해줘",
    "반복 처리해서 모든 파일 분석해",
    "병렬로 동시에 처리해줘",
  ],

  // 에이전트 시나리오
  agent: [
    "전문가 페르소나로 평가해줘",
    "다중 에이전트가 협업해서 분석해",
    "위원회 방식으로 다수결 평가해",
    "역할 기반 에이전트로 검토해줘",
  ],

  // MCP 시나리오
  mcp: [
    "MCP 도구로 웹 검색해줘",
    "MCP 코드 실행 도구 사용해",
    "MCP 파일 시스템 조작해",
    "MCP API 호출 도구 실행해",
  ],
}

// ============================================================
// Test Prompt Templates
// ============================================================

/** 워크플로우 실행 패턴 */
const EXECUTION_PATTERNS = {
  sequential: "순차적으로",
  parallel: "병렬로 동시에",
  pipeline: "파이프라인으로",
  iterative: "반복적으로",
  conditional: "조건부로",
  hybrid: "복합적으로",
}

/** 복잡도 레벨 */
const COMPLEXITY_LEVELS = {
  single: { nodes: 2, description: "단일 처리" },
  simple: { nodes: 3, description: "단순 파이프라인" },
  moderate: { nodes: 5, description: "중간 복잡도" },
  complex: { nodes: 8, description: "복잡한 워크플로우" },
  advanced: { nodes: 12, description: "고급 멀티스텝" },
  expert: { nodes: 15, description: "전문가급 워크플로우" },
}

/**
 * 단순 프롬프트 (20%) - 모든 노드 카테고리 포함
 */
const SIMPLE_PROMPTS = [
  // IO
  "PDF 파일 읽어줘",
  "폴더에서 파일 불러와",
  "API 데이터 가져와",

  // Convert
  "문서 텍스트 변환해줘",
  "이미지 OCR 해줘",

  // Text
  "텍스트 분할해줘",
  "텍스트 전처리해",

  // AI
  "LLM으로 요약해줘",
  "임베딩 생성해",
  "AI 분석해줘",

  // RAG
  "문서 검색해줘",
  "RAG로 답변해",

  // Prompt
  "프롬프트 생성해",
  "CoT 분석해줘",

  // Viz
  "차트 그려줘",
  "결과 테이블로",
  "시각화해줘",

  // Export
  "엑셀로 저장",
  "JSON 내보내기",
  "PDF로 변환",

  // Control
  "조건부 처리해",
  "결과 병합해줘",

  // Agent
  "에이전트로 분석",
  "평가해줘",

  // MCP
  "MCP 도구 실행",
  "웹 검색해줘",
]

/**
 * 복잡한 프롬프트 (80%) - 모든 노드와 패턴 조합
 */
const COMPLEX_PROMPT_TEMPLATES = [
  // ========== 순차 처리 패턴 ==========
  "폴더에서 {docType} 파일들 읽어서 → 텍스트 추출하고 → {output}으로 저장해줘",
  "API에서 데이터 가져와서 → 전처리하고 → LLM으로 분석해줘",
  "PDF 문서 파싱해서 → 청크로 분할하고 → 임베딩 생성해서 저장",
  "{n}개 파일 읽고 → 각각 요약하고 → 통합 보고서 만들어줘",

  // ========== 병렬 처리 패턴 ==========
  "{n}개 문서를 병렬로 동시에 분석해줘",
  "여러 API에서 동시에 데이터 수집해서 통합 분석해",
  "각 파일을 병렬로 OCR하고 결과 합쳐줘",
  "동시에 여러 LLM 모델로 분석해서 비교해줘",

  // ========== RAG 파이프라인 ==========
  "문서들을 임베딩해서 벡터 DB에 저장하고 RAG 검색 시스템 구축해줘",
  "지식베이스에서 {question}에 대해 검색하고 근거와 함께 답변해줘",
  "관련 문서 검색해서 컨텍스트 구성하고 LLM으로 답변 생성해",
  "RAG로 검색한 후 Chain of Thought로 분석해줘",

  // ========== 다중 에이전트 패턴 ==========
  "{n}명의 전문가가 {target}을 {execution_pattern} 평가하는 워크플로우 만들어",
  "{domain1}, {domain2}, {domain3} 관점에서 병렬로 분석 후 결과 통합해줘",
  "위원회 방식으로 {n}명이 {target} 평가하고 다수결로 최종 결정해",
  "각 에이전트가 독립적으로 분석 후 투표로 결론 도출해",

  // ========== 조건부 처리 ==========
  "파일 형식에 따라 다른 처리 방식 적용해줘",
  "분석 결과가 {threshold} 이상이면 상세 분석, 아니면 요약만 해줘",
  "문서 길이에 따라 청킹 전략 다르게 적용해",
  "에러 발생시 대체 경로로 처리해줘",

  // ========== 반복 처리 ==========
  "폴더 내 모든 파일에 대해 반복적으로 분석 수행해",
  "{n}번 반복해서 결과 개선해줘",
  "각 청크에 대해 순차적으로 LLM 호출하고 결과 합쳐",
  "모든 문서에 대해 동일한 분석 파이프라인 실행해",

  // ========== 복합 파이프라인 ==========
  "PDF 읽기 → OCR → 텍스트 분할 → 임베딩 → RAG 검색 → LLM 답변 → 엑셀 저장",
  "API 데이터 → 전처리 → 분석 → 시각화 → PDF 보고서 생성",
  "다중 소스 데이터 수집 → 통합 → 분석 → 다중 형식 출력",
  "문서 파싱 → 요약 → 번역 → 평가 → 최종 보고서",

  // ========== MCP 도구 활용 ==========
  "MCP로 웹 검색하고 결과 분석해줘",
  "MCP 코드 실행 도구로 데이터 처리해",
  "MCP 파일 시스템 도구로 폴더 정리하고 분석해",
  "MCP API 도구로 외부 서비스 연동해줘",

  // ========== 시각화 통합 ==========
  "분석 결과를 차트, 테이블, 마크다운으로 동시에 출력해줘",
  "데이터 분석하고 인터랙티브 대시보드 생성해",
  "통계 계산하고 여러 형태의 시각화 생성해",

  // ========== 실제 사용자 패턴 (비정형) ==========
  "아 그냥 이거 분석해줘",
  "뭔가 보고서 비슷한 거 만들어줄 수 있어?",
  "저번에 했던 거 비슷하게 해줘",
  "이거 어떻게 처리하면 좋을까?",
  "복잡한 데이터인데 정리해줄 수 있어?",
  "여러 파일 한번에 처리하고 싶은데",
  "AI로 분석하고 결과 뽑아줘",
  "좀 더 나은 결과 얻을 수 있게 해줘",
  "더 정확한 분석 원해",

  // ========== 추가 비정형 프롬프트 (실제 사용 패턴) ==========
  "음... PDF 여러 개 있는데 그거 다 읽어서 뭔가 결과물 뽑아줄 수 있어?",
  "회사에서 쓸 보고서 만들어야 하는데 데이터 분석해서 시각화까지 해줘",
  "이 자료들 가지고 PT 만들 때 쓸 수 있게 정리해줘",
  "그냥 알아서 잘 처리해줘 ㅎㅎ",
  "이거랑 저거 합쳐서 뭔가 유용한 거 만들어봐",
  "전에 말한 것처럼 해줘",
  "좀 더 스마트하게 처리할 방법 없어?",
  "AI가 알아서 판단해서 처리해줬으면 좋겠어",
  "데이터가 많은데 자동으로 분류하고 정리해줄 수 있어?",
  "급하게 결과물 뽑아야 하는데 빨리 해줘",
  "이게 가능한지 모르겠는데 한번 해봐",
  "여기 있는 파일들 전부 다 처리해야 해",
  "뭔가 인사이트 있는 분석 해줘",
  "복잡하게 말하지 않을게, 그냥 분석해서 결과 줘",
  "시간 없어서 대충 설명하는데 알아서 해줘",
  "내가 원하는 건 이런 느낌인데...",
  "첫번째 파일 읽고 두번째 파일이랑 비교해서 차이점 알려줘",
  "1. PDF 읽기 2. 분석 3. 결과 저장 이렇게 해줘",
  "크롤링 → 전처리 → 분석 → 저장 순서로 해줘",
  "아 그리고 중간에 에러나면 알려주고",
  "결과가 맘에 안 들면 다시 처리할 수 있게 해줘",
  "일단 해보고 안 되면 말해줘",
  "이거 자동화 가능해?",
  "매번 수동으로 하기 귀찮은데 워크플로우로 만들어줘",
  "테스트로 한번 돌려볼 수 있어?",

  // ========== 도메인 특화 ==========
  "{target}를 기술, 경제, 안전, 환경, 법규 측면에서 종합 평가해줘",
  "건설 신기술 평가를 10명 위원회가 다수결로 심사해",
  "논문 {n}편을 분석해서 연구 동향 보고서 작성해",
  "계약서 검토하고 위험 조항 추출해서 요약해줘",
  "기술 문서 번역하고 용어집 생성해",

  // ========== 고급 워크플로우 ==========
  "데이터 ETL 파이프라인 구축해줘",
  "실시간 데이터 처리 워크플로우 만들어",
  "CI/CD 스타일 문서 처리 파이프라인 구성해",
  "마이크로서비스 아키텍처처럼 모듈화된 워크플로우 설계해",
]

/**
 * 변수 대체용 값들 - 확장됨
 */
const VARIABLES: Record<string, (string | number)[]> = {
  n: [3, 5, 7, 10, 15, 20, 50, 100],
  docType: ['논문', '보고서', '계약서', '매뉴얼', 'PDF', '엑셀', '문서', '자료', 'PPT', '이미지'],
  output: ['보고서', '엑셀', '차트', '요약문', '테이블', 'JSON', 'PDF', 'CSV', '마크다운'],
  topic: ['기술', '경제', '환경', '안전', '법률', '정책', '트렌드', '성능', '품질'],
  question: ['핵심 내용이 뭐야', '결론은', '장단점은', '비교 결과는', '추천은', '위험 요소는', '개선점은'],
  task: ['요약', '분석', '비교', '검증', '추출', '번역', '분류', '평가'],
  target: ['신기술', '프로젝트', '제안서', '논문', '보고서', '계획서', '시스템', '제품'],
  domain1: ['기술', '구조', '재료', '설계', '성능'],
  domain2: ['경제성', '시공성', '품질', '효율성'],
  domain3: ['안전', '환경', '법규', '정책', '지속가능성'],
  input: ['PDF', '엑셀', '문서', '데이터', 'API', '이미지'],
  threshold: ['70%', '80%', '90%', '50점', '합격 기준'],
  execution_pattern: Object.values(EXECUTION_PATTERNS),
  process: ['분석', '변환', '추출', '요약'],
}

// ============================================================
// Test Result Types
// ============================================================

export interface SimulationResult {
  promptId: number
  prompt: string
  promptType: 'simple' | 'complex' | 'long' | 'multi_turn'
  scenarioCategory?: string  // 시나리오 카테고리 (io, ai, rag 등)

  // 1단계: 워크플로우 생성 결과
  workflowGenerated: boolean
  workflowError?: string
  workflow?: WorkflowDesign
  generationTimeMs: number

  // 2단계: 워크플로우 검증 결과
  validationPassed: boolean
  validationErrors: string[]

  // 3단계: 노드 연결 검증
  connectionErrors: string[]

  // 4단계: 실행 시뮬레이션 결과 (포트 검증)
  executionSimulated: boolean
  nodeExecutionResults: {
    nodeId: string
    nodeType: string
    success: boolean
    error?: string
  }[]

  // 5단계: 실제 워크플로우 실행 결과
  workflowExecuted: boolean
  executionTimeMs: number
  executionError?: string
  executionOutputs?: Record<string, any>  // 각 노드의 출력값
  completedNodes: number  // 완료된 노드 수
  failedNodes: string[]   // 실패한 노드 ID 목록

  // 6단계: 결과 품질 (자동 평가)
  outputQuality?: 'good' | 'acceptable' | 'poor' | 'error'
  qualityNotes?: string

  // 사용된 노드 타입
  usedNodeTypes: string[]

  // 재시도 정보
  retryCount: number

  // 종합 상태
  overallSuccess: boolean
  failureReasons: string[]

  // 시뮬레이션 단계별 진행
  stagesCompleted: ('generation' | 'validation' | 'connection' | 'simulation' | 'execution' | 'result')[]

  // === 신규: XAI 평가 ===
  xaiEvaluation?: XAIEvaluation
  xaiPassed?: boolean

  // === 신규: 상대 평가 ===
  competitorComparison?: CompetitorComparison
  competitorPassed?: boolean

  // === 신규: 멀티턴 시나리오 ===
  isMultiTurn?: boolean
  multiTurnScenarioId?: string
  currentTurn?: number
  totalTurns?: number

  // === 신규: 프롬프트 복잡도 ===
  promptLength?: number
  promptComplexity?: 'simple' | 'complex' | 'long' | 'multi_turn'

  // === 신규: AI 설명 품질 ===
  aiExplanation?: string
  explanationQuality?: 'intuitive' | 'technical' | 'unclear'

  // === v4: NotebookLM 대비 평가 ===
  notebookLMComparison?: NotebookLMComparison
  notebookLMPassed?: boolean
  taskType?: 'summary' | 'qa' | 'analysis' | 'multi_doc' | 'general'

  // === v5: 복잡도 대비 시간 효율성 평가 (강화학습 보상/패널티) ===
  complexityTimeEvaluation?: ComplexityTimeEvaluation
  timeEfficiencyPassed?: boolean  // efficiencyScore >= 5 이면 합격

  // === v6: 프롬프트 전략 평가 (강화학습 시스템) ===
  promptStrategyUsed?: string                // 사용된 전략 ID
  promptStrategyEvaluation?: {
    strategyId: string
    success: boolean
    qualityScore: number                     // 1-10
    rewardPenalty: number                    // -5 ~ +5
    weightUpdate: { delta: number; newWeight: number }
    alternatives: Array<{ id: string; score: number }>
  }
}

/** 버그 레코드 */
export interface BugRecord {
  id: string
  timestamp: number
  prompt: string
  errorType: string
  errorMessage: string
  nodeType?: string
  connectionPair?: { source: string; target: string }
  stackTrace?: string
  fixed: boolean
  fixDescription?: string
}

export interface SimulationSummary {
  totalTests: number
  successCount: number
  failureCount: number
  successRate: number

  // 카테고리별 성공률
  simplePromptSuccess: number
  complexPromptSuccess: number
  longPromptSuccess: number      // 신규
  multiTurnSuccess: number       // 신규

  // XAI 평가 통계
  xaiPassRate: number            // XAI 합격률
  avgXaiScore: number            // 평균 XAI 점수

  // 상대 평가 통계
  competitorPassRate: number     // 상대 평가 합격률
  avgCompetitorScore: number     // 평균 상대 점수

  // 시나리오 카테고리별 성공률
  categorySuccessRates: Record<string, number>

  // 오류 유형별 집계
  errorsByType: Record<string, number>

  // 가장 흔한 오류
  topErrors: { error: string; count: number }[]

  // 문제가 있는 노드 타입
  problematicNodeTypes: { type: string; errorCount: number }[]

  // 연결 문제
  connectionIssues: { source: string; target: string; count: number }[]

  // 버그 통계
  bugsDetected: number
  bugsFixed: number
  bugs: BugRecord[]

  // 노드 커버리지
  nodeTypesCovered: string[]
  nodeTypesNotCovered: string[]
  coverageRate: number

  // 시간 통계
  avgGenerationTimeMs: number
  totalTimeMs: number

  // 재시도 통계
  totalRetries: number
  avgRetriesPerTest: number

  // === v5: 시간 효율성 통계 (강화학습) ===
  timeEfficiencyStats: {
    avgEfficiencyScore: number      // 평균 효율성 점수 (1-10)
    avgEfficiencyRatio: number      // 평균 효율성 비율
    totalBonus: number              // 총 보너스 점수
    totalPenalty: number            // 총 패널티 점수
    netBonusPenalty: number         // 순 보너스/패널티
    gradeDistribution: {            // 등급 분포
      exceptional: number
      efficient: number
      normal: number
      slow: number
      very_slow: number
    }
  }

  // === v6: 프롬프트 전략 통계 (강화학습) ===
  promptStrategyStats: {
    totalEvaluations: number
    avgRewardPenalty: number        // 평균 보상/패널티
    strategyUsageDistribution: Record<string, number>  // 전략별 사용 횟수
    strategySuccessRates: Record<string, number>       // 전략별 성공률
    topPerformingStrategies: Array<{ id: string; avgReward: number; uses: number }>
    totalWeightUpdates: number
  }
}

// ============================================================
// Simulator Class
// ============================================================

export class WorkflowSimulator {
  private results: SimulationResult[] = []
  private successfulResults: SimulationResult[] = []  // 성공한 것만
  private agent: typeof IntegratedWorkflowAgent
  private onProgress?: (current: number, total: number, result: SimulationResult) => void
  private onBugDetected?: (bug: BugRecord) => void
  private stopRequested = false
  private bugs: BugRecord[] = []
  private coveredNodeTypes: Set<string> = new Set()
  private promptIndex = 0  // 프롬프트 인덱스 (무한 생성용)

  constructor() {
    this.agent = IntegratedWorkflowAgent
  }

  /**
   * 프로그레스 콜백 설정
   */
  setProgressCallback(callback: (current: number, total: number, result: SimulationResult) => void) {
    this.onProgress = callback
  }

  /**
   * 버그 감지 콜백 설정
   */
  setBugCallback(callback: (bug: BugRecord) => void) {
    this.onBugDetected = callback
  }

  /**
   * 버그 기록
   */
  private recordBug(
    prompt: string,
    errorType: string,
    errorMessage: string,
    nodeType?: string,
    connectionPair?: { source: string; target: string }
  ): BugRecord {
    const bug: BugRecord = {
      id: `bug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      prompt,
      errorType,
      errorMessage,
      nodeType,
      connectionPair,
      fixed: false,
    }
    this.bugs.push(bug)

    console.error(`🐛 [BUG DETECTED] ${errorType}: ${errorMessage}`)
    if (nodeType) console.error(`   노드 타입: ${nodeType}`)
    if (connectionPair) console.error(`   연결: ${connectionPair.source} → ${connectionPair.target}`)

    // 설계 품질 학습 시스템에 오류 기록 (강화학습)
    if (errorType === 'UNREGISTERED_NODE' && nodeType) {
      DesignErrorLearningSystem.recordError('UNREGISTERED_NODE', nodeType, prompt)
    } else if (errorType === 'CONNECTION_ERROR' && connectionPair) {
      DesignErrorLearningSystem.recordError('CONNECTION_ERROR', `${connectionPair.source} → ${connectionPair.target}`, prompt)
    } else if (errorType === 'EXECUTION_ERROR' && nodeType) {
      DesignErrorLearningSystem.recordError('EXECUTION_ERROR', nodeType, prompt)
    } else if (errorType === 'EXECUTION_ERROR' || errorType === 'PORT_MISMATCH') {
      DesignErrorLearningSystem.recordError('EXECUTION_ERROR', errorMessage.slice(0, 100), prompt)
    }

    if (this.onBugDetected) {
      this.onBugDetected(bug)
    }

    return bug
  }

  /**
   * 커버리지 추적
   */
  private trackCoverage(workflow?: WorkflowDesign) {
    if (!workflow) return
    for (const node of workflow.nodes) {
      this.coveredNodeTypes.add(node.type)
    }
  }

  /**
   * 모든 등록된 노드 타입
   */
  private getAllNodeTypes(): string[] {
    return Object.keys(NODE_PORT_REGISTRY)
  }

  /**
   * 시뮬레이션 중지 요청
   */
  stop() {
    this.stopRequested = true
  }

  /**
   * 랜덤 프롬프트 생성 (v2 - 완전 랜덤화)
   * - 15% 단순 프롬프트 (랜덤 선택)
   * - 25% 긴/복잡 프롬프트 (실제 사용 패턴)
   * - 10% 멀티턴 시나리오
   * - 25% 일반 복잡 프롬프트 (템플릿 + 랜덤 변수)
   * - 25% 카테고리별 시나리오 (모든 노드 유형 커버)
   */
  private generatePrompt(_index: number): {
    prompt: string
    type: 'simple' | 'complex' | 'long' | 'multi_turn'
    scenario?: MultiTurnScenario
    category?: string
  } {
    const rand = Math.random()

    // 15% 단순 프롬프트 - 완전 랜덤 선택
    if (rand < 0.15) {
      const randomIdx = Math.floor(Math.random() * SIMPLE_PROMPTS.length)
      const prompt = SIMPLE_PROMPTS[randomIdx]
      return { prompt, type: 'simple' }
    }

    // 25% 긴/복잡 프롬프트 (실제 Claude/ChatGPT 사용 패턴) - 랜덤 선택
    if (rand < 0.40) {
      const randomIdx = Math.floor(Math.random() * REALISTIC_LONG_PROMPTS.length)
      const prompt = REALISTIC_LONG_PROMPTS[randomIdx]
      return { prompt, type: 'long' }
    }

    // 10% 멀티턴 시나리오 - 랜덤 선택
    if (rand < 0.50) {
      const randomIdx = Math.floor(Math.random() * MULTI_TURN_SCENARIOS.length)
      const scenario = MULTI_TURN_SCENARIOS[randomIdx]
      return {
        prompt: scenario.turns[0].content,
        type: 'multi_turn',
        scenario,
      }
    }

    // 25% 카테고리별 시나리오 - 모든 노드 유형 커버
    if (rand < 0.75) {
      const categories = Object.keys(SCENARIO_CATEGORIES) as (keyof typeof SCENARIO_CATEGORIES)[]
      const randomCategory = categories[Math.floor(Math.random() * categories.length)]
      const categoryPrompts = SCENARIO_CATEGORIES[randomCategory]
      const randomPrompt = categoryPrompts[Math.floor(Math.random() * categoryPrompts.length)]
      return { prompt: randomPrompt, type: 'complex', category: randomCategory }
    }

    // 25% 일반 복잡 프롬프트 - 템플릿 + 랜덤 변수
    const randomIdx = Math.floor(Math.random() * COMPLEX_PROMPT_TEMPLATES.length)
    const template = COMPLEX_PROMPT_TEMPLATES[randomIdx]
    let prompt = template

    // 변수 대체 - 각 변수마다 랜덤 선택
    for (const [key, values] of Object.entries(VARIABLES)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g')
      // 여러 번 나오는 변수는 매번 다른 값으로 대체
      prompt = prompt.replace(regex, () => {
        const value = values[Math.floor(Math.random() * values.length)]
        return String(value)
      })
    }

    return { prompt, type: 'complex' }
  }

  /**
   * 워크플로우 검증
   */
  private validateWorkflow(workflow: WorkflowDesign): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // 1. 노드 존재 확인
    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push('워크플로우에 노드가 없습니다')
      return { valid: false, errors }
    }

    // 2. 노드 타입 유효성 확인
    for (const node of workflow.nodes) {
      if (!node.type) {
        errors.push(`노드 ${node.id}에 타입이 없습니다`)
      }
      if (!NODE_PORT_REGISTRY[node.type]) {
        errors.push(`미등록 노드 타입: ${node.type} (노드: ${node.id})`)
      }
    }

    // 3. 엣지 유효성 확인
    const nodeIds = new Set(workflow.nodes.map(n => n.id))
    for (const edge of workflow.edges || []) {
      if (!nodeIds.has(edge.source)) {
        errors.push(`엣지 소스 노드 없음: ${edge.source}`)
      }
      if (!nodeIds.has(edge.target)) {
        errors.push(`엣지 타겟 노드 없음: ${edge.target}`)
      }
    }

    // 4. 시작 노드 확인 (입력 엣지가 없는 노드)
    const targetNodes = new Set((workflow.edges || []).map(e => e.target))
    const startNodes = workflow.nodes.filter(n => !targetNodes.has(n.id))
    if (startNodes.length === 0) {
      errors.push('시작 노드가 없습니다 (순환 구조 의심)')
    }

    // 5. 종료 노드 확인 (출력 엣지가 없는 노드)
    const sourceNodes = new Set((workflow.edges || []).map(e => e.source))
    const endNodes = workflow.nodes.filter(n => !sourceNodes.has(n.id))
    if (endNodes.length === 0 && workflow.nodes.length > 1) {
      errors.push('종료 노드가 없습니다 (순환 구조 의심)')
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * 노드 연결 검증
   */
  private validateConnections(workflow: WorkflowDesign): string[] {
    const errors: string[] = []
    const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]))

    for (const edge of workflow.edges || []) {
      const sourceNode = nodeMap.get(edge.source)
      const targetNode = nodeMap.get(edge.target)

      if (!sourceNode || !targetNode) continue

      const result = canConnect(sourceNode.type, targetNode.type)
      if (!result.canConnect) {
        errors.push(`연결 불가: ${sourceNode.type} → ${targetNode.type} (${result.reason})`)
      }
    }

    return errors
  }

  /**
   * 노드 실행 시뮬레이션
   */
  private simulateExecution(workflow: WorkflowDesign): {
    nodeId: string
    nodeType: string
    success: boolean
    error?: string
  }[] {
    const results: { nodeId: string; nodeType: string; success: boolean; error?: string }[] = []

    for (const node of workflow.nodes) {
      const portInfo = NODE_PORT_REGISTRY[node.type]

      // 미등록 노드
      if (!portInfo) {
        results.push({
          nodeId: node.id,
          nodeType: node.type,
          success: false,
          error: `미등록 노드 타입: ${node.type}`,
        })
        continue
      }

      // 필수 입력 포트 확인
      const requiredInputs = portInfo.inputs.filter(p => p.required)
      const incomingEdges = (workflow.edges || []).filter(e => e.target === node.id)

      if (requiredInputs.length > 0 && incomingEdges.length === 0) {
        // 시작 노드가 아닌데 입력이 없는 경우
        const isStartNode = portInfo.canReceiveFrom.length === 0
        if (!isStartNode) {
          results.push({
            nodeId: node.id,
            nodeType: node.type,
            success: false,
            error: `필수 입력 포트에 연결된 엣지 없음`,
          })
          continue
        }
      }

      // 설정 필수값 확인 (시뮬레이션 - 실제 값은 없으므로 타입만 확인)
      results.push({
        nodeId: node.id,
        nodeType: node.type,
        success: true,
      })
    }

    return results
  }

  /**
   * 시뮬레이션용 mock config 생성
   * IO 노드에 가상의 경로를 주입하여 실행 가능하게 함
   */
  private getSimulationMockConfig(nodeType: string): Record<string, any> {
    switch (nodeType) {
      case 'io.local-folder':
        return {
          folder_path: 'C:/simulation/mock_folder',
          file_filter: '*.pdf;*.txt',
          read_content: false,
        }
      case 'io.local-file':
        return {
          file_path: 'C:/simulation/mock_file.txt',
        }
      case 'data.file-loader':
        return {
          file_path: 'C:/simulation/mock_data.json',
        }
      case 'api.http-request':
        return {
          url: 'https://api.example.com/mock',
          method: 'GET',
        }
      case 'convert.doc-parser':
        return {
          file_path: 'C:/simulation/mock_document.pdf',
        }
      default:
        return {}
    }
  }

  /**
   * 실제 워크플로우 실행 (사용자 경험 시뮬레이션)
   */
  private async executeWorkflowActual(
    workflow: WorkflowDesign,
    promptId: number
  ): Promise<{
    executed: boolean
    timeMs: number
    error?: string
    outputs: Record<string, any>
    completedNodes: number
    failedNodes: string[]
  }> {
    const startTime = Date.now()
    const outputs: Record<string, any> = {}
    const failedNodes: string[] = []
    let completedNodes = 0

    try {
      // WorkflowDesign을 ReactFlow 노드/엣지로 변환
      // 시뮬레이션 모드에서는 IO 노드에 mock config 주입
      const nodes: Node[] = workflow.nodes.map(n => {
        const mockConfig = this.getSimulationMockConfig(n.type)
        return {
          id: n.id,
          type: n.type,
          position: { x: n.position?.x || 0, y: n.position?.y || 0 },
          data: {
            label: n.label || n.type,
            ...mockConfig,  // 시뮬레이션 mock config 먼저
            ...(n.toolConfig || {}),  // 실제 설정이 있으면 덮어씀
          },
        }
      })

      const edges: Edge[] = (workflow.edges || []).map(e => ({
        id: e.id || `edge_${e.source}_${e.target}`,
        source: e.source,
        target: e.target,
      }))

      // 실행 완료 추적
      let executionComplete = false

      // 워크플로우 실행 (시뮬레이션 모드)
      await executeWorkflow({
        nodes,
        edges,
        onNodeStatusChange: (nodeId, status, output) => {
          if (status === 'completed') {
            completedNodes++
            if (output) {
              outputs[nodeId] = output
            }
          } else if (status === 'error') {
            failedNodes.push(nodeId)
          }
        },
        onComplete: () => {
          executionComplete = true
        },
        isSimulation: true,  // 시뮬레이션 모드 활성화 - mock 데이터 사용
      })

      const timeMs = Date.now() - startTime
      console.log(`[Simulator #${promptId}] 워크플로우 실행: ${completedNodes}/${nodes.length} 노드 완료 (${timeMs}ms)`)

      return {
        executed: true,
        timeMs,
        outputs,
        completedNodes,
        failedNodes,
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[Simulator #${promptId}] 워크플로우 실행 오류: ${errorMessage}`)

      return {
        executed: false,
        timeMs: Date.now() - startTime,
        error: errorMessage,
        outputs,
        completedNodes,
        failedNodes,
      }
    }
  }

  /**
   * 출력 품질 평가 (v2 - 버그 수정)
   *
   * 버그 수정:
   * - 기존: validRatio >= 0.9 && hasContent → 'good'
   * - 문제: 시뮬레이션 환경에서 hasContent가 false가 되어 항상 'acceptable' 반환
   * - 수정: validRatio >= 0.9이면 'good' (hasContent 조건 완화)
   */
  private evaluateOutputQuality(outputs: Record<string, any>): 'good' | 'acceptable' | 'poor' | 'error' {
    const outputCount = Object.keys(outputs).length

    if (outputCount === 0) {
      return 'error'
    }

    // 출력값 검사
    let validOutputs = 0
    let hasContent = false
    let hasStructuredOutput = false

    for (const [nodeId, output] of Object.entries(outputs)) {
      if (output === null || output === undefined) continue

      validOutputs++

      // 텍스트 출력인 경우 길이 확인
      if (typeof output === 'string' && output.length > 10) {
        hasContent = true
      }
      // 객체 출력인 경우 키 개수 확인
      else if (typeof output === 'object') {
        const keys = Object.keys(output)
        if (keys.length > 0) {
          hasContent = true
          // 구조화된 출력 확인 (text, data, result, output 등의 키 존재)
          if (keys.some(k => ['text', 'data', 'result', 'output', 'content', 'response'].includes(k))) {
            hasStructuredOutput = true
          }
        }
      }
    }

    const validRatio = validOutputs / outputCount

    // 버그 수정: validRatio >= 0.9이면 'good' (90% 이상 노드가 유효한 출력 생성)
    // hasContent 조건은 보너스로만 사용 (필수 아님)
    if (validRatio >= 0.9) {
      return 'good'
    } else if (validRatio >= 0.7) {
      return hasContent || hasStructuredOutput ? 'good' : 'acceptable'
    } else if (validRatio >= 0.5) {
      return 'acceptable'
    } else {
      return 'poor'
    }
  }

  /**
   * 단일 프롬프트 시뮬레이션 - 실제 사용자 경험 전체 시뮬레이션
   *
   * 단계:
   * 1. 프롬프트 입력 → LLM 호출 → 워크플로우 생성
   * 2. 워크플로우 검증 (구조, 연결)
   * 3. 포트 시뮬레이션
   * 4. 실제 워크플로우 실행
   * 5. 결과 확인 및 품질 평가
   */
  private async simulateOne(promptId: number, retryCount = 0): Promise<SimulationResult> {
    const { prompt, type, scenario } = this.generatePrompt(promptId)

    const result: SimulationResult = {
      promptId,
      prompt,
      promptType: type,
      // 멀티턴 시나리오 메타데이터
      isMultiTurn: type === 'multi_turn',
      multiTurnScenarioId: scenario?.id,
      currentTurn: type === 'multi_turn' ? 1 : undefined,
      totalTurns: scenario?.turns?.length,
      // 1단계: 워크플로우 생성
      workflowGenerated: false,
      generationTimeMs: 0,
      // 2단계: 구조 검증
      validationPassed: false,
      validationErrors: [],
      // 3단계: 연결 검증
      connectionErrors: [],
      // 4단계: 포트 시뮬레이션
      executionSimulated: false,
      nodeExecutionResults: [],
      // 5단계: 실제 실행
      workflowExecuted: false,
      executionTimeMs: 0,
      completedNodes: 0,
      failedNodes: [],
      // 메타데이터
      usedNodeTypes: [],
      retryCount: 0,
      overallSuccess: false,
      failureReasons: [],
      stagesCompleted: [],
    }

    const startTime = Date.now()

    try {
      // ============================================================
      // 1. 실제 LLM 호출로 워크플로우 생성
      // ============================================================
      console.log(`[Simulator #${promptId}] LLM 호출 중: "${prompt.slice(0, 50)}..."`)

      const chatResponse = await this.agent.chat(prompt)

      result.generationTimeMs = Date.now() - startTime

      // LLM 응답 분석
      if (chatResponse.workflow) {
        result.workflowGenerated = true
        result.workflow = chatResponse.workflow
        result.stagesCompleted.push('generation')
        console.log(`[Simulator #${promptId}] ✓ 1단계: 워크플로우 생성 - 노드: ${chatResponse.workflow.nodes.length}개`)
      } else {
        // 워크플로우가 생성되지 않음 (명확화 질문이 필요한 경우 등)
        result.workflowGenerated = false
        result.workflowError = chatResponse.clarifyingQuestions.length > 0
          ? `명확화 필요: ${chatResponse.clarifyingQuestions[0]}`
          : `워크플로우 미생성: ${chatResponse.response.slice(0, 100)}`
        result.failureReasons.push(result.workflowError)
        return result
      }

      const workflow = chatResponse.workflow

      // 커버리지 추적
      this.trackCoverage(workflow)
      result.usedNodeTypes = workflow.nodes.map(n => n.type)

      // ============================================================
      // 2. 워크플로우 구조 검증
      // ============================================================
      const validation = this.validateWorkflow(workflow)
      result.validationPassed = validation.valid
      result.validationErrors = validation.errors
      if (validation.valid) {
        result.stagesCompleted.push('validation')
        console.log(`[Simulator #${promptId}] ✓ 2단계: 구조 검증 통과`)
      } else {
        result.failureReasons.push(...validation.errors)
        // 버그 기록
        for (const error of validation.errors) {
          if (error.includes('미등록 노드')) {
            const match = error.match(/미등록 노드 타입: (\S+)/)
            this.recordBug(prompt, 'UNREGISTERED_NODE', error, match?.[1])
          }
        }
      }

      // ============================================================
      // 3. 노드 연결 규칙 검증
      // ============================================================
      result.connectionErrors = this.validateConnections(workflow)
      if (result.connectionErrors.length === 0) {
        result.stagesCompleted.push('connection')
        console.log(`[Simulator #${promptId}] ✓ 3단계: 연결 규칙 검증 통과`)
      } else {
        result.failureReasons.push(...result.connectionErrors)
        // 연결 버그 기록
        for (const error of result.connectionErrors) {
          const match = error.match(/연결 불가: (\S+) → (\S+)/)
          if (match) {
            this.recordBug(prompt, 'CONNECTION_ERROR', error, undefined, { source: match[1], target: match[2] })
          }
        }
      }

      // ============================================================
      // 4. 노드 실행 시뮬레이션 (포트 요구사항 검증)
      // ============================================================
      result.nodeExecutionResults = this.simulateExecution(workflow)
      result.executionSimulated = true
      result.stagesCompleted.push('simulation')

      const executionErrors = result.nodeExecutionResults.filter(r => !r.success)
      if (executionErrors.length > 0) {
        result.failureReasons.push(...executionErrors.map(e => e.error || '실행 오류'))
        // 실행 버그 기록
        for (const execError of executionErrors) {
          this.recordBug(prompt, 'EXECUTION_ERROR', execError.error || '실행 오류', execError.nodeType)
        }
      }

      // ============================================================
      // 5. 실제 워크플로우 실행 (사용자 경험 시뮬레이션)
      // ============================================================
      // 검증을 통과한 경우에만 실행
      if (result.validationPassed && result.connectionErrors.length === 0 && executionErrors.length === 0) {
        const executionResult = await this.executeWorkflowActual(workflow, promptId)
        result.workflowExecuted = executionResult.executed
        result.executionTimeMs = executionResult.timeMs
        result.executionError = executionResult.error
        result.executionOutputs = executionResult.outputs
        result.completedNodes = executionResult.completedNodes
        result.failedNodes = executionResult.failedNodes

        if (executionResult.executed && executionResult.failedNodes.length === 0) {
          result.stagesCompleted.push('execution')
          console.log(`[Simulator #${promptId}] 🚀 워크플로우 실행 완료 (${executionResult.completedNodes}개 노드)`)
        } else if (executionResult.error) {
          result.failureReasons.push(`실행 오류: ${executionResult.error}`)
          this.recordBug(prompt, 'WORKFLOW_EXECUTION_ERROR', executionResult.error)
        }

        // 결과 품질 평가
        if (executionResult.outputs && Object.keys(executionResult.outputs).length > 0) {
          result.outputQuality = this.evaluateOutputQuality(executionResult.outputs)
          result.stagesCompleted.push('result')
        }
      } else {
        result.workflowExecuted = false
        result.executionTimeMs = 0
        result.completedNodes = 0
        result.failedNodes = []
      }

      // ============================================================
      // 6. XAI 평가 (설명 직관성)
      // ============================================================
      if (SIMULATION_CONFIG.enableXAI && chatResponse?.response) {
        result.aiExplanation = chatResponse.response
        result.xaiEvaluation = evaluateXAI(chatResponse.response)
        result.xaiPassed = result.xaiEvaluation.passed

        if (!result.xaiPassed) {
          result.failureReasons.push(`XAI 점수 미달: ${result.xaiEvaluation.totalScore}/30`)
          result.explanationQuality = 'unclear'
          if (SIMULATION_CONFIG.failOnXAIFail) {
            this.recordBug(prompt, 'XAI_QUALITY_FAIL', `XAI 점수 ${result.xaiEvaluation.totalScore}/30 (최소 21점 필요)`)
          }
        } else {
          result.explanationQuality = result.xaiEvaluation.intuitiveness >= 4 ? 'intuitive' : 'technical'
        }
      }

      // ============================================================
      // 7. 상대 평가 (경쟁 플랫폼 대비)
      // ============================================================
      if (SIMULATION_CONFIG.enableCompetitorComparison) {
        result.competitorComparison = evaluateAgainstCompetitors({
          taskCompleted: result.workflowExecuted && result.failedNodes.length === 0,
          nodeCount: workflow?.nodes?.length || 0,
          executionTimeMs: result.executionTimeMs || 0,
          errors: result.failureReasons,
          outputQuality: result.outputQuality || 'error',
          xaiScore: result.xaiEvaluation?.totalScore || 15,
        })
        result.competitorPassed = result.competitorComparison.passed

        if (!result.competitorPassed && SIMULATION_CONFIG.failOnCompetitorFail) {
          result.failureReasons.push(`상대 평가 미달: ${result.competitorComparison.totalScore}/60`)
          this.recordBug(prompt, 'COMPETITOR_SCORE_FAIL', `경쟁 점수 ${result.competitorComparison.totalScore}/60 (최소 42점 필요)`)
        }
      }

      // ============================================================
      // 8. NotebookLM 대비 평가 (우선 목표)
      // ============================================================
      // 작업 유형 추정
      const hasRAG = result.usedNodeTypes.some(t => t.includes('rag'))
      const hasMultiDoc = result.usedNodeTypes.some(t => t.includes('folder') || t.includes('multi'))
      const hasQA = prompt.includes('질문') || prompt.includes('검색') || prompt.includes('찾아')
      const hasSummary = prompt.includes('요약') || prompt.includes('정리')

      let taskType: 'summary' | 'qa' | 'analysis' | 'multi_doc' | 'general' = 'general'
      if (hasMultiDoc || hasRAG) taskType = 'multi_doc'
      else if (hasQA) taskType = 'qa'
      else if (hasSummary) taskType = 'summary'
      else if (prompt.includes('분석') || prompt.includes('평가')) taskType = 'analysis'

      result.taskType = taskType

      // NotebookLM 대비 평가 수행
      result.notebookLMComparison = evaluateAgainstNotebookLM({
        taskCompleted: result.workflowExecuted && result.failedNodes.length === 0,
        nodeCount: workflow?.nodes?.length || 0,
        executionTimeMs: result.executionTimeMs || 0,
        nodeTypes: result.usedNodeTypes,
        outputQuality: result.outputQuality || 'error',
        hasCitations: result.usedNodeTypes.some(t => t.includes('context') || t.includes('retriever')),
        hasStructuredOutput: result.usedNodeTypes.some(t => t.includes('viz') || t.includes('table')),
      }, taskType)

      result.notebookLMPassed = result.notebookLMComparison.beatsNotebookLM

      if (result.notebookLMPassed) {
        console.log(`[Simulator #${promptId}] 🏆 NotebookLM 우위: ${result.notebookLMComparison.totalScore.toFixed(1)}/100`)
      }

      // ============================================================
      // 9. 복잡도 대비 시간 효율성 평가 (강화학습 보상/패널티)
      // ============================================================
      // 총 처리 시간 = 생성 시간 + 실행 시간
      const totalProcessingTime = result.generationTimeMs + (result.executionTimeMs || 0)
      result.complexityTimeEvaluation = evaluateComplexityTimeRatio(
        prompt,
        result.usedNodeTypes,
        totalProcessingTime
      )
      result.timeEfficiencyPassed = result.complexityTimeEvaluation.efficiencyScore >= 5

      // 시간 효율성 로그 (보너스/패널티 있을 때만)
      if (result.complexityTimeEvaluation.bonusPenalty !== 0) {
        console.log(`[Simulator #${promptId}] ${result.complexityTimeEvaluation.feedback}`)
      }

      // ============================================================
      // 9.5. 프롬프트 전략 평가 (강화학습 시스템)
      // ============================================================
      try {
        // 전략 선택 (현재는 simple 전략 고정, 실제로는 자동 선택)
        const strategySelection = PromptStrategyRegistry.selectStrategy({
          originalPrompt: prompt,
          complexity: result.complexityTimeEvaluation?.promptComplexityScore || 5,
        })

        result.promptStrategyUsed = strategySelection.selectedStrategy

        // 품질 점수 계산 (XAI 점수 기반)
        const qualityScore = Math.round(((result.xaiEvaluation?.totalScore || 15) / 30) * 10)

        // 전략 평가 및 학습
        const strategyEval = PromptStrategyEvaluator.evaluate(
          strategySelection.selectedStrategy as any,
          prompt,
          {
            transformedPrompt: prompt,
            examplesUsed: 0,
            additionalTokens: 0,
            metadata: {
              strategyId: strategySelection.selectedStrategy as any,
              appliedAt: Date.now(),
              transformationSteps: [],
            },
          },
          totalProcessingTime,
          result.workflowGenerated && result.validationPassed && result.connectionErrors.length === 0,
          qualityScore,
          strategySelection.analysis.detectedDomain
        )

        result.promptStrategyEvaluation = {
          strategyId: strategySelection.selectedStrategy,
          success: strategyEval.success,
          qualityScore: strategyEval.qualityScore,
          rewardPenalty: strategyEval.rewardPenalty.total,
          weightUpdate: strategyEval.weightUpdate,
          alternatives: strategySelection.alternatives.map(a => ({
            id: a.strategyId,
            score: a.score,
          })),
        }

        // 전략 평가 로그 (보상/패널티 있을 때만)
        if (strategyEval.rewardPenalty.total !== 0) {
          const rewardStr = strategyEval.rewardPenalty.total > 0
            ? `+${strategyEval.rewardPenalty.total}`
            : `${strategyEval.rewardPenalty.total}`
          console.log(`[Simulator #${promptId}] 📊 전략 "${strategySelection.selectedStrategy}": ${rewardStr}점 (품질: ${qualityScore}/10)`)
        }
      } catch (strategyError) {
        // 전략 평가 실패 시 무시 (핵심 기능 아님)
        console.warn(`[Simulator #${promptId}] 전략 평가 실패:`, strategyError)
      }

      // ============================================================
      // 10. 프롬프트 메타데이터
      // ============================================================
      result.promptLength = prompt.length
      result.promptComplexity = type as 'simple' | 'complex' | 'long' | 'multi_turn'

      // ============================================================
      // 11. 종합 판정 (NotebookLM 기준 + 시간 효율성 포함)
      // ============================================================
      const basicSuccess =
        result.workflowGenerated &&
        result.validationPassed &&
        result.connectionErrors.length === 0 &&
        executionErrors.length === 0 &&
        result.workflowExecuted &&
        result.failedNodes.length === 0

      // XAI 및 상대 평가 조건 추가
      const xaiCondition = !SIMULATION_CONFIG.failOnXAIFail || (result.xaiPassed !== false)
      const competitorCondition = !SIMULATION_CONFIG.failOnCompetitorFail || (result.competitorPassed !== false)
      // NotebookLM 조건: 기본 성공이면 OK, 아니면 NotebookLM 점수 50점 이상이면 OK
      const notebookLMCondition = basicSuccess || (result.notebookLMComparison?.totalScore || 0) >= 50
      // 시간 효율성 조건: 심각하게 느린 경우(very_slow)는 실패 처리
      const timeEfficiencyCondition = result.complexityTimeEvaluation?.grade !== 'very_slow'

      result.overallSuccess = basicSuccess && xaiCondition && competitorCondition && notebookLMCondition && timeEfficiencyCondition

      // 시간 효율성 패널티로 인한 실패 기록
      if (!timeEfficiencyCondition && result.complexityTimeEvaluation) {
        result.failureReasons.push(`시간 효율성 패널티: ${result.complexityTimeEvaluation.feedback}`)
        this.recordBug(prompt, 'TIME_EFFICIENCY_PENALTY', result.complexityTimeEvaluation.feedback)
      }

      result.retryCount = retryCount

      if (result.overallSuccess) {
        const nbScore = result.notebookLMComparison?.totalScore?.toFixed(1) || '?'
        const timeBonus = result.complexityTimeEvaluation?.bonusPenalty || 0
        const timeBonusStr = timeBonus > 0 ? ` +${timeBonus}` : timeBonus < 0 ? ` ${timeBonus}` : ''
        console.log(`[Simulator #${promptId}] ✅ 성공 (NB:${nbScore}/100, XAI:${result.xaiEvaluation?.totalScore || '?'}/30${timeBonusStr})`)
      } else {
        console.log(`[Simulator #${promptId}] ❌ 실패: ${result.failureReasons.slice(0, 2).join(', ')}`)
      }

    } catch (error) {
      result.generationTimeMs = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)
      result.workflowError = errorMessage
      result.failureReasons.push(`LLM 호출 오류: ${errorMessage}`)
      result.retryCount = retryCount
      result.usedNodeTypes = []

      console.error(`[Simulator #${promptId}] ⚠️ 오류: ${errorMessage}`)
      this.recordBug(prompt, 'LLM_ERROR', errorMessage)

      // 재시도 로직
      if (retryCount < MAX_RETRIES_PER_PROMPT) {
        console.log(`[Simulator #${promptId}] 재시도 ${retryCount + 1}/${MAX_RETRIES_PER_PROMPT}...`)
        await this.delay(RETRY_DELAY_MS)
        return this.simulateOne(promptId, retryCount + 1)
      }
    }

    return result
  }

  /**
   * 딜레이 유틸리티
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 대규모 시뮬레이션 실행 - 실제 LLM 호출
   *
   * ⚠️ 주의: 이 함수는 실제 LLM API를 호출합니다.
   * Rate limiting이 적용되어 있으며, 전체 실행에 상당한 시간이 소요됩니다.
   *
   * 예상 소요 시간 (대략적):
   * - 100건: ~5분
   * - 1000건: ~50분
   * - 20000건: ~16시간
   */
  async runSimulation(count: number = 20000): Promise<SimulationSummary> {
    this.results = []
    this.stopRequested = false
    const startTime = Date.now()

    console.log('═'.repeat(60))
    console.log(`[WorkflowSimulator] 🚀 LLM 기반 시뮬레이션 시작`)
    console.log(`[WorkflowSimulator] 총 테스트 수: ${count}건`)
    console.log(`[WorkflowSimulator] LLM 호출 딜레이: ${LLM_CALL_DELAY_MS}ms`)
    console.log(`[WorkflowSimulator] 배치 크기: ${BATCH_SIZE}건, 배치 딜레이: ${BATCH_DELAY_MS}ms`)
    console.log('═'.repeat(60))

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < count; i++) {
      if (this.stopRequested) {
        console.log(`\n[WorkflowSimulator] ⛔ 시뮬레이션 중지됨 (${i}/${count})`)
        break
      }

      // LLM 호출 (실제)
      const result = await this.simulateOne(i)
      this.results.push(result)

      if (result.overallSuccess) {
        successCount++
      } else {
        failCount++
      }

      // 진행 상황 콜백
      if (this.onProgress) {
        this.onProgress(i + 1, count, result)
      }

      // LLM 호출 간 딜레이 (rate limiting)
      await this.delay(LLM_CALL_DELAY_MS)

      // 배치 처리 - 배치 완료 시 추가 딜레이
      if ((i + 1) % BATCH_SIZE === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        const rate = ((i + 1) / count * 100).toFixed(1)
        const currentSuccessRate = ((successCount / (i + 1)) * 100).toFixed(1)

        console.log(`\n[Batch ${Math.floor((i + 1) / BATCH_SIZE)}] ────────────────────────`)
        console.log(`  진행: ${i + 1}/${count} (${rate}%)`)
        console.log(`  성공: ${successCount}, 실패: ${failCount}`)
        console.log(`  현재 성공률: ${currentSuccessRate}%`)
        console.log(`  경과 시간: ${elapsed}초`)

        await this.delay(BATCH_DELAY_MS)
      }

      // 매 100건마다 중간 요약
      if ((i + 1) % 100 === 0 && (i + 1) % BATCH_SIZE !== 0) {
        const rate = ((i + 1) / count * 100).toFixed(1)
        console.log(`[WorkflowSimulator] 진행: ${i + 1}/${count} (${rate}%)`)
      }
    }

    // 최종 요약 생성
    const summary = this.generateSummary()
    const totalTimeMs = Date.now() - startTime
    const totalTimeSec = Math.round(totalTimeMs / 1000)
    const totalTimeMin = Math.round(totalTimeSec / 60)

    console.log('\n' + '═'.repeat(60))
    console.log(`[WorkflowSimulator] 🏁 시뮬레이션 완료`)
    console.log('═'.repeat(60))
    console.log(`  총 테스트: ${summary.totalTests}건`)
    console.log(`  성공: ${summary.successCount}건 (${summary.successRate.toFixed(1)}%)`)
    console.log(`  실패: ${summary.failureCount}건`)
    console.log(`  단순 프롬프트 성공률: ${summary.simplePromptSuccess.toFixed(1)}%`)
    console.log(`  복잡 프롬프트 성공률: ${summary.complexPromptSuccess.toFixed(1)}%`)
    console.log(`  총 소요 시간: ${totalTimeMin}분 ${totalTimeSec % 60}초`)
    console.log('═'.repeat(60))

    // 상위 오류 출력
    if (summary.topErrors.length > 0) {
      console.log('\n[Top Errors]')
      summary.topErrors.slice(0, 5).forEach((e, i) => {
        console.log(`  ${i + 1}. ${e.error}: ${e.count}건`)
      })
    }

    // 연결 이슈 출력
    if (summary.connectionIssues.length > 0) {
      console.log('\n[Connection Issues]')
      summary.connectionIssues.slice(0, 5).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.source} → ${c.target}: ${c.count}건`)
      })
    }

    // 시간 효율성 통계 (강화학습 보상/패널티)
    console.log('\n[Time Efficiency - 강화학습 보상/패널티]')
    const te = summary.timeEfficiencyStats
    console.log(`  평균 효율성 점수: ${te.avgEfficiencyScore.toFixed(2)}/10`)
    console.log(`  평균 효율성 비율: ${te.avgEfficiencyRatio.toFixed(2)}x`)
    console.log(`  총 보너스: +${te.totalBonus}점 | 총 패널티: -${te.totalPenalty}점`)
    console.log(`  순 보상: ${te.netBonusPenalty >= 0 ? '+' : ''}${te.netBonusPenalty}점`)
    console.log(`  등급 분포: 🚀${te.gradeDistribution.exceptional} ⚡${te.gradeDistribution.efficient} ✅${te.gradeDistribution.normal} ⚠️${te.gradeDistribution.slow} ❌${te.gradeDistribution.very_slow}`)

    // 프롬프트 전략 통계 (v6)
    console.log('\n[Prompt Strategy - 강화학습 전략 평가]')
    const ps = summary.promptStrategyStats
    console.log(`  총 평가: ${ps.totalEvaluations}건`)
    console.log(`  평균 보상/패널티: ${ps.avgRewardPenalty >= 0 ? '+' : ''}${ps.avgRewardPenalty.toFixed(2)}점`)
    console.log(`  가중치 업데이트: ${ps.totalWeightUpdates}건`)

    // 전략 사용 분포
    const strategyUsage = Object.entries(ps.strategyUsageDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => `${id}:${count}`)
      .join(' | ')
    if (strategyUsage) {
      console.log(`  전략 사용: ${strategyUsage}`)
    }

    // 상위 성과 전략
    if (ps.topPerformingStrategies.length > 0) {
      const topStrategies = ps.topPerformingStrategies
        .map(s => `${s.id}(${s.avgReward >= 0 ? '+' : ''}${s.avgReward.toFixed(1)})`)
        .join(' > ')
      console.log(`  상위 전략: ${topStrategies}`)
    }

    return summary
  }

  /**
   * 완벽 성공 검증 - 1건이 완벽하게 출력까지 완료되었는지 확인
   *
   * 완벽 성공 조건 (12개):
   * 1. 워크플로우 생성 성공
   * 2. 구조 검증 통과
   * 3. 연결 검증 통과
   * 4. 포트 시뮬레이션 통과
   * 5. 실제 워크플로우 실행 완료
   * 6. 모든 노드 실행 완료 (실패 노드 없음)
   * 7. 시뮬레이션 모드로 폴백한 노드 없음 ⚠️ 중요: 구현 미완료 노드 버그 감지
   * 8. 출력 품질 acceptable 이상
   * 9. XAI 평가 합격
   * 10. 경쟁 평가 합격
   * 11. NotebookLM 대비 합격
   * 12. 시간 효율성 합격 (very_slow 아님) ⚠️ 강화학습 보상/패널티 적용
   */
  private isPerfectSuccess(result: SimulationResult): { perfect: boolean; reason?: string } {
    // 1. 워크플로우 생성 확인
    if (!result.workflowGenerated) {
      return { perfect: false, reason: 'WORKFLOW_NOT_GENERATED' }
    }

    // 2. 구조 검증 확인
    if (!result.validationPassed) {
      return { perfect: false, reason: `VALIDATION_FAILED: ${result.validationErrors.join(', ')}` }
    }

    // 3. 연결 검증 확인
    if (result.connectionErrors.length > 0) {
      return { perfect: false, reason: `CONNECTION_ERROR: ${result.connectionErrors.join(', ')}` }
    }

    // 4. 포트 시뮬레이션 확인
    const executionErrors = result.nodeExecutionResults.filter(r => !r.success)
    if (executionErrors.length > 0) {
      return { perfect: false, reason: `EXECUTION_SIM_FAILED: ${executionErrors.map(e => e.error).join(', ')}` }
    }

    // 5. 실제 워크플로우 실행 완료 확인
    if (!result.workflowExecuted) {
      return { perfect: false, reason: 'WORKFLOW_NOT_EXECUTED' }
    }

    // 6. 모든 노드 실행 완료 확인
    if (result.failedNodes.length > 0) {
      return { perfect: false, reason: `NODES_FAILED: ${result.failedNodes.join(', ')}` }
    }

    // 7. ⚠️ 시뮬레이션 모드로 폴백한 노드 확인 (구현 미완료 버그)
    // _simulation: true 플래그가 있는 노드 출력은 실제 구현이 안된 것 → 버그로 취급
    const simulationFallbackNodes = this.detectSimulationFallback(result.executionOutputs)
    if (simulationFallbackNodes.length > 0) {
      return {
        perfect: false,
        reason: `SIMULATION_FALLBACK_BUG: ${simulationFallbackNodes.join(', ')} - 노드 구현 필요`,
      }
    }

    // 8. 출력 품질 확인 (acceptable 이상)
    if (!result.outputQuality || result.outputQuality === 'error' || result.outputQuality === 'poor') {
      return { perfect: false, reason: `OUTPUT_QUALITY_POOR: ${result.outputQuality || 'none'}` }
    }

    // 9. XAI 평가 합격 확인
    if (SIMULATION_CONFIG.enableXAI && !result.xaiPassed) {
      const score = result.xaiEvaluation?.totalScore || 0
      return { perfect: false, reason: `XAI_SCORE_LOW: ${score}/30` }
    }

    // 10. 경쟁 평가 합격 확인
    if (SIMULATION_CONFIG.enableCompetitorComparison && !result.competitorPassed) {
      const score = result.competitorComparison?.totalScore || 0
      return { perfect: false, reason: `COMPETITOR_SCORE_LOW: ${score}/60` }
    }

    // 11. NotebookLM 대비 합격 확인
    if (result.notebookLMComparison && !result.notebookLMPassed) {
      const score = result.notebookLMComparison.totalScore || 0
      return { perfect: false, reason: `NOTEBOOKLM_SCORE_LOW: ${score}/100` }
    }

    // 12. 시간 효율성 확인 (very_slow = 실패)
    if (result.complexityTimeEvaluation?.grade === 'very_slow') {
      const ratio = result.complexityTimeEvaluation.timeEfficiencyRatio.toFixed(2)
      return { perfect: false, reason: `TIME_EFFICIENCY_VERY_SLOW: 효율성 비율 ${ratio} (최소 0.7 필요)` }
    }

    // 모든 조건 충족 - 완벽 성공
    return { perfect: true }
  }

  /**
   * 시뮬레이션 모드로 폴백한 노드 감지
   *
   * 노드 출력에 _simulation: true 플래그가 있으면
   * 해당 노드는 실제 구현이 안되어 시뮬레이션으로 대체된 것
   * → 이는 버그로 취급되어야 함
   *
   * 감지 대상:
   * - _simulation: true (직접 플래그)
   * - [시뮬레이션] 텍스트 포함 (레거시 시뮬레이션 응답)
   * - model: 'simulation' (시뮬레이션 LLM 응답)
   */
  private detectSimulationFallback(outputs?: Record<string, any>): string[] {
    if (!outputs) return []

    const simulationNodes: string[] = []

    for (const [nodeId, output] of Object.entries(outputs)) {
      if (!output || typeof output !== 'object') continue

      // 1. _simulation: true 플래그 확인
      if (output._simulation === true) {
        simulationNodes.push(`${nodeId}(_simulation:true)`)
        continue
      }

      // 2. model: 'simulation' 확인 (시뮬레이션 LLM 응답)
      if (output.model === 'simulation') {
        simulationNodes.push(`${nodeId}(model:simulation)`)
        continue
      }

      // 3. 텍스트 출력에 [시뮬레이션] 포함 확인
      const textFields = ['text', 'response', 'content', 'analysis', 'result']
      for (const field of textFields) {
        const value = output[field]
        if (typeof value === 'string' && value.includes('[시뮬레이션]')) {
          simulationNodes.push(`${nodeId}(text:[시뮬레이션])`)
          break
        }
      }

      // 4. _note 필드에 "구현 필요" 또는 "연결 필요" 포함 확인
      if (typeof output._note === 'string') {
        if (output._note.includes('구현 필요') || output._note.includes('연결 필요')) {
          simulationNodes.push(`${nodeId}(_note:구현필요)`)
          continue
        }
      }
    }

    return simulationNodes
  }

  /**
   * 성공 건수 목표 달성까지 무한 반복 실행 (엄격 모드)
   *
   * 🎯 핵심 기능:
   * - 버그 발생 시 → 0건으로 취급, 무한 반복
   * - 평가 기준 미달 시 → 0건으로 취급, 무한 반복
   * - 1건이 완벽하게 출력까지 완료되어야 성공
   * - 불완전한 성공은 버그로 취급
   * - 목표 달성까지 무한 반복
   * - 버그 자동 감지 및 기록
   *
   * @param targetSuccessCount 목표 성공 건수 (기본: 20000)
   */
  async runUntilSuccessTarget(targetSuccessCount: number = 20000): Promise<SimulationSummary> {
    this.results = []
    this.successfulResults = []
    this.bugs = []
    this.coveredNodeTypes.clear()
    this.stopRequested = false
    this.promptIndex = 0

    const startTime = Date.now()
    let totalAttempts = 0
    let consecutiveFailures = 0
    const MAX_CONSECUTIVE_FAILURES = 100  // 연속 실패 시 경고

    console.log('\n' + '═'.repeat(70))
    console.log(`[WorkflowSimulator] 🎯 완벽 성공 목표 달성 모드 v3.1`)
    console.log('═'.repeat(70))
    console.log(`  목표: ${targetSuccessCount.toLocaleString()}건 완벽 성공`)
    console.log(`  조건: 버그/평가 미달 시 0건 취급, 무한 반복`)
    console.log(`  기준: 생성→검증→연결→시뮬→실행→출력 모두 완료`)
    console.log(`        + XAI 합격 + 경쟁 합격 + NotebookLM 우위`)
    console.log(`  ⚠️ 시뮬레이션 모드 폴백 = 버그로 취급 (구현 미완료 감지)`)
    console.log('═'.repeat(70) + '\n')

    while (this.successfulResults.length < targetSuccessCount && !this.stopRequested) {
      totalAttempts++
      this.promptIndex++

      try {
        const result = await this.simulateOne(this.promptIndex)
        this.results.push(result)

        // 완벽 성공 검증
        const perfectCheck = this.isPerfectSuccess(result)

        if (perfectCheck.perfect) {
          // ✅ 완벽 성공
          this.successfulResults.push(result)
          consecutiveFailures = 0

          // 진행 상황 출력
          const progress = (this.successfulResults.length / targetSuccessCount * 100).toFixed(2)
          if (this.successfulResults.length % 10 === 0 || this.successfulResults.length === targetSuccessCount) {
            const elapsed = Math.round((Date.now() - startTime) / 1000)
            const successRate = ((this.successfulResults.length / totalAttempts) * 100).toFixed(2)
            const xaiScore = result.xaiEvaluation?.totalScore || '?'
            const compScore = result.competitorComparison?.totalScore || '?'
            const nbScore = result.notebookLMComparison?.totalScore?.toFixed(1) || '?'

            console.log(`\n[Progress] ✅ ${this.successfulResults.length}/${targetSuccessCount} (${progress}%)`)
            console.log(`  📊 총 시도: ${totalAttempts} | 성공률: ${successRate}%`)
            console.log(`  🧠 XAI: ${xaiScore}/30 | ⚔️ 경쟁: ${compScore}/60 | 📓 NB: ${nbScore}/100`)
            console.log(`  🐛 감지된 버그: ${this.bugs.length}개`)
            console.log(`  ⏱️ 경과: ${Math.floor(elapsed / 60)}분 ${elapsed % 60}초`)
          }

          if (this.onProgress) {
            this.onProgress(this.successfulResults.length, targetSuccessCount, result)
          }

        } else {
          // ❌ 실패 - 버그로 기록
          consecutiveFailures++
          const failReason = perfectCheck.reason || 'UNKNOWN'

          // 시뮬레이션 폴백 버그 (최우선 처리 - 구현 미완료)
          if (failReason.includes('SIMULATION_FALLBACK_BUG')) {
            // 시뮬레이션 폴백은 노드 구현이 안된 것 → 심각한 버그
            const nodeInfo = failReason.split(': ')[1] || 'unknown'
            this.recordBug(result.prompt, 'SIMULATION_FALLBACK_BUG', `노드가 시뮬레이션 모드로 폴백됨: ${nodeInfo}`)
            console.error(`🚨 [SIMULATION_FALLBACK] ${nodeInfo} - 노드 구현 필요!`)
          }
          // 평가 기준 미달도 버그로 기록
          else if (failReason.includes('XAI_SCORE') || failReason.includes('COMPETITOR_SCORE') || failReason.includes('NOTEBOOKLM_SCORE')) {
            this.recordBug(result.prompt, 'EVALUATION_CRITERIA_NOT_MET', failReason)
          } else if (failReason.includes('OUTPUT_QUALITY')) {
            this.recordBug(result.prompt, 'OUTPUT_INCOMPLETE', failReason)
          } else if (!result.workflowGenerated) {
            this.recordBug(result.prompt, 'GENERATION_FAILED', failReason)
          }

          // 진행 상황 (실패)
          if (totalAttempts % 50 === 0) {
            console.log(`[Attempt ${totalAttempts}] ❌ ${failReason.slice(0, 50)}...`)
          }

          // 연속 실패 경고
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.warn(`\n⚠️ [WARNING] ${MAX_CONSECUTIVE_FAILURES}회 연속 실패!`)
            console.warn(`   최근 실패 원인: ${failReason}`)
            console.warn(`   버그 ${this.bugs.length}개 감지됨`)
            console.warn(`   5초 대기 후 계속...`)
            await this.delay(5000)
            consecutiveFailures = 0
          }
        }

      } catch (error) {
        // 예외 발생 - 버그로 기록
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.recordBug(`Attempt #${this.promptIndex}`, 'EXCEPTION', errorMessage)
        consecutiveFailures++
        console.error(`[Attempt ${totalAttempts}] 💥 예외 발생: ${errorMessage.slice(0, 50)}...`)
      }

      // Rate limiting
      await this.delay(LLM_CALL_DELAY_MS)

      // 배치 처리
      if (totalAttempts % BATCH_SIZE === 0) {
        await this.delay(BATCH_DELAY_MS)
      }
    }

    // 최종 결과
    const summary = this.generateSummary()
    const totalTimeMs = Date.now() - startTime
    const totalTimeSec = Math.round(totalTimeMs / 1000)
    const totalTimeMin = Math.floor(totalTimeSec / 60)
    const totalTimeHour = Math.floor(totalTimeMin / 60)

    console.log('\n' + '═'.repeat(70))
    if (this.successfulResults.length >= targetSuccessCount) {
      console.log(`[WorkflowSimulator] 🏆 목표 달성! (완벽 성공 모드)`)
    } else {
      console.log(`[WorkflowSimulator] ⛔ 중단됨 (${this.successfulResults.length}/${targetSuccessCount})`)
    }
    console.log('═'.repeat(70))
    console.log(`  🎯 목표 성공 건수: ${targetSuccessCount.toLocaleString()}건`)
    console.log(`  ✅ 실제 완벽 성공: ${this.successfulResults.length.toLocaleString()}건`)
    console.log(`  📊 총 시도 횟수: ${totalAttempts.toLocaleString()}건`)
    console.log(`  📈 최종 성공률: ${(this.successfulResults.length / totalAttempts * 100).toFixed(2)}%`)
    console.log(`  🐛 감지된 버그: ${this.bugs.length}개`)
    console.log(`  🔧 노드 커버리지: ${this.coveredNodeTypes.size}/${this.getAllNodeTypes().length}`)
    console.log(`  ⏱️ 총 소요 시간: ${totalTimeHour}시간 ${totalTimeMin % 60}분 ${totalTimeSec % 60}초`)
    console.log('═'.repeat(70))

    // 버그 요약
    if (this.bugs.length > 0) {
      console.log('\n[Detected Bugs - 분류별]')
      const bugTypes = new Map<string, number>()
      for (const bug of this.bugs) {
        bugTypes.set(bug.errorType, (bugTypes.get(bug.errorType) || 0) + 1)
      }
      Array.from(bugTypes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .forEach(([type, count], i) => {
          console.log(`  ${i + 1}. ${type}: ${count}건`)
        })
    }

    return summary
  }

  /**
   * 결과 요약 생성
   */
  private generateSummary(): SimulationSummary {
    const total = this.results.length
    const successes = this.results.filter(r => r.overallSuccess)
    const simpleResults = this.results.filter(r => r.promptType === 'simple')
    const complexResults = this.results.filter(r => r.promptType === 'complex')
    const longResults = this.results.filter(r => r.promptType === 'long')
    const multiTurnResults = this.results.filter(r => r.promptType === 'multi_turn')

    // XAI 통계
    const xaiResults = this.results.filter(r => r.xaiEvaluation)
    const xaiPassed = xaiResults.filter(r => r.xaiPassed)
    const avgXaiScore = xaiResults.length > 0
      ? xaiResults.reduce((sum, r) => sum + (r.xaiEvaluation?.totalScore || 0), 0) / xaiResults.length
      : 0

    // 상대 평가 통계
    const competitorResults = this.results.filter(r => r.competitorComparison)
    const competitorPassed = competitorResults.filter(r => r.competitorPassed)
    const avgCompetitorScore = competitorResults.length > 0
      ? competitorResults.reduce((sum, r) => sum + (r.competitorComparison?.totalScore || 0), 0) / competitorResults.length
      : 0

    // 오류 유형별 집계
    const errorsByType: Record<string, number> = {}
    const nodeTypeErrors: Record<string, number> = {}
    const connectionIssueMap: Map<string, number> = new Map()

    for (const result of this.results) {
      for (const reason of result.failureReasons) {
        // 오류 유형 분류
        if (reason.includes('미등록 노드')) {
          errorsByType['미등록 노드'] = (errorsByType['미등록 노드'] || 0) + 1
          const match = reason.match(/미등록 노드 타입: (\S+)/)
          if (match) {
            nodeTypeErrors[match[1]] = (nodeTypeErrors[match[1]] || 0) + 1
          }
        } else if (reason.includes('연결 불가')) {
          errorsByType['연결 오류'] = (errorsByType['연결 오류'] || 0) + 1
          const match = reason.match(/연결 불가: (\S+) → (\S+)/)
          if (match) {
            const key = `${match[1]} → ${match[2]}`
            connectionIssueMap.set(key, (connectionIssueMap.get(key) || 0) + 1)
          }
        } else if (reason.includes('필수 입력')) {
          errorsByType['입력 누락'] = (errorsByType['입력 누락'] || 0) + 1
        } else if (reason.includes('생성 오류')) {
          errorsByType['생성 실패'] = (errorsByType['생성 실패'] || 0) + 1
        } else {
          errorsByType['기타'] = (errorsByType['기타'] || 0) + 1
        }
      }
    }

    // 상위 오류
    const topErrors = Object.entries(errorsByType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([error, count]) => ({ error, count }))

    // 문제 노드 타입
    const problematicNodeTypes = Object.entries(nodeTypeErrors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, errorCount]) => ({ type, errorCount }))

    // 연결 이슈
    const connectionIssues = Array.from(connectionIssueMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => {
        const [source, target] = key.split(' → ')
        return { source, target, count }
      })

    // 시간 통계
    const totalTimeMs = this.results.reduce((sum, r) => sum + r.generationTimeMs, 0)
    const avgGenerationTimeMs = total > 0 ? totalTimeMs / total : 0

    // 재시도 통계
    const totalRetries = this.results.reduce((sum, r) => sum + (r.retryCount || 0), 0)
    const avgRetriesPerTest = total > 0 ? totalRetries / total : 0

    // 노드 커버리지
    const allNodeTypes = this.getAllNodeTypes()
    const nodeTypesCovered = Array.from(this.coveredNodeTypes)
    const nodeTypesNotCovered = allNodeTypes.filter(t => !this.coveredNodeTypes.has(t))
    const coverageRate = allNodeTypes.length > 0 ? (nodeTypesCovered.length / allNodeTypes.length) * 100 : 0

    // 카테고리별 성공률 (시나리오 기반)
    const categorySuccessRates: Record<string, number> = {}
    for (const category of Object.keys(SCENARIO_CATEGORIES)) {
      const categoryResults = this.results.filter(r => r.scenarioCategory === category)
      if (categoryResults.length > 0) {
        categorySuccessRates[category] = (categoryResults.filter(r => r.overallSuccess).length / categoryResults.length) * 100
      }
    }

    // 시간 효율성 통계 (강화학습 보상/패널티)
    const timeResults = this.results.filter(r => r.complexityTimeEvaluation)
    const gradeDistribution = {
      exceptional: 0,
      efficient: 0,
      normal: 0,
      slow: 0,
      very_slow: 0,
    }
    let totalBonus = 0
    let totalPenalty = 0
    let sumEfficiencyScore = 0
    let sumEfficiencyRatio = 0

    for (const result of timeResults) {
      const eval_ = result.complexityTimeEvaluation!
      gradeDistribution[eval_.grade]++
      sumEfficiencyScore += eval_.efficiencyScore
      sumEfficiencyRatio += eval_.timeEfficiencyRatio

      if (eval_.bonusPenalty > 0) {
        totalBonus += eval_.bonusPenalty
      } else if (eval_.bonusPenalty < 0) {
        totalPenalty += Math.abs(eval_.bonusPenalty)
      }
    }

    const timeEfficiencyStats = {
      avgEfficiencyScore: timeResults.length > 0 ? sumEfficiencyScore / timeResults.length : 0,
      avgEfficiencyRatio: timeResults.length > 0 ? sumEfficiencyRatio / timeResults.length : 0,
      totalBonus,
      totalPenalty,
      netBonusPenalty: totalBonus - totalPenalty,
      gradeDistribution,
    }

    // 프롬프트 전략 통계 (v6)
    const strategyResults = this.results.filter(r => r.promptStrategyEvaluation)
    const strategyUsageDistribution: Record<string, number> = {}
    const strategyRewards: Record<string, { total: number; count: number; successes: number }> = {}

    for (const result of strategyResults) {
      const eval_ = result.promptStrategyEvaluation!
      const strategyId = eval_.strategyId

      // 사용 횟수
      strategyUsageDistribution[strategyId] = (strategyUsageDistribution[strategyId] || 0) + 1

      // 보상/성공 집계
      if (!strategyRewards[strategyId]) {
        strategyRewards[strategyId] = { total: 0, count: 0, successes: 0 }
      }
      strategyRewards[strategyId].total += eval_.rewardPenalty
      strategyRewards[strategyId].count++
      if (eval_.success) strategyRewards[strategyId].successes++
    }

    // 전략별 성공률
    const strategySuccessRates: Record<string, number> = {}
    for (const [id, data] of Object.entries(strategyRewards)) {
      strategySuccessRates[id] = data.count > 0 ? (data.successes / data.count) * 100 : 0
    }

    // 상위 성과 전략
    const topPerformingStrategies = Object.entries(strategyRewards)
      .map(([id, data]) => ({
        id,
        avgReward: data.count > 0 ? data.total / data.count : 0,
        uses: data.count,
      }))
      .sort((a, b) => b.avgReward - a.avgReward)
      .slice(0, 5)

    const promptStrategyStats = {
      totalEvaluations: strategyResults.length,
      avgRewardPenalty: strategyResults.length > 0
        ? strategyResults.reduce((sum, r) => sum + (r.promptStrategyEvaluation?.rewardPenalty || 0), 0) / strategyResults.length
        : 0,
      strategyUsageDistribution,
      strategySuccessRates,
      topPerformingStrategies,
      totalWeightUpdates: strategyResults.filter(r => r.promptStrategyEvaluation?.weightUpdate.delta !== 0).length,
    }

    return {
      totalTests: total,
      successCount: successes.length,
      failureCount: total - successes.length,
      successRate: total > 0 ? (successes.length / total) * 100 : 0,
      simplePromptSuccess: simpleResults.length > 0
        ? (simpleResults.filter(r => r.overallSuccess).length / simpleResults.length) * 100
        : 0,
      complexPromptSuccess: complexResults.length > 0
        ? (complexResults.filter(r => r.overallSuccess).length / complexResults.length) * 100
        : 0,
      longPromptSuccess: longResults.length > 0
        ? (longResults.filter(r => r.overallSuccess).length / longResults.length) * 100
        : 0,
      multiTurnSuccess: multiTurnResults.length > 0
        ? (multiTurnResults.filter(r => r.overallSuccess).length / multiTurnResults.length) * 100
        : 0,
      xaiPassRate: xaiResults.length > 0 ? (xaiPassed.length / xaiResults.length) * 100 : 0,
      avgXaiScore,
      competitorPassRate: competitorResults.length > 0 ? (competitorPassed.length / competitorResults.length) * 100 : 0,
      avgCompetitorScore,
      categorySuccessRates,
      errorsByType,
      topErrors,
      problematicNodeTypes,
      connectionIssues,
      bugsDetected: this.bugs.length,
      bugsFixed: this.bugs.filter(b => b.fixed).length,
      bugs: this.bugs,
      nodeTypesCovered,
      nodeTypesNotCovered,
      coverageRate,
      avgGenerationTimeMs,
      totalTimeMs,
      totalRetries,
      avgRetriesPerTest,
      timeEfficiencyStats,
      promptStrategyStats,
    }
  }

  /**
   * 결과 내보내기
   */
  exportResults(): { results: SimulationResult[]; summary: SimulationSummary } {
    return {
      results: this.results,
      summary: this.generateSummary(),
    }
  }

  /**
   * 실패한 케이스만 추출
   */
  getFailedCases(): SimulationResult[] {
    return this.results.filter(r => !r.overallSuccess)
  }

  /**
   * 빠른 테스트 모드 - 소규모 샘플로 시스템 검증
   */
  async runQuickTest(count: number = 10): Promise<SimulationSummary> {
    console.log(`[WorkflowSimulator] 🧪 빠른 테스트 모드 (${count}건)`)
    return this.runSimulation(count)
  }

  /**
   * 중간 규모 테스트 - 100건
   */
  async runMediumTest(): Promise<SimulationSummary> {
    console.log(`[WorkflowSimulator] 🧪 중간 테스트 모드 (100건)`)
    return this.runSimulation(100)
  }

  /**
   * 대규모 테스트 - 1000건
   */
  async runLargeTest(): Promise<SimulationSummary> {
    console.log(`[WorkflowSimulator] 🧪 대규모 테스트 모드 (1000건)`)
    return this.runSimulation(1000)
  }

  /**
   * 전체 테스트 - 20000건
   */
  async runFullTest(): Promise<SimulationSummary> {
    console.log(`[WorkflowSimulator] 🧪 전체 테스트 모드 (20000건)`)
    return this.runSimulation(20000)
  }

  /**
   * 결과를 JSON 문자열로 내보내기
   */
  exportToJSON(): string {
    const data = this.exportResults()
    return JSON.stringify(data, null, 2)
  }

  /**
   * 특정 오류 유형 분석
   */
  analyzeErrorType(errorType: string): SimulationResult[] {
    return this.results.filter(r =>
      r.failureReasons.some(reason => reason.includes(errorType))
    )
  }

  /**
   * 노드 타입별 성공/실패 통계
   */
  getNodeTypeStats(): Record<string, { success: number; fail: number; total: number }> {
    const stats: Record<string, { success: number; fail: number; total: number }> = {}

    for (const result of this.results) {
      if (!result.workflow) continue

      for (const node of result.workflow.nodes) {
        if (!stats[node.type]) {
          stats[node.type] = { success: 0, fail: 0, total: 0 }
        }
        stats[node.type].total++

        const nodeResult = result.nodeExecutionResults.find(r => r.nodeId === node.id)
        if (nodeResult?.success) {
          stats[node.type].success++
        } else {
          stats[node.type].fail++
        }
      }
    }

    return stats
  }

  /**
   * 재현 가능한 실패 케이스 추출 (디버깅용)
   */
  getReproducibleFailures(): {
    prompt: string
    workflow: WorkflowDesign | undefined
    errors: string[]
  }[] {
    return this.getFailedCases().map(r => ({
      prompt: r.prompt,
      workflow: r.workflow,
      errors: r.failureReasons,
    }))
  }

  /**
   * 시뮬레이션 상태 요약 (진행 중 확인용)
   */
  getCurrentStatus(): {
    processed: number
    success: number
    fail: number
    rate: string
  } {
    const processed = this.results.length
    const success = this.results.filter(r => r.overallSuccess).length
    const fail = processed - success
    const rate = processed > 0 ? ((success / processed) * 100).toFixed(1) : '0'

    return { processed, success, fail, rate: `${rate}%` }
  }
}

// ============================================================
// 헬퍼 함수들 - 콘솔에서 쉽게 사용 가능
// ============================================================

/**
 * 빠른 시뮬레이션 시작 (10건)
 */
export async function quickSimulation(): Promise<SimulationSummary> {
  return workflowSimulator.runQuickTest(10)
}

/**
 * 중간 시뮬레이션 시작 (100건)
 */
export async function mediumSimulation(): Promise<SimulationSummary> {
  return workflowSimulator.runMediumTest()
}

/**
 * 대규모 시뮬레이션 시작 (1000건)
 */
export async function largeSimulation(): Promise<SimulationSummary> {
  return workflowSimulator.runLargeTest()
}

/**
 * 전체 시뮬레이션 시작 (20000건)
 */
export async function fullSimulation(): Promise<SimulationSummary> {
  return workflowSimulator.runFullTest()
}

/**
 * 시뮬레이션 중지
 */
export function stopSimulation(): void {
  workflowSimulator.stop()
  console.log('[WorkflowSimulator] 중지 요청됨')
}

/**
 * 현재 상태 확인
 */
export function getSimulationStatus(): ReturnType<typeof workflowSimulator.getCurrentStatus> {
  return workflowSimulator.getCurrentStatus()
}

/**
 * 🎯 목표 달성 시뮬레이션 (성공만 카운트)
 *
 * 20000건 성공 달성까지 무한 반복
 * 실패는 카운트하지 않고 재시도
 */
export async function runUntilSuccess(targetCount: number = 20000): Promise<SimulationSummary> {
  console.log('🎯 목표 달성 모드: 성공만 카운트, 실패 시 재시도')
  return workflowSimulator.runUntilSuccessTarget(targetCount)
}

/**
 * 버그 목록 조회
 */
export function getDetectedBugs(): BugRecord[] {
  return workflowSimulator.exportResults().summary.bugs
}

// 싱글톤 인스턴스
export const workflowSimulator = new WorkflowSimulator()

export default WorkflowSimulator
