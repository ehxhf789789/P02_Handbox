/**
 * Agent System Types
 *
 * Claude Code 수준의 로컬 MCP 에이전트 시스템 타입 정의.
 * XAI(설명 가능한 AI) 특성을 내장하여 모든 의사결정이 추적 가능.
 */

// ============================================================
// Core Agent Types
// ============================================================

export interface AgentContext {
  /** 현재 세션 ID */
  sessionId: string
  /** 사용자 프로필 */
  userProfile: UserProfile
  /** 단기 기억 (세션 내) */
  shortTermMemory: Map<string, any>
  /** 현재 워크플로우 컨텍스트 */
  workflowContext?: WorkflowContext
  /** XAI 추적 활성화 */
  xaiEnabled: boolean
}

export interface AgentResponse<T = any> {
  /** 결과 데이터 */
  data: T
  /** XAI 설명 */
  explanation: XAIExplanation
  /** 신뢰도 (0-1) */
  confidence: number
  /** 처리 시간 (ms) */
  processingTime: number
  /** 사용된 토큰 수 */
  tokensUsed?: number
}

// ============================================================
// User Profile & Learning
// ============================================================

export interface UserProfile {
  /** 사용자 ID */
  userId: string
  /** 생성일 */
  createdAt: number
  /** 마지막 활동 */
  lastActiveAt: number

  /** 선호도 */
  preferences: UserPreferences
  /** 행동 패턴 */
  behaviorPatterns: BehaviorPattern[]
  /** 도메인별 전문성 수준 */
  domainExpertise: Record<string, number>
  /** 자주 사용하는 워크플로우 패턴 */
  frequentPatterns: WorkflowPattern[]
  /** 피드백 히스토리 */
  feedbackHistory: FeedbackEntry[]
}

export interface UserPreferences {
  /** 선호 LLM 모델 */
  preferredModel: string
  /** 선호 온도 설정 */
  preferredTemperature: number
  /** 응답 상세 수준 (1-5) */
  detailLevel: number
  /** 자동 실행 허용 */
  autoExecuteEnabled: boolean
  /** XAI 상세 수준 */
  xaiDetailLevel: 'minimal' | 'standard' | 'detailed' | 'verbose'
  /** 선호 언어 */
  language: 'ko' | 'en' | 'ja' | 'zh'
  /** 커스텀 시스템 프롬프트 */
  customSystemPrompt?: string
}

export interface BehaviorPattern {
  /** 패턴 ID */
  id: string
  /** 패턴 유형 */
  type: 'workflow' | 'prompt' | 'interaction' | 'error-handling'
  /** 패턴 설명 */
  description: string
  /** 발생 빈도 */
  frequency: number
  /** 마지막 발생 */
  lastOccurrence: number
  /** 관련 컨텍스트 */
  contexts: string[]
}

export interface WorkflowPattern {
  /** 패턴 ID */
  id: string
  /** 노드 타입 시퀀스 */
  nodeSequence: string[]
  /** 사용 횟수 */
  usageCount: number
  /** 평균 성공률 */
  successRate: number
  /** 평균 실행 시간 */
  avgExecutionTime: number
}

export interface FeedbackEntry {
  /** 피드백 ID */
  id: string
  /** 타임스탬프 */
  timestamp: number
  /** 피드백 유형 */
  type: 'positive' | 'negative' | 'correction' | 'suggestion'
  /** 대상 (워크플로우, 응답, 제안 등) */
  targetType: string
  targetId: string
  /** 피드백 내용 */
  content: string
  /** 적용됨 여부 */
  applied: boolean
}

// ============================================================
// XAI (Explainable AI)
// ============================================================

export interface XAIExplanation {
  /** 설명 ID */
  id: string
  /** 의사결정 유형 */
  decisionType: string
  /** 단계별 추론 과정 */
  reasoningSteps: ReasoningStep[]
  /** 고려된 대안들 */
  alternatives: Alternative[]
  /** 사용된 지식/기억 */
  knowledgeUsed: KnowledgeReference[]
  /** 신뢰도 근거 */
  confidenceFactors: ConfidenceFactor[]
  /** 요약 */
  summary: string
  /** 시각화용 데이터 */
  visualizationData?: XAIVisualization
}

export interface ReasoningStep {
  /** 단계 번호 */
  step: number
  /** 행동 */
  action: string
  /** 근거 */
  rationale: string
  /** 입력 */
  input: any
  /** 출력 */
  output: any
  /** 소요 시간 */
  duration: number
}

export interface Alternative {
  /** 대안 설명 */
  description: string
  /** 선택되지 않은 이유 */
  rejectionReason: string
  /** 예상 결과 */
  expectedOutcome: string
  /** 점수 */
  score: number
}

export interface KnowledgeReference {
  /** 지식 유형 */
  type: 'memory' | 'pattern' | 'rule' | 'example' | 'user-feedback'
  /** 소스 */
  source: string
  /** 관련성 점수 */
  relevance: number
  /** 내용 요약 */
  summary: string
}

