/**
 * Prompt Strategy Types - 프롬프트 엔지니어링 전략 타입 정의
 *
 * 강화학습 기반 전략 선택 시스템:
 * - 다양한 프롬프트 기법 (Simple, Few-shot, CoT, Tree-of-Thought 등)
 * - 전략별 가중치 및 성능 메트릭
 * - 자동 전략 선택 및 최적화
 */

// ============================================================
// 전략 유형 정의
// ============================================================

/**
 * 프롬프트 전략 유형
 */
export type PromptStrategyType =
  | 'simple'           // 단순 프롬프트 (직접 질문)
  | 'few-shot'         // Few-shot Learning (예시 기반)
  | 'zero-shot-cot'    // Zero-shot Chain-of-Thought (단계별 사고)
  | 'few-shot-cot'     // Few-shot + CoT 결합
  | 'tree-of-thought'  // Tree-of-Thought (분기 사고)
  | 'self-consistency' // Self-Consistency (다중 경로 + 다수결)
  | 'react'            // ReAct (Reasoning + Acting)
  | 'decomposition'    // 문제 분해 (Task Decomposition)
  | 'role-play'        // 역할극 (페르소나 기반)
  | 'structured'       // 구조화된 출력 (JSON/XML 강제)
  | 'iterative'        // 반복 개선 (Iterative Refinement)
  | 'meta-prompt'      // 메타 프롬프트 (프롬프트 생성 프롬프트)

/**
 * 전략 카테고리
 */
export type StrategyCategory =
  | 'basic'            // 기본 전략
  | 'reasoning'        // 추론 강화 전략
  | 'learning'         // 학습 기반 전략
  | 'advanced'         // 고급 전략

// ============================================================
// 전략 정의
// ============================================================

/**
 * 프롬프트 전략 정의
 */
export interface PromptStrategy {
  /** 전략 ID */
  id: PromptStrategyType

  /** 전략 이름 */
  name: string

  /** 설명 */
  description: string

  /** 카테고리 */
  category: StrategyCategory

  /** 적합한 작업 유형 */
  suitableFor: string[]

  /** 부적합한 작업 유형 */
  notSuitableFor: string[]

  /** 복잡도 요구 (1-10, 높을수록 복잡한 작업에 적합) */
  complexityThreshold: {
    min: number
    max: number
  }

  /** 예상 토큰 오버헤드 (배수) */
  tokenOverhead: number

  /** 예상 응답 시간 배수 */
  timeMultiplier: number

  /** 전략 적용 함수 */
  apply: (
    prompt: string,
    context: StrategyContext
  ) => Promise<StrategyResult>

  /** 내장 여부 */
  isBuiltin: boolean
}

/**
 * 전략 적용 컨텍스트
 */
export interface StrategyContext {
  /** 원본 프롬프트 */
  originalPrompt: string

  /** 도메인 */
  domain?: string

  /** 복잡도 점수 (1-10) */
  complexity: number

  /** 사용 가능한 예시 */
  examples?: StrategyExample[]

  /** 이전 시도 결과 */
  previousAttempts?: StrategyAttempt[]

  /** 사용자 선호도 */
  userPreferences?: {
    detailLevel: number
    language: string
    outputFormat?: string
  }

  /** 제약 조건 */
  constraints?: {
    maxTokens?: number
    maxTime?: number
    requiredFields?: string[]
  }
}

/**
 * 전략 적용 결과
 */
export interface StrategyResult {
  /** 변환된 프롬프트 */
  transformedPrompt: string

  /** 시스템 프롬프트 (선택) */
  systemPrompt?: string

  /** 사용된 예시 수 */
  examplesUsed: number

  /** 추가된 토큰 수 (추정) */
  additionalTokens: number

  /** 메타데이터 */
  metadata: {
    strategyId: PromptStrategyType
    appliedAt: number
    transformationSteps: string[]
  }
}

/**
 * 전략 예시
 */
export interface StrategyExample {
  /** 입력 */
  input: string

