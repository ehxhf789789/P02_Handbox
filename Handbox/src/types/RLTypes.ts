/**
 * RL Simulation System Types
 *
 * 강화학습 시뮬레이션 시스템을 위한 타입 정의
 * 20,000건 성공 목표를 위한 학습 시스템 타입
 */

// ============================================================
// Strategy & Action Types
// ============================================================

export enum Strategy {
  COT = 'chain_of_thought',
  FEWSHOT = 'few_shot',
  CHAIN_REASONING = 'chain_reasoning',
  TEMPLATE_MATCH = 'template_match',
  HYBRID = 'hybrid',
}

export type Action = Strategy

// ============================================================
// State Types
// ============================================================

export interface PromptFeatures {
  length: number
  complexity: number        // 0-1 정규화
  hasMultiStep: boolean
  hasConditional: boolean
  hasRAG: boolean
  hasVision: boolean
  hasMultiTurn: boolean
  domainCategory: string
  keywordCount: number
  intentClarity: number     // 0-1 정규화
}

export interface AgentState {
  currentSuccessRate: number
  recentRewards: number[]   // 최근 10개 보상
  strategyPerformance: Map<Strategy, number>
  errorPatterns: string[]
  contextEmbedding?: number[]
}

export interface State {
  promptFeatures: PromptFeatures
  agentState: AgentState
  timestamp: Date
  sessionId: string
}

// ============================================================
// Experience & Reward Types
// ============================================================

export interface Experience {
  id: string
  timestamp: Date
  state: State
  action: Action
  reward: number            // -5 ~ +5 정규화
  nextState: State | null
  metadata: ExperienceMetadata
}

export interface ExperienceMetadata {
  promptHash: string
  prompt: string
  workflowId: string
  executionTime: number
  nodeCount: number
  success: boolean
  errorMessage?: string
  checklist: SuccessChecklist
}

export interface RewardFactors {
  executionSuccess: boolean       // +2 / -3
  notebookLMComparison: number    // -2 ~ +2
  xaiScore: number                // -1 ~ +1
  nodeEfficiency: number          // -1 ~ +1
  intentAlignment: number         // -1 ~ +1
  toolSelectionAccuracy: number   // -1 ~ +1
}

// ============================================================
// Success Checklist (12-Point)
// ============================================================

export interface SuccessChecklist {
  // 구조적 검증 (4점)
  hasValidStructure: boolean
  hasRequiredNodes: boolean
  hasValidConnections: boolean
  hasNoOrphanNodes: boolean

  // 실행 검증 (4점)
  executionCompleted: boolean
  noRuntimeErrors: boolean
  outputsGenerated: boolean
  withinTimeLimit: boolean

  // 품질 검증 (4점)
  intentAligned: boolean
  xaiExplainable: boolean
  notebookLMPassing: boolean
  toolSelectionOptimal: boolean
}

export function calculateChecklistScore(checklist: SuccessChecklist): number {
  return Object.values(checklist).filter(Boolean).length
}

export function isSuccessful(checklist: SuccessChecklist): boolean {
  return calculateChecklistScore(checklist) >= 10
}

// ============================================================
// Loop Result Types
// ============================================================

export interface LoopResult {
  id: string
  prompt: string
  workflow: WorkflowSnapshot | null
  executionResult: ExecutionSnapshot | null
  success: boolean
  checklist: SuccessChecklist
  reward: number
  xaiScore: number
  notebookLMScore: number
  intentAlignmentScore: number
  executionTime: number
  nodeCount: number
  strategy: Strategy
  errorMessage?: string
  timestamp: Date
}

export interface WorkflowSnapshot {
  id: string
  nodes: NodeSnapshot[]
  edges: EdgeSnapshot[]
  createdAt: Date
}

export interface NodeSnapshot {
  id: string
  type: string
  config: Record<string, unknown>
}

