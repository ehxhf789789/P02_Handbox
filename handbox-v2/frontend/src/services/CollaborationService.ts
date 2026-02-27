/**
 * CollaborationService — Real-time collaboration for workflows.
 *
 * Features:
 * - Presence tracking (who's online, cursor positions)
 * - Real-time sync of workflow changes
 * - Chat messaging
 * - Conflict resolution
 */

import type {
  Collaborator,
  CollaboratorRole,
  CollaborationSession,
  CollaborationEvent,
  CollaborationEventType,
  CursorPosition,
  ChatMessage,
  SessionSettings,
  CollaborationInvite,
} from '@/types/marketplace'

/** Event callback type */
type EventCallback = (event: CollaborationEvent) => void
type PresenceCallback = (collaborators: Collaborator[]) => void
type ChatCallback = (message: ChatMessage) => void

/** Default session settings */
const DEFAULT_SETTINGS: SessionSettings = {
  allowEditing: true,
  allowExecution: true,
  allowInvite: true,
  maxCollaborators: 10,
  autoSave: true,
  autoSaveInterval: 5000,
}

/** Cursor colors for collaborators */
const CURSOR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1',
]

/**
 * CollaborationService class
 */
export class CollaborationService {
  private session: CollaborationSession | null = null
  private localUser: Collaborator | null = null
  private eventCallbacks: Set<EventCallback> = new Set()
  private presenceCallbacks: Set<PresenceCallback> = new Set()
  private chatCallbacks: Set<ChatCallback> = new Set()
  private chatHistory: ChatMessage[] = []
  private cursorUpdateInterval?: ReturnType<typeof setInterval>
  private heartbeatInterval?: ReturnType<typeof setInterval>

  // ========== Session Management ==========