export interface ConfidenceFactor {
  /** 요인 이름 */
  factor: string
  /** 기여도 (-1 ~ 1) */
  contribution: number
  /** 설명 */
  explanation: string
}

export interface XAIVisualization {
  /** 시각화 유형 */
  type: 'decision-tree' | 'flowchart' | 'comparison' | 'timeline'
  /** 노드 데이터 */
  nodes: XAINode[]
  /** 엣지 데이터 */
  edges: XAIEdge[]
}

export interface XAINode {
  id: string
  label: string
  type: string
  data: any
}

export interface XAIEdge {
  source: string
  target: string
  label?: string
}

// ============================================================
// Task Planning
// ============================================================

export interface TaskPlan {
  /** 계획 ID */
  id: string
  /** 원본 요청 */
  originalRequest: string
  /** 해석된 의도 */
  interpretedIntent: InterpretedIntent
  /** 계획된 단계들 */
  steps: TaskStep[]
  /** 예상 소요 시간 */
  estimatedDuration: number
  /** 필요한 리소스 */
  requiredResources: Resource[]
  /** 위험 요소 */
  risks: Risk[]
  /** 대체 계획 */
  alternativePlans: TaskPlan[]
  /** XAI 설명 */
  explanation: XAIExplanation
  /** 상태 */
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled'
}

export interface InterpretedIntent {
  /** 주요 목표 */
  primaryGoal: string
  /** 부차적 목표들 */
  secondaryGoals: string[]
  /** 제약 조건 */
  constraints: string[]
  /** 기대 출력 */
  expectedOutputs: string[]
  /** 도메인 */
  domain: string
  /** 복잡도 (1-10) */
  complexity: number
}

export interface TaskStep {
  /** 단계 ID */
  id: string
  /** 순서 */
  order: number
  /** 이름 */
  name: string
  /** 설명 */
  description: string
  /** 담당 에이전트 */
  assignedAgent: string
  /** 노드 타입 (VLP용) */
  nodeType: string
  /** 노드 설정 */
  nodeConfig: Record<string, any>
  /** 의존성 (이전 단계 ID) */
  dependencies: string[]
  /** 예상 소요 시간 */
  estimatedDuration: number
  /** 상태 */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  /** 결과 */
  result?: any
  /** XAI 설명 */
  explanation?: XAIExplanation
}

export interface Resource {
  type: 'api' | 'file' | 'database' | 'memory' | 'compute'
  name: string
  required: boolean
  available: boolean
}

export interface Risk {
  type: string
  description: string
  probability: number
  impact: number
  mitigation: string
}

// ============================================================
// Memory System
// ============================================================

export interface Memory {
  /** 기억 ID */
  id: string
  /** 유형 */
  type: 'episodic' | 'semantic' | 'procedural'
  /** 카테고리 */
  category: string
  /** 키 */
  key: string
  /** 값 */
  value: any
  /** 메타데이터 */
  metadata: MemoryMetadata
  /** 생성 시간 */
  createdAt: number
  /** 마지막 접근 */
  lastAccessedAt: number
  /** 접근 횟수 */
  accessCount: number
  /** 중요도 (0-1) */
  importance: number
  /** 관련 기억 ID들 */
  relatedMemories: string[]
  /** 임베딩 벡터 */
  embedding?: number[]
}

export interface MemoryMetadata {
  /** 소스 */
  source: string
  /** 컨텍스트 */
  context: string
  /** 태그 */
  tags: string[]
  /** 만료 시간 (optional) */
  expiresAt?: number
  /** 검증됨 여부 */
  verified: boolean
}

export interface MemoryQuery {
  /** 검색 텍스트 */
  query?: string
  /** 카테고리 필터 */
  category?: string
  /** 유형 필터 */
  type?: Memory['type']
  /** 태그 필터 */
  tags?: string[]
  /** 시간 범위 */
  timeRange?: { start: number; end: number }
  /** 최소 중요도 */
  minImportance?: number
  /** 결과 수 */
  limit?: number
  /** 정렬 */
  sortBy?: 'relevance' | 'recency' | 'importance' | 'accessCount'
}

// ============================================================
// Workflow Context
// ============================================================

export interface WorkflowContext {
  /** 워크플로우 ID */
  workflowId: string
  /** 워크플로우 이름 */
  workflowName: string
  /** 노드 정보 */
  nodes: WorkflowNodeInfo[]
  /** 엣지 정보 */
  edges: WorkflowEdgeInfo[]
  /** 현재 실행 상태 */
  executionState?: ExecutionState
  /** 변수 스코프 */
  variables: Record<string, any>
}

export interface WorkflowNodeInfo {
  id: string
  type: string
  label: string
  config: Record<string, any>
  status?: 'idle' | 'running' | 'completed' | 'failed'
}

export interface WorkflowEdgeInfo {
  id: string
  source: string
  target: string
  label?: string
}

export interface ExecutionState {
  /** 현재 실행 중인 노드 */
  currentNodes: string[]
  /** 완료된 노드 */
  completedNodes: string[]
  /** 실패한 노드 */
  failedNodes: string[]
  /** 노드별 결과 */
  nodeResults: Record<string, any>
  /** 시작 시간 */
  startTime: number
  /** 경과 시간 */
  elapsedTime: number
}

