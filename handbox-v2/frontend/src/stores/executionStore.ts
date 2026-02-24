/**
 * Execution store — tracks workflow execution state.
 */

import { create } from 'zustand'
import type { ExecutionRecord, ExecutionStatus, NodeSpan } from '@/types/trace'

interface ExecutionState {
  /** Current execution (null if idle). */
  currentExecution: ExecutionRecord | null

  /** Per-node execution status. */
  nodeStatuses: Record<string, ExecutionStatus>

  /** Collected spans from the current execution. */
  spans: NodeSpan[]

  /** Whether an execution is in progress. */
  isRunning: boolean

  /** Actions */
  startExecution: (record: ExecutionRecord) => void
  updateNodeStatus: (nodeId: string, status: ExecutionStatus) => void
  addSpan: (span: NodeSpan) => void
  completeExecution: (record: ExecutionRecord) => void
  reset: () => void
}

export const useExecutionStore = create<ExecutionState>()((set) => ({
  currentExecution: null,
  nodeStatuses: {},
  spans: [],
  isRunning: false,

  startExecution: (record) =>
    set({
      currentExecution: record,
      nodeStatuses: {},
      spans: [],
      isRunning: true,
    }),

  updateNodeStatus: (nodeId, status) =>
    set((state) => ({
      nodeStatuses: { ...state.nodeStatuses, [nodeId]: status },
    })),

  addSpan: (span) =>
    set((state) => ({
      spans: [...state.spans, span],
    })),

  completeExecution: (record) =>
    set({
      currentExecution: record,
      isRunning: false,
    }),

  reset: () =>
    set({
      currentExecution: null,
      nodeStatuses: {},
      spans: [],
      isRunning: false,
    }),
}))
