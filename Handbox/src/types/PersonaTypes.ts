/**
 * 페르소나 시스템 타입 정의
 *
 * 전문가 AI 에이전트의 역할, 전문성, 평가 성향, 지식 베이스를 정의합니다.
 * XAI(설명 가능한 AI) 관점의 판단 근거 및 이력 관리를 지원합니다.
 */

// ============================================================
// 전문가 지식 베이스
// ============================================================

/**
 * 전문가별 특정 지식 (해당 전문가만이 가지고 있는 지식)
 */
export interface PersonaKnowledgeBase {
  /** 지식 베이스 ID */
  id: string
  /** 지식 영역명 */
  name: string
  /** 지식 출처 (논문, 실무 경험, 교육 등) */
  source: 'academic' | 'practical' | 'regulatory' | 'industry' | 'custom'
  /** 지식 내용 (텍스트 또는 참조) */
  content?: string
  /** 벡터 스토어 참조 (RAG용) */
  vectorStoreRef?: string
  /** 파일 경로 목록 */
  filePaths?: string[]
  /** 관련 키워드 */
  keywords: string[]
  /** 생성일 */
  createdAt: string
  /** 수정일 */
  updatedAt: string
}

// ============================================================
// 평가 이력
// ============================================================

/**
 * 단일 평가 기록
 */
export interface EvaluationRecord {
  /** 평가 기록 ID */
  id: string
  /** 평가 대상 (제안서명, 기술명 등) */
  targetName: string
  /** 평가 대상 ID */
  targetId: string
  /** 평가 일시 */
  evaluatedAt: string
  /** 평가 결과 */
  result: 'approve' | 'conditional' | 'reject' | 'abstain'
  /** 부여한 점수 */
  scores: Record<string, number>
  /** 총점 */
  totalScore: number
  /** 평가 의견 */
  opinion: string
  /** 판단 근거 (XAI) */
  reasoning: string
  /** 핵심 인사이트 */
  keyInsights: string[]
  /** 워크플로우 ID (어떤 워크플로우에서 평가했는지) */
  workflowId?: string
  /** 세션 ID (어떤 회의에서 평가했는지) */
  sessionId?: string
}

/**
 * 평가 이력 통계
 */
export interface EvaluationStats {
  /** 총 평가 횟수 */
  totalEvaluations: number
  /** 승인 횟수 */
  approveCount: number
  /** 조건부 승인 횟수 */
  conditionalCount: number
  /** 반려 횟수 */
  rejectCount: number
  /** 평균 점수 */
  averageScore: number
  /** 가장 최근 평가일 */
  lastEvaluationAt?: string
  /** 평가 시작일 (경력 시작) */
  firstEvaluationAt?: string
  /** 주로 평가한 분야 */
  primaryDomains: string[]
}

// ============================================================
// 전문성 프로필
// ============================================================

export interface ExpertiseProfile {
  /** 주 전문 영역 */
  primary: string[]
  /** 부 전문 영역 */
  secondary: string[]
  /** 관련 키워드 (검색/매칭용) */
  keywords: string[]
}

// ============================================================
// 경력 프로필
// ============================================================

export type ExperienceLevel = 'junior' | 'mid' | 'senior' | 'expert' | 'master'

export interface ExperienceProfile {
  /** 경력 연차 */
  years: number
  /** 경력 레벨 */
  level: ExperienceLevel
  /** 자격/학위 목록 */
  credentials: string[]
  /** 소속 기관 (현재 또는 과거) */
  affiliations?: string[]
  /** 주요 프로젝트/업적 */
  achievements?: string[]
}

// ============================================================
// 평가 성향
// ============================================================

export type EvaluationStance = 'conservative' | 'progressive' | 'neutral' | 'balanced'

export interface EvaluationBehavior {
  /** 평가 성향 */
  stance: EvaluationStance
  /** 평가 시 중점 사항 */
  evaluationFocus: string[]
  /** 점수 보정 경향 (-1.0 ~ +1.0, 보수적이면 음수) */
  scoreBias?: number
  /** 엄격도 (1-5, 높을수록 엄격) */
  strictness?: number
}

