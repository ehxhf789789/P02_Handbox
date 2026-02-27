/**
 * TauriAgentService — Tauri backend integration for agent orchestration.
 * Handles graceful degradation when not running in Tauri environment.
 */

import type {
  AgentDef,
  AgentInstance,
  AgentTask,
  AgentStatus,
  OrchestrationConfig,
  OrchestrationEvent,
  TaskResult,
} from '@/types/agent'
import { isTauri, safeInvoke } from '@/utils/tauri'

// Convert frontend types to backend snake_case format
function toSnakeCase<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(toSnakeCase) as T
  if (typeof obj !== 'object') return obj

  const converted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    converted[snakeKey] = toSnakeCase(value)
  }
  return converted as T
}

// Convert backend snake_case to frontend camelCase
function toCamelCase<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(toCamelCase) as T
  if (typeof obj !== 'object') return obj

  const converted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    converted[camelKey] = toCamelCase(value)
  }
  return converted as T
}

/**
 * TauriAgentService class — wraps Tauri commands for agent orchestration
 * Gracefully handles non-Tauri environments (browser mode)
 */
class TauriAgentService {
  /**
   * Start the orchestrator
   */
  async startOrchestrator(): Promise<boolean> {
    if (!isTauri()) {
      console.warn('[TauriAgentService] Not in Tauri environment')
      return false
    }
    try {
      return (await safeInvoke<boolean>('agent_start_orchestrator')) ?? false
    } catch (e) {
      console.error('Failed to start orchestrator:', e)
      return false
    }
  }

  /**
   * Stop the orchestrator
   */
  async stopOrchestrator(): Promise<boolean> {
    if (!isTauri()) return false
    try {
      return (await safeInvoke<boolean>('agent_stop_orchestrator')) ?? false
    } catch (e) {
      console.error('Failed to stop orchestrator:', e)
      return false
    }
  }