export interface EdgeSnapshot {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface ExecutionSnapshot {
  status: 'completed' | 'failed' | 'timeout'
  outputs: Record<string, unknown>
  errors: string[]
  duration: number
}

// ============================================================
// Bug Pattern Types
// ============================================================

export interface BugPattern {
  id: string
  pattern: string           // 정규식 또는 의미적 패턴
  description: string
  frequency: number
  severity: BugSeverity
  resolution?: string
  examples: FailureExample[]
  firstSeen: Date
  lastSeen: Date
}

export type BugSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface FailureExample {
  prompt: string
  workflowId: string
  errorMessage: string
  timestamp: Date
}

// ============================================================
// Learning & Growth Types
// ============================================================

export interface LearningEntry {
  id: string
  timestamp: Date
  eventType: LearningEventType
  details: Record<string, unknown>
  metrics: LearningMetrics
}

export type LearningEventType =
  | 'strategy_update'
  | 'bug_detected'
  | 'bug_resolved'
  | 'fewshot_added'
  | 'checkpoint_created'
  | 'policy_update'

export interface LearningMetrics {
  successRate: number
  averageReward: number
  strategyDistribution: Record<Strategy, number>
  errorRate: number
  improvementRate: number
}

export interface GrowthMetrics {
  totalExperiences: number
  successCount: number
  successRate: number
  averageReward: number
  bugPatternsDetected: number
  bugPatternsResolved: number
  fewShotExamplesGenerated: number
  strategiesOptimized: number
  learningVelocity: number    // 최근 개선 속도
}

// ============================================================
// Checkpoint Types
// ============================================================

export interface Checkpoint {
  id: string
  timestamp: Date
  successCount: number
  totalAttempts: number
  policyWeights: Map<Strategy, number>
  supervisorState: SupervisorState
  experienceBufferSize: number
  metrics: SimulationMetrics
}

export interface SupervisorState {
  bugPatterns: BugPattern[]
  learningHistory: LearningEntry[]
  fewShotExamples: Record<string, FewShotExample[]>
  resolvedBugs: string[]
}

export interface FewShotExample {
  prompt: string
  workflow: WorkflowSnapshot
  score: number
  category: string
}

// ============================================================
// Guardrail Config (API 사용량 제한)
// ============================================================

export interface RLGuardrailConfig {
  // API 호출 제한
  maxAPICallsPerMinute: number     // 분당 최대 호출 (기본: 20)
  maxAPICallsPerHour: number       // 시간당 최대 호출 (기본: 500)
  maxAPICallsPerDay: number        // 일일 최대 호출 (기본: 5000)

  // 비용 제한 (USD 기준)
  maxCostPerHour: number           // 시간당 최대 비용 (기본: 10)
  maxCostPerDay: number            // 일일 최대 비용 (기본: 50)
  estimatedCostPerCall: number     // 예상 호출당 비용 (기본: 0.01)

  // 안전 기능
  enableEmergencyStop: boolean     // 긴급 중지 활성화
  pauseOnConsecutiveFailures: number  // 연속 실패 시 일시정지 (기본: 10)
  cooldownMinutes: number          // 제한 도달 시 쿨다운 (분)

  // 알림
  warnAtUsagePercent: number       // 경고 임계값 (기본: 80%)
}

export const DEFAULT_GUARDRAIL_CONFIG: RLGuardrailConfig = {
  maxAPICallsPerMinute: 20,
  maxAPICallsPerHour: 500,
  maxAPICallsPerDay: 5000,
  maxCostPerHour: 10,
  maxCostPerDay: 50,
  estimatedCostPerCall: 0.01,
  enableEmergencyStop: true,
  pauseOnConsecutiveFailures: 10,
  cooldownMinutes: 5,
  warnAtUsagePercent: 80,
}

export interface APIUsageStats {
  callsThisMinute: number
  callsThisHour: number
  callsThisDay: number
  costThisHour: number
  costThisDay: number
  consecutiveFailures: number
  lastCallTime: Date | null
  lastResetTime: Date
  isRateLimited: boolean
  cooldownUntil: Date | null
}

export const createInitialUsageStats = (): APIUsageStats => ({
  callsThisMinute: 0,
  callsThisHour: 0,
  callsThisDay: 0,
  costThisHour: 0,
  costThisDay: 0,
  consecutiveFailures: 0,
  lastCallTime: null,
  lastResetTime: new Date(),
  isRateLimited: false,
  cooldownUntil: null,
})

// ============================================================
// Simulation Config & Result Types
// ============================================================

export interface RLSimulationConfig {
  targetSuccesses: number        // 20,000
  batchSize: number              // 100
  checkpointInterval: number     // 1000
  maxRetries: number             // 3
  notebookLMThreshold: number    // 0.7
  xaiThreshold: number           // 0.75
  intentThreshold: number        // 0.8
  persistenceMode: 'sqlite' | 'memory'
  timeoutMs: number              // 30000
  epsilon: number                // ε-greedy 탐색률 (0.1)
  learningRate: number           // 0.01
  discountFactor: number         // 0.95

