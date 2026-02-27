/**
 * marketplaceStore — Zustand store for workflow marketplace.
 * Connected to Tauri backend.
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  MarketplaceWorkflow,
  MarketplaceFilters,
  MarketplaceSearchResult,
  WorkflowReview,
  WorkflowCollection,
  WorkflowCategory,
} from '@/types/marketplace'
import { tauriMarketplaceService } from '@/services/TauriMarketplaceService'

/** Marketplace store state */
interface MarketplaceState {
  // Search state
  filters: MarketplaceFilters
  searchResults: MarketplaceSearchResult | null
  isSearching: boolean

  // Selected workflow
  selectedWorkflow: MarketplaceWorkflow | null
  selectedWorkflowReviews: WorkflowReview[]
  isLoadingWorkflow: boolean

  // User data
  downloadedWorkflows: string[]
  likedWorkflows: string[]
  collections: WorkflowCollection[]

  // Featured/Popular
  featuredWorkflows: MarketplaceWorkflow[]
  popularWorkflows: MarketplaceWorkflow[]
  recentWorkflows: MarketplaceWorkflow[]

  // Categories
  categories: { id: WorkflowCategory; name: string; count: number }[]

  // UI state
  viewMode: 'grid' | 'list'
  detailOpen: boolean

  // Current user (for API calls)
  currentUserId: string

  // Actions
  setFilters: (filters: Partial<MarketplaceFilters>) => void
  search: () => Promise<void>
  loadWorkflow: (id: string) => Promise<void>
  downloadWorkflow: (id: string) => Promise<MarketplaceWorkflow | null>
  likeWorkflow: (id: string) => Promise<void>
  unlikeWorkflow: (id: string) => Promise<void>
  submitReview: (workflowId: string, rating: number, title: string, content: string) => Promise<void>
  loadFeatured: () => Promise<void>
  loadPopular: () => Promise<void>
  loadCategories: () => Promise<void>
  setViewMode: (mode: 'grid' | 'list') => void
  openDetail: (workflow: MarketplaceWorkflow) => void
  closeDetail: () => void

  // Collection management
  createCollection: (name: string, description: string) => Promise<void>
  addToCollection: (collectionId: string, workflowId: string) => Promise<void>
  removeFromCollection: (collectionId: string, workflowId: string) => Promise<void>
  loadCollections: () => Promise<void>

  // User data loading
  loadUserData: () => Promise<void>

  // Publish
  publishWorkflow: (
    name: string,
    description: string,
    category: WorkflowCategory,
    tags: string[],
    workflowData: string,
    license: string
  ) => Promise<MarketplaceWorkflow | null>
}

/** Default filters */
const DEFAULT_FILTERS: MarketplaceFilters = {
  sortBy: 'popular',
  sortOrder: 'desc',
  page: 1,
  pageSize: 20,
}

