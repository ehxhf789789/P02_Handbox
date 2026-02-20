/**
 * LLM 워크플로우 생성 채팅 관련 타입 정의
 */

import type { WorkflowFile } from './WorkflowFile'

// ============================================================
// 채팅 메시지
// ============================================================

export interface ChatMessage {
  /** 메시지 고유 ID */
  id: string
  /** 발신자 역할 */
  role: 'user' | 'assistant' | 'system'
  /** 메시지 내용 */
  content: string
  /** 타임스탬프 (ms) */
  timestamp: number
  /** 어시스턴트가 생성한 워크플로우 (있는 경우) */
  workflowPreview?: WorkflowFile
  /** 생성 중 여부 */
  isGenerating?: boolean
  /** 오류 메시지 */
  error?: string
}

// ============================================================
// 채팅 스토어 상태
// ============================================================

export interface WorkflowChatState {
  /** 채팅 드로어 열림 여부 */
  isOpen: boolean
  /** 대화 메시지 목록 */
  messages: ChatMessage[]
  /** LLM 응답 생성 중 여부 */
  isGenerating: boolean
  /** 미리보기 워크플로우 */
  previewWorkflow: WorkflowFile | null
  /** 마지막 오류 */
  lastError: string | null

  // Actions
  openChat: () => void
  closeChat: () => void
  toggleChat: () => void
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  updateLastMessage: (content: string, workflowPreview?: WorkflowFile) => void
  setGenerating: (isGenerating: boolean) => void
  setPreviewWorkflow: (workflow: WorkflowFile | null) => void
  setError: (error: string | null) => void
  clearChat: () => void
}

// ============================================================
// 워크플로우 생성 결과
// ============================================================

export interface WorkflowGenerationResult {
  /** LLM 응답 텍스트 */
  responseText: string
  /** 파싱된 워크플로우 (성공 시) */
  workflow: WorkflowFile | null
  /** 검증 오류 목록 */
  validationErrors: string[]
  /** 경고 메시지 */
  warnings: string[]
  /** 학습용 메타데이터 (내부 사용) */
  _meta?: {
    userRequest: string
    conversationTurns: number
  }
}

// ============================================================
// LLM 요청/응답
// ============================================================

export interface WorkflowGenerationRequest {
  /** 사용자 입력 */
  userInput: string
  /** 대화 기록 */
  conversationHistory: ChatMessage[]
  /** 시스템 프롬프트 (노드 카탈로그 포함) */
  systemPrompt: string
}

export interface LLMInvocationResult {
  response: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

// ============================================================
// 대화 세션 (ChatGPT 스타일 히스토리)
// ============================================================

export interface ChatSession {
  /** 세션 고유 ID */
  id: string
  /** 세션 제목 (첫 메시지 기반 자동 생성) */
  title: string
  /** 생성 날짜 (ISO string) */
  createdAt: string
  /** 마지막 업데이트 날짜 (ISO string) */
  updatedAt: string
  /** 대화 메시지 목록 */
  messages: ChatMessage[]
  /** 연결된 워크플로우 ID (있는 경우) */
  linkedWorkflowId?: string
  /** 연결된 워크플로우 이름 */
  linkedWorkflowName?: string
}

export interface ChatHistoryState {
  /** 모든 대화 세션 */
  sessions: ChatSession[]
  /** 현재 활성 세션 ID */
  activeSessionId: string | null
  /** 검색 쿼리 */
  searchQuery: string

  // Actions
  createSession: () => string
  loadSession: (sessionId: string) => void
  saveCurrentSession: () => void
  deleteSession: (sessionId: string) => void
  renameSession: (sessionId: string, newTitle: string) => void
  linkWorkflow: (sessionId: string, workflowId: string, workflowName: string) => void
  setSearchQuery: (query: string) => void
  getFilteredSessions: () => ChatSession[]
}