  /**
   * Register an agent
   */
  async registerAgent(def: AgentDef): Promise<AgentInstance | null> {
    if (!isTauri()) return null
    try {
      const backendDef = toSnakeCase(def)
      const result = await safeInvoke<AgentInstance>('agent_register', { def: backendDef })
      return result ? toCamelCase(result) : null
    } catch (e) {
      console.error('Failed to register agent:', e)
      return null
    }
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(instanceId: string): Promise<boolean> {
    if (!isTauri()) return false
    try {
      return (await safeInvoke<boolean>('agent_unregister', { instanceId })) ?? false
    } catch (e) {
      console.error('Failed to unregister agent:', e)
      return false
    }
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(instanceId: string, status: AgentStatus): Promise<boolean> {
    if (!isTauri()) return false
    try {
      return (await safeInvoke<boolean>('agent_update_status', { instanceId, status })) ?? false
    } catch (e) {
      console.error('Failed to update agent status:', e)
      return false
    }
  }

  /**
   * List all agent instances
   */
  async listInstances(): Promise<AgentInstance[]> {
    if (!isTauri()) return []
    try {
      const result = await safeInvoke<AgentInstance[]>('agent_list_instances')
      return result ? result.map(toCamelCase) : []
    } catch (e) {
      console.error('Failed to list instances:', e)
      return []
    }
  }

  /**
   * Get agent instance by ID
   */
  async getInstance(instanceId: string): Promise<AgentInstance | null> {
    if (!isTauri()) return null
    try {
      const result = await safeInvoke<AgentInstance | null>('agent_get_instance', { instanceId })
      return result ? toCamelCase(result) : null
    } catch (e) {
      console.error('Failed to get instance:', e)
      return null
    }
  }

  /**
   * Create a task
   */
  async createTask(
    taskType: AgentTask['type'],
    payload: unknown,
    options?: { priority?: number; timeout?: number; maxRetries?: number; parentTaskId?: string }
  ): Promise<AgentTask | null> {
    if (!isTauri()) return null
    try {
      const result = await safeInvoke<AgentTask>('agent_create_task', {
        taskType,
        payload,
        priority: options?.priority,
        timeout: options?.timeout,
        maxRetries: options?.maxRetries,
        parentTaskId: options?.parentTaskId,
      })
      return result ? toCamelCase(result) : null
    } catch (e) {
      console.error('Failed to create task:', e)
      return null
    }
  }

  /**
   * Assign task to agent
   */
  async assignTask(taskId: string, agentId: string): Promise<boolean> {
    if (!isTauri()) return false
    try {
      return (await safeInvoke<boolean>('agent_assign_task', { taskId, agentId })) ?? false
    } catch (e) {
      console.error('Failed to assign task:', e)
      return false
    }
  }

  /**
   * Start task execution
   */
  async startTask(taskId: string): Promise<boolean> {
    if (!isTauri()) return false
    try {
      return (await safeInvoke<boolean>('agent_start_task', { taskId })) ?? false
    } catch (e) {
      console.error('Failed to start task:', e)
      return false
    }
  }

  /**
   * Complete a task
   */
  async completeTask(taskId: string, result: TaskResult): Promise<boolean> {
    if (!isTauri()) return false
    try {
      const backendResult = toSnakeCase(result)
      return (await safeInvoke<boolean>('agent_complete_task', { taskId, result: backendResult })) ?? false
    } catch (e) {
      console.error('Failed to complete task:', e)
      return false
    }
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    if (!isTauri()) return false
    try {
      return (await safeInvoke<boolean>('agent_cancel_task', { taskId })) ?? false
    } catch (e) {
      console.error('Failed to cancel task:', e)
      return false
    }
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<AgentTask | null> {
    if (!isTauri()) return null
    try {
      const result = await safeInvoke<AgentTask | null>('agent_get_task', { taskId })
      return result ? toCamelCase(result) : null
    } catch (e) {
      console.error('Failed to get task:', e)
      return null
    }
  }

  /**
   * List tasks
   */
  async listTasks(statusFilter?: AgentTask['status']): Promise<AgentTask[]> {
    if (!isTauri()) return []
    try {
      const result = await safeInvoke<AgentTask[]>('agent_list_tasks', { statusFilter })
      return result ? result.map(toCamelCase) : []
    } catch (e) {
      console.error('Failed to list tasks:', e)
      return []
    }
  }

  /**
   * Get pending tasks
   */
  async getPendingTasks(): Promise<AgentTask[]> {
    if (!isTauri()) return []
    try {
      const result = await safeInvoke<AgentTask[]>('agent_get_pending_tasks')
      return result ? result.map(toCamelCase) : []
    } catch (e) {
      console.error('Failed to get pending tasks:', e)
      return []
    }
  }

  /**
   * Get orchestrator stats
   */
  async getStats(): Promise<{
    totalAgents: number
    activeAgents: number
    totalTasks: number
    pendingTasks: number
    runningTasks: number
    completedTasks: number
    failedTasks: number
    averageSuccessRate: number
  } | null> {
    if (!isTauri()) return null
    try {
      const result = await safeInvoke<Record<string, unknown>>('agent_get_stats')
      if (!result) return null
      return toCamelCase(result) as {
        totalAgents: number
        activeAgents: number
        totalTasks: number
        pendingTasks: number
        runningTasks: number
        completedTasks: number
        failedTasks: number
        averageSuccessRate: number
      }
    } catch (e) {
      console.error('Failed to get stats:', e)
      return null
    }
  }

  /**
   * Get events
   */
  async getEvents(limit?: number): Promise<OrchestrationEvent[]> {
    if (!isTauri()) return []
    try {
      const result = await safeInvoke<OrchestrationEvent[]>('agent_get_events', { limit })
      return result ? result.map(toCamelCase) : []
    } catch (e) {
      console.error('Failed to get events:', e)
      return []
    }
  }

  /**
   * Update config
   */
  async updateConfig(config: OrchestrationConfig): Promise<boolean> {
    if (!isTauri()) return false
    try {
      const backendConfig = toSnakeCase(config)
      return (await safeInvoke<boolean>('agent_update_config', { config: backendConfig })) ?? false
    } catch (e) {
      console.error('Failed to update config:', e)
      return false
    }
  }

  /**
   * Get config
   */
  async getConfig(): Promise<OrchestrationConfig | null> {
    if (!isTauri()) return null
    try {
      const result = await safeInvoke<OrchestrationConfig>('agent_get_config')
      return result ? toCamelCase(result) : null
    } catch (e) {
      console.error('Failed to get config:', e)
      return null
    }
  }

  /**
   * Process pending tasks (auto-assign)
   */
  async processPending(): Promise<number> {
    if (!isTauri()) return 0
    try {
      return (await safeInvoke<number>('agent_process_pending')) ?? 0
    } catch (e) {
      console.error('Failed to process pending tasks:', e)
      return 0
    }
  }

  /**
   * Check if running in Tauri environment
   */
  isAvailable(): boolean {
    return isTauri()
  }
}

// Singleton instance
export const tauriAgentService = new TauriAgentService()
