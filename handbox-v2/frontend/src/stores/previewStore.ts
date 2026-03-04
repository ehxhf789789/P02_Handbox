import { create } from 'zustand'
import type { PreviewPayload } from '@/types/preview'

interface PreviewState {
  fullscreenNodeId: string | null
  expandedNodes: Set<string>
  previewCache: Map<string, PreviewPayload>

  openFullscreen: (nodeId: string) => void
  closeFullscreen: () => void
  toggleExpand: (nodeId: string) => void
  cachePreview: (nodeId: string, payload: PreviewPayload) => void
  clearCache: () => void
}

export const usePreviewStore = create<PreviewState>((set, get) => ({
  fullscreenNodeId: null,
  expandedNodes: new Set<string>(),
  previewCache: new Map<string, PreviewPayload>(),

  openFullscreen: (nodeId) => set({ fullscreenNodeId: nodeId }),
  closeFullscreen: () => set({ fullscreenNodeId: null }),

  toggleExpand: (nodeId) => {
    const expanded = new Set(get().expandedNodes)
    if (expanded.has(nodeId)) {
      expanded.delete(nodeId)
    } else {
      expanded.add(nodeId)
    }
    set({ expandedNodes: expanded })
  },

  cachePreview: (nodeId, payload) => {
    const cache = new Map(get().previewCache)
    cache.set(nodeId, payload)
    set({ previewCache: cache })
  },

  clearCache: () => set({ previewCache: new Map() }),
}))
