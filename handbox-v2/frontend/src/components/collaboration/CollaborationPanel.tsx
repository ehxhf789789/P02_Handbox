/**
 * CollaborationPanel — Real-time collaboration UI with presence and chat.
 */

import { useState, useEffect, useRef } from 'react'
import { collaborationService } from '@/services/CollaborationService'
import type { Collaborator, ChatMessage, CollaborationSession } from '@/types/marketplace'
import {
  Users,
  MessageCircle,
  Send,
  Share2,
  Copy,
  Check,
  X,
  Circle,
  UserPlus,
  Crown,
  Edit3,
  Eye,
} from 'lucide-react'

type TabType = 'presence' | 'chat'

interface CollaborationPanelProps {
  workflowId: string
  workflowName: string
  userId: string
  userName: string
}

export function CollaborationPanel({
  workflowId,
  workflowName,
  userId,
  userName,
}: CollaborationPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('presence')
  const [session, setSession] = useState<CollaborationSession | null>(null)
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [copied, setCopied] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)

  // Initialize session
  useEffect(() => {
    const existingSession = collaborationService.getSession()

    if (!existingSession) {
      // Create new session
      const newSession = collaborationService.createSession(
        workflowId,
        workflowName,
        userId,
        userName
      )
      setSession(newSession)
      setCollaborators(newSession.collaborators)
    } else {
      setSession(existingSession)
      setCollaborators(existingSession.collaborators)
    }

    // Subscribe to updates
    const unsubPresence = collaborationService.onPresence((collabs) => {
      setCollaborators(collabs)
    })

    const unsubChat = collaborationService.onChat((msg) => {
      setMessages(prev => [...prev, msg])
    })

    // Load chat history
    setMessages(collaborationService.getChatHistory())

    return () => {
      unsubPresence()
      unsubChat()
    }
  }, [workflowId, workflowName, userId, userName])

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = () => {
    if (!messageInput.trim()) return

    collaborationService.sendMessage(messageInput.trim())
    setMessageInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleCreateInvite = () => {
    const invite = collaborationService.createInvite('editor')
    if (invite) {
      // Generate invite link (in real app, this would be a proper URL)
      const link = `${window.location.origin}/collab/${session?.id}?invite=${invite.id}`
      setInviteLink(link)
      setShowInvite(true)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const localUser = collaborationService.getLocalUser()
  const onlineCount = collaborators.filter(c => c.isOnline).length

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-neutral-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Share2 size={16} className="text-violet-400" />
            <span className="font-semibold text-sm">Collaboration</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Circle size={6} className="fill-emerald-400" />
              {onlineCount} online
            </span>
          </div>
        </div>

        {/* Session info */}
        {session && (
          <div className="text-xs text-neutral-500 truncate">
            Session: {session.name}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800">
        <button
          onClick={() => setActiveTab('presence')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium
                    border-b-2 transition-colors ${
            activeTab === 'presence'
              ? 'border-violet-500 text-violet-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Users size={12} />
          People ({onlineCount})
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium
                    border-b-2 transition-colors ${
            activeTab === 'chat'
              ? 'border-violet-500 text-violet-400'
              : 'border-transparent text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <MessageCircle size={12} />
          Chat
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'presence' ? (
          <PresenceTab
            collaborators={collaborators}
            localUserId={localUser?.id}
            onInvite={handleCreateInvite}
          />
        ) : (
          <ChatTab
            messages={messages}
            localUserId={userId}
            messageInput={messageInput}
            onMessageChange={setMessageInput}
            onSend={handleSendMessage}
            onKeyDown={handleKeyDown}
            chatEndRef={chatEndRef}
          />
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-neutral-800 rounded-lg p-4 w-80">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Invite Collaborators</h3>
              <button onClick={() => setShowInvite(false)} className="p-1 hover:bg-neutral-700 rounded">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-neutral-400 mb-3">
              Share this link to invite others to collaborate:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteLink}
                readOnly
                className="flex-1 px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-xs truncate"
              />
              <button
                onClick={handleCopyLink}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 rounded"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-[10px] text-neutral-500 mt-2">
              Link expires in 24 hours
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ========== Presence Tab ==========

function PresenceTab({
  collaborators,
  localUserId,
  onInvite,
}: {
  collaborators: Collaborator[]
  localUserId?: string
  onInvite: () => void
}) {
  const roleIcons = {
    owner: <Crown size={10} className="text-yellow-400" />,
    editor: <Edit3 size={10} className="text-blue-400" />,
    viewer: <Eye size={10} className="text-neutral-400" />,
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {collaborators.map(collab => (
          <div
            key={collab.id}
            className={`flex items-center gap-3 p-2 rounded-lg ${
              collab.id === localUserId ? 'bg-violet-500/10' : 'hover:bg-neutral-800'
            }`}
          >
            {/* Avatar */}
            <div className="relative">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                style={{ backgroundColor: collab.color + '30', color: collab.color }}
              >
                {(collab.name[0] || '?').toUpperCase()}
              </div>
              {collab.isOnline && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-neutral-900" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium truncate">
                  {collab.name}
                  {collab.id === localUserId && (
                    <span className="text-neutral-500 font-normal"> (you)</span>
                  )}
                </span>
                {roleIcons[collab.role]}
              </div>
              <div className="text-[10px] text-neutral-500">
                {collab.isOnline ? (
                  collab.selection?.length ? (
                    `Editing ${collab.selection.length} node(s)`
                  ) : (
                    'Online'
                  )
                ) : (
                  `Last seen ${formatTimeAgo(collab.lastActive)}`
                )}
              </div>
            </div>

            {/* Cursor indicator */}
            {collab.isOnline && collab.cursor && collab.id !== localUserId && (
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: collab.color }}
                title="Cursor on canvas"
              />
            )}
          </div>
        ))}
      </div>

      {/* Invite button */}
      <div className="p-3 border-t border-neutral-800">
        <button
          onClick={onInvite}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium"
        >
          <UserPlus size={14} />
          Invite People
        </button>
      </div>
    </div>
  )
}

// ========== Chat Tab ==========

function ChatTab({
  messages,
  localUserId,
  messageInput,
  onMessageChange,
  onSend,
  onKeyDown,
  chatEndRef,
}: {
  messages: ChatMessage[]
  localUserId: string
  messageInput: string
  onMessageChange: (value: string) => void
  onSend: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  chatEndRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-500 text-sm">
            <MessageCircle size={32} className="mb-2 opacity-50" />
            <p>No messages yet</p>
            <p className="text-xs">Start the conversation!</p>
          </div>
        ) : (
          messages.map(msg => (
            <ChatMessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.userId === localUserId}
            />
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-neutral-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm
                     focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={onSend}
            disabled={!messageInput.trim()}
            className="px-3 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function ChatMessageBubble({
  message,
  isOwn,
}: {
  message: ChatMessage
  isOwn: boolean
}) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${isOwn ? 'order-2' : 'order-1'}`}>
        {!isOwn && (
          <div className="text-[10px] text-neutral-500 mb-0.5 ml-1">
            {message.userName}
          </div>
        )}
        <div
          className={`px-3 py-2 rounded-lg text-sm ${
            isOwn
              ? 'bg-violet-600 text-white rounded-br-sm'
              : 'bg-neutral-800 text-neutral-200 rounded-bl-sm'
          }`}
        >
          {message.content}
        </div>
        <div className={`text-[10px] text-neutral-600 mt-0.5 ${isOwn ? 'text-right mr-1' : 'ml-1'}`}>
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  )
}

// ========== Utilities ==========

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatTimeAgo(timestamp: string): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

// ========== Cursor Overlay (for canvas) ==========

export function CollaboratorCursors() {
  const [cursors, setCursors] = useState<{ collaborator: Collaborator; cursor: { x: number; y: number } }[]>([])

  useEffect(() => {
    const unsubPresence = collaborationService.onPresence(() => {
      setCursors(collaborationService.getOtherCursors())
    })

    return () => unsubPresence()
  }, [])

  return (
    <>
      {cursors.map(({ collaborator, cursor }) => (
        <div
          key={collaborator.id}
          className="fixed pointer-events-none z-50 transition-all duration-75"
          style={{
            left: cursor.x,
            top: cursor.y,
            transform: 'translate(-2px, -2px)',
          }}
        >
          {/* Cursor arrow */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
          >
            <path
              d="M5 3L19 12L12 12L9 21L5 3Z"
              fill={collaborator.color}
              stroke="white"
              strokeWidth="1"
            />
          </svg>
          {/* Name label */}
          <div
            className="absolute left-5 top-4 px-1.5 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap"
            style={{ backgroundColor: collaborator.color }}
          >
            {collaborator.name}
          </div>
        </div>
      ))}
    </>
  )
}

export default CollaborationPanel
