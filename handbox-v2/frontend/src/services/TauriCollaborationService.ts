/**
 * TauriCollaborationService — Tauri backend integration for real-time collaboration.
 */

import { invoke } from '@tauri-apps/api/core'
import type {
  Collaborator,
  CollaboratorRole,
  CollaborationSession,
  CollaborationEvent,
  CursorPosition,
  ChatMessage,
  SessionSettings,
  CollaborationInvite,
} from '@/types/marketplace'

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
 * TauriCollaborationService class
 */
class TauriCollaborationService {
  private heartbeatInterval?: ReturnType<typeof setInterval>
  private currentSessionId?: string
  private currentUserId?: string
  private eventCallbacks: Set<(event: CollaborationEvent) => void> = new Set()
  private presenceCallbacks: Set<(collaborators: Collaborator[]) => void> = new Set()
  private chatCallbacks: Set<(message: ChatMessage) => void> = new Set()

  /**
   * Create a new collaboration session
   */
  async createSession(
    workflowId: string,
    name: string,
    userId: string,
    userName: string,
    settings?: Partial<SessionSettings>
  ): Promise<CollaborationSession | null> {
    try {
      const backendSettings = settings ? toSnakeCase(settings) : undefined
      const result = await invoke<CollaborationSession>('collab_create_session', {
        workflowId,
        name,
        userId,
        userName,
        settings: backendSettings,
      })
      const session = toCamelCase(result)
      this.currentSessionId = session.id
      this.currentUserId = userId
      this.startHeartbeat()
      return session
    } catch (e) {
      console.error('Failed to create session:', e)
      return null
    }
  }

  /**
   * Join an existing session
   */
  async joinSession(
    sessionId: string,
    userId: string,
    userName: string,
    role?: CollaboratorRole
  ): Promise<CollaborationSession | null> {
    try {
      const result = await invoke<CollaborationSession>('collab_join_session', {
        sessionId,
        userId,
        userName,
        role,
      })
      const session = toCamelCase(result)
      this.currentSessionId = session.id
      this.currentUserId = userId
      this.startHeartbeat()
      return session
    } catch (e) {
      console.error('Failed to join session:', e)
      return null
    }
  }

