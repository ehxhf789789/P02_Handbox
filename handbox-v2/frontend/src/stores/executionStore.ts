/**
 * Execution store — tracks workflow execution state.
 */

import { create } from 'zustand'
import type { ExecutionRecord, ExecutionStatus, NodeSpan } from '@/types/trace'

/** Details tracked per node during execution */
export interface NodeExecutionDetail {
  status: ExecutionStatus
  error?: string
  input?: unknown
  output?: unknown
  duration_ms?: number
}

interface ExecutionState {
  /** Current execution (null if idle). */
  currentExecution: ExecutionRecord | null

  /** Per-node execution status. */
  nodeStatuses: Record<string, ExecutionStatus>

  /** Per-node execution details (error, input, output). */
  nodeDetails: Record<string, NodeExecutionDetail>

  /** Collected spans from the current execution. */
  spans: NodeSpan[]

  /** Whether an execution is in progress. */
  isRunning: boolean

  /** Currently selected node ID for inspection */
  selectedNodeId: string | null

  /** Actions */
  startExecution: (record: ExecutionRecord) => void
  updateNodeStatus: (nodeId: string, status: ExecutionStatus) => void
  updateNodeDetail: (nodeId: string, detail: Partial<NodeExecutionDetail>) => void
  addSpan: (span: NodeSpan) => void
  completeExecution: (record: ExecutionRecord) => void
  selectNode: (nodeId: string | null) => void
  reset: () => void
}

export const useExecutionStore = create<ExecutionState>()((set) => ({
  currentExecution: null,
  nodeStatuses: {},
  nodeDetails: {},
  spans: [],
  isRunning: false,
  selectedNodeId: null,

  startExecution: (record) =>
    set({
      currentExecution: record,
      nodeStatuses: {},
      nodeDetails: {},
      spans: [],
      isRunning: true,
      selectedNodeId: null,
    }),

  updateNodeStatus: (nodeId, status) =>
    set((state) => ({
      nodeStatuses: { ...state.nodeStatuses, [nodeId]: status },
    })),

  updateNodeDetail: (nodeId, detail) =>
    set((state) => {
      const existing = state.nodeDetails[nodeId] || { status: 'pending' as ExecutionStatus }
      return {
        nodeDetails: {
          ...state.nodeDetails,
          [nodeId]: {
            ...existing,
            ...detail,
          } as NodeExecutionDetail,
        },
      }
    }),

  addSpan: (span) =>
    set((state) => ({
      spans: [...state.spans, span],
    })),

  completeExecution: (record) =>
    set({
      currentExecution: record,
      isRunning: false,
    }),

  selectNode: (nodeId) =>
    set({ selectedNodeId: nodeId }),

  reset: () =>
    set({
      currentExecution: null,
      nodeStatuses: {},
      nodeDetails: {},
      spans: [],
      isRunning: false,
      selectedNodeId: null,
    }),
}))
