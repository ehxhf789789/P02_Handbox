/**
 * Marketplace types — Workflow sharing and collaboration types.
 */

/** Published workflow in marketplace */
export interface MarketplaceWorkflow {
  id: string
  name: string
  description: string
  author: AuthorInfo
  version: string
  category: WorkflowCategory
  tags: string[]
  thumbnail?: string
  previewImages: string[]

  // Stats
  downloads: number
  likes: number
  rating: number
  ratingCount: number

  // Metadata
  nodeCount: number
  estimatedRuntime: string
  requiredTools: string[]
  requiredProviders: string[]

  // Timestamps
  publishedAt: string
  updatedAt: string

  // Content
  workflowData: string  // Serialized workflow JSON
  readme?: string
  changelog?: string

  // Flags
  isVerified: boolean
  isFeatured: boolean
  isOfficial: boolean
  license: LicenseType
}

/** Author information */
export interface AuthorInfo {
  id: string
  name: string
  avatar?: string
  isVerified: boolean
  publishedCount: number
  totalDownloads: number
}

/** Workflow categories */
export type WorkflowCategory =
  | 'ai-assistant'
  | 'data-processing'
  | 'document'
  | 'automation'
  | 'integration'
  | 'analysis'
  | 'creative'
  | 'developer'
  | 'other'

/** License types */
export type LicenseType =
  | 'mit'
  | 'apache-2.0'
  | 'gpl-3.0'
  | 'cc-by-4.0'
  | 'cc0'
  | 'proprietary'
  | 'custom'

/** Review for a workflow */
export interface WorkflowReview {
  id: string
  workflowId: string
  author: AuthorInfo
  rating: number
  title: string
  content: string
  createdAt: string
  updatedAt: string
  helpfulCount: number
  isVerifiedPurchase: boolean
}

/** Search filters for marketplace */
export interface MarketplaceFilters {
  query?: string
  category?: WorkflowCategory
  tags?: string[]
  minRating?: number
  sortBy: 'popular' | 'recent' | 'rating' | 'downloads'
  sortOrder: 'asc' | 'desc'
  page: number
  pageSize: number
  verified?: boolean
  featured?: boolean
}

/** Marketplace search result */
export interface MarketplaceSearchResult {
  workflows: MarketplaceWorkflow[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

/** User's marketplace activity */
export interface UserMarketplaceProfile {
  userId: string
  publishedWorkflows: string[]
  downloadedWorkflows: string[]
  likedWorkflows: string[]
  reviews: string[]
  collections: WorkflowCollection[]
}

/** Collection of workflows */
export interface WorkflowCollection {
  id: string
  name: string
  description: string
  workflowIds: string[]
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

// ========== Collaboration Types ==========

/** Collaborator in a session */
export interface Collaborator {
  id: string
  name: string
  avatar?: string
  color: string
  cursor?: CursorPosition
  selection?: string[]  // Selected node IDs
  isOnline: boolean
  lastActive: string
  role: CollaboratorRole
}

export type CollaboratorRole = 'owner' | 'editor' | 'viewer'

/** Cursor position on canvas */
export interface CursorPosition {
  x: number
  y: number
  nodeId?: string  // If hovering over a node
}

/** Collaboration session */
export interface CollaborationSession {
  id: string
  workflowId: string
  name: string
  owner: string
  collaborators: Collaborator[]
  createdAt: string
  isActive: boolean
  settings: SessionSettings
}

/** Session settings */
export interface SessionSettings {
  allowEditing: boolean
  allowExecution: boolean
  allowInvite: boolean
  maxCollaborators: number
  autoSave: boolean
  autoSaveInterval: number  // ms
}

/** Collaboration event types */
export type CollaborationEventType =
  | 'user_joined'
  | 'user_left'
  | 'cursor_moved'
  | 'selection_changed'
  | 'node_added'
  | 'node_removed'
  | 'node_updated'
  | 'edge_added'
  | 'edge_removed'
  | 'execution_started'
  | 'execution_completed'
  | 'chat_message'

/** Collaboration event */
export interface CollaborationEvent {
  id: string
  type: CollaborationEventType
  sessionId: string
  userId: string
  timestamp: string
  payload: unknown
}

/** Chat message in collaboration */
export interface ChatMessage {
  id: string
  sessionId: string
  userId: string
  userName: string
  content: string
  timestamp: string
  replyToId?: string
  reactions: Record<string, string[]>  // emoji -> userIds
}

/** Invite to collaboration */
export interface CollaborationInvite {
  id: string
  sessionId: string
  invitedBy: string
  invitedEmail?: string
  role: CollaboratorRole
  expiresAt: string
  acceptedAt?: string
  status: 'pending' | 'accepted' | 'declined' | 'expired'
}
