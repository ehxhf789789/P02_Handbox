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

/** Edge execution state for data flow visualization */
export type EdgeFlowStatus = 'idle' | 'active' | 'completed' | 'failed'

interface ExecutionState {
  /** Current execution (null if idle). */
  currentExecution: ExecutionRecord | null

  /** Per-node execution status. */
  nodeStatuses: Record<string, ExecutionStatus>

  /** Per-node execution details (error, input, output). */
  nodeDetails: Record<string, NodeExecutionDetail>

  /** Per-edge flow status for data flow visualization. */
  edgeFlowStatuses: Record<string, EdgeFlowStatus>

  /** Collected spans from the current execution. */
  spans: NodeSpan[]

  /** Whether an execution is in progress. */
  isRunning: boolean

  /** Currently selected node ID for inspection */
  selectedNodeId: string | null

  /** Node ID currently being highlighted by agent tool call */
  agentHighlightNodeId: string | null

  /** Actions */
  startExecution: (record: ExecutionRecord) => void
  updateNodeStatus: (nodeId: string, status: ExecutionStatus) => void
  updateNodeDetail: (nodeId: string, detail: Partial<NodeExecutionDetail>) => void
  updateEdgeFlowStatus: (edgeId: string, status: EdgeFlowStatus) => void
  setAgentHighlightNode: (nodeId: string | null) => void
  addSpan: (span: NodeSpan) => void
  completeExecution: (record: ExecutionRecord) => void
  selectNode: (nodeId: string | null) => void
  reset: () => void
}

export const useExecutionStore = create<ExecutionState>()((set) => ({
  currentExecution: null,
  nodeStatuses: {},
  nodeDetails: {},
  edgeFlowStatuses: {},
  spans: [],
  isRunning: false,
  selectedNodeId: null,
  agentHighlightNodeId: null,

  startExecution: (record) =>
    set({
      currentExecution: record,
      nodeStatuses: {},
      nodeDetails: {},
      edgeFlowStatuses: {},
      spans: [],
      isRunning: true,
      selectedNodeId: null,
      agentHighlightNodeId: null,
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

  updateEdgeFlowStatus: (edgeId, status) =>
    set((state) => ({
      edgeFlowStatuses: { ...state.edgeFlowStatuses, [edgeId]: status },
    })),

  setAgentHighlightNode: (nodeId) =>
    set({ agentHighlightNodeId: nodeId }),

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
      edgeFlowStatuses: {},
      spans: [],
      isRunning: false,
      selectedNodeId: null,
      agentHighlightNodeId: null,
    }),
}))