  /**
   * Create a new collaboration session
   */
  createSession(
    workflowId: string,
    name: string,
    userId: string,
    userName: string,
    settings: Partial<SessionSettings> = {}
  ): CollaborationSession {
    const localUser: Collaborator = {
      id: userId,
      name: userName,
      color: CURSOR_COLORS[0] ?? '#FF6B6B',
      isOnline: true,
      lastActive: new Date().toISOString(),
      role: 'owner',
    }

    this.localUser = localUser

    const session: CollaborationSession = {
      id: crypto.randomUUID(),
      workflowId,
      name,
      owner: userId,
      collaborators: [localUser],
      createdAt: new Date().toISOString(),
      isActive: true,
      settings: { ...DEFAULT_SETTINGS, ...settings },
    }

    this.session = session
    this.startHeartbeat()

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'user_joined',
      sessionId: session.id,
      userId,
      timestamp: new Date().toISOString(),
      payload: { userName, role: 'owner' },
    })

    return session
  }

  /**
   * Join an existing session
   */
  async joinSession(
    sessionId: string,
    userId: string,
    userName: string,
    role: CollaboratorRole = 'editor'
  ): Promise<CollaborationSession | null> {
    // In real implementation, this would connect to a server
    // For now, simulate joining

    if (!this.session || this.session.id !== sessionId) {
      console.error('Session not found:', sessionId)
      return null
    }

    // Check max collaborators
    if (this.session.collaborators.length >= this.session.settings.maxCollaborators) {
      console.error('Session is full')
      return null
    }

    const colorIndex = this.session.collaborators.length % CURSOR_COLORS.length
    const collaborator: Collaborator = {
      id: userId,
      name: userName,
      color: CURSOR_COLORS[colorIndex] ?? '#FF6B6B',
      isOnline: true,
      lastActive: new Date().toISOString(),
      role,
    }

    this.localUser = collaborator
    this.session.collaborators.push(collaborator)

    this.startHeartbeat()
    this.notifyPresence()

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'user_joined',
      sessionId,
      userId,
      timestamp: new Date().toISOString(),
      payload: { userName, role },
    })

    return this.session
  }

  /**
   * Leave the current session
   */
  leaveSession(): void {
    if (!this.session || !this.localUser) return

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'user_left',
      sessionId: this.session.id,
      userId: this.localUser.id,
      timestamp: new Date().toISOString(),
      payload: {},
    })

    // Remove from collaborators
    this.session.collaborators = this.session.collaborators.filter(
      c => c.id !== this.localUser?.id
    )

    this.stopHeartbeat()
    this.notifyPresence()

    // Clean up if owner and no one left
    if (this.localUser.role === 'owner' && this.session.collaborators.length === 0) {
      this.session.isActive = false
    }

    this.localUser = null
  }

  /**
   * Get current session
   */
  getSession(): CollaborationSession | null {
    return this.session
  }

  /**
   * Get local user
   */
  getLocalUser(): Collaborator | null {
    return this.localUser
  }

  // ========== Presence ==========

  /**
   * Update cursor position
   */
  updateCursor(position: CursorPosition): void {
    if (!this.session || !this.localUser) return

    this.localUser.cursor = position
    this.localUser.lastActive = new Date().toISOString()

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'cursor_moved',
      sessionId: this.session.id,
      userId: this.localUser.id,
      timestamp: new Date().toISOString(),
      payload: position,
    })

    this.notifyPresence()
  }

  /**
   * Update selection (selected nodes)
   */
  updateSelection(nodeIds: string[]): void {
    if (!this.session || !this.localUser) return

    this.localUser.selection = nodeIds
    this.localUser.lastActive = new Date().toISOString()

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'selection_changed',
      sessionId: this.session.id,
      userId: this.localUser.id,
      timestamp: new Date().toISOString(),
      payload: { nodeIds },
    })

    this.notifyPresence()
  }

  /**
   * Get all online collaborators
   */
  getCollaborators(): Collaborator[] {
    return this.session?.collaborators.filter(c => c.isOnline) ?? []
  }

  /**
   * Get collaborator cursors (excluding self)
   */
  getOtherCursors(): { collaborator: Collaborator; cursor: CursorPosition }[] {
    if (!this.session || !this.localUser) return []

    return this.session.collaborators
      .filter(c => c.id !== this.localUser?.id && c.isOnline && c.cursor)
      .map(c => ({ collaborator: c, cursor: c.cursor! }))
  }

  // ========== Workflow Changes ==========

  /**
   * Broadcast node added
   */
  broadcastNodeAdded(nodeId: string, nodeData: unknown): void {
    this.broadcastChange('node_added', { nodeId, nodeData })
  }

  /**
   * Broadcast node removed
   */
  broadcastNodeRemoved(nodeId: string): void {
    this.broadcastChange('node_removed', { nodeId })
  }

  /**
   * Broadcast node updated
   */
  broadcastNodeUpdated(nodeId: string, changes: unknown): void {
    this.broadcastChange('node_updated', { nodeId, changes })
  }

  /**
   * Broadcast edge added
   */
  broadcastEdgeAdded(edgeId: string, edgeData: unknown): void {
    this.broadcastChange('edge_added', { edgeId, edgeData })
  }

  /**
   * Broadcast edge removed
   */
  broadcastEdgeRemoved(edgeId: string): void {
    this.broadcastChange('edge_removed', { edgeId })
  }

  /**
   * Broadcast execution started
   */
  broadcastExecutionStarted(executionId: string): void {
    this.broadcastChange('execution_started', { executionId })
  }

  /**
   * Broadcast execution completed
   */
  broadcastExecutionCompleted(executionId: string, success: boolean): void {
    this.broadcastChange('execution_completed', { executionId, success })
  }

  private broadcastChange(type: CollaborationEventType, payload: unknown): void {
    if (!this.session || !this.localUser) return

    // Check permissions
    if (!this.session.settings.allowEditing && this.localUser.role !== 'owner') {
      console.warn('Editing not allowed')
      return
    }

    const event: CollaborationEvent = {
      id: crypto.randomUUID(),
      type,
      sessionId: this.session.id,
      userId: this.localUser.id,
      timestamp: new Date().toISOString(),
      payload,
    }

    this.emitEvent(event)
  }

  // ========== Chat ==========

  /**
   * Send a chat message
   */
  sendMessage(content: string, replyToId?: string): ChatMessage | null {
    if (!this.session || !this.localUser) return null

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: this.session.id,
      userId: this.localUser.id,
      userName: this.localUser.name,
      content,
      timestamp: new Date().toISOString(),
      replyToId,
      reactions: {},
    }

    this.chatHistory.push(message)

    this.emitEvent({
      id: crypto.randomUUID(),
      type: 'chat_message',
      sessionId: this.session.id,
      userId: this.localUser.id,
      timestamp: new Date().toISOString(),
      payload: message,
    })

    // Notify chat callbacks
    for (const callback of this.chatCallbacks) {
      try {
        callback(message)
      } catch (e) {
        console.error('Chat callback error:', e)
      }
    }

    return message
  }

  /**
   * Add reaction to message
   */
  addReaction(messageId: string, emoji: string): void {
    if (!this.localUser) return

    const message = this.chatHistory.find(m => m.id === messageId)
    if (!message) return

    if (!message.reactions[emoji]) {
      message.reactions[emoji] = []
    }

    if (!message.reactions[emoji].includes(this.localUser.id)) {
      message.reactions[emoji].push(this.localUser.id)
    }
  }

  /**
   * Remove reaction from message
   */
  removeReaction(messageId: string, emoji: string): void {
    if (!this.localUser) return

    const message = this.chatHistory.find(m => m.id === messageId)
    if (!message || !message.reactions[emoji]) return

    message.reactions[emoji] = message.reactions[emoji].filter(
      id => id !== this.localUser?.id
    )
  }

  /**
   * Get chat history
   */
  getChatHistory(limit = 50): ChatMessage[] {
    return this.chatHistory.slice(-limit)
  }

  // ========== Invites ==========

  /**
   * Create an invite link
   */
  createInvite(
    role: CollaboratorRole = 'editor',
    expiresInHours = 24
  ): CollaborationInvite | null {
    if (!this.session || !this.localUser) return null

    // Only owner and editors with permission can invite
    if (this.localUser.role === 'viewer') {
      console.warn('Viewers cannot invite')
      return null
    }

    if (!this.session.settings.allowInvite && this.localUser.role !== 'owner') {
      console.warn('Invites not allowed')
      return null
    }

    const invite: CollaborationInvite = {
      id: crypto.randomUUID(),
      sessionId: this.session.id,
      invitedBy: this.localUser.id,
      role,
      expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    }

    return invite
  }

  // ========== Event Handling ==========

  /**
   * Subscribe to collaboration events
   */
  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.add(callback)
    return () => this.eventCallbacks.delete(callback)
  }

  /**
   * Subscribe to presence updates
   */
  onPresence(callback: PresenceCallback): () => void {
    this.presenceCallbacks.add(callback)
    return () => this.presenceCallbacks.delete(callback)
  }

  /**
   * Subscribe to chat messages
   */
  onChat(callback: ChatCallback): () => void {
    this.chatCallbacks.add(callback)
    return () => this.chatCallbacks.delete(callback)
  }

  private emitEvent(event: CollaborationEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event)
      } catch (e) {
        console.error('Event callback error:', e)
      }
    }
  }

  private notifyPresence(): void {
    const collaborators = this.getCollaborators()
    for (const callback of this.presenceCallbacks) {
      try {
        callback(collaborators)
      } catch (e) {
        console.error('Presence callback error:', e)
      }
    }
  }

  // ========== Heartbeat ==========

  private startHeartbeat(): void {
    // Update presence every 5 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.localUser) {
        this.localUser.lastActive = new Date().toISOString()
      }

      // Check for stale collaborators
      if (this.session) {
        const now = Date.now()
        for (const collaborator of this.session.collaborators) {
          const lastActive = new Date(collaborator.lastActive).getTime()
          if (now - lastActive > 30000 && collaborator.id !== this.localUser?.id) {
            collaborator.isOnline = false
          }
        }
        this.notifyPresence()
      }
    }, 5000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = undefined
    }
    if (this.cursorUpdateInterval) {
      clearInterval(this.cursorUpdateInterval)
      this.cursorUpdateInterval = undefined
    }
  }

  // ========== Cleanup ==========

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.leaveSession()
    this.eventCallbacks.clear()
    this.presenceCallbacks.clear()
    this.chatCallbacks.clear()
    this.chatHistory = []
    this.session = null
  }
}

// Singleton instance
export const collaborationService = new CollaborationService()
