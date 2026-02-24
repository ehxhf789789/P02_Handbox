/**
 * Project store — manages workspace/project state.
 */

import { create } from 'zustand'

interface ProjectSummary {
  id: string
  name: string
  description?: string
  root_path: string
}

interface ProjectState {
  /** Currently active project. */
  activeProject: ProjectSummary | null

  /** All known projects. */
  projects: ProjectSummary[]

  /** Actions */
  setActiveProject: (project: ProjectSummary) => void
  setProjects: (projects: ProjectSummary[]) => void
  clearActiveProject: () => void
}

export const useProjectStore = create<ProjectState>()((set) => ({
  activeProject: null,
  projects: [],

  setActiveProject: (project) => set({ activeProject: project }),
  setProjects: (projects) => set({ projects }),
  clearActiveProject: () => set({ activeProject: null }),
}))
