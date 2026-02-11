import { create } from 'zustand'

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

  // Actions
  startDrag: (data: DragState['dragData']) => void
  updatePosition: (x: number, y: number) => void
  endDrag: () => void
}

export const useDragStore = create<DragState>((set) => ({
  isDragging: false,
  dragData: null,
  mousePosition: { x: 0, y: 0 },

  startDrag: (data) => set({ isDragging: true, dragData: data }),

  updatePosition: (x, y) => set({ mousePosition: { x, y } }),

  endDrag: () => set({ isDragging: false, dragData: null }),
}))
