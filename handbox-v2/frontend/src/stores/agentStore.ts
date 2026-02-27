/**
 * agentStore — Zustand store for multi-agent orchestration state.
 * Connected to Tauri backend for real orchestration.
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  AgentDef,
  AgentInstance,
  AgentTask,
  AgentStatus,
  OrchestrationEvent,
  OrchestrationConfig,
  AgentMessage,
  TaskResult,
} from '@/types/agent'
import { tauriAgentService } from '@/services/TauriAgentService'

/** Agent store state */
interface AgentState {
  // Agent definitions (templates)
  definitions: Record<string, AgentDef>

  // Agent instances (runtime)
  instances: Record<string, AgentInstance>

  // Tasks
  tasks: Record<string, AgentTask>
  taskQueue: string[]

  // Events
  events: OrchestrationEvent[]

  // Messages
  messages: AgentMessage[]

  // Configuration
  config: OrchestrationConfig

  // UI state
  selectedAgentId: string | null
  selectedTaskId: string | null
  isOrchestratorRunning: boolean
  viewMode: 'grid' | 'list' | 'timeline'
  isLoading: boolean

  // Actions
  registerAgent: (def: AgentDef) => Promise<AgentInstance | null>
  unregisterAgent: (instanceId: string) => Promise<void>
  updateAgentStatus: (instanceId: string, status: AgentStatus) => Promise<void>

  createTask: (
    type: AgentTask['type'],
    payload: AgentTask['payload'],
    options?: Partial<Pick<AgentTask, 'priority' | 'timeout' | 'maxRetries'>>
  ) => Promise<AgentTask | null>
  cancelTask: (taskId: string) => Promise<boolean>
  completeTask: (taskId: string, result: TaskResult) => Promise<void>

  startOrchestrator: () => Promise<void>
  stopOrchestrator: () => Promise<void>
  updateConfig: (config: Partial<OrchestrationConfig>) => Promise<void>

  selectAgent: (agentId: string | null) => void
  selectTask: (taskId: string | null) => void
  setViewMode: (mode: 'grid' | 'list' | 'timeline') => void

  // Sync with backend
  syncFromBackend: () => Promise<void>
  processPendingTasks: () => Promise<number>
}

/** Default agent definitions */
const DEFAULT_AGENTS: AgentDef[] = [
  {
    id: 'orchestrator-main',
    name: 'Main Orchestrator',
    role: 'orchestrator',
    description: 'Coordinates all agent activities and task distribution',
    capabilities: [
      {
        id: 'task-routing',
        name: 'Task Routing',
        description: 'Routes tasks to appropriate agents',
        toolRefs: [],
        inputTypes: ['task'],
        outputTypes: ['assignment'],
      },
    ],
    maxConcurrentTasks: 50,
    priority: 10,
    config: {},
  },
  {
    id: 'worker-llm',
    name: 'LLM Worker',
    role: 'worker',
    description: 'Executes LLM-based tasks',
    capabilities: [
      {
        id: 'llm-completion',
        name: 'LLM Completion',
        description: 'Text generation using LLMs',
        toolRefs: ['llm_completion', 'llm_chat', 'llm_embedding'],
        inputTypes: ['prompt', 'messages'],
        outputTypes: ['text', 'embedding'],
      },
    ],
    maxConcurrentTasks: 5,
    priority: 7,
    config: {},
  },
  {
    id: 'worker-data',
    name: 'Data Worker',
    role: 'worker',
    description: 'Handles data transformation tasks',
    capabilities: [
      {
        id: 'data-transform',
        name: 'Data Transform',
        description: 'Transform and process data',
        toolRefs: ['json_parse', 'json_stringify', 'text_split', 'text_join'],
        inputTypes: ['json', 'text', 'array'],
        outputTypes: ['json', 'text', 'array'],
      },
    ],
    maxConcurrentTasks: 10,
    priority: 5,
    config: {},
  },
  {
    id: 'specialist-code',
    name: 'Code Specialist',
    role: 'specialist',
    description: 'Specialized in code-related tasks',
    capabilities: [
      {
        id: 'code-analysis',
        name: 'Code Analysis',
        description: 'Analyze and transform code',
        toolRefs: ['code_execute', 'code_analyze', 'code_format'],
        inputTypes: ['code'],
        outputTypes: ['code', 'analysis'],
      },
    ],
    maxConcurrentTasks: 3,
    priority: 8,
    config: {},
  },
  {
    id: 'reviewer-quality',
    name: 'Quality Reviewer',
    role: 'reviewer',
    description: 'Reviews outputs for quality and correctness',
    capabilities: [
      {
        id: 'quality-check',
        name: 'Quality Check',
        description: 'Review and validate outputs',
        toolRefs: [],
        inputTypes: ['any'],
        outputTypes: ['review', 'approval'],
      },
    ],
    maxConcurrentTasks: 5,
    priority: 6,
    config: {},
  },
]