  // 가드레일 설정
  guardrails: RLGuardrailConfig
}

export const DEFAULT_RL_CONFIG: RLSimulationConfig = {
  targetSuccesses: 20000,
  batchSize: 100,
  checkpointInterval: 1000,
  maxRetries: 3,
  notebookLMThreshold: 0.7,
  xaiThreshold: 0.75,
  intentThreshold: 0.8,
  persistenceMode: 'sqlite',
  timeoutMs: 30000,
  epsilon: 0.1,
  learningRate: 0.01,
  discountFactor: 0.95,
  guardrails: DEFAULT_GUARDRAIL_CONFIG,
}

export interface SimulationMetrics {
  successCount: number
  totalAttempts: number
  successRate: number
  averageReward: number
  averageExecutionTime: number
  averageNodeCount: number
  strategyUsage: Record<Strategy, number>
  strategySuccessRate: Record<Strategy, number>
  topErrorPatterns: BugPattern[]
  xaiAverageScore: number
  notebookLMAverageScore: number
  intentAverageScore: number
}

export interface SimulationResult {
  success: boolean
  finalMetrics: SimulationMetrics
  checkpoints: Checkpoint[]
  totalDuration: number
  completedAt: Date
}

// ============================================================
// Multi-Turn Types
// ============================================================

export interface ConversationContext {
  sessionId: string
  turns: ConversationTurn[]
  currentWorkflow: WorkflowSnapshot | null
  modificationHistory: WorkflowModification[]
}

export interface ConversationTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  workflowId?: string
}

export interface WorkflowModification {
  type: 'add_node' | 'remove_node' | 'modify_node' | 'add_edge' | 'remove_edge' | 'replace_workflow'
  description: string
  before: WorkflowSnapshot
  after: WorkflowSnapshot
  timestamp: Date
}

export interface MultiTurnScenario {
  id: string
  name: string
  description: string
  turns: MultiTurnPrompt[]
  expectedOutcome: string
}

export interface MultiTurnPrompt {
  turnNumber: number
  prompt: string
  expectedAction: 'create' | 'modify' | 'extend' | 'replace'
  expectedChanges?: string[]
}

// ============================================================
// Complex Prompt Templates
// ============================================================

export interface ComplexPromptTemplate {
  id: string
  category: string
  template: string
  variables: string[]
  complexity: number        // 1-5
  expectedNodeTypes: string[]
  expectedMinNodes: number
  expectedMaxNodes: number
}

export const PROMPT_CATEGORIES = [
  'file_processing',
  'data_transformation',
  'rag_pipeline',
  'conditional_logic',
  'multi_file',
  'vision_analysis',
  'report_generation',
  'api_integration',
  'batch_processing',
  'multi_turn_modification',
] as const

export type PromptCategory = typeof PROMPT_CATEGORIES[number]

// ============================================================
// Logger Types
// ============================================================

export interface LogEntry {
  id: string
  timestamp: Date
  level: 'debug' | 'info' | 'warn' | 'error'
  category: string
  message: string
  data?: Record<string, unknown>
}

export interface SimulationStats {
  startTime: Date
  currentTime: Date
  runningTime: number
  successCount: number
  totalAttempts: number
  successRate: number
  averageReward: number
  currentBatchProgress: number
  estimatedTimeRemaining: number
  lastCheckpointId: string | null
}

// ============================================================
// Learning Data Management Types (개발자 전용)
// ============================================================

export interface LearningDataQuery {
  /** 필터 조건 */
  filter?: {
    success?: boolean
    strategy?: Strategy[]
    minReward?: number
    maxReward?: number
    startDate?: Date
    endDate?: Date
    category?: string[]
  }
  /** 정렬 */
  sort?: {
    field: 'timestamp' | 'reward' | 'executionTime' | 'nodeCount'
    order: 'asc' | 'desc'
  }
  /** 페이지네이션 */
  pagination?: {
    offset: number
    limit: number
  }
}

export interface LearningDataExport {
  version: string
  exportedAt: Date
  config: RLSimulationConfig
  experiences: Experience[]
  checkpoints: Checkpoint[]
  bugPatterns: BugPattern[]
  policyWeights: Record<Strategy, number>
  stats: SimulationStats
}

export interface LearningDataImportResult {
  success: boolean
  imported: {
    experiences: number
    checkpoints: number
    bugPatterns: number
  }
  errors: string[]
}

export interface DeveloperSimulationControl {
  /** 현재 상태 */
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'cooldown'

  /** API 사용량 */
  apiUsage: APIUsageStats

  /** 실시간 메트릭 */
  metrics: SimulationMetrics | null

  /** 최근 결과 */
  recentResults: LoopResult[]

  /** 경고 메시지 */
  warnings: string[]
}