// ============================================================
// Logging
// ============================================================

export interface ActivityLog {
  /** 로그 ID */
  id: string
  /** 타임스탬프 */
  timestamp: number
  /** 세션 ID */
  sessionId: string
  /** 활동 유형 */
  type: ActivityType
  /** 활동 상세 */
  action: string
  /** 입력 데이터 */
  input?: any
  /** 출력 데이터 */
  output?: any
  /** 메타데이터 */
  metadata?: Record<string, any>
  /** XAI 설명 */
  explanation?: XAIExplanation
}

export type ActivityType =
  | 'prompt_input'
  | 'workflow_create'
  | 'workflow_execute'
  | 'workflow_modify'
  | 'node_add'
  | 'node_remove'
  | 'node_configure'
  | 'agent_invoke'
  | 'llm_call'
  | 'memory_store'
  | 'memory_recall'
  | 'feedback_submit'
  | 'error_occur'
  | 'plan_create'
  | 'plan_approve'
  | 'plan_modify'

// ============================================================
// Agent Interfaces
// ============================================================

export interface IMemoryAgent {
  /** 기억 저장 */
  store(memory: Omit<Memory, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'>): Promise<string>
  /** 기억 검색 */
  recall(query: MemoryQuery): Promise<Memory[]>
  /** 기억 업데이트 */
  update(id: string, updates: Partial<Memory>): Promise<void>
  /** 기억 삭제 */
  forget(id: string): Promise<void>
  /** 관련 기억 찾기 */
  findRelated(memoryId: string, limit?: number): Promise<Memory[]>
  /** 기억 통합 (중복 제거 및 요약) */
  consolidate(): Promise<void>
  /** 중요도 재계산 */
  recalculateImportance(): Promise<void>
}

export interface IPromptEngineerAgent {
  /** 프롬프트 분석 */
  analyze(prompt: string, context: AgentContext): Promise<AgentResponse<PromptAnalysis>>
  /** 프롬프트 개선 */
  enhance(prompt: string, context: AgentContext): Promise<AgentResponse<string>>
  /** 프롬프트 템플릿 생성 */
  generateTemplate(task: string, domain: string): Promise<AgentResponse<PromptTemplate>>
  /** Few-shot 예시 생성 */
  generateExamples(task: string, count: number): Promise<AgentResponse<Example[]>>
  /** Chain-of-Thought 분해 */
  decomposeToChainOfThought(task: string): Promise<AgentResponse<ChainOfThoughtStep[]>>
}

export interface IOrchestratorAgent {
  /** 작업 계획 생성 */
  createPlan(request: string, context: AgentContext): Promise<AgentResponse<TaskPlan>>
  /** 계획 수정 */
  modifyPlan(planId: string, modifications: PlanModification[]): Promise<AgentResponse<TaskPlan>>
  /** 계획 실행 */
  executePlan(plan: TaskPlan, context: AgentContext): Promise<AgentResponse<ExecutionResult>>
  /** 실행 모니터링 */
  monitorExecution(planId: string): AsyncIterable<ExecutionProgress>
  /** 오류 복구 */
  handleError(error: Error, context: AgentContext): Promise<AgentResponse<RecoveryAction>>
}

// ============================================================
// Supporting Types
// ============================================================

export interface PromptAnalysis {
  /** 의도 */
  intent: string
  /** 명확성 점수 */
  clarityScore: number
  /** 구체성 점수 */
  specificityScore: number
  /** 누락된 정보 */
  missingInfo: string[]
  /** 모호한 부분 */
  ambiguities: string[]
  /** 개선 제안 */
  suggestions: string[]
  /** 감지된 도메인 */
  detectedDomain: string
  /** 복잡도 */
  complexity: number
}

export interface PromptTemplate {
  /** 템플릿 ID */
  id: string
  /** 이름 */
  name: string
  /** 템플릿 텍스트 */
  template: string
  /** 변수들 */
  variables: TemplateVariable[]
  /** 사용 예시 */
  examples: Example[]
}

export interface TemplateVariable {
  name: string
  description: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required: boolean
  default?: any
}

export interface Example {
  input: string
  output: string
  explanation?: string
}

export interface ChainOfThoughtStep {
  step: number
  thought: string
  action: string
  expectedOutcome: string
}

export interface PlanModification {
  type: 'add' | 'remove' | 'modify' | 'reorder'
  stepId?: string
  newStep?: Partial<TaskStep>
  newOrder?: number
}

export interface ExecutionResult {
  success: boolean
  outputs: Record<string, any>
  errors: Error[]
  duration: number
  stepsCompleted: number
  totalSteps: number
}

export interface ExecutionProgress {
  planId: string
  currentStep: string
  progress: number
  status: string
  message: string
}

export interface RecoveryAction {
  type: 'retry' | 'skip' | 'rollback' | 'alternative' | 'abort'
  description: string
  steps: TaskStep[]
}
