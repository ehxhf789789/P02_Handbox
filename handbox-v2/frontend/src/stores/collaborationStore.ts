/**
 * collaborationStore — Zustand store for real-time collaboration.
 * Connected to Tauri backend.
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
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
import { tauriCollaborationService } from '@/services/TauriCollaborationService'

/** Collaboration store state */
interface CollaborationState {
  // Session
  currentSession: CollaborationSession | null
  isInSession: boolean

  // Collaborators
  collaborators: Collaborator[]
  localUser: Collaborator | null

  // Cursors (other users)
  remoteCursors: { collaborator: Collaborator; cursor: CursorPosition }[]

  // Chat
  chatMessages: ChatMessage[]
  unreadCount: number

  // Events
  events: CollaborationEvent[]

  // Invites
  pendingInvites: CollaborationInvite[]

  // UI state
  isChatOpen: boolean
  isCollaboratorsListOpen: boolean
  isLoading: boolean

  // User info
  userId: string
  userName: string

  // Actions - Session management
  createSession: (workflowId: string, name: string, settings?: Partial<SessionSettings>) => Promise<CollaborationSession | null>
  joinSession: (sessionId: string, role?: CollaboratorRole) => Promise<CollaborationSession | null>
  leaveSession: () => Promise<void>
  closeSession: () => Promise<void>

  // Actions - Presence
  updateCursor: (cursor: CursorPosition) => Promise<void>
  updateSelection: (nodeIds: string[]) => Promise<void>

  // Actions - Chat
  sendMessage: (content: string, replyToId?: string) => Promise<ChatMessage | null>
  addReaction: (messageId: string, emoji: string) => Promise<void>
  removeReaction: (messageId: string, emoji: string) => Promise<void>
  loadChatHistory: () => Promise<void>

  // Actions - Changes
  broadcastNodeAdded: (nodeId: string, nodeData: unknown) => Promise<void>
  broadcastNodeRemoved: (nodeId: string) => Promise<void>
  broadcastNodeUpdated: (nodeId: string, changes: unknown) => Promise<void>
  broadcastEdgeAdded: (edgeId: string, edgeData: unknown) => Promise<void>
  broadcastEdgeRemoved: (edgeId: string) => Promise<void>

  // Actions - Invites
  createInvite: (role?: CollaboratorRole, expiresHours?: number) => Promise<CollaborationInvite | null>
  acceptInvite: (inviteId: string) => Promise<CollaborationSession | null>

  // Actions - Settings
  updateSettings: (settings: SessionSettings) => Promise<void>

  // Actions - UI
  toggleChat: () => void
  toggleCollaboratorsList: () => void
  markMessagesRead: () => void

  // Actions - User
  setUserInfo: (userId: string, userName: string) => void

  // Actions - Sync
  syncFromBackend: () => Promise<void>
}

/** Default session settings */
const DEFAULT_SETTINGS: SessionSettings = {
  allowEditing: true,
  allowExecution: true,
  allowInvite: true,
  maxCollaborators: 10,
  autoSave: true,
  autoSaveInterval: 5000,
}

