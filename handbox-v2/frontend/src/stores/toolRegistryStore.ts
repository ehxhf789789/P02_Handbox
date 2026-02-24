/**
 * Tool registry store — client-side cache of available tools.
 */

import { create } from 'zustand'
import type { ToolInterface } from '@/types/tool'

interface ToolRegistryState {
  /** All registered tools. */
  tools: ToolInterface[]

  /** Loading state. */
  isLoading: boolean

  /** Actions */
  setTools: (tools: ToolInterface[]) => void
  setLoading: (loading: boolean) => void
  getToolById: (toolId: string) => ToolInterface | undefined
}

export const useToolRegistryStore = create<ToolRegistryState>()((set, get) => ({
  tools: [],
  isLoading: false,

  setTools: (tools) => set({ tools }),
  setLoading: (loading) => set({ isLoading: loading }),
  getToolById: (toolId) => get().tools.find((t) => t.tool_id === toolId),
}))