// ============================================================
// XAI 설정 (설명 가능한 AI)
// ============================================================

export interface XAIConfig {
  /** 설명 상세도 */
  explanationDetail: 'brief' | 'standard' | 'detailed' | 'comprehensive'
  /** 근거 제시 필수 여부 */
  requireEvidence: boolean
  /** 인사이트 생성 여부 */
  generateInsights: boolean
  /** 인사이트 최대 개수 */
  maxInsights?: number
  /** 반대 의견 생성 (다른 관점 제시) */
  generateCounterpoints?: boolean
  /** 확신도 표시 여부 */
  showConfidence: boolean
}

// ============================================================
// 페르소나 정의 (메인)
// ============================================================

export interface PersonaDefinition {
  /** 페르소나 고유 ID */
  id: string
  /** 페르소나 이름 */
  name: string
  /** 직함 (예: "구조공학 수석연구원") */
  title: string
  /** 전문 분야 코드 */
  domain: string

  /** 전문성 프로필 */
  expertise: ExpertiseProfile

  /** 경력 프로필 */
  experience: ExperienceProfile

  /** 평가 행동 설정 */
  evaluationBehavior: EvaluationBehavior

  /** XAI 설정 */
  xaiConfig: XAIConfig

  /** 전문가별 지식 베이스 (해당 전문가만의 지식) */
  knowledgeBases: PersonaKnowledgeBase[]

  /** 평가 이력 */
  evaluationHistory: EvaluationRecord[]

  /** 평가 통계 */
  evaluationStats: EvaluationStats

  /** LLM 시스템 프롬프트 */
  systemPrompt: string

  /** 페르소나 카테고리 */
  category: string

  /** 내장 페르소나 여부 */
  isBuiltin: boolean

  /** 활성화 여부 */
  isActive: boolean

  /** 생성일 */
  createdAt: string

  /** 수정일 */
  updatedAt: string
}

// ============================================================
// 페르소나 생성 요청
// ============================================================

export interface CreatePersonaRequest {
  name: string
  title: string
  domain: string
  expertise: ExpertiseProfile
  experience: ExperienceProfile
  evaluationBehavior: EvaluationBehavior
  xaiConfig?: Partial<XAIConfig>
  category: string
  systemPromptTemplate?: string
}

// ============================================================
// 평가 세션 (회의)
// ============================================================

export interface EvaluationSession {
  /** 세션 ID */
  id: string
  /** 세션명 (회의명) */
  name: string
  /** 세션 설명 */
  description?: string
  /** 평가 대상 */
  targetName: string
  /** 평가 대상 ID */
  targetId: string
  /** 참여 페르소나 ID 목록 */
  participantIds: string[]
  /** 세션 시작 시간 */
  startedAt: string
  /** 세션 종료 시간 */
  endedAt?: string
  /** 세션 상태 */
  status: 'preparing' | 'in_progress' | 'completed' | 'cancelled'
  /** 최종 결정 */
  finalDecision?: 'approve' | 'conditional' | 'reject' | 'no_consensus'
  /** 각 페르소나별 평가 결과 */
  evaluationResults: Record<string, EvaluationRecord>
  /** 워크플로우 ID */
  workflowId?: string
}

// ============================================================
// 상수 및 기본값
// ============================================================

/** 경험 레벨별 가중치 (투표 가중치로 사용 가능) */
export const EXPERIENCE_WEIGHTS: Record<ExperienceLevel, number> = {
  junior: 0.6,
  mid: 0.8,
  senior: 1.0,
  expert: 1.2,
  master: 1.5,
}

/** 평가 성향별 점수 보정 */
export const STANCE_SCORE_BIAS: Record<EvaluationStance, number> = {
  conservative: -0.3,
  neutral: 0,
  balanced: 0,
  progressive: 0.2,
}