  /**
   * Leave the current session
   */
  async leaveSession(): Promise<boolean> {
    if (!this.currentSessionId || !this.currentUserId) return false

    try {
      const result = await invoke<boolean>('collab_leave_session', {
        sessionId: this.currentSessionId,
        userId: this.currentUserId,
      })
      this.stopHeartbeat()
      this.currentSessionId = undefined
      this.currentUserId = undefined
      return result
    } catch (e) {
      console.error('Failed to leave session:', e)
      return false
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<CollaborationSession | null> {
    try {
      const result = await invoke<CollaborationSession | null>('collab_get_session', { sessionId })
      return result ? toCamelCase(result) : null
    } catch (e) {
      console.error('Failed to get session:', e)
      return null
    }
  }

  /**
   * List all active sessions
   */
  async listSessions(): Promise<CollaborationSession[]> {
    try {
      const result = await invoke<CollaborationSession[]>('collab_list_sessions')
      return result.map(toCamelCase)
    } catch (e) {
      console.error('Failed to list sessions:', e)
      return []
    }
  }

  /**
   * Update cursor position
   */
  async updateCursor(cursor: CursorPosition): Promise<boolean> {
    if (!this.currentSessionId || !this.currentUserId) return false

    try {
      return await invoke<boolean>('collab_update_cursor', {
        sessionId: this.currentSessionId,
        userId: this.currentUserId,
        cursor: toSnakeCase(cursor),
      })
    } catch (e) {
      console.error('Failed to update cursor:', e)
      return false
    }
  }

  /**
   * Update selection
   */
  async updateSelection(nodeIds: string[]): Promise<boolean> {
    if (!this.currentSessionId || !this.currentUserId) return false

    try {
      return await invoke<boolean>('collab_update_selection', {
        sessionId: this.currentSessionId,
        userId: this.currentUserId,
        nodeIds,
      })
    } catch (e) {
      console.error('Failed to update selection:', e)
      return false
    }
  }

  /**
   * Send chat message
   */
  async sendMessage(content: string, replyToId?: string): Promise<ChatMessage | null> {
    if (!this.currentSessionId || !this.currentUserId) return null

    try {
      // Get user name from session
      const session = await this.getSession(this.currentSessionId)
      const user = session?.collaborators.find(c => c.id === this.currentUserId)
      const userName = user?.name || 'Unknown'

      const result = await invoke<ChatMessage>('collab_send_message', {
        sessionId: this.currentSessionId,
        userId: this.currentUserId,
        userName,
        content,
        replyToId,
      })
      const message = toCamelCase(result)

      // Notify callbacks
      for (const callback of this.chatCallbacks) {
        try {
          callback(message)
        } catch (e) {
          console.error('Chat callback error:', e)
        }
      }

      return message
    } catch (e) {
      console.error('Failed to send message:', e)
      return null
    }
  }

  /**
   * Get chat history
   */
  async getChatHistory(limit?: number): Promise<ChatMessage[]> {
    if (!this.currentSessionId) return []

    try {
      const result = await invoke<ChatMessage[]>('collab_get_chat_history', {
        sessionId: this.currentSessionId,
        limit,
      })
      return result.map(toCamelCase)
    } catch (e) {
      console.error('Failed to get chat history:', e)
      return []
    }
  }

  /**
   * Add reaction to message
   */
  async addReaction(messageId: string, emoji: string): Promise<boolean> {
    if (!this.currentSessionId || !this.currentUserId) return false

    try {
      return await invoke<boolean>('collab_add_reaction', {
        sessionId: this.currentSessionId,
        messageId,
        userId: this.currentUserId,
        emoji,
      })
    } catch (e) {
      console.error('Failed to add reaction:', e)
      return false
    }
  }

  /**
   * Remove reaction from message
   */
  async removeReaction(messageId: string, emoji: string): Promise<boolean> {
    if (!this.currentSessionId || !this.currentUserId) return false

    try {
      return await invoke<boolean>('collab_remove_reaction', {
        sessionId: this.currentSessionId,
        messageId,
        userId: this.currentUserId,
        emoji,
      })
    } catch (e) {
      console.error('Failed to remove reaction:', e)
      return false
    }
  }

  /**
   * Broadcast workflow change
   */
  async broadcastChange(changeType: string, payload: unknown): Promise<boolean> {
    if (!this.currentSessionId || !this.currentUserId) return false

    try {
      return await invoke<boolean>('collab_broadcast_change', {
        sessionId: this.currentSessionId,
        userId: this.currentUserId,
        changeType,
        payload,
      })
    } catch (e) {
      console.error('Failed to broadcast change:', e)
      return false
    }
  }

  /**
   * Get session events
   */
  async getEvents(sinceTimestamp?: string, limit?: number): Promise<CollaborationEvent[]> {
    if (!this.currentSessionId) return []

    try {
      const result = await invoke<CollaborationEvent[]>('collab_get_events', {
        sessionId: this.currentSessionId,
        sinceTimestamp,
        limit,
      })
      return result.map(toCamelCase)
    } catch (e) {
      console.error('Failed to get events:', e)
      return []
    }
  }

  /**
   * Create invite link
   */
  async createInvite(role?: CollaboratorRole, expiresHours?: number): Promise<CollaborationInvite | null> {
    if (!this.currentSessionId || !this.currentUserId) return null

    try {
      const result = await invoke<CollaborationInvite>('collab_create_invite', {
        sessionId: this.currentSessionId,
        userId: this.currentUserId,
        role: role || 'editor',
        expiresHours: expiresHours || 24,
      })
      return toCamelCase(result)
    } catch (e) {
      console.error('Failed to create invite:', e)
      return null
    }
  }

  /**
   * Get invite by ID
   */
  async getInvite(inviteId: string): Promise<CollaborationInvite | null> {
    try {
      const result = await invoke<CollaborationInvite | null>('collab_get_invite', { inviteId })
      return result ? toCamelCase(result) : null
    } catch (e) {
      console.error('Failed to get invite:', e)
      return null
    }
  }

  /**
   * Accept invite
   */
  async acceptInvite(
    inviteId: string,
    userId: string,
    userName: string
  ): Promise<CollaborationSession | null> {
    try {
      const result = await invoke<CollaborationSession>('collab_accept_invite', {
        inviteId,
        userId,
        userName,
      })
      const session = toCamelCase(result)
      this.currentSessionId = session.id
      this.currentUserId = userId
      this.startHeartbeat()
      return session
    } catch (e) {
      console.error('Failed to accept invite:', e)
      return null
    }
  }

  /**
   * Update session settings
   */
  async updateSettings(settings: SessionSettings): Promise<boolean> {
    if (!this.currentSessionId || !this.currentUserId) return false

    try {
      return await invoke<boolean>('collab_update_settings', {
        sessionId: this.currentSessionId,
        userId: this.currentUserId,
        settings: toSnakeCase(settings),
      })
    } catch (e) {
      console.error('Failed to update settings:', e)
      return false
    }
  }

  /**
   * Close session
   */
  async closeSession(): Promise<boolean> {
    if (!this.currentSessionId || !this.currentUserId) return false

    try {
      const result = await invoke<boolean>('collab_close_session', {
        sessionId: this.currentSessionId,
        userId: this.currentUserId,
      })
      this.stopHeartbeat()
      this.currentSessionId = undefined
      this.currentUserId = undefined
      return result
    } catch (e) {
      console.error('Failed to close session:', e)
      return false
    }
  }

  /**
   * Subscribe to events
   */
  onEvent(callback: (event: CollaborationEvent) => void): () => void {
    this.eventCallbacks.add(callback)
    return () => this.eventCallbacks.delete(callback)
  }

  /**
   * Subscribe to presence updates
   */
  onPresence(callback: (collaborators: Collaborator[]) => void): () => void {
    this.presenceCallbacks.add(callback)
    return () => this.presenceCallbacks.delete(callback)
  }

  /**
   * Subscribe to chat messages
   */
  onChat(callback: (message: ChatMessage) => void): () => void {
    this.chatCallbacks.add(callback)
    return () => this.chatCallbacks.delete(callback)
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) return

    this.heartbeatInterval = setInterval(async () => {
      if (!this.currentSessionId || !this.currentUserId) return

      try {
        const collaborators = await invoke<Collaborator[]>('collab_heartbeat', {
          sessionId: this.currentSessionId,
          userId: this.currentUserId,
        })

        // Notify presence callbacks
        const camelCaseCollaborators = collaborators.map(toCamelCase)
        for (const callback of this.presenceCallbacks) {
          try {
            callback(camelCaseCollaborators)
          } catch (e) {
            console.error('Presence callback error:', e)
          }
        }
      } catch (e) {
        console.error('Heartbeat failed:', e)
      }
    }, 5000)
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = undefined
    }
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | undefined {
    return this.currentSessionId
  }

  /**
   * Get current user ID
   */
  getCurrentUserId(): string | undefined {
    return this.currentUserId
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.leaveSession()
    this.eventCallbacks.clear()
    this.presenceCallbacks.clear()
    this.chatCallbacks.clear()
  }
}

// Singleton instance
export const tauriCollaborationService = new TauriCollaborationService()