  /** 출력 */
  output: string

  /** 설명 (선택) */
  explanation?: string

  /** 도메인 */
  domain?: string
}

/**
 * 이전 시도 기록
 */
export interface StrategyAttempt {
  /** 사용된 전략 */
  strategyId: PromptStrategyType

  /** 성공 여부 */
  success: boolean

  /** 품질 점수 (1-10) */
  qualityScore: number

  /** 소요 시간 (ms) */
  duration: number

  /** 실패 이유 (실패 시) */
  failureReason?: string
}

// ============================================================
// 전략 가중치 및 성능 메트릭
// ============================================================

/**
 * 전략 가중치 (강화학습용)
 */
export interface StrategyWeight {
  /** 전략 ID */
  strategyId: PromptStrategyType

  /** 기본 가중치 (0-1) */
  baseWeight: number

  /** 현재 가중치 (학습 후) */
  currentWeight: number

  /** 도메인별 가중치 조정 */
  domainModifiers: Record<string, number>

  /** 복잡도별 가중치 조정 */
  complexityModifiers: {
    low: number    // 복잡도 1-3
    medium: number // 복잡도 4-6
    high: number   // 복잡도 7-10
  }

  /** 최근 업데이트 */
  lastUpdated: number
}

/**
 * 전략 성능 메트릭
 */
export interface StrategyPerformanceMetrics {
  /** 전략 ID */
  strategyId: PromptStrategyType

  /** 총 사용 횟수 */
  totalUses: number

  /** 성공 횟수 */
  successCount: number

  /** 실패 횟수 */
  failureCount: number

  /** 성공률 */
  successRate: number

  /** 평균 품질 점수 */
  avgQualityScore: number

  /** 평균 처리 시간 (ms) */
  avgDuration: number

  /** 도메인별 성공률 */
  domainSuccessRates: Record<string, number>

  /** 복잡도별 성공률 */
  complexitySuccessRates: {
    low: number
    medium: number
    high: number
  }

  /** 최근 N건 성공률 (트렌드 분석용) */
  recentSuccessRate: number

  /** 성능 트렌드 (-1: 하락, 0: 유지, 1: 상승) */
  trend: -1 | 0 | 1
}

// ============================================================
// 강화학습 보상/패널티
// ============================================================

/**
 * 전략 평가 결과
 */
export interface StrategyEvaluation {
  /** 전략 ID */
  strategyId: PromptStrategyType

  /** 프롬프트 */
  prompt: string

  /** 도메인 */
  domain: string

  /** 복잡도 */
  complexity: number

  /** 성공 여부 */
  success: boolean

  /** 품질 점수 (1-10) */
  qualityScore: number

  /** 처리 시간 (ms) */
  duration: number

  /** 예상 시간 대비 효율성 */
  timeEfficiency: number

  /** 토큰 효율성 */
  tokenEfficiency: number

  /** 보상/패널티 점수 */
  rewardPenalty: {
    base: number           // 기본 보상 (+1 성공, -1 실패)
    quality: number        // 품질 보너스 (-2 ~ +2)
    efficiency: number     // 효율성 보너스 (-2 ~ +2)
    complexity: number     // 복잡도 보너스 (복잡한 문제 해결 시 +1)
    total: number          // 총합 (-5 ~ +5)
  }

  /** 가중치 업데이트 제안 */
  weightUpdate: {
    delta: number          // 가중치 변화량
    newWeight: number      // 새 가중치
    reason: string         // 변화 이유
  }

  /** 평가 시간 */
  evaluatedAt: number
}

// ============================================================
// 전략 선택 결과
// ============================================================

/**
 * 전략 선택 결과
 */
export interface StrategySelection {
  /** 선택된 전략 */
  selectedStrategy: PromptStrategyType

  /** 선택 이유 */
  reason: string

  /** 대안 전략들 (점수순) */
  alternatives: Array<{
    strategyId: PromptStrategyType
    score: number
    reason: string
  }>