/** Default orchestration config */
const DEFAULT_CONFIG: OrchestrationConfig = {
  strategy: 'hybrid',
  maxConcurrentTasks: 20,
  taskTimeout: 60000,
  retryPolicy: {
    maxRetries: 3,
    backoffMultiplier: 2,
    initialDelay: 1000,
  },
  loadBalancing: {
    enabled: true,
    threshold: 5,
  },
  healthCheck: {
    enabled: true,
    intervalMs: 30000,
    timeoutMs: 5000,
  },
}

export const useAgentStore = create<AgentState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    definitions: Object.fromEntries(DEFAULT_AGENTS.map(a => [a.id, a])),
    instances: {},
    tasks: {},
    taskQueue: [],
    events: [],
    messages: [],
    config: DEFAULT_CONFIG,
    selectedAgentId: null,
    selectedTaskId: null,
    isOrchestratorRunning: false,
    viewMode: 'grid',
    isLoading: false,

    // Agent management - connected to Tauri backend
    registerAgent: async (def: AgentDef) => {
      set({ isLoading: true })
      try {
        const instance = await tauriAgentService.registerAgent(def)
        if (instance) {
          set(state => ({
            definitions: { ...state.definitions, [def.id]: def },
            instances: { ...state.instances, [instance.id]: instance },
            isLoading: false,
          }))
        } else {
          set({ isLoading: false })
        }
        return instance
      } catch (e) {
        console.error('Failed to register agent:', e)
        set({ isLoading: false })
        return null
      }
    },

    unregisterAgent: async (instanceId: string) => {
      set({ isLoading: true })
      try {
        await tauriAgentService.unregisterAgent(instanceId)
        set(state => {
          const { [instanceId]: removed, ...remaining } = state.instances
          return {
            instances: remaining,
            selectedAgentId: state.selectedAgentId === instanceId ? null : state.selectedAgentId,
            isLoading: false,
          }
        })
      } catch (e) {
        console.error('Failed to unregister agent:', e)
        set({ isLoading: false })
      }
    },

    updateAgentStatus: async (instanceId: string, status: AgentStatus) => {
      try {
        await tauriAgentService.updateAgentStatus(instanceId, status)
        set(state => {
          const existing = state.instances[instanceId]
          if (!existing) return state
          return {
            instances: {
              ...state.instances,
              [instanceId]: {
                ...existing,
                status,
                lastActive: new Date().toISOString(),
              },
            },
          }
        })
      } catch (e) {
        console.error('Failed to update agent status:', e)
      }
    },

    // Task management - connected to Tauri backend
    createTask: async (type, payload, options = {}) => {
      set({ isLoading: true })
      try {
        const task = await tauriAgentService.createTask(type, payload, options)
        if (task) {
          set(state => ({
            tasks: { ...state.tasks, [task.id]: task },
            taskQueue: [...state.taskQueue, task.id],
            isLoading: false,
          }))
        } else {
          set({ isLoading: false })
        }
        return task
      } catch (e) {
        console.error('Failed to create task:', e)
        set({ isLoading: false })
        return null
      }
    },

    cancelTask: async (taskId: string) => {
      try {
        const success = await tauriAgentService.cancelTask(taskId)
        if (success) {
          set(state => {
            const existing = state.tasks[taskId]
            if (!existing) return state
            return {
              tasks: {
                ...state.tasks,
                [taskId]: { ...existing, status: 'cancelled' as const },
              },
              taskQueue: state.taskQueue.filter(id => id !== taskId),
            }
          })
        }
        return success
      } catch (e) {
        console.error('Failed to cancel task:', e)
        return false
      }
    },

    completeTask: async (taskId: string, result: TaskResult) => {
      try {
        await tauriAgentService.completeTask(taskId, result)
        set(state => {
          const existing = state.tasks[taskId]
          if (!existing) return state
          return {
            tasks: {
              ...state.tasks,
              [taskId]: {
                ...existing,
                status: result.success ? 'completed' as const : 'failed' as const,
                result,
                completedAt: new Date().toISOString(),
              },
            },
            taskQueue: state.taskQueue.filter(id => id !== taskId),
          }
        })
      } catch (e) {
        console.error('Failed to complete task:', e)
      }
    },

    // Orchestrator control - connected to Tauri backend
    startOrchestrator: async () => {
      set({ isLoading: true })
      try {
        await tauriAgentService.startOrchestrator()

        // Register default agents if none exist
        const state = get()
        if (Object.keys(state.instances).length === 0) {
          for (const def of DEFAULT_AGENTS) {
            await tauriAgentService.registerAgent(def)
          }
        }

        set({ isOrchestratorRunning: true, isLoading: false })
        await get().syncFromBackend()
      } catch (e) {
        console.error('Failed to start orchestrator:', e)
        set({ isLoading: false })
      }
    },

    stopOrchestrator: async () => {
      try {
        await tauriAgentService.stopOrchestrator()
        set({ isOrchestratorRunning: false })
      } catch (e) {
        console.error('Failed to stop orchestrator:', e)
      }
    },

    updateConfig: async (configUpdate: Partial<OrchestrationConfig>) => {
      const newConfig = { ...get().config, ...configUpdate }
      try {
        await tauriAgentService.updateConfig(newConfig)
        set({ config: newConfig })
      } catch (e) {
        console.error('Failed to update config:', e)
      }
    },

    // UI state
    selectAgent: (agentId: string | null) => {
      set({ selectedAgentId: agentId })
    },

    selectTask: (taskId: string | null) => {
      set({ selectedTaskId: taskId })
    },

    setViewMode: (mode: 'grid' | 'list' | 'timeline') => {
      set({ viewMode: mode })
    },

    // Sync with backend
    syncFromBackend: async () => {
      try {
        const [instances, events, tasks] = await Promise.all([
          tauriAgentService.listInstances(),
          tauriAgentService.getEvents(100),
          tauriAgentService.listTasks(),
        ])

        set({
          instances: Object.fromEntries(instances.map(a => [a.id, a])),
          events,
          tasks: Object.fromEntries(tasks.map(t => [t.id, t])),
        })
      } catch (e) {
        console.error('Failed to sync from backend:', e)
      }
    },

    processPendingTasks: async () => {
      try {
        const count = await tauriAgentService.processPending()
        if (count > 0) {
          await get().syncFromBackend()
        }
        return count
      } catch (e) {
        console.error('Failed to process pending tasks:', e)
        return 0
      }
    },
  }))
)

