/**
 * canvasExecutor — programmatic workflow execution from agent context.
 * Converts the current canvas state into a workflow, imports it to the backend,
 * and triggers execution. Used by AgentCanvasBridge when the agent calls workflow_execute.
 */

import { useWorkflowStore } from '@/stores/workflowStore'
import { useExecutionStore } from '@/stores/executionStore'
import type { ExecutionStatus } from '@/types/trace'

interface TauriApis {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
}

async function getTauriApis(): Promise<TauriApis | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return { invoke }
  } catch {
    return null
  }
}

interface ExecutionResult {
  execution_id: string
  started_at: string
  completed_at: string | null
  status: ExecutionStatus
  total_nodes: number
  completed_nodes: number
  failed_nodes: number
}

/**
 * Execute the current canvas workflow programmatically.
 * This is called when the agent emits a workflow-execute-request event.
 */
export async function executeCanvasWorkflow(): Promise<void> {
  const store = useWorkflowStore.getState()
  const execStore = useExecutionStore.getState()
  const { nodes } = store

  if (nodes.length === 0) {
    console.warn('[canvasExecutor] No nodes on canvas to execute')
    return
  }

  if (execStore.isRunning) {
    console.warn('[canvasExecutor] Execution already in progress')
    return
  }

  const execId = crypto.randomUUID()
  const wfId = crypto.randomUUID()

  // Start execution in UI
  execStore.startExecution({
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

  // Mark all nodes as pending
  for (const node of nodes) {
    execStore.updateNodeStatus(node.id, 'pending')
  }

  const tauriApis = await getTauriApis()
  if (!tauriApis) {
    console.warn('[canvasExecutor] Not in Tauri environment')
    return
  }

  try {
    // Convert canvas to JSON and import to backend
    const workflowJson = store.getWorkflowJson()
    const imported = await tauriApis.invoke<{ id: string }>('import_workflow', {
      json: workflowJson,
    })

    // Execute the imported workflow
    const result = await tauriApis.invoke<ExecutionResult>('execute_workflow', {
      workflowId: imported.id,
    })

    execStore.completeExecution({
      execution_id: execId,
      workflow_id: imported.id,
      started_at: result.started_at,
      completed_at: result.completed_at || new Date().toISOString(),
      status: result.status,
      total_nodes: result.total_nodes,
      completed_nodes: result.completed_nodes,
      failed_nodes: result.failed_nodes,
      cache_hits: 0,
    })
  } catch (error) {
    console.error('[canvasExecutor] Execution failed:', error)
    for (const node of nodes) {
      execStore.updateNodeStatus(node.id, 'failed')
    }
    execStore.completeExecution({
      execution_id: execId,
      workflow_id: wfId,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: 'failed',
      total_nodes: nodes.length,
      completed_nodes: 0,
      failed_nodes: nodes.length,
      cache_hits: 0,
    })
  }
}