  /** 선택에 사용된 점수 */
  selectionScore: number

  /** 확신도 (0-1) */
  confidence: number

  /** 분석 정보 */
  analysis: {
    detectedDomain: string
    complexityLevel: 'low' | 'medium' | 'high'
    promptCharacteristics: string[]
    recommendedFeatures: string[]
  }
}

// ============================================================
// 전략 저장소 (영속화)
// ============================================================

/**
 * 전략 저장 데이터
 */
export interface StrategyStorageData {
  /** 버전 */
  version: string

  /** 가중치 맵 */
  weights: Record<PromptStrategyType, StrategyWeight>

  /** 성능 메트릭 */
  metrics: Record<PromptStrategyType, StrategyPerformanceMetrics>

  /** 최근 평가 기록 (최대 1000건) */
  recentEvaluations: StrategyEvaluation[]

  /** 마지막 업데이트 */
  lastUpdated: number

  /** 총 학습 횟수 */
  totalLearningIterations: number
}

// ============================================================
// 상수
// ============================================================

/**
 * 기본 가중치 (전략별 초기값)
 */
export const DEFAULT_STRATEGY_WEIGHTS: Record<PromptStrategyType, number> = {
  'simple': 1.0,           // 기본 전략, 항상 사용 가능
  'few-shot': 0.8,         // 예시가 있을 때 효과적
  'zero-shot-cot': 0.7,    // 추론 문제에 효과적
  'few-shot-cot': 0.6,     // 복잡한 추론 + 예시
  'tree-of-thought': 0.5,  // 매우 복잡한 문제
  'self-consistency': 0.4, // 정확도가 중요할 때
  'react': 0.5,            // 도구 사용 필요 시
  'decomposition': 0.6,    // 큰 문제 분해
  'role-play': 0.7,        // 페르소나 기반
  'structured': 0.8,       // 구조화된 출력 필요 시
  'iterative': 0.5,        // 품질 개선 필요 시
  'meta-prompt': 0.3,      // 고급 사용 시
}

/**
 * 전략별 토큰 오버헤드 (배수)
 */
export const STRATEGY_TOKEN_OVERHEAD: Record<PromptStrategyType, number> = {
  'simple': 1.0,
  'few-shot': 2.5,          // 예시 포함
  'zero-shot-cot': 1.3,     // "단계별로 생각해보면..." 추가
  'few-shot-cot': 3.0,      // 예시 + CoT
  'tree-of-thought': 4.0,   // 여러 경로 탐색
  'self-consistency': 5.0,  // 다중 생성
  'react': 2.0,             // 행동 계획 포함
  'decomposition': 2.0,     // 하위 문제 분해
  'role-play': 1.5,         // 페르소나 설명
  'structured': 1.2,        // 출력 형식 지정
  'iterative': 3.0,         // 여러 번 반복
  'meta-prompt': 2.5,       // 메타 레벨 프롬프트
}

/**
 * 보상/패널티 기준
 */
export const REWARD_PENALTY_THRESHOLDS = {
  // 품질 기준
  quality: {
    excellent: 9,    // +2 보너스
    good: 7,         // +1 보너스
    acceptable: 5,   // 0
    poor: 3,         // -1 패널티
    veryPoor: 0,     // -2 패널티
  },

  // 시간 효율성 기준 (예상 대비 실제)
  timeEfficiency: {
    exceptional: 2.0,  // +2 보너스 (예상의 2배 빠름)
    efficient: 1.5,    // +1 보너스
    normal: 1.0,       // 0
    slow: 0.7,         // -1 패널티
    verySlow: 0.5,     // -2 패널티
  },

  // 가중치 조정 기준
  weightAdjustment: {
    successBoost: 0.02,     // 성공 시 가중치 증가
    failurePenalty: 0.03,   // 실패 시 가중치 감소
    maxWeight: 1.5,         // 최대 가중치
    minWeight: 0.1,         // 최소 가중치
  },
}