export const useCollaborationStore = create<CollaborationState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    currentSession: null,
    isInSession: false,
    collaborators: [],
    localUser: null,
    remoteCursors: [],
    chatMessages: [],
    unreadCount: 0,
    events: [],
    pendingInvites: [],
    isChatOpen: false,
    isCollaboratorsListOpen: false,
    isLoading: false,
    userId: `user-${Date.now()}`,
    userName: 'Anonymous',

    // Session management
    createSession: async (workflowId, name, settings) => {
      set({ isLoading: true })
      try {
        const { userId, userName } = get()
        const session = await tauriCollaborationService.createSession(
          workflowId,
          name,
          userId,
          userName,
          settings || DEFAULT_SETTINGS
        )
        if (session) {
          const localUser = session.collaborators.find(c => c.id === userId) || null
          set({
            currentSession: session,
            isInSession: true,
            collaborators: session.collaborators,
            localUser,
            isLoading: false,
          })

          // Setup callbacks
          tauriCollaborationService.onPresence((collaborators) => {
            set({ collaborators })
            // Update remote cursors
            const { userId } = get()
            const cursors = collaborators
              .filter(c => c.id !== userId && c.cursor)
              .map(c => ({ collaborator: c, cursor: c.cursor! }))
            set({ remoteCursors: cursors })
          })

          tauriCollaborationService.onChat((message) => {
            set(state => ({
              chatMessages: [...state.chatMessages, message],
              unreadCount: state.isChatOpen ? state.unreadCount : state.unreadCount + 1,
            }))
          })
        } else {
          set({ isLoading: false })
        }
        return session
      } catch (e) {
        console.error('Failed to create session:', e)
        set({ isLoading: false })
        return null
      }
    },

    joinSession: async (sessionId, role) => {
      set({ isLoading: true })
      try {
        const { userId, userName } = get()
        const session = await tauriCollaborationService.joinSession(
          sessionId,
          userId,
          userName,
          role
        )
        if (session) {
          const localUser = session.collaborators.find(c => c.id === userId) || null
          set({
            currentSession: session,
            isInSession: true,
            collaborators: session.collaborators,
            localUser,
            isLoading: false,
          })

          // Setup callbacks
          tauriCollaborationService.onPresence((collaborators) => {
            set({ collaborators })
            const { userId } = get()
            const cursors = collaborators
              .filter(c => c.id !== userId && c.cursor)
              .map(c => ({ collaborator: c, cursor: c.cursor! }))
            set({ remoteCursors: cursors })
          })

          tauriCollaborationService.onChat((message) => {
            set(state => ({
              chatMessages: [...state.chatMessages, message],
              unreadCount: state.isChatOpen ? state.unreadCount : state.unreadCount + 1,
            }))
          })

          // Load chat history
          await get().loadChatHistory()
        } else {
          set({ isLoading: false })
        }
        return session
      } catch (e) {
        console.error('Failed to join session:', e)
        set({ isLoading: false })
        return null
      }
    },

    leaveSession: async () => {
      try {
        await tauriCollaborationService.leaveSession()
        set({
          currentSession: null,
          isInSession: false,
          collaborators: [],
          localUser: null,
          remoteCursors: [],
          chatMessages: [],
          unreadCount: 0,
        })
      } catch (e) {
        console.error('Failed to leave session:', e)
      }
    },

    closeSession: async () => {
      try {
        await tauriCollaborationService.closeSession()
        set({
          currentSession: null,
          isInSession: false,
          collaborators: [],
          localUser: null,
          remoteCursors: [],
          chatMessages: [],
          unreadCount: 0,
        })
      } catch (e) {
        console.error('Failed to close session:', e)
      }
    },

    // Presence
    updateCursor: async (cursor) => {
      try {
        await tauriCollaborationService.updateCursor(cursor)
      } catch (e) {
        console.error('Failed to update cursor:', e)
      }
    },

    updateSelection: async (nodeIds) => {
      try {
        await tauriCollaborationService.updateSelection(nodeIds)
      } catch (e) {
        console.error('Failed to update selection:', e)
      }
    },

    // Chat
    sendMessage: async (content, replyToId) => {
      try {
        const message = await tauriCollaborationService.sendMessage(content, replyToId)
        return message
      } catch (e) {
        console.error('Failed to send message:', e)
        return null
      }
    },

    addReaction: async (messageId, emoji) => {
      try {
        await tauriCollaborationService.addReaction(messageId, emoji)
        // Update local state
        set(state => ({
          chatMessages: state.chatMessages.map(m => {
            if (m.id === messageId) {
              const reactions = { ...m.reactions }
              if (!reactions[emoji]) reactions[emoji] = []
              if (!reactions[emoji].includes(state.userId)) {
                reactions[emoji] = [...reactions[emoji], state.userId]
              }
              return { ...m, reactions }
            }
            return m
          }),
        }))
      } catch (e) {
        console.error('Failed to add reaction:', e)
      }
    },

    removeReaction: async (messageId, emoji) => {
      try {
        await tauriCollaborationService.removeReaction(messageId, emoji)
        set(state => ({
          chatMessages: state.chatMessages.map(m => {
            if (m.id === messageId) {
              const reactions = { ...m.reactions }
              if (reactions[emoji]) {
                reactions[emoji] = reactions[emoji].filter(id => id !== state.userId)
              }
              return { ...m, reactions }
            }
            return m
          }),
        }))
      } catch (e) {
        console.error('Failed to remove reaction:', e)
      }
    },

    loadChatHistory: async () => {
      try {
        const messages = await tauriCollaborationService.getChatHistory(50)
        set({ chatMessages: messages })
      } catch (e) {
        console.error('Failed to load chat history:', e)
      }
    },

    // Changes
    broadcastNodeAdded: async (nodeId, nodeData) => {
      try {
        await tauriCollaborationService.broadcastChange('node_added', { nodeId, nodeData })
      } catch (e) {
        console.error('Failed to broadcast node added:', e)
      }
    },

    broadcastNodeRemoved: async (nodeId) => {
      try {
        await tauriCollaborationService.broadcastChange('node_removed', { nodeId })
      } catch (e) {
        console.error('Failed to broadcast node removed:', e)
      }
    },

    broadcastNodeUpdated: async (nodeId, changes) => {
      try {
        await tauriCollaborationService.broadcastChange('node_updated', { nodeId, changes })
      } catch (e) {
        console.error('Failed to broadcast node updated:', e)
      }
    },

    broadcastEdgeAdded: async (edgeId, edgeData) => {
      try {
        await tauriCollaborationService.broadcastChange('edge_added', { edgeId, edgeData })
      } catch (e) {
        console.error('Failed to broadcast edge added:', e)
      }
    },

    broadcastEdgeRemoved: async (edgeId) => {
      try {
        await tauriCollaborationService.broadcastChange('edge_removed', { edgeId })
      } catch (e) {
        console.error('Failed to broadcast edge removed:', e)
      }
    },

    // Invites
    createInvite: async (role, expiresHours) => {
      try {
        const invite = await tauriCollaborationService.createInvite(role, expiresHours)
        if (invite) {
          set(state => ({
            pendingInvites: [...state.pendingInvites, invite],
          }))
        }
        return invite
      } catch (e) {
        console.error('Failed to create invite:', e)
        return null
      }
    },

    acceptInvite: async (inviteId) => {
      try {
        const { userId, userName } = get()
        const session = await tauriCollaborationService.acceptInvite(inviteId, userId, userName)
        if (session) {
          const localUser = session.collaborators.find(c => c.id === userId) || null
          set({
            currentSession: session,
            isInSession: true,
            collaborators: session.collaborators,
            localUser,
          })
        }
        return session
      } catch (e) {
        console.error('Failed to accept invite:', e)
        return null
      }
    },

    // Settings
    updateSettings: async (settings) => {
      try {
        await tauriCollaborationService.updateSettings(settings)
        set(state => ({
          currentSession: state.currentSession
            ? { ...state.currentSession, settings }
            : null,
        }))
      } catch (e) {
        console.error('Failed to update settings:', e)
      }
    },

    // UI
    toggleChat: () => {
      set(state => ({
        isChatOpen: !state.isChatOpen,
        unreadCount: !state.isChatOpen ? 0 : state.unreadCount,
      }))
    },

    toggleCollaboratorsList: () => {
      set(state => ({ isCollaboratorsListOpen: !state.isCollaboratorsListOpen }))
    },

    markMessagesRead: () => {
      set({ unreadCount: 0 })
    },

    // User
    setUserInfo: (userId, userName) => {
      set({ userId, userName })
    },

    // Sync
    syncFromBackend: async () => {
      try {
        const sessionId = tauriCollaborationService.getCurrentSessionId()
        if (!sessionId) return

        const session = await tauriCollaborationService.getSession(sessionId)
        if (session) {
          const { userId } = get()
          const localUser = session.collaborators.find(c => c.id === userId) || null
          set({
            currentSession: session,
            collaborators: session.collaborators,
            localUser,
          })
        }
      } catch (e) {
        console.error('Failed to sync from backend:', e)
      }
    },
  }))
)

// ========== Selectors ==========

export const selectOnlineCollaborators = (state: CollaborationState): Collaborator[] =>
  state.collaborators.filter(c => c.isOnline)

export const selectCollaboratorById = (state: CollaborationState, id: string): Collaborator | undefined =>
  state.collaborators.find(c => c.id === id)

export const selectIsOwner = (state: CollaborationState): boolean =>
  state.localUser?.role === 'owner'

export const selectCanEdit = (state: CollaborationState): boolean => {
  const { currentSession, localUser } = state
  if (!currentSession || !localUser) return false
  if (localUser.role === 'owner') return true
  if (localUser.role === 'viewer') return false
  return currentSession.settings.allowEditing
}

export const selectCanInvite = (state: CollaborationState): boolean => {
  const { currentSession, localUser } = state
  if (!currentSession || !localUser) return false
  if (localUser.role === 'owner') return true
  if (localUser.role === 'viewer') return false
  return currentSession.settings.allowInvite
}