/** 기본 XAI 설정 */
export const DEFAULT_XAI_CONFIG: XAIConfig = {
  explanationDetail: 'standard',
  requireEvidence: true,
  generateInsights: true,
  maxInsights: 5,
  generateCounterpoints: false,
  showConfidence: true,
}

/** 페르소나 카테고리 */
export const PERSONA_CATEGORIES = [
  { id: 'engineering', label: '공학/기술', icon: 'Engineering' },
  { id: 'economics', label: '경제/재무', icon: 'TrendingUp' },
  { id: 'legal', label: '법률/규제', icon: 'Gavel' },
  { id: 'environment', label: '환경/안전', icon: 'Nature' },
  { id: 'policy', label: '정책/행정', icon: 'AccountBalance' },
  { id: 'quality', label: '품질/검증', icon: 'VerifiedUser' },
  { id: 'innovation', label: '혁신/R&D', icon: 'Lightbulb' },
  { id: 'custom', label: '사용자 정의', icon: 'Person' },
] as const

/** 지식 출처 레이블 */
export const KNOWLEDGE_SOURCE_LABELS: Record<PersonaKnowledgeBase['source'], string> = {
  academic: '학술/연구',
  practical: '실무 경험',
  regulatory: '규정/법규',
  industry: '산업 표준',
  custom: '사용자 정의',
}

// ============================================================
// XAI 평가 결과 (설명 가능한 평가)
// ============================================================

export interface XAIEvaluationResult {
  /** 평가자 ID */
  evaluatorId: string
  /** 평가자 이름 */
  evaluatorName: string
  /** 전문 분야 */
  domain: string

  /** 항목별 점수 */
  scores: Record<string, number>
  /** 총점 */
  totalScore: number
  /** 평가 의견 */
  opinion: string
  /** 권고사항 */
  recommendation: 'approve' | 'conditional' | 'reject' | 'abstain'
  /** 확신도 (0-1) */
  confidence: number

  // XAI 요소
  /** 판단 근거 (상세 설명) */
  reasoning: string
  /** 핵심 인사이트 */
  keyInsights: string[]
  /** 참조한 근거 자료 */
  evidences: Evidence[]
  /** 강점 분석 */
  strengths: string[]
  /** 약점 분석 */
  weaknesses: string[]
  /** 개선 제안 */
  suggestions: string[]
  /** 반대 관점 (선택적) */
  counterpoints?: string[]
  /** 불확실 요소 */
  uncertainties?: string[]
}

export interface Evidence {
  /** 근거 유형 */
  type: 'document' | 'data' | 'regulation' | 'experience' | 'comparison'
  /** 근거 제목/출처 */
  source: string
  /** 근거 내용 요약 */
  content: string
  /** 관련성 점수 (0-1) */
  relevance: number
  /** 참조 위치 (페이지, 섹션 등) */
  reference?: string
}

// ============================================================
// 투표 집계 결과
// ============================================================

export interface VotingAggregationResult {
  /** 최종 결정 */
  finalDecision: 'approve' | 'conditional' | 'reject' | 'no_consensus'

  /** 투표 집계 */
  votes: {
    approve: number
    conditional: number
    reject: number
    abstain: number
    total: number
  }

  /** 점수 통계 */
  scoreStats: {
    average: number
    min: number
    max: number
    stdDev: number
    byDomain: Record<string, number>
    byCriteria: Record<string, number>
  }

  /** 합의 정도 (0-1) */
  consensusLevel: number

  /** 종합 요약 */
  summary: string

  /** 핵심 인사이트 (전체 통합) */
  consolidatedInsights: string[]

  /** 주요 강점 (전체 통합) */
  consolidatedStrengths: string[]

  /** 주요 약점 (전체 통합) */
  consolidatedWeaknesses: string[]

  /** 반대 의견 목록 */
  dissents: {
    evaluatorName: string
    domain: string
    reason: string
  }[]

  /** 조건부 승인 조건 (해당 시) */
  conditions?: string[]
}