// ========== Selectors ==========

/**
 * Get agents by role
 */
export const selectAgentsByRole = (state: AgentState, role: AgentDef['role']): AgentInstance[] => {
  return Object.values(state.instances).filter(inst => {
    const def = state.definitions[inst.defId]
    return def?.role === role
  })
}

/**
 * Get agents by status
 */
export const selectAgentsByStatus = (state: AgentState, status: AgentStatus): AgentInstance[] => {
  return Object.values(state.instances).filter(inst => inst.status === status)
}

/**
 * Get tasks by status
 */
export const selectTasksByStatus = (state: AgentState, status: AgentTask['status']): AgentTask[] => {
  return Object.values(state.tasks).filter(task => task.status === status)
}

/**
 * Get agent with definition
 */
export const selectAgentWithDef = (
  state: AgentState,
  instanceId: string
): { instance: AgentInstance; def: AgentDef } | null => {
  const instance = state.instances[instanceId]
  if (!instance) return null

  const def = state.definitions[instance.defId]
  if (!def) return null

  return { instance, def }
}

/**
 * Get orchestrator statistics
 */
export const selectOrchestratorStats = (state: AgentState) => {
  const instances = Object.values(state.instances)
  const tasks = Object.values(state.tasks)

  return {
    totalAgents: instances.length,
    activeAgents: instances.filter(a => a.status !== 'offline').length,
    idleAgents: instances.filter(a => a.status === 'idle').length,
    busyAgents: instances.filter(a => a.status === 'busy').length,
    totalTasks: tasks.length,
    pendingTasks: tasks.filter(t => t.status === 'pending' || t.status === 'queued').length,
    runningTasks: tasks.filter(t => t.status === 'running').length,
    completedTasks: tasks.filter(t => t.status === 'completed').length,
    failedTasks: tasks.filter(t => t.status === 'failed').length,
  }
}
