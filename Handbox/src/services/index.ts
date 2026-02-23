/**
 * Services Index
 *
 * Handbox 서비스 모듈 통합 export
 */

// XAI (Explainable AI) 서비스
export { XAIService, xaiService } from './XAIService'
export type {
  LLMCallTrace,
  TokenAttribution,
  CoTStep,
  ConfidenceAnalysis,
  CounterfactualExplanation,
} from './XAIService'

// LLM XAI 래퍼
export {
  callLLMWithXAI,
  streamLLMWithXAI,
  evaluatePromptQuality,
  formatXAIForDisplay,
} from './LLMXAIWrapper'
export type { LLMRequest, LLMResponse } from './LLMXAIWrapper'

// Local MCP Registry
export { LocalMCPRegistry } from './LocalMCPRegistry'
export type {
  MCPTool,
  MCPToolResult,
  MCPContent,
  ToolExecutionContext,
  ToolExecutionLog,
} from './LocalMCPRegistry'

// Advanced MCP Tools (AWS Bedrock 수준 기능)
export { registerAdvancedMCPTools } from './AdvancedMCPTools'
export type { RAGConfig, S3Config, KnowledgeBaseConfig, AgentConfig } from './AdvancedMCPTools'

// Local LLM Provider (Ollama, LM Studio 등)
export { LocalLLMProvider, configureOllama, configureLMStudio, generateLocal, embedLocal } from './LocalLLMProvider'
export type { LocalLLMConfig, LocalLLMRequest, LocalLLMResponse, LocalEmbeddingRequest, LocalEmbeddingResponse } from './LocalLLMProvider'

// Local Vector Database (기본)
export { LocalVectorDB } from './LocalVectorDB'

// Enhanced Vector Database (IndexedDB + BM25 하이브리드)
export { EnhancedVectorDB } from './EnhancedVectorDB'
export type {
  VectorDocument,
  KnowledgeBase,
  SearchResult,
  HybridSearchOptions,
} from './EnhancedVectorDB'

// ReAct Agent Engine (멀티스텝 에이전트)
export { ReActAgent, invokeAgent } from './ReActAgent'
export type { AgentConfig as ReActAgentConfig, AgentStep, AgentResult, AgentSession } from './ReActAgent'

// Guardrails (PII 마스킹, 인젝션 탐지)
export { Guardrails, maskPII, checkInjection, validateInput, validateOutput } from './Guardrails'
export type { PIIEntity, PIIType, GuardrailConfig, GuardrailResult } from './Guardrails'

// ============================================================
// 핵심: 통합 워크플로우 생성 에이전트 (AWS 차별점)
// ============================================================
export {
  IntegratedWorkflowAgent,
  createWorkflowWithAgent,
  modifyWorkflowWithAgent,
  getToolRecommendations,
} from './IntegratedWorkflowAgent'
export type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowDesign,
  ConversationTurn,
  AgentSession as WorkflowAgentSession,
} from './IntegratedWorkflowAgent'

// 기존 서비스
export * from './PromptAnalyzer'
export * from './WorkflowValidator'
export * from './WorkflowOrchestratorAgent'
export * from './WorkflowLearningService'
export * from './ConnectionGuideService'
export * from './PersonaService'
