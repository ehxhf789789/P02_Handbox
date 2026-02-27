/**
 * TauriMarketplaceService — Tauri backend integration for workflow marketplace.
 */

import { invoke } from '@tauri-apps/api/core'
import type {
  MarketplaceWorkflow,
  MarketplaceFilters,
  MarketplaceSearchResult,
  WorkflowReview,
  WorkflowCollection,
  WorkflowCategory,
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

interface CategoryInfo {
  id: WorkflowCategory
  name: string
  count: number
}

interface PublishRequest {
  name: string
  description: string
  category: WorkflowCategory
  tags: string[]
  workflowData: string
  license: string
  readme?: string
  previewImages: string[]
}

/**
 * TauriMarketplaceService class
 */
class TauriMarketplaceService {
  /**
   * Search workflows
   */
  async search(filters: Partial<MarketplaceFilters> = {}): Promise<MarketplaceSearchResult> {
    try {
      const defaultFilters: MarketplaceFilters = {
        sortBy: 'popular',
        sortOrder: 'desc',
        page: 1,
        pageSize: 20,
      }
      const mergedFilters = { ...defaultFilters, ...filters }
      const backendFilters = toSnakeCase(mergedFilters)

      const result = await invoke<MarketplaceSearchResult>('marketplace_search', {
        filters: backendFilters,
      })
      return toCamelCase(result)
    } catch (e) {
      console.error('Failed to search marketplace:', e)
      return {
        workflows: [],
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      }
    }
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(id: string): Promise<MarketplaceWorkflow | null> {
    try {
      const result = await invoke<MarketplaceWorkflow | null>('marketplace_get_workflow', { id })
      return result ? toCamelCase(result) : null
    } catch (e) {
      console.error('Failed to get workflow:', e)
      return null
    }
  }

  /**
   * Get featured workflows
   */
  async getFeatured(): Promise<MarketplaceWorkflow[]> {
    try {
      const result = await invoke<MarketplaceWorkflow[]>('marketplace_get_featured')
      return result.map(toCamelCase)
    } catch (e) {
      console.error('Failed to get featured workflows:', e)
      return []
    }
  }

  /**
   * Get popular workflows
   */
  async getPopular(limit?: number): Promise<MarketplaceWorkflow[]> {
    try {
      const result = await invoke<MarketplaceWorkflow[]>('marketplace_get_popular', { limit })
      return result.map(toCamelCase)
    } catch (e) {
      console.error('Failed to get popular workflows:', e)
      return []
    }
  }

  /**
   * Get categories with counts
   */
  async getCategories(): Promise<CategoryInfo[]> {
    try {
      const result = await invoke<CategoryInfo[]>('marketplace_get_categories')
      return result.map(toCamelCase)
    } catch (e) {
      console.error('Failed to get categories:', e)
      return []
    }
  }

  /**
   * Download workflow
   */
  async download(workflowId: string, userId: string): Promise<MarketplaceWorkflow | null> {
    try {
      const result = await invoke<MarketplaceWorkflow>('marketplace_download', {
        workflowId,
        userId,
      })
      return toCamelCase(result)
    } catch (e) {
      console.error('Failed to download workflow:', e)
      return null
    }
  }

  /**
   * Like workflow
   */
  async like(workflowId: string, userId: string): Promise<boolean> {
    try {
      return await invoke<boolean>('marketplace_like', { workflowId, userId })
    } catch (e) {
      console.error('Failed to like workflow:', e)
      return false
    }
  }

  /**
   * Unlike workflow
   */
  async unlike(workflowId: string, userId: string): Promise<boolean> {
    try {
      return await invoke<boolean>('marketplace_unlike', { workflowId, userId })
    } catch (e) {
      console.error('Failed to unlike workflow:', e)
      return false
    }
  }

  /**
   * Check if user liked a workflow
   */
  async isLiked(workflowId: string, userId: string): Promise<boolean> {
    try {
      return await invoke<boolean>('marketplace_is_liked', { workflowId, userId })
    } catch (e) {
      console.error('Failed to check if liked:', e)
      return false
    }
  }

  /**
   * Get workflow reviews
   */
  async getReviews(workflowId: string): Promise<WorkflowReview[]> {
    try {
      const result = await invoke<WorkflowReview[]>('marketplace_get_reviews', { workflowId })
      return result.map(toCamelCase)
    } catch (e) {
      console.error('Failed to get reviews:', e)
      return []
    }
  }

  /**
   * Submit review
   */
  async submitReview(
    workflowId: string,
    userId: string,
    userName: string,
    rating: number,
    title: string,
    content: string
  ): Promise<WorkflowReview | null> {
    try {
      const result = await invoke<WorkflowReview>('marketplace_submit_review', {
        workflowId,
        userId,
        userName,
        rating,
        title,
        content,
      })
      return toCamelCase(result)
    } catch (e) {
      console.error('Failed to submit review:', e)
      return null
    }
  }

  /**
   * Create collection
   */
  async createCollection(
    userId: string,
    name: string,
    description: string,
    isPublic: boolean = false
  ): Promise<WorkflowCollection | null> {
    try {
      const result = await invoke<WorkflowCollection>('marketplace_create_collection', {
        userId,
        name,
        description,
        isPublic,
      })
      return toCamelCase(result)
    } catch (e) {
      console.error('Failed to create collection:', e)
      return null
    }
  }

  /**
   * Add to collection
   */
  async addToCollection(
    collectionId: string,
    workflowId: string,
    userId: string
  ): Promise<boolean> {
    try {
      return await invoke<boolean>('marketplace_add_to_collection', {
        collectionId,
        workflowId,
        userId,
      })
    } catch (e) {
      console.error('Failed to add to collection:', e)
      return false
    }
  }

  /**
   * Remove from collection
   */
  async removeFromCollection(
    collectionId: string,
    workflowId: string,
    userId: string
  ): Promise<boolean> {
    try {
      return await invoke<boolean>('marketplace_remove_from_collection', {
        collectionId,
        workflowId,
        userId,
      })
    } catch (e) {
      console.error('Failed to remove from collection:', e)
      return false
    }
  }

  /**
   * Get user collections
   */
  async getCollections(userId: string): Promise<WorkflowCollection[]> {
    try {
      const result = await invoke<WorkflowCollection[]>('marketplace_get_collections', { userId })
      return result.map(toCamelCase)
    } catch (e) {
      console.error('Failed to get collections:', e)
      return []
    }
  }

  /**
   * Get user downloads
   */
  async getDownloads(userId: string): Promise<string[]> {
    try {
      return await invoke<string[]>('marketplace_get_downloads', { userId })
    } catch (e) {
      console.error('Failed to get downloads:', e)
      return []
    }
  }

  /**
   * Get user likes
   */
  async getLikes(userId: string): Promise<string[]> {
    try {
      return await invoke<string[]>('marketplace_get_likes', { userId })
    } catch (e) {
      console.error('Failed to get likes:', e)
      return []
    }
  }

  /**
   * Publish workflow
   */
  async publish(
    request: PublishRequest,
    userId: string,
    userName: string
  ): Promise<MarketplaceWorkflow | null> {
    try {
      const backendRequest = toSnakeCase(request)
      const result = await invoke<MarketplaceWorkflow>('marketplace_publish', {
        request: backendRequest,
        userId,
        userName,
      })
      return toCamelCase(result)
    } catch (e) {
      console.error('Failed to publish workflow:', e)
      return null
    }
  }
}

// Singleton instance
export const tauriMarketplaceService = new TauriMarketplaceService()
