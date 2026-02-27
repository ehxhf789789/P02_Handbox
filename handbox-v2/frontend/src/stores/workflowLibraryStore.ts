/**
 * Workflow Library Store — Manages saved workflows and version control
 */

import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { NodeData } from './workflowStore'
import type {
  SavedWorkflow,
  SavedWorkflowMeta,
  WorkflowVersion,
  WorkflowParameter,
  WorkflowExport,
  ImportResult,
} from '@/types/workflow'
import type { LLMProvider } from '@/types'
import { workflowStorage } from '@/services/WorkflowStorage'

interface WorkflowLibraryState {
  /** List of all workflows (metadata only) */
  workflows: SavedWorkflowMeta[]

  /** Currently loaded workflow for editing */
  activeWorkflow: SavedWorkflow | null

  /** Loading states */
  isLoading: boolean
  isSaving: boolean

  /** Error state */
  error: string | null

  /** Search/filter state */
  searchQuery: string
  filterTags: string[]
  sortBy: 'name' | 'updatedAt' | 'createdAt'
  sortOrder: 'asc' | 'desc'

  /** Actions */
  loadWorkflowList: () => Promise<void>
  loadWorkflow: (id: string) => Promise<SavedWorkflow | null>

  saveWorkflow: (
    nodes: Node<NodeData>[],
    edges: Edge[],
    meta: Partial<SavedWorkflowMeta>,
    options?: {
      versionMessage?: string
      parameters?: WorkflowParameter[]
      modelOverrides?: Record<string, { provider: LLMProvider; modelId: string }>
    }
  ) => Promise<SavedWorkflow | null>

  deleteWorkflow: (id: string) => Promise<void>

  /** Version control */
  revertToVersion: (workflowId: string, version: number) => Promise<SavedWorkflow | null>
  getVersionHistory: (workflowId: string) => Promise<WorkflowVersion[]>

  /** Import/Export */
  exportWorkflow: (id: string) => Promise<WorkflowExport | null>
  importWorkflow: (data: WorkflowExport) => Promise<ImportResult>

  /** UI state */
  setSearchQuery: (query: string) => void
  setFilterTags: (tags: string[]) => void
  setSortBy: (sortBy: 'name' | 'updatedAt' | 'createdAt') => void
  setSortOrder: (order: 'asc' | 'desc') => void
  clearError: () => void

  /** Computed */
  getFilteredWorkflows: () => SavedWorkflowMeta[]
  getAllTags: () => string[]
}

export const useWorkflowLibraryStore = create<WorkflowLibraryState>()((set, get) => ({
  workflows: [],
  activeWorkflow: null,
  isLoading: false,
  isSaving: false,
  error: null,
  searchQuery: '',
  filterTags: [],
  sortBy: 'updatedAt',
  sortOrder: 'desc',

  loadWorkflowList: async () => {
    set({ isLoading: true, error: null })
    try {
      const workflows = await workflowStorage.listWorkflows()
      set({ workflows, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load workflows',
        isLoading: false,
      })
    }
  },

  loadWorkflow: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const workflow = await workflowStorage.getWorkflow(id)
      set({ activeWorkflow: workflow, isLoading: false })
      return workflow
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load workflow',
        isLoading: false,
      })
      return null
    }
  },

  saveWorkflow: async (nodes, edges, meta, options) => {
    set({ isSaving: true, error: null })
    try {
      const workflow = await workflowStorage.saveWorkflow(nodes, edges, meta, options)

      // Update local list
      const workflows = get().workflows
      const existingIdx = workflows.findIndex(w => w.id === workflow.meta.id)
      if (existingIdx >= 0) {
        workflows[existingIdx] = workflow.meta
        set({ workflows: [...workflows] })
      } else {
        set({ workflows: [workflow.meta, ...workflows] })
      }

      set({ activeWorkflow: workflow, isSaving: false })
      return workflow
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to save workflow',
        isSaving: false,
      })
      return null
    }
  },

  deleteWorkflow: async (id) => {
    set({ error: null })
    try {
      await workflowStorage.deleteWorkflow(id)
      set({
        workflows: get().workflows.filter(w => w.id !== id),
        activeWorkflow: get().activeWorkflow?.meta.id === id ? null : get().activeWorkflow,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete workflow',
      })
    }
  },

  revertToVersion: async (workflowId, version) => {
    set({ isSaving: true, error: null })
    try {
      const workflow = await workflowStorage.revertToVersion(workflowId, version)
      if (workflow) {
        // Update local list
        const workflows = get().workflows.map(w =>
          w.id === workflowId ? workflow.meta : w
        )
        set({ workflows, activeWorkflow: workflow, isSaving: false })
      }
      return workflow
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to revert version',
        isSaving: false,
      })
      return null
    }
  },

  getVersionHistory: async (workflowId) => {
    try {
      return await workflowStorage.getVersionHistory(workflowId)
    } catch {
      return []
    }
  },

  exportWorkflow: async (id) => {
    try {
      return await workflowStorage.exportWorkflow(id)
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to export workflow',
      })
      return null
    }
  },

  importWorkflow: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const result = await workflowStorage.importWorkflow(data)
      if (result.success) {
        await get().loadWorkflowList()
      }
      set({ isLoading: false })
      return result
    } catch (error) {
      set({ isLoading: false })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Import failed',
      }
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setFilterTags: (tags) => set({ filterTags: tags }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSortOrder: (order) => set({ sortOrder: order }),
  clearError: () => set({ error: null }),

  getFilteredWorkflows: () => {
    const { workflows, searchQuery, filterTags, sortBy, sortOrder } = get()

    let filtered = workflows

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        w =>
          w.name.toLowerCase().includes(query) ||
          w.description.toLowerCase().includes(query)
      )
    }

    // Tag filter
    if (filterTags.length > 0) {
      filtered = filtered.filter(w =>
        filterTags.some(tag => w.tags.includes(tag))
      )
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'updatedAt':
          comparison = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          break
        case 'createdAt':
          comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  },

  getAllTags: () => {
    const { workflows } = get()
    const tagSet = new Set<string>()
    workflows.forEach(w => w.tags.forEach((tag: string) => tagSet.add(tag)))
    return Array.from(tagSet).sort()
  },
}))
