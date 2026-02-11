/**
 * Execution Store — 워크플로우 실행 상태 관리
 *
 * workflowStore.ts에서 실행 관련 로직을 분리.
 * ExecutionEngine.executeWorkflow()를 사용하여 노드를 실행하고,
 * 실행 상태/결과를 관리한다.
 */

import { create } from 'zustand'
import type { Node, Edge } from 'reactflow'
import type { NodeExecutionStatus, NodeExecutionResult } from '../engine/types'
import { executeWorkflow } from '../engine/ExecutionEngine'

export interface ExecutionState {
  /** 각 노드의 실행 결과 */
  nodeExecutionResults: Record<string, NodeExecutionResult>
  /** 워크플로우 실행 중 여부 */
  isWorkflowRunning: boolean
  /** 현재 실행의 AbortController */
  abortController: AbortController | null
  /** 중단점 노드 ID */
  breakpointNodeId: string | null

  // Actions
  setNodeExecutionStatus: (
    nodeId: string,
    status: NodeExecutionStatus,
    output?: Record<string, any>,
    error?: string,
  ) => void
  getNodeExecutionResult: (nodeId: string) => NodeExecutionResult | undefined
  clearAllExecutionResults: () => void

  /** 새 엔진으로 워크플로우 실행 */
  runWorkflow: (nodes: Node[], edges: Edge[]) => Promise<void>
  /** 중단점까지 실행 */
  runUntilBreakpoint: (nodes: Node[], edges: Edge[]) => Promise<void>
  /** 실행 중단 */
  abortExecution: () => void

  // Breakpoint
  setBreakpoint: (nodeId: string | null) => void
  toggleBreakpoint: (nodeId: string) => void
  clearBreakpoint: () => void
}

export const useExecutionStore = create<ExecutionState>((set, get) => ({
  nodeExecutionResults: {},
  isWorkflowRunning: false,
  abortController: null,
  breakpointNodeId: null,

  setNodeExecutionStatus: (nodeId, status, output, error) => {
    const state = get()
    const currentResult = state.nodeExecutionResults[nodeId] || {}
    const now = Date.now()

    const newResult: NodeExecutionResult = {
      ...currentResult,
      status,
      output: output !== undefined ? output : currentResult.output,
      error: error !== undefined ? error : currentResult.error,
    }

    if (status === 'running') {
      newResult.startTime = now
      newResult.endTime = undefined
      newResult.duration = undefined
    } else if (status === 'completed' || status === 'error') {
      newResult.endTime = now
      if (newResult.startTime) {
        newResult.duration = now - newResult.startTime
      }
    }

    set({
      nodeExecutionResults: {
        ...state.nodeExecutionResults,
        [nodeId]: newResult,
      },
    })
  },

  getNodeExecutionResult: (nodeId) => {
    return get().nodeExecutionResults[nodeId]
  },

  clearAllExecutionResults: () => {
    set({ nodeExecutionResults: {}, isWorkflowRunning: false })
  },

  runWorkflow: async (nodes, edges) => {
    const abortController = new AbortController()
    get().clearAllExecutionResults()
    set({ isWorkflowRunning: true, abortController })

    const onNodeStatusChange = (
      nodeId: string,
      status: NodeExecutionStatus,
      output?: Record<string, any>,
      error?: string,
    ) => {
      get().setNodeExecutionStatus(nodeId, status, output, error)
    }

    try {
      await executeWorkflow({
        nodes,
        edges,
        onNodeStatusChange,
        onComplete: () => {
          set({ isWorkflowRunning: false, abortController: null })
        },
        abortController,
      })
    } catch (error) {
      console.error('[ExecutionStore] Workflow failed:', error)
    } finally {
      set({ isWorkflowRunning: false, abortController: null })
    }
  },

  runUntilBreakpoint: async (nodes, edges) => {
    const state = get()
    const abortController = new AbortController()
    state.clearAllExecutionResults()
    set({ isWorkflowRunning: true, abortController })

    const onNodeStatusChange = (
      nodeId: string,
      status: NodeExecutionStatus,
      output?: Record<string, any>,
      error?: string,
    ) => {
      get().setNodeExecutionStatus(nodeId, status, output, error)
    }

    try {
      await executeWorkflow({
        nodes,
        edges,
        onNodeStatusChange,
        onComplete: () => {
          set({ isWorkflowRunning: false, abortController: null })
        },
        breakpointNodeId: state.breakpointNodeId,
        abortController,
      })
    } catch (error) {
      console.error('[ExecutionStore] Workflow failed:', error)
    } finally {
      set({ isWorkflowRunning: false, abortController: null })
    }
  },

  abortExecution: () => {
    const { abortController } = get()
    if (abortController) {
      abortController.abort()
    }
    set({ isWorkflowRunning: false, abortController: null })
  },

  setBreakpoint: (nodeId) => set({ breakpointNodeId: nodeId }),
  toggleBreakpoint: (nodeId) => {
    const current = get().breakpointNodeId
    set({ breakpointNodeId: current === nodeId ? null : nodeId })
  },
  clearBreakpoint: () => set({ breakpointNodeId: null }),
}))
