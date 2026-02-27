/**
 * AgentCommunication — Inter-agent communication protocol and message handling.
 *
 * Features:
 * - Message routing
 * - Request-response patterns
 * - Broadcast messaging
 * - Message history
 * - Handoff protocol
 */

import type {
  AgentMessage,
  MessageType,
  AgentInstance,
  AgentTask,
  AgentCapability,
} from '@/types/agent'

/** Message handler callback */
type MessageHandler = (message: AgentMessage) => Promise<unknown> | unknown

/** Pending request for request-response pattern */
interface PendingRequest {
  id: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

/**
 * AgentCommunicationHub - Central message router
 */
export class AgentCommunicationHub {
  private handlers: Map<string, Map<MessageType, MessageHandler>> = new Map()
  private messageLog: AgentMessage[] = []
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private maxLogSize = 1000
  private defaultTimeout = 30000

  /**
   * Register a message handler for an agent
   */
  registerHandler(
    agentId: string,
    type: MessageType,
    handler: MessageHandler
  ): () => void {
    if (!this.handlers.has(agentId)) {
      this.handlers.set(agentId, new Map())
    }

    const agentHandlers = this.handlers.get(agentId)!
    agentHandlers.set(type, handler)

    return () => {
      agentHandlers.delete(type)
      if (agentHandlers.size === 0) {
        this.handlers.delete(agentId)
      }
    }
  }

  /**
   * Send a message (fire-and-forget)
   */
  async send(message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<AgentMessage> {
    const fullMessage: AgentMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    }

    this.logMessage(fullMessage)

    if (message.toAgentId === 'broadcast') {
      // Broadcast to all registered agents
      const promises = Array.from(this.handlers.keys()).map(agentId =>
        this.deliverToAgent(fullMessage, agentId)
      )
      await Promise.allSettled(promises)
    } else {
      await this.deliverToAgent(fullMessage, message.toAgentId)
    }

    return fullMessage
  }

  /**
   * Send a request and wait for response
   */
  async request<T = unknown>(
    message: Omit<AgentMessage, 'id' | 'timestamp'>,
    timeout = this.defaultTimeout
  ): Promise<T> {
    const fullMessage: AgentMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    }

    this.logMessage(fullMessage)

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(fullMessage.id)
        reject(new Error(`Request timeout: ${fullMessage.id}`))
      }, timeout)

      this.pendingRequests.set(fullMessage.id, {
        id: fullMessage.id,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timeoutId,
      })

      this.deliverToAgent(fullMessage, message.toAgentId as string)
        .catch(err => {
          this.pendingRequests.delete(fullMessage.id)
          clearTimeout(timeoutId)
          reject(err)
        })
    })
  }

  /**
   * Reply to a message
   */
  async reply(
    originalMessage: AgentMessage,
    payload: unknown
  ): Promise<AgentMessage> {
    const replyMessage: AgentMessage = {
      id: crypto.randomUUID(),
      fromAgentId: originalMessage.toAgentId as string,
      toAgentId: originalMessage.fromAgentId,
      type: this.getReplyType(originalMessage.type),
      payload,
      timestamp: new Date().toISOString(),
      replyToId: originalMessage.id,
      priority: originalMessage.priority,
    }

    this.logMessage(replyMessage)

    // Check if there's a pending request
    const pending = this.pendingRequests.get(originalMessage.id)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingRequests.delete(originalMessage.id)
      pending.resolve(payload)
    }

    await this.deliverToAgent(replyMessage, replyMessage.toAgentId)

    return replyMessage
  }

  /**
   * Deliver message to specific agent
   */
  private async deliverToAgent(message: AgentMessage, agentId: string): Promise<void> {
    const agentHandlers = this.handlers.get(agentId)
    if (!agentHandlers) {
      console.warn(`No handlers registered for agent: ${agentId}`)
      return
    }

    const handler = agentHandlers.get(message.type)
    if (!handler) {
      // Try default handler
      const defaultHandler = agentHandlers.get('ping') // Use ping as fallback
      if (defaultHandler) {
        await defaultHandler(message)
      }
      return
    }

    try {
      await handler(message)
    } catch (err) {
      console.error(`Handler error for ${agentId}:${message.type}:`, err)
      throw err
    }
  }

  /**
   * Get reply type for a message type
   */
  private getReplyType(type: MessageType): MessageType {
    const replyTypes: Record<MessageType, MessageType> = {
      task_assign: 'task_complete',
      task_complete: 'status_update',
      task_failed: 'status_update',
      status_update: 'status_update',
      capability_query: 'capability_response',
      capability_response: 'status_update',
      handoff: 'status_update',
      ping: 'pong',
      pong: 'pong',
    }
    return replyTypes[type] || 'status_update'
  }

  /**
   * Log message
   */
  private logMessage(message: AgentMessage): void {
    this.messageLog.push(message)
    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog = this.messageLog.slice(-this.maxLogSize / 2)
    }
  }

  /**
   * Get message history
   */
  getHistory(options?: {
    agentId?: string
    type?: MessageType
    limit?: number
    since?: string
  }): AgentMessage[] {
    let messages = [...this.messageLog]

    if (options?.agentId) {
      messages = messages.filter(
        m => m.fromAgentId === options.agentId || m.toAgentId === options.agentId
      )
    }

    if (options?.type) {
      messages = messages.filter(m => m.type === options.type)
    }

    if (options?.since) {
      const sinceTime = new Date(options.since).getTime()
      messages = messages.filter(m => new Date(m.timestamp).getTime() >= sinceTime)
    }

    if (options?.limit) {
      messages = messages.slice(-options.limit)
    }

    return messages
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.messageLog = []
  }
}

