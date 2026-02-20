import { create } from 'zustand'

/** 호환 노드 방향: 'input' = 왼쪽 핸들, 'output' = 오른쪽 핸들, 'both' = 양쪽 */
export type CompatibleSide = 'input' | 'output' | 'both'

interface DragState {
  isDragging: boolean
  dragData: {
    type: string
    label: string
    color: string
    description: string
    provider: string
    useCase: string
  } | null
  mousePosition: { x: number; y: number }

  /** 드래그 중 호환 가능한 캔버스 노드들 (nodeId → side) */
  compatibleNodes: Map<string, CompatibleSide>

  // Actions
  startDrag: (data: DragState['dragData']) => void
  updatePosition: (x: number, y: number) => void
  endDrag: () => void
  setCompatibleNodes: (nodes: Map<string, CompatibleSide>) => void
  clearCompatibleNodes: () => void
}

export const useDragStore = create<DragState>((set) => ({
  isDragging: false,
  dragData: null,
  mousePosition: { x: 0, y: 0 },
  compatibleNodes: new Map(),

  startDrag: (data) => set({ isDragging: true, dragData: data }),

  updatePosition: (x, y) => set({ mousePosition: { x, y } }),

  endDrag: () => set({
    isDragging: false,
    dragData: null,
    compatibleNodes: new Map(),
  }),

  setCompatibleNodes: (nodes) => set({ compatibleNodes: nodes }),

  clearCompatibleNodes: () => set({ compatibleNodes: new Map() }),
}))
