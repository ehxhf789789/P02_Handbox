/**
 * RL Simulation System - Testing Module Exports
 *
 * 강화학습 기반 워크플로우 생성 시뮬레이션 시스템
 * 20,000건 성공 목표 / 실제 LLM 환경
 */

// Types
export type {
  Strategy,
  State,
  PromptFeatures,
  AgentState,
  Experience,
  ExperienceMetadata,
  RewardFactors,
  SuccessChecklist,
  LoopResult,
  WorkflowSnapshot,
  NodeSnapshot,
  EdgeSnapshot,
  ExecutionSnapshot,
  BugPattern,
  BugSeverity,
  FailureExample,
  LearningEntry,
  LearningEventType,
  LearningMetrics,
  GrowthMetrics,
  Checkpoint,
  SupervisorState,
  FewShotExample,
  RLSimulationConfig,
  SimulationMetrics,
  SimulationResult,
  ConversationContext,
  ConversationTurn,
  WorkflowModification,
  MultiTurnScenario,
  MultiTurnPrompt,
  ComplexPromptTemplate,
  PromptCategory,
  LogEntry,
  SimulationStats,
  // 가드레일 & 개발자 도구 타입
  RLGuardrailConfig,
  APIUsageStats,
  LearningDataQuery,
  LearningDataExport,
  LearningDataImportResult,
  DeveloperSimulationControl,
} from '../types/RLTypes'

// 가드레일 기본 설정
export {
  DEFAULT_RL_CONFIG,
  DEFAULT_GUARDRAIL_CONFIG,
  createInitialUsageStats,
} from '../types/RLTypes'

// Core Components
export { RLLogger, rlLogger } from './RLLogger'
export { ExperienceBuffer, experienceBuffer, createState, createExperienceMetadata } from './ExperienceBuffer'
export { RewardCalculator, rewardCalculator } from './RewardCalculator'
export { PolicyNetwork, policyNetwork } from './PolicyNetwork'
export { SupervisorAgent, supervisorAgent } from './SupervisorAgent'
export { MultiTurnHandler, multiTurnHandler } from './MultiTurnHandler'

// Main System
export { RLSimulationSystem, rlSimulationSystem } from './RLSimulationSystem'

// Integration
export {
  initializeRLSimulation,
  startRLSimulation,
  verifySimulationRealism,
  getSimulationState,
  pauseSimulation,
  resumeSimulation,
  stopSimulation,
  RealWorkflowAgentAdapter,
  RealExecutionEngineAdapter,
  type RealismCheck,
} from './RLIntegration'

// Test Runner
export { runRLTest } from './runRLTest'

// Legacy Simulation (기존 WorkflowSimulator와 호환)
export { WorkflowSimulator, workflowSimulator, quickSimulation, mediumSimulation } from './WorkflowSimulator'
export { REALISTIC_LONG_PROMPTS, MULTI_TURN_SCENARIOS, SIMULATION_CONFIG } from './RealisticSimulationScenarios'

// RL Data Migration (v1 → v2)
export {
  migrateRLDataToV2,
  executeMigration,
  generateMigrationReport,
  EXTRACTED_RL_DATA,
  type RLSimulationStats,
} from './RLDataMigration'
