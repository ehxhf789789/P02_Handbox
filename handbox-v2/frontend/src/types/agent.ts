/**
 * Agent types — Multi-agent orchestration system types.
 */

/** Agent role in the orchestration */
export type AgentRole =
  | 'orchestrator'    // Main coordinator
  | 'worker'          // Executes tasks
  | 'specialist'      // Domain-specific agent
  | 'reviewer'        // Reviews outputs
  | 'router'          // Routes tasks to appropriate agents

/** Agent status */
export type AgentStatus =
  | 'idle'
  | 'busy'
  | 'waiting'
  | 'error'
  | 'offline'

/** Agent capability */
export interface AgentCapability {
  id: string
  name: string
  description: string
  toolRefs: string[]          // Tools this capability uses
  inputTypes: string[]        // Accepted input types
  outputTypes: string[]       // Produced output types
}

/** Agent definition */
export interface AgentDef {
  id: string
  name: string
  role: AgentRole
  description: string
  modelId?: string            // Preferred LLM model
  providerId?: string         // Preferred LLM provider
  capabilities: AgentCapability[]
  maxConcurrentTasks: number
  priority: number            // 0-10, higher = more important
  systemPrompt?: string       // Custom system prompt
  config: Record<string, unknown>
}

/** Agent instance (runtime state) */
export interface AgentInstance {
  id: string
  defId: string               // Reference to AgentDef
  status: AgentStatus
  currentTaskId?: string
  taskQueue: string[]
  metrics: AgentMetrics
  lastActive: string
  errorCount: number
  createdAt: string
}

/** Agent performance metrics */
export interface AgentMetrics {
  tasksCompleted: number
  tasksFailed: number
  averageExecutionTime: number
  totalExecutionTime: number
  successRate: number
  lastUpdated: string
}

/** Task for agent execution */
export interface AgentTask {
  id: string
  type: 'workflow' | 'node' | 'review' | 'route' | 'custom'
  priority: number
  payload: TaskPayload
  assignedAgentId?: string
  status: TaskStatus
  result?: TaskResult
  createdAt: string
  startedAt?: string
  completedAt?: string
  timeout: number             // ms
  retryCount: number
  maxRetries: number
  parentTaskId?: string       // For sub-tasks
  childTaskIds: string[]
}

/** Task payload variants */
export type TaskPayload =
  | WorkflowTaskPayload
  | NodeTaskPayload
  | ReviewTaskPayload
  | RouteTaskPayload
  | CustomTaskPayload

export interface WorkflowTaskPayload {
  type: 'workflow'
  workflowId: string
  inputs: Record<string, unknown>
  options?: {
    partial?: boolean
    startNodeId?: string
  }
}

export interface NodeTaskPayload {
  type: 'node'
  nodeId: string
  toolRef: string
  inputs: Record<string, unknown>
  config: Record<string, unknown>
}

export interface ReviewTaskPayload {
  type: 'review'
  targetTaskId: string
  criteria: string[]
  autoApprove: boolean
}

export interface RouteTaskPayload {
  type: 'route'
  query: string
  context: Record<string, unknown>
  candidates: string[]        // Agent IDs to choose from
}

export interface CustomTaskPayload {
  type: 'custom'
  action: string
  data: Record<string, unknown>
}

/** Task status */
export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout'

/** Task result */
export interface TaskResult {
  success: boolean
  output?: unknown
  error?: string
  metrics: {
    executionTime: number
    tokensUsed?: number
    cost?: number
  }
  reviewNotes?: string
}

/** Message between agents */
export interface AgentMessage {
  id: string
  fromAgentId: string
  toAgentId: string | 'broadcast'
  type: MessageType
  payload: unknown
  timestamp: string
  replyToId?: string
  priority: number
}

export type MessageType =
  | 'task_assign'
  | 'task_complete'
  | 'task_failed'
  | 'status_update'
  | 'capability_query'
  | 'capability_response'
  | 'handoff'
  | 'ping'
  | 'pong'

/** Orchestration strategy */
export type OrchestrationStrategy =
  | 'round_robin'             // Distribute evenly
  | 'least_busy'              // Assign to least loaded agent
  | 'capability_match'        // Match by capability
  | 'priority_based'          // Honor task priority
  | 'hybrid'                  // Combination of strategies

/** Orchestration configuration */
export interface OrchestrationConfig {
  strategy: OrchestrationStrategy
  maxConcurrentTasks: number
  taskTimeout: number         // Default timeout in ms
  retryPolicy: {
    maxRetries: number
    backoffMultiplier: number
    initialDelay: number
  }
  loadBalancing: {
    enabled: boolean
    threshold: number         // Rebalance when queue diff exceeds this
  }
  healthCheck: {
    enabled: boolean
    intervalMs: number
    timeoutMs: number
  }
}

/** Agent registry for managing definitions */
export interface AgentRegistry {
  agents: Record<string, AgentDef>
  defaultOrchestrator?: string
  version: number
}

/** Orchestration event for logging */
export interface OrchestrationEvent {
  id: string
  type: OrchestrationEventType
  timestamp: string
  agentId?: string
  taskId?: string
  details: Record<string, unknown>
}

export type OrchestrationEventType =
  | 'agent_registered'
  | 'agent_unregistered'
  | 'agent_status_changed'
  | 'task_created'
  | 'task_assigned'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'task_timeout'
  | 'task_retried'
  | 'load_rebalanced'
  | 'health_check'
