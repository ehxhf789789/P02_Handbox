/**
 * LLM 워크플로우 생성 채팅 스토어 (대화 기록 저장 지원)
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WorkflowChatState, ChatMessage, ChatSession, ChatHistoryState } from '../types/ChatTypes'

const STORAGE_KEY = 'handbox-chat-history'

// 디바운스된 저장 (성능 최적화)
let saveTimeout: ReturnType<typeof setTimeout> | null = null
function debouncedSave(saveFn: () => void, delay = 1000) {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(saveFn, delay)
}

// 세션 제목 자동 생성 (첫 메시지 기반)
function generateSessionTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((m) => m.role === 'user')
  if (firstUserMessage) {
    const content = firstUserMessage.content.trim()
    // 최대 50자, 줄바꿈 제거
    const title = content.replace(/\n/g, ' ').slice(0, 50)
    return title.length < content.length ? `${title}...` : title
  }
  return '새 대화'
}

// 날짜별 그룹화를 위한 헬퍼
export function groupSessionsByDate(sessions: ChatSession[]): Record<string, ChatSession[]> {
  const groups: Record<string, ChatSession[]> = {}
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  for (const session of sessions) {
    const sessionDate = new Date(session.createdAt)
    let groupKey: string

    if (sessionDate.toDateString() === today.toDateString()) {
      groupKey = '오늘'
    } else if (sessionDate.toDateString() === yesterday.toDateString()) {
      groupKey = '어제'
    } else if (sessionDate > new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
      groupKey = '이번 주'
    } else if (sessionDate > new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) {
      groupKey = '이번 달'
    } else {
      groupKey = sessionDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })
    }

    if (!groups[groupKey]) {
      groups[groupKey] = []
    }
    groups[groupKey].push(session)
  }

  return groups
}

interface CombinedChatState extends WorkflowChatState, ChatHistoryState {}

export const useChatStore = create<CombinedChatState>()(
  persist(
    (set, get) => ({
      // WorkflowChatState
      isOpen: false,
      messages: [],
      isGenerating: false,
      previewWorkflow: null,
      lastError: null,

      // ChatHistoryState
      sessions: [],
      activeSessionId: null,
      searchQuery: '',

      // === WorkflowChatState Actions ===
      openChat: () => set({ isOpen: true }),

      closeChat: () => set({ isOpen: false }),

      toggleChat: () => set((state) => ({ isOpen: !state.isOpen })),

      addMessage: (message) => {
        const newMessage: ChatMessage = {
          ...message,
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
        }
        set((state) => ({
          messages: [...state.messages, newMessage],
          lastError: null,
        }))
        // 디바운스된 자동 저장
        const state = get()
        if (state.activeSessionId) {
          debouncedSave(() => state.saveCurrentSession())
        }
      },

      updateLastMessage: (content, workflowPreview) => {
        set((state) => {
          const messages = [...state.messages]
          if (messages.length > 0) {
            const lastIndex = messages.length - 1
            messages[lastIndex] = {
              ...messages[lastIndex],
              content,
              workflowPreview,
              isGenerating: false,
            }
          }
          return {
            messages,
            previewWorkflow: workflowPreview || state.previewWorkflow,
          }
        })
        // 디바운스된 자동 저장
        const state = get()
        if (state.activeSessionId) {
          debouncedSave(() => state.saveCurrentSession())
        }
      },

      setGenerating: (isGenerating) => set({ isGenerating }),

      setPreviewWorkflow: (workflow) => set({ previewWorkflow: workflow }),

      setError: (error) => set({ lastError: error }),

      clearChat: () => {
        const state = get()
        // 현재 세션이 있고 메시지가 있으면 저장
        if (state.activeSessionId && state.messages.length > 0) {
          state.saveCurrentSession()
        }
        set({
          messages: [],
          previewWorkflow: null,
          lastError: null,
          isGenerating: false,
          activeSessionId: null,
        })
      },

      // === ChatHistoryState Actions ===
      createSession: () => {
        const state = get()
        // 기존 세션 저장
        if (state.activeSessionId && state.messages.length > 0) {
          state.saveCurrentSession()
        }

        const newSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const now = new Date().toISOString()

        const newSession: ChatSession = {
          id: newSessionId,
          title: '새 대화',
          createdAt: now,
          updatedAt: now,
          messages: [],
        }

        set({
          sessions: [newSession, ...state.sessions],
          activeSessionId: newSessionId,
          messages: [],
          previewWorkflow: null,
          lastError: null,
          isGenerating: false,
        })

        return newSessionId
      },

      loadSession: (sessionId) => {
        const state = get()
        // 현재 세션 저장
        if (state.activeSessionId && state.messages.length > 0) {
          state.saveCurrentSession()
        }

        const session = state.sessions.find((s) => s.id === sessionId)
        if (session) {
          set({
            activeSessionId: sessionId,
            messages: [...session.messages],
            previewWorkflow: null,
            lastError: null,
            isGenerating: false,
          })
        }
      },

      saveCurrentSession: () => {
        const state = get()
        if (!state.activeSessionId || state.messages.length === 0) return

        const updatedSessions = state.sessions.map((session) => {
          if (session.id === state.activeSessionId) {
            return {
              ...session,
              title: generateSessionTitle(state.messages),
              updatedAt: new Date().toISOString(),
              messages: [...state.messages],
            }
          }
          return session
        })

        set({ sessions: updatedSessions })
      },

      deleteSession: (sessionId) => {
        const state = get()
        const updatedSessions = state.sessions.filter((s) => s.id !== sessionId)

        if (state.activeSessionId === sessionId) {
          set({
            sessions: updatedSessions,
            activeSessionId: null,
            messages: [],
            previewWorkflow: null,
          })
        } else {
          set({ sessions: updatedSessions })
        }
      },

      renameSession: (sessionId, newTitle) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, title: newTitle, updatedAt: new Date().toISOString() } : s
          ),
        }))
      },

      linkWorkflow: (sessionId, workflowId, workflowName) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? { ...s, linkedWorkflowId: workflowId, linkedWorkflowName: workflowName, updatedAt: new Date().toISOString() }
              : s
          ),
        }))
      },

      setSearchQuery: (query) => set({ searchQuery: query }),

      getFilteredSessions: () => {
        const state = get()
        const query = state.searchQuery.toLowerCase().trim()

        if (!query) {
          return state.sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        }

        return state.sessions
          .filter((session) => {
            // 제목 검색
            if (session.title.toLowerCase().includes(query)) return true
            // 워크플로우 이름 검색
            if (session.linkedWorkflowName?.toLowerCase().includes(query)) return true
            // 메시지 내용 검색
            return session.messages.some((msg) => msg.content.toLowerCase().includes(query))
          })
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        // 세션 데이터만 영구 저장
        sessions: state.sessions,
      }),
    }
  )
)