export const useMarketplaceStore = create<MarketplaceState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    filters: DEFAULT_FILTERS,
    searchResults: null,
    isSearching: false,
    selectedWorkflow: null,
    selectedWorkflowReviews: [],
    isLoadingWorkflow: false,
    downloadedWorkflows: [],
    likedWorkflows: [],
    collections: [],
    featuredWorkflows: [],
    popularWorkflows: [],
    recentWorkflows: [],
    categories: [],
    viewMode: 'grid',
    detailOpen: false,
    currentUserId: 'user-local', // Default user ID

    // Filter management
    setFilters: (newFilters) => {
      set(state => ({
        filters: { ...state.filters, ...newFilters },
      }))
    },

    // Search - connected to Tauri backend
    search: async () => {
      set({ isSearching: true })
      try {
        const { filters } = get()
        const results = await tauriMarketplaceService.search(filters)
        set({ searchResults: results, isSearching: false })
      } catch (e) {
        console.error('Search failed:', e)
        set({ isSearching: false })
      }
    },

    // Load single workflow - connected to Tauri backend
    loadWorkflow: async (id) => {
      set({ isLoadingWorkflow: true })
      try {
        const [workflow, reviews] = await Promise.all([
          tauriMarketplaceService.getWorkflow(id),
          tauriMarketplaceService.getReviews(id),
        ])
        set({
          isLoadingWorkflow: false,
          selectedWorkflow: workflow,
          selectedWorkflowReviews: reviews,
        })
      } catch (e) {
        console.error('Failed to load workflow:', e)
        set({ isLoadingWorkflow: false })
      }
    },

    // Download workflow - connected to Tauri backend
    downloadWorkflow: async (id) => {
      try {
        const { currentUserId } = get()
        const workflow = await tauriMarketplaceService.download(id, currentUserId)
        if (workflow) {
          set(state => ({
            downloadedWorkflows: [...new Set([...state.downloadedWorkflows, id])],
          }))
        }
        return workflow
      } catch (e) {
        console.error('Failed to download workflow:', e)
        return null
      }
    },

    // Like - connected to Tauri backend
    likeWorkflow: async (id) => {
      try {
        const { currentUserId } = get()
        const success = await tauriMarketplaceService.like(id, currentUserId)
        if (success) {
          set(state => ({
            likedWorkflows: [...new Set([...state.likedWorkflows, id])],
          }))
        }
      } catch (e) {
        console.error('Failed to like workflow:', e)
      }
    },

    // Unlike - connected to Tauri backend
    unlikeWorkflow: async (id) => {
      try {
        const { currentUserId } = get()
        const success = await tauriMarketplaceService.unlike(id, currentUserId)
        if (success) {
          set(state => ({
            likedWorkflows: state.likedWorkflows.filter(wid => wid !== id),
          }))
        }
      } catch (e) {
        console.error('Failed to unlike workflow:', e)
      }
    },

    // Submit review - connected to Tauri backend
    submitReview: async (workflowId, rating, title, content) => {
      try {
        const { currentUserId } = get()
        const review = await tauriMarketplaceService.submitReview(
          workflowId,
          currentUserId,
          'User',
          rating,
          title,
          content
        )
        if (review) {
          set(state => ({
            selectedWorkflowReviews: [...state.selectedWorkflowReviews, review],
          }))
        }
      } catch (e) {
        console.error('Failed to submit review:', e)
      }
    },

    // Load featured - connected to Tauri backend
    loadFeatured: async () => {
      try {
        const featured = await tauriMarketplaceService.getFeatured()
        set({ featuredWorkflows: featured })
      } catch (e) {
        console.error('Failed to load featured:', e)
      }
    },

    // Load popular - connected to Tauri backend
    loadPopular: async () => {
      try {
        const popular = await tauriMarketplaceService.getPopular(10)
        set({ popularWorkflows: popular })
      } catch (e) {
        console.error('Failed to load popular:', e)
      }
    },

    // Load categories - connected to Tauri backend
    loadCategories: async () => {
      try {
        const categories = await tauriMarketplaceService.getCategories()
        set({ categories })
      } catch (e) {
        console.error('Failed to load categories:', e)
      }
    },

    // UI
    setViewMode: (mode) => set({ viewMode: mode }),

    openDetail: (workflow) => set({
      selectedWorkflow: workflow,
      detailOpen: true,
    }),

    closeDetail: () => set({
      detailOpen: false,
    }),

    // Collections - connected to Tauri backend
    createCollection: async (name, description) => {
      try {
        const { currentUserId } = get()
        const collection = await tauriMarketplaceService.createCollection(
          currentUserId,
          name,
          description,
          false
        )
        if (collection) {
          set(state => ({
            collections: [...state.collections, collection],
          }))
        }
      } catch (e) {
        console.error('Failed to create collection:', e)
      }
    },

    addToCollection: async (collectionId, workflowId) => {
      try {
        const { currentUserId } = get()
        const success = await tauriMarketplaceService.addToCollection(
          collectionId,
          workflowId,
          currentUserId
        )
        if (success) {
          set(state => ({
            collections: state.collections.map(c =>
              c.id === collectionId
                ? { ...c, workflowIds: [...new Set([...c.workflowIds, workflowId])] }
                : c
            ),
          }))
        }
      } catch (e) {
        console.error('Failed to add to collection:', e)
      }
    },

    removeFromCollection: async (collectionId, workflowId) => {
      try {
        const { currentUserId } = get()
        const success = await tauriMarketplaceService.removeFromCollection(
          collectionId,
          workflowId,
          currentUserId
        )
        if (success) {
          set(state => ({
            collections: state.collections.map(c =>
              c.id === collectionId
                ? { ...c, workflowIds: c.workflowIds.filter(id => id !== workflowId) }
                : c
            ),
          }))
        }
      } catch (e) {
        console.error('Failed to remove from collection:', e)
      }
    },

    loadCollections: async () => {
      try {
        const { currentUserId } = get()
        const collections = await tauriMarketplaceService.getCollections(currentUserId)
        set({ collections })
      } catch (e) {
        console.error('Failed to load collections:', e)
      }
    },

    // Load user data (downloads, likes)
    loadUserData: async () => {
      try {
        const { currentUserId } = get()
        const [downloads, likes, collections] = await Promise.all([
          tauriMarketplaceService.getDownloads(currentUserId),
          tauriMarketplaceService.getLikes(currentUserId),
          tauriMarketplaceService.getCollections(currentUserId),
        ])
        set({
          downloadedWorkflows: downloads,
          likedWorkflows: likes,
          collections,
        })
      } catch (e) {
        console.error('Failed to load user data:', e)
      }
    },

    // Publish workflow - connected to Tauri backend
    publishWorkflow: async (name, description, category, tags, workflowData, license) => {
      try {
        const { currentUserId } = get()
        const workflow = await tauriMarketplaceService.publish(
          {
            name,
            description,
            category,
            tags,
            workflowData,
            license,
            previewImages: [],
          },
          currentUserId,
          'User'
        )
        return workflow
      } catch (e) {
        console.error('Failed to publish workflow:', e)
        return null
      }
    },
  }))
)

// ========== Selectors ==========

export const selectWorkflowById = (state: MarketplaceState, id: string) =>
  state.featuredWorkflows.find(w => w.id === id) ||
  state.popularWorkflows.find(w => w.id === id) ||
  state.searchResults?.workflows.find(w => w.id === id)

export const selectIsLiked = (state: MarketplaceState, id: string) =>
  state.likedWorkflows.includes(id)

export const selectIsDownloaded = (state: MarketplaceState, id: string) =>
  state.downloadedWorkflows.includes(id)
