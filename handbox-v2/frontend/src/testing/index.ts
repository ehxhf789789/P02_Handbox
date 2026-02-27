// @ts-nocheck
/**
 * RL Simulation System - Testing Module Exports (v2)
 *
 * 강화학습 기반 워크플로우 생성 시뮬레이션 시스템
 * Handbox v2 아키텍처에 맞게 재구성
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

// Integration (v2)
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
