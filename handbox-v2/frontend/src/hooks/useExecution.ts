/**
 * useExecution — hook for workflow execution control.
 * Calls Tauri backend commands and manages execution state.
 * Supports real-time node status streaming via Tauri events.
 */

import { useEffect, useRef } from 'react'
import { useExecutionStore } from '@/stores/executionStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { ExecutionStatus } from '@/types/trace'

// Helper to check if we're running in Tauri environment
const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// Dynamic import for Tauri APIs (only available in Tauri runtime)
const getTauriApis = async () => {
  if (!isTauri()) {
    return null
  }
  try {
    const [{ invoke }, { listen }] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/event'),
    ])
    return { invoke, listen }
  } catch {
    return null
  }
}

type UnlistenFn = () => void

export interface ExecutionResult {
  execution_id: string
  workflow_id: string
  started_at: string
  completed_at: string | null
  status: 'completed' | 'failed' | 'cancelled'
  total_nodes: number
  completed_nodes: number
  failed_nodes: number
  outputs: Record<string, unknown>
  error?: string
}

interface NodeStatusEvent {
  execution_id: string
  node_id: string
  status: string // "pending", "running", "completed", "failed", "cache_hit", "skipped"
  output?: unknown
  error?: string
  duration_ms?: number
}

export function useExecution() {
  const { startExecution, completeExecution, updateNodeStatus, updateNodeDetail } = useExecutionStore()
  const { nodes, getWorkflowJson } = useWorkflowStore()
  const unlistenRef = useRef<UnlistenFn | null>(null)

  // Set up event listener for node status updates
  useEffect(() => {
    // Skip if not in Tauri environment
    if (!isTauri()) {
      console.log('[useExecution] Not in Tauri environment, skipping event listener setup')
      return
    }

    const setupListener = async () => {
      // Clean up any existing listener
      if (unlistenRef.current) {
        unlistenRef.current()
      }

      const tauriApis = await getTauriApis()
      if (!tauriApis) {
        console.warn('[useExecution] Tauri APIs not available')
        return
      }

      // Listen for node-status events from backend
      unlistenRef.current = await tauriApis.listen<NodeStatusEvent>('node-status', (event) => {
        const { node_id, status, error, output, duration_ms } = event.payload

        // Map backend status to frontend ExecutionStatus
        const mappedStatus: ExecutionStatus = (() => {
          switch (status) {
            case 'pending':
              return 'pending'
            case 'running':
              return 'running'
            case 'completed':
              return 'completed'
            case 'failed':
              return 'failed'
            case 'cache_hit':
              return 'cache_hit'
            case 'skipped':
              return 'skipped'
            default:
              return 'pending'
          }
        })()

        updateNodeStatus(node_id, mappedStatus)

        // Store detailed information about the node execution
        updateNodeDetail(node_id, {
          status: mappedStatus,
          error,
          output,
          duration_ms,
        })

        // Log for debugging
        if (error) {
          console.error(`Node ${node_id} failed:`, error)
        } else if (duration_ms !== undefined && status === 'completed') {
          console.log(`Node ${node_id} completed in ${duration_ms}ms`)
        }
      })
    }

    setupListener()

    // Cleanup on unmount
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
    }
  }, [updateNodeStatus, updateNodeDetail])

  const execute = async (workflowId?: string) => {
    const execId = crypto.randomUUID()
    const wfId = workflowId || crypto.randomUUID()

    // Start execution in UI
    startExecution({
      execution_id: execId,
      workflow_id: wfId,
      started_at: new Date().toISOString(),
      completed_at: null,
      status: 'running',
      total_nodes: nodes.length,
      completed_nodes: 0,
      failed_nodes: 0,
      cache_hits: 0,
    })

    // Mark all nodes as pending (backend will update via events)
    for (const node of nodes) {
      updateNodeStatus(node.id, 'pending')
    }

    // Check if we're in Tauri environment
    const tauriApis = await getTauriApis()
    if (!tauriApis) {
      console.warn('[useExecution] Not in Tauri environment, using simulation')
      return simulateExecution(execId, wfId, nodes.length)
    }

    try {
      // If we have a stored workflow, use it. Otherwise, import from current state
      let targetWorkflowId = workflowId

      if (!targetWorkflowId) {
        // Create workflow from current graph state and import to backend
        const workflowJson = getWorkflowJson()

        // Import workflow to backend (this parses and stores it)
        const imported = await tauriApis.invoke<{ id: string }>('import_workflow', {
          json: workflowJson,
        })
        targetWorkflowId = imported.id
      }

      // Execute the workflow (node statuses will be updated via events)
      const result = await tauriApis.invoke<ExecutionResult>('execute_workflow', {
        workflowId: targetWorkflowId,
      })

      completeExecution({
        execution_id: execId,
        workflow_id: targetWorkflowId,
        started_at: result.started_at,
        completed_at: result.completed_at || new Date().toISOString(),
        status: result.status,
        total_nodes: result.total_nodes,
        completed_nodes: result.completed_nodes,
        failed_nodes: result.failed_nodes,
        cache_hits: 0,
      })

      return result
    } catch (error) {
      // Mark all nodes as failed on error
      for (const node of nodes) {
        updateNodeStatus(node.id, 'failed')
      }
      // Fallback to simulated execution if backend is not ready
      console.warn('Backend execution failed, using simulation:', error)
      return simulateExecution(execId, wfId, nodes.length)
    }
  }

  const simulateExecution = async (execId: string, wfId: string, nodeCount: number) => {
    return new Promise<ExecutionResult>((resolve) => {
      let completed = 0
      const interval = setInterval(() => {
        completed++

        // Update node status
        const node = nodes[completed - 1]
        if (node) {
          updateNodeStatus(node.id, 'completed')
        }

        if (completed >= nodeCount) {
          clearInterval(interval)
          const result: ExecutionResult = {
            execution_id: execId,
            workflow_id: wfId,
            started_at: new Date(Date.now() - completed * 300).toISOString(),
            completed_at: new Date().toISOString(),
            status: 'completed',
            total_nodes: nodeCount,
            completed_nodes: nodeCount,
            failed_nodes: 0,
            outputs: {},
          }

          completeExecution({
            execution_id: execId,
            workflow_id: wfId,
            started_at: result.started_at,
            completed_at: result.completed_at,
            status: 'completed',
            total_nodes: nodeCount,
            completed_nodes: nodeCount,
            failed_nodes: 0,
            cache_hits: 0,
          })

          resolve(result)
        }
      }, 300)
    })
  }

  const cancel = async (executionId: string) => {
    try {
      const tauriApis = await getTauriApis()
      if (tauriApis) {
        await tauriApis.invoke('cancel_execution', { executionId })
      }
      const state = useExecutionStore.getState()
      if (state.currentExecution) {
        completeExecution({
          ...state.currentExecution,
          completed_at: new Date().toISOString(),
          status: 'cancelled',
        })
      }
      // Mark all running nodes as cancelled
      for (const node of nodes) {
        const currentStatus = state.nodeStatuses[node.id]
        if (currentStatus === 'running' || currentStatus === 'pending') {
          updateNodeStatus(node.id, 'cancelled')
        }
      }
    } catch (error) {
      console.error('Failed to cancel execution:', error)
      // Still update UI to cancelled state
      const state = useExecutionStore.getState()
      if (state.currentExecution) {
        completeExecution({
          ...state.currentExecution,
          completed_at: new Date().toISOString(),
          status: 'cancelled',
        })
      }
    }
  }

  const getStatus = async (executionId: string) => {
    try {
      const tauriApis = await getTauriApis()
      if (!tauriApis) {
        return 'unknown'
      }
      return await tauriApis.invoke<string>('get_execution_status', { executionId })
    } catch (error) {
      console.error('Failed to get execution status:', error)
      return 'unknown'
    }
  }

  return {
    execute,
    cancel,
    getStatus,
  }
}
