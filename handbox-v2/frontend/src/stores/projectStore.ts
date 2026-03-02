/**
 * Project store — manages workspace/project state with Tauri backend integration.
 */

import { create } from 'zustand'
import { safeInvoke } from '@/utils/tauri'

export interface ProjectSummary {
  id: string
  name: string
  description?: string
  created_at?: string
  updated_at?: string
}

interface ProjectState {
  /** Currently active project (null = global/no project). */
  activeProject: ProjectSummary | null

  /** All known projects. */
  projects: ProjectSummary[]

  /** Loading state */
  loading: boolean

  /** Actions */
  fetchProjects: () => Promise<void>
  createProject: (name: string, description?: string) => Promise<ProjectSummary | null>
  deleteProject: (id: string) => Promise<void>
  setActiveProject: (project: ProjectSummary | null) => void
  clearActiveProject: () => void
}

// Persist active project ID to localStorage
const ACTIVE_PROJECT_KEY = 'handbox_active_project_id'

export const useProjectStore = create<ProjectState>()((set, get) => ({
  activeProject: null,
  projects: [],
  loading: false,

  fetchProjects: async () => {
    set({ loading: true })
    try {
      const result = await safeInvoke<ProjectSummary[]>('list_projects')
      if (result) {
        set({ projects: result })

        // Restore active project from localStorage
        const savedId = localStorage.getItem(ACTIVE_PROJECT_KEY)
        if (savedId && !get().activeProject) {
          const match = result.find(p => p.id === savedId)
          if (match) {
            set({ activeProject: match })
          } else {
            localStorage.removeItem(ACTIVE_PROJECT_KEY)
          }
        }
      }
    } catch (e) {
      console.warn('[projectStore] Failed to fetch projects:', e)
    } finally {
      set({ loading: false })
    }
  },

  createProject: async (name, description) => {
    try {
      const result = await safeInvoke<ProjectSummary>('create_project', { name, description })
      if (result) {
        set(s => ({ projects: [result, ...s.projects] }))
        return result
      }
    } catch (e) {
      console.error('[projectStore] Failed to create project:', e)
    }
    return null
  },

  deleteProject: async (id) => {
    try {
      await safeInvoke('delete_project', { id })
      set(s => ({
        projects: s.projects.filter(p => p.id !== id),
        activeProject: s.activeProject?.id === id ? null : s.activeProject,
      }))
      if (localStorage.getItem(ACTIVE_PROJECT_KEY) === id) {
        localStorage.removeItem(ACTIVE_PROJECT_KEY)
      }
    } catch (e) {
      console.error('[projectStore] Failed to delete project:', e)
    }
  },

  setActiveProject: (project) => {
    set({ activeProject: project })
    if (project) {
      localStorage.setItem(ACTIVE_PROJECT_KEY, project.id)
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_KEY)
    }
  },

  clearActiveProject: () => {
    set({ activeProject: null })
    localStorage.removeItem(ACTIVE_PROJECT_KEY)
  },
}))
