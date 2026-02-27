/**
 * AgentOrchestrator — Multi-agent coordination and task distribution.
 *
 * Features:
 * - Agent lifecycle management
 * - Task assignment and load balancing
 * - Capability-based routing
 * - Health monitoring
 * - Event logging
 */

import type {
  AgentDef,
  AgentInstance,
  AgentTask,
  AgentStatus,
  TaskResult,
  OrchestrationConfig,
  OrchestrationEvent,
  AgentMessage,
  TaskPayload,
  NodeTaskPayload,
} from '@/types/agent'

/** Default orchestration configuration */
const DEFAULT_CONFIG: OrchestrationConfig = {
  strategy: 'hybrid',
  maxConcurrentTasks: 10,
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

/** Event callback type */
type EventCallback = (event: OrchestrationEvent) => void

/**
 * AgentOrchestrator class
 */
export class AgentOrchestrator {
  private definitions: Map<string, AgentDef> = new Map()
  private instances: Map<string, AgentInstance> = new Map()
  private tasks: Map<string, AgentTask> = new Map()
  private pendingTasks: AgentTask[] = []
  private config: OrchestrationConfig
  private eventLog: OrchestrationEvent[] = []
  private eventCallbacks: Set<EventCallback> = new Set()
  private healthCheckInterval?: ReturnType<typeof setInterval>
  private isRunning = false

  constructor(config: Partial<OrchestrationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // ========== Lifecycle ==========

  /**
   * Start the orchestrator
   */
  start(): void {
    if (this.isRunning) return
    this.isRunning = true

    // Start health check if enabled
    if (this.config.healthCheck.enabled) {
      this.healthCheckInterval = setInterval(
        () => this.performHealthCheck(),
        this.config.healthCheck.intervalMs
      )
    }

    // Process any pending tasks
    this.processPendingTasks()
  }

  /**
   * Stop the orchestrator
   */
  stop(): void {
    this.isRunning = false
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }
  }

  // ========== Agent Management ==========

  /**
   * Register an agent definition
   */
  registerAgent(def: AgentDef): AgentInstance {
    this.definitions.set(def.id, def)

    // Create instance
    const instance: AgentInstance = {
      id: `inst_${def.id}_${Date.now()}`,
      defId: def.id,
      status: 'idle',
      taskQueue: [],
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        averageExecutionTime: 0,
        totalExecutionTime: 0,
        successRate: 1,
        lastUpdated: new Date().toISOString(),
      },
      lastActive: new Date().toISOString(),
      errorCount: 0,
      createdAt: new Date().toISOString(),
    }

    this.instances.set(instance.id, instance)

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'agent_registered',
      timestamp: new Date().toISOString(),
      agentId: instance.id,
      details: { defId: def.id, name: def.name, role: def.role },
    })

    return instance
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(instanceId: string): void {
    const instance = this.instances.get(instanceId)
    if (!instance) return

    // Reassign pending tasks
    for (const taskId of instance.taskQueue) {
      const task = this.tasks.get(taskId)
      if (task) {
        task.assignedAgentId = undefined
        task.status = 'pending'
        this.pendingTasks.push(task)
      }
    }

    this.instances.delete(instanceId)

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'agent_unregistered',
      timestamp: new Date().toISOString(),
      agentId: instanceId,
      details: {},
    })

    // Reprocess pending tasks
    this.processPendingTasks()
  }

  /**
   * Update agent status
   */
  updateAgentStatus(instanceId: string, status: AgentStatus): void {
    const instance = this.instances.get(instanceId)
    if (!instance) return

    const previousStatus = instance.status
    instance.status = status
    instance.lastActive = new Date().toISOString()

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'agent_status_changed',
      timestamp: new Date().toISOString(),
      agentId: instanceId,
      details: { previousStatus, newStatus: status },
    })

    // If agent became idle, process pending tasks
    if (status === 'idle') {
      this.processPendingTasks()
    }
  }

  /**
   * Get agent by instance ID
   */
  getAgent(instanceId: string): AgentInstance | undefined {
    return this.instances.get(instanceId)
  }

  /**
   * Get agent definition
   */
  getAgentDef(defId: string): AgentDef | undefined {
    return this.definitions.get(defId)
  }

  /**
   * Get all agent instances
   */
  getAllAgents(): AgentInstance[] {
    return Array.from(this.instances.values())
  }

  // ========== Task Management ==========

  /**
   * Create and queue a new task
   */
  createTask(
    type: AgentTask['type'],
    payload: TaskPayload,
    options: Partial<Pick<AgentTask, 'priority' | 'timeout' | 'maxRetries' | 'parentTaskId'>> = {}
  ): AgentTask {
    const task: AgentTask = {
      id: crypto.randomUUID(),
      type,
      priority: options.priority ?? 5,
      payload,
      status: 'pending',
      createdAt: new Date().toISOString(),
      timeout: options.timeout ?? this.config.taskTimeout,
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.config.retryPolicy.maxRetries,
      parentTaskId: options.parentTaskId,
      childTaskIds: [],
    }

    this.tasks.set(task.id, task)
    this.pendingTasks.push(task)

    // Link to parent task
    if (task.parentTaskId) {
      const parent = this.tasks.get(task.parentTaskId)
      if (parent) {
        parent.childTaskIds.push(task.id)
      }
    }

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'task_created',
      timestamp: new Date().toISOString(),
      taskId: task.id,
      details: { type, priority: task.priority },
    })

    // Try to assign immediately
    this.processPendingTasks()

    return task
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false

    if (task.status === 'running') {
      // Cannot cancel running task directly
      return false
    }

    task.status = 'cancelled'

    // Remove from agent queue if assigned
    if (task.assignedAgentId) {
      const agent = this.instances.get(task.assignedAgentId)
      if (agent) {
        agent.taskQueue = agent.taskQueue.filter(id => id !== taskId)
      }
    }

    // Remove from pending
    this.pendingTasks = this.pendingTasks.filter(t => t.id !== taskId)

    return true
  }

  /**
   * Mark task as completed
   */
  completeTask(taskId: string, result: TaskResult): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.status = result.success ? 'completed' : 'failed'
    task.result = result
    task.completedAt = new Date().toISOString()

    // Update agent metrics
    if (task.assignedAgentId) {
      const agent = this.instances.get(task.assignedAgentId)
      if (agent) {
        agent.taskQueue = agent.taskQueue.filter(id => id !== taskId)
        agent.currentTaskId = undefined
        agent.status = 'idle'

        // Update metrics
        const executionTime = task.startedAt
          ? new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()
          : 0

        if (result.success) {
          agent.metrics.tasksCompleted++
        } else {
          agent.metrics.tasksFailed++
        }

        agent.metrics.totalExecutionTime += executionTime
        const totalTasks = agent.metrics.tasksCompleted + agent.metrics.tasksFailed
        agent.metrics.averageExecutionTime = agent.metrics.totalExecutionTime / totalTasks
        agent.metrics.successRate = agent.metrics.tasksCompleted / totalTasks
        agent.metrics.lastUpdated = new Date().toISOString()
      }
    }

    this.emitEvent({
      id: crypto.randomUUID(),
      type: result.success ? 'task_completed' : 'task_failed',
      timestamp: new Date().toISOString(),
      taskId,
      agentId: task.assignedAgentId,
      details: {
        executionTime: result.metrics.executionTime,
        error: result.error,
      },
    })

    // Handle retry on failure
    if (!result.success && task.retryCount < task.maxRetries) {
      this.retryTask(task)
    }

    // Process more tasks
    this.processPendingTasks()
  }

  // ========== Task Assignment ==========

  /**
   * Process pending tasks and assign to available agents
   */
  private processPendingTasks(): void {
    if (!this.isRunning) return

    // Sort by priority (higher first)
    this.pendingTasks.sort((a, b) => b.priority - a.priority)

    const tasksToAssign = [...this.pendingTasks]
    this.pendingTasks = []

    for (const task of tasksToAssign) {
      const agent = this.selectAgent(task)
      if (agent) {
        this.assignTask(task, agent)
      } else {
        // No agent available, put back in pending
        this.pendingTasks.push(task)
      }
    }
  }

  /**
   * Select best agent for a task based on strategy
   */
  private selectAgent(task: AgentTask): AgentInstance | null {
    const availableAgents = this.getAvailableAgents(task)
    if (availableAgents.length === 0) return null

    switch (this.config.strategy) {
      case 'round_robin':
        return this.selectRoundRobin(availableAgents)

      case 'least_busy':
        return this.selectLeastBusy(availableAgents)

      case 'capability_match':
        return this.selectByCapability(availableAgents, task)

      case 'priority_based':
        return this.selectByPriority(availableAgents)

      case 'hybrid':
      default:
        return this.selectHybrid(availableAgents, task)
    }
  }

  /**
   * Get agents that can handle this task
   */
  private getAvailableAgents(task: AgentTask): AgentInstance[] {
    return Array.from(this.instances.values()).filter(agent => {
      // Must be idle or have room in queue
      if (agent.status === 'error' || agent.status === 'offline') {
        return false
      }

      const def = this.definitions.get(agent.defId)
      if (!def) return false

      // Check queue capacity
      if (agent.taskQueue.length >= def.maxConcurrentTasks) {
        return false
      }

      // Check capability match for specific task types
      if (task.type === 'node' && task.payload.type === 'node') {
        const nodePayload = task.payload as NodeTaskPayload
        const hasCapability = def.capabilities.some(
          cap => cap.toolRefs.includes(nodePayload.toolRef)
        )
        if (!hasCapability && def.role === 'specialist') {
          return false
        }
      }

      return true
    })
  }

  private selectRoundRobin(agents: AgentInstance[]): AgentInstance {
    // Simple round-robin based on last active time
    const sorted = agents.sort((a, b) =>
      new Date(a.lastActive).getTime() - new Date(b.lastActive).getTime()
    )
    return sorted[0]!
  }

  private selectLeastBusy(agents: AgentInstance[]): AgentInstance {
    const sorted = agents.sort((a, b) => a.taskQueue.length - b.taskQueue.length)
    return sorted[0]!
  }

  private selectByCapability(agents: AgentInstance[], task: AgentTask): AgentInstance {
    // Score agents by capability match
    const scored = agents.map(agent => {
      const def = this.definitions.get(agent.defId)
      let score = 0

      if (def) {
        if (task.type === 'node' && task.payload.type === 'node') {
          const nodePayload = task.payload as NodeTaskPayload
          const matchingCap = def.capabilities.find(
            cap => cap.toolRefs.includes(nodePayload.toolRef)
          )
          if (matchingCap) score += 10
        }

        // Prefer specialists for their domain
        if (def.role === 'specialist') score += 5
        if (def.role === 'worker') score += 2
      }

      return { agent, score }
    })

    const sorted = scored.sort((a, b) => b.score - a.score)
    return sorted[0]!.agent
  }

  private selectByPriority(agents: AgentInstance[]): AgentInstance {
    const sorted = agents.sort((a, b) => {
      const defA = this.definitions.get(a.defId)
      const defB = this.definitions.get(b.defId)
      return (defB?.priority ?? 0) - (defA?.priority ?? 0)
    })
    return sorted[0]!
  }

  private selectHybrid(agents: AgentInstance[], task: AgentTask): AgentInstance {
    // Combined scoring
    const scored = agents.map(agent => {
      const def = this.definitions.get(agent.defId)
      let score = 0

      // Capability match (40%)
      if (def && task.type === 'node' && task.payload.type === 'node') {
        const nodePayload = task.payload as NodeTaskPayload
        const matchingCap = def.capabilities.find(
          cap => cap.toolRefs.includes(nodePayload.toolRef)
        )
        if (matchingCap) score += 40
      }

      // Load (30%)
      const loadScore = 30 - (agent.taskQueue.length * 10)
      score += Math.max(0, loadScore)

      // Success rate (20%)
      score += agent.metrics.successRate * 20

      // Priority (10%)
      score += (def?.priority ?? 5)

      return { agent, score }
    })

    const sorted = scored.sort((a, b) => b.score - a.score)
    return sorted[0]!.agent
  }

  /**
   * Assign task to agent
   */
  private assignTask(task: AgentTask, agent: AgentInstance): void {
    task.assignedAgentId = agent.id
    task.status = 'queued'

    agent.taskQueue.push(task.id)
    agent.lastActive = new Date().toISOString()

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'task_assigned',
      timestamp: new Date().toISOString(),
      taskId: task.id,
      agentId: agent.id,
      details: {},
    })

    // If agent is idle, start the task
    if (agent.status === 'idle' && !agent.currentTaskId) {
      this.startTask(task, agent)
    }
  }

  /**
   * Start task execution
   */
  private startTask(task: AgentTask, agent: AgentInstance): void {
    task.status = 'running'
    task.startedAt = new Date().toISOString()

    agent.currentTaskId = task.id
    agent.status = 'busy'

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'task_started',
      timestamp: new Date().toISOString(),
      taskId: task.id,
      agentId: agent.id,
      details: {},
    })

    // Set timeout
    setTimeout(() => {
      if (task.status === 'running') {
        this.handleTaskTimeout(task)
      }
    }, task.timeout)
  }

  /**
   * Handle task timeout
   */
  private handleTaskTimeout(task: AgentTask): void {
    task.status = 'timeout'
    task.completedAt = new Date().toISOString()

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'task_timeout',
      timestamp: new Date().toISOString(),
      taskId: task.id,
      agentId: task.assignedAgentId,
      details: { timeout: task.timeout },
    })

    // Update agent
    if (task.assignedAgentId) {
      const agent = this.instances.get(task.assignedAgentId)
      if (agent) {
        agent.taskQueue = agent.taskQueue.filter(id => id !== task.id)
        agent.currentTaskId = undefined
        agent.status = 'idle'
        agent.errorCount++
      }
    }

    // Retry if possible
    if (task.retryCount < task.maxRetries) {
      this.retryTask(task)
    }
  }

  /**
   * Retry a failed task
   */
  private retryTask(task: AgentTask): void {
    const delay = this.config.retryPolicy.initialDelay *
      Math.pow(this.config.retryPolicy.backoffMultiplier, task.retryCount)

    task.retryCount++
    task.status = 'pending'
    task.assignedAgentId = undefined
    task.startedAt = undefined

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'task_retried',
      timestamp: new Date().toISOString(),
      taskId: task.id,
      details: { retryCount: task.retryCount, delay },
    })

    setTimeout(() => {
      this.pendingTasks.push(task)
      this.processPendingTasks()
    }, delay)
  }

  // ========== Health Check ==========

  /**
   * Perform health check on all agents
   */
  private performHealthCheck(): void {
    const now = Date.now()

    for (const agent of this.instances.values()) {
      const lastActive = new Date(agent.lastActive).getTime()
      const elapsed = now - lastActive

      // Mark as offline if not active for too long
      if (elapsed > this.config.healthCheck.timeoutMs * 3) {
        if (agent.status !== 'offline') {
          this.updateAgentStatus(agent.id, 'offline')
        }
      }
    }

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'health_check',
      timestamp: new Date().toISOString(),
      details: {
        totalAgents: this.instances.size,
        healthyAgents: Array.from(this.instances.values())
          .filter(a => a.status !== 'offline' && a.status !== 'error').length,
      },
    })

    // Rebalance if needed
    if (this.config.loadBalancing.enabled) {
      this.rebalanceLoad()
    }
  }

  /**
   * Rebalance task load across agents
   */
  private rebalanceLoad(): void {
    const agents = Array.from(this.instances.values())
      .filter(a => a.status !== 'offline' && a.status !== 'error')

    if (agents.length < 2) return

    const queueLengths = agents.map(a => a.taskQueue.length)
    const maxQueue = Math.max(...queueLengths)
    const minQueue = Math.min(...queueLengths)

    if (maxQueue - minQueue > this.config.loadBalancing.threshold) {
      // Move tasks from overloaded to underloaded agents
      const overloaded = agents.filter(a => a.taskQueue.length === maxQueue)
      const underloaded = agents.filter(a => a.taskQueue.length === minQueue)

      for (const from of overloaded) {
        for (const to of underloaded) {
          if (from.taskQueue.length - to.taskQueue.length > 1) {
            // Move one queued (not current) task
            const taskId = from.taskQueue.find(id => id !== from.currentTaskId)
            if (taskId) {
              const task = this.tasks.get(taskId)
              if (task && task.status === 'queued') {
                // Reassign
                from.taskQueue = from.taskQueue.filter(id => id !== taskId)
                to.taskQueue.push(taskId)
                task.assignedAgentId = to.id
              }
            }
          }
        }
      }

      this.emitEvent({
        id: crypto.randomUUID(),
        type: 'load_rebalanced',
        timestamp: new Date().toISOString(),
        details: { maxQueue, minQueue, threshold: this.config.loadBalancing.threshold },
      })
    }
  }

  // ========== Events ==========

  /**
   * Subscribe to orchestration events
   */
  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.add(callback)
    return () => this.eventCallbacks.delete(callback)
  }

  /**
   * Emit an event
   */
  private emitEvent(event: OrchestrationEvent): void {
    this.eventLog.push(event)

    // Keep log bounded
    if (this.eventLog.length > 1000) {
      this.eventLog = this.eventLog.slice(-500)
    }

    for (const callback of this.eventCallbacks) {
      try {
        callback(event)
      } catch (e) {
        console.error('Event callback error:', e)
      }
    }
  }

  /**
   * Get event log
   */
  getEventLog(limit = 100): OrchestrationEvent[] {
    return this.eventLog.slice(-limit)
  }

  // ========== Messaging ==========

  /**
   * Send message between agents
   */
  sendMessage(message: Omit<AgentMessage, 'id' | 'timestamp'>): AgentMessage {
    const fullMessage: AgentMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    }

    // Handle based on message type
    if (fullMessage.toAgentId === 'broadcast') {
      // Broadcast to all agents
      for (const agent of this.instances.values()) {
        this.deliverMessage(fullMessage, agent.id)
      }
    } else {
      this.deliverMessage(fullMessage, fullMessage.toAgentId)
    }

    return fullMessage
  }

  private deliverMessage(message: AgentMessage, toAgentId: string): void {
    // In a real implementation, this would be async and handle message queues
    // For now, we just emit an event
    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'agent_status_changed',
      timestamp: new Date().toISOString(),
      agentId: toAgentId,
      details: { messageReceived: message.type, fromAgent: message.fromAgentId },
    })
  }

  // ========== Statistics ==========

  /**
   * Get orchestration statistics
   */
  getStats(): {
    totalAgents: number
    activeAgents: number
    totalTasks: number
    pendingTasks: number
    runningTasks: number
    completedTasks: number
    failedTasks: number
    averageSuccessRate: number
  } {
    const agents = Array.from(this.instances.values())
    const tasks = Array.from(this.tasks.values())

    const successRates = agents.map(a => a.metrics.successRate)
    const avgSuccessRate = successRates.length > 0
      ? successRates.reduce((a, b) => a + b, 0) / successRates.length
      : 1

    return {
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status !== 'offline').length,
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === 'pending' || t.status === 'queued').length,
      runningTasks: tasks.filter(t => t.status === 'running').length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      failedTasks: tasks.filter(t => t.status === 'failed' || t.status === 'timeout').length,
      averageSuccessRate: avgSuccessRate,
    }
  }
}

// Singleton instance
export const orchestrator = new AgentOrchestrator()