// ========== Protocol Helpers ==========

/**
 * Create a task assignment message
 */
export function createTaskAssignMessage(
  fromAgentId: string,
  toAgentId: string,
  task: AgentTask
): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    fromAgentId,
    toAgentId,
    type: 'task_assign',
    payload: {
      taskId: task.id,
      type: task.type,
      payload: task.payload,
      priority: task.priority,
      timeout: task.timeout,
    },
    priority: task.priority,
  }
}

/**
 * Create a task completion message
 */
export function createTaskCompleteMessage(
  fromAgentId: string,
  toAgentId: string,
  taskId: string,
  result: unknown,
  success: boolean
): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    fromAgentId,
    toAgentId,
    type: success ? 'task_complete' : 'task_failed',
    payload: {
      taskId,
      result,
      success,
    },
    priority: 5,
  }
}

/**
 * Create a capability query message
 */
export function createCapabilityQueryMessage(
  fromAgentId: string,
  toAgentId: string | 'broadcast',
  requiredCapabilities: string[]
): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    fromAgentId,
    toAgentId,
    type: 'capability_query',
    payload: {
      requiredCapabilities,
    },
    priority: 3,
  }
}

/**
 * Create a capability response message
 */
export function createCapabilityResponseMessage(
  fromAgentId: string,
  toAgentId: string,
  capabilities: AgentCapability[],
  available: boolean
): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    fromAgentId,
    toAgentId,
    type: 'capability_response',
    payload: {
      capabilities,
      available,
    },
    priority: 3,
  }
}

/**
 * Create a handoff message for transferring work between agents
 */
export function createHandoffMessage(
  fromAgentId: string,
  toAgentId: string,
  context: {
    taskId: string
    reason: string
    state: Record<string, unknown>
    instructions?: string
  }
): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    fromAgentId,
    toAgentId,
    type: 'handoff',
    payload: context,
    priority: 7, // High priority for handoffs
  }
}

/**
 * Create a status update message
 */
export function createStatusUpdateMessage(
  fromAgentId: string,
  toAgentId: string | 'broadcast',
  status: {
    agentStatus: AgentInstance['status']
    currentTaskId?: string
    queueLength: number
    metrics?: AgentInstance['metrics']
  }
): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    fromAgentId,
    toAgentId,
    type: 'status_update',
    payload: status,
    priority: 2,
  }
}

/**
 * Create a ping message for health check
 */
export function createPingMessage(
  fromAgentId: string,
  toAgentId: string
): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    fromAgentId,
    toAgentId,
    type: 'ping',
    payload: { timestamp: Date.now() },
    priority: 1,
  }
}

// ========== Handoff Protocol ==========

/**
 * HandoffCoordinator - Manages smooth task transfers between agents
 */
export class HandoffCoordinator {
  private hub: AgentCommunicationHub
  private activeHandoffs: Map<string, {
    fromAgent: string
    toAgent: string
    taskId: string
    state: Record<string, unknown>
    startedAt: string
    status: 'pending' | 'accepted' | 'completed' | 'failed'
  }> = new Map()

  constructor(hub: AgentCommunicationHub) {
    this.hub = hub
  }

  /**
   * Initiate a handoff from one agent to another
   */
  async initiateHandoff(
    fromAgentId: string,
    toAgentId: string,
    taskId: string,
    state: Record<string, unknown>,
    reason: string
  ): Promise<{ success: boolean; handoffId: string }> {
    const handoffId = crypto.randomUUID()

    this.activeHandoffs.set(handoffId, {
      fromAgent: fromAgentId,
      toAgent: toAgentId,
      taskId,
      state,
      startedAt: new Date().toISOString(),
      status: 'pending',
    })

    try {
      // Send handoff request
      const response = await this.hub.request<{ accepted: boolean }>(
        createHandoffMessage(fromAgentId, toAgentId, {
          taskId,
          reason,
          state,
          instructions: `Handoff ID: ${handoffId}`,
        }),
        10000
      )

      const handoff = this.activeHandoffs.get(handoffId)
      if (handoff) {
        handoff.status = response.accepted ? 'accepted' : 'failed'
      }

      return { success: response.accepted, handoffId }
    } catch (err) {
      const handoff = this.activeHandoffs.get(handoffId)
      if (handoff) {
        handoff.status = 'failed'
      }
      return { success: false, handoffId }
    }
  }

  /**
   * Complete a handoff
   */
  completeHandoff(handoffId: string): void {
    const handoff = this.activeHandoffs.get(handoffId)
    if (handoff) {
      handoff.status = 'completed'
    }
  }

  /**
   * Get active handoffs
   */
  getActiveHandoffs(): Array<{
    handoffId: string
    fromAgent: string
    toAgent: string
    taskId: string
    status: string
  }> {
    return Array.from(this.activeHandoffs.entries())
      .filter(([, h]) => h.status !== 'completed')
      .map(([id, h]) => ({
        handoffId: id,
        fromAgent: h.fromAgent,
        toAgent: h.toAgent,
        taskId: h.taskId,
        status: h.status,
      }))
  }
}

// Singleton instances
export const communicationHub = new AgentCommunicationHub()
export const handoffCoordinator = new HandoffCoordinator(communicationHub)
