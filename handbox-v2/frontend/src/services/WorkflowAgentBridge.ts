/**
 * WorkflowAgentBridge — Connects workflow execution with multi-agent orchestration.
 *
 * Features:
 * - Convert workflow nodes to agent tasks
 * - Distribute workflow execution across agents
 * - Handle agent results back to workflow
 * - Support parallel and sequential execution
 */

import type { Node, Edge } from '@xyflow/react'
import type { NodeData } from '@/stores/workflowStore'
import type {
  AgentTask,
  TaskResult,
  NodeTaskPayload,
} from '@/types/agent'
import type { ExecutionRecord, ExecutionStatus } from '@/types/trace'
import { orchestrator } from './AgentOrchestrator'
import { useExecutionStore } from '@/stores/executionStore'

/** Workflow execution options */
interface WorkflowExecutionOptions {
  parallel?: boolean
  useAgentCache?: boolean
  preferredAgentId?: string
  timeout?: number
}

/**
 * Execute a workflow using the agent orchestration system
 */
export async function executeWorkflowWithAgents(
  _workflowId: string,
  nodes: Node<NodeData>[],
  edges: Edge[],
  inputs: Record<string, unknown>,
  options: WorkflowExecutionOptions = {}
): Promise<{
  success: boolean
  outputs: Record<string, unknown>
  taskResults: Map<string, TaskResult>
}> {
  const { updateNodeStatus, updateNodeDetail, startExecution, completeExecution } = useExecutionStore.getState()

  // Build execution order
  const executionOrder = buildExecutionOrder(nodes, edges)
  const taskResults = new Map<string, TaskResult>()
  const nodeOutputs: Record<string, unknown> = {}

  // Start execution tracking
  const executionRecord: ExecutionRecord = {
    execution_id: crypto.randomUUID(),
    workflow_id: _workflowId,
    started_at: new Date().toISOString(),
    completed_at: null,
    status: 'running',
    total_nodes: nodes.length,
    completed_nodes: 0,
    failed_nodes: 0,
    cache_hits: 0,
  }
  startExecution(executionRecord)

  try {
    if (options.parallel) {
      // Execute all nodes in parallel where possible
      const layers = buildParallelLayers(executionOrder, edges)

      for (const layer of layers) {
        const layerTasks = layer.map(nodeId => {
          const node = nodes.find(n => n.id === nodeId)
          if (!node) return null

          return createNodeTask(node, nodeOutputs, inputs, options)
        }).filter((t): t is AgentTask => t !== null)

        // Execute layer in parallel
        const results = await Promise.all(
          layerTasks.map(task => executeAgentTask(task, updateNodeStatus, updateNodeDetail))
        )

        // Collect results
        results.forEach((result, index) => {
          const nodeId = layer[index]
          if (nodeId) {
            taskResults.set(nodeId, result)
            if (result.success) {
              nodeOutputs[nodeId] = result.output
            }
          }
        })

        // Check for failures
        if (results.some(r => !r.success)) {
          // Continue or stop based on configuration
          const failedNodes = results
            .map((r, i) => ({ result: r, nodeId: layer[i] }))
            .filter(({ result }) => !result.success)

          console.warn('Some nodes failed:', failedNodes)
        }
      }
    } else {
      // Sequential execution
      for (const nodeId of executionOrder) {
        const node = nodes.find(n => n.id === nodeId)
        if (!node) continue

        const task = createNodeTask(node, nodeOutputs, inputs, options)
        const result = await executeAgentTask(task, updateNodeStatus, updateNodeDetail)

        taskResults.set(nodeId, result)

        if (result.success) {
          nodeOutputs[nodeId] = result.output
        } else {
          // Stop on failure in sequential mode
          break
        }
      }
    }

    const allSuccess = Array.from(taskResults.values()).every(r => r.success)

    const completedRecord: ExecutionRecord = {
      ...executionRecord,
      completed_at: new Date().toISOString(),
      status: allSuccess ? 'completed' : 'failed',
      completed_nodes: Array.from(taskResults.values()).filter(r => r.success).length,
      failed_nodes: Array.from(taskResults.values()).filter(r => !r.success).length,
    }
    completeExecution(completedRecord)

    return {
      success: allSuccess,
      outputs: nodeOutputs,
      taskResults,
    }
  } catch (error) {
    const errorRecord: ExecutionRecord = {
      ...executionRecord,
      completed_at: new Date().toISOString(),
      status: 'failed',
    }
    completeExecution(errorRecord)

    return {
      success: false,
      outputs: nodeOutputs,
      taskResults,
    }
  }
}

/**
 * Create an agent task from a workflow node
 */
function createNodeTask(
  node: Node<NodeData>,
  previousOutputs: Record<string, unknown>,
  workflowInputs: Record<string, unknown>,
  options: WorkflowExecutionOptions
): AgentTask {
  const nodeData = node.data as NodeData

  // Resolve inputs from previous outputs and workflow inputs
  const resolvedInputs = resolveNodeInputs(nodeData, previousOutputs, workflowInputs)

  const payload: NodeTaskPayload = {
    type: 'node',
    nodeId: node.id,
    toolRef: nodeData.toolRef,
    inputs: resolvedInputs,
    config: nodeData.config || {},
  }

  return orchestrator.createTask('node', payload, {
    priority: 5,
    timeout: options.timeout ?? 60000,
    maxRetries: 3,
  })
}

/**
 * Execute an agent task and wait for result
 */
async function executeAgentTask(
  task: AgentTask,
  updateNodeStatus: (nodeId: string, status: ExecutionStatus) => void,
  updateNodeDetail: (nodeId: string, detail: { output?: unknown; error?: string }) => void
): Promise<TaskResult> {
  const nodeId = (task.payload as NodeTaskPayload).nodeId

  return new Promise((resolve) => {
    // Update node status
    updateNodeStatus(nodeId, 'running')

    // Poll for task completion
    const checkInterval = setInterval(() => {
      const currentTask = orchestrator.getTask(task.id)

      if (!currentTask) {
        clearInterval(checkInterval)
        resolve({
          success: false,
          error: 'Task not found',
          metrics: { executionTime: 0 },
        })
        return
      }

      if (currentTask.status === 'completed' || currentTask.status === 'failed') {
        clearInterval(checkInterval)

        const result = currentTask.result ?? {
          success: currentTask.status === 'completed',
          error: currentTask.status === 'failed' ? 'Task failed' : undefined,
          metrics: { executionTime: 0 },
        }

        // Update node status
        updateNodeStatus(nodeId, result.success ? 'completed' : 'failed')
        updateNodeDetail(nodeId, {
          output: result.output,
          error: result.error,
        })

        resolve(result)
      }
    }, 100)

    // Timeout fallback
    setTimeout(() => {
      clearInterval(checkInterval)
      updateNodeStatus(nodeId, 'failed')
      resolve({
        success: false,
        error: 'Task timeout',
        metrics: { executionTime: task.timeout },
      })
    }, task.timeout + 1000)
  })
}

/**
 * Resolve node inputs from previous outputs and workflow inputs
 */
function resolveNodeInputs(
  nodeData: NodeData,
  previousOutputs: Record<string, unknown>,
  workflowInputs: Record<string, unknown>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}

  // Copy direct inputs from node config
  if (nodeData.config) {
    Object.assign(resolved, nodeData.config)
  }

  // Resolve references to previous node outputs
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string' && value.startsWith('$')) {
      const ref = value.slice(1)

      // Check workflow inputs first
      if (ref in workflowInputs) {
        resolved[key] = workflowInputs[ref]
      }
      // Then check previous outputs
      else if (ref in previousOutputs) {
        resolved[key] = previousOutputs[ref]
      }
      // Handle node.output pattern
      else if (ref.includes('.')) {
        const parts = ref.split('.')
        const refNodeId = parts[0]
        const path = parts[1]
        if (refNodeId && path) {
          const output = previousOutputs[refNodeId]
          if (output && typeof output === 'object') {
            resolved[key] = (output as Record<string, unknown>)[path]
          }
        }
      }
    }
  }

  return resolved
}

/**
 * Build topological execution order
 */
function buildExecutionOrder(nodes: Node<NodeData>[], edges: Edge[]): string[] {
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  // Initialize
  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  // Build graph
  for (const edge of edges) {
    const targets = adjacency.get(edge.source) ?? []
    targets.push(edge.target)
    adjacency.set(edge.source, targets)

    const degree = inDegree.get(edge.target) ?? 0
    inDegree.set(edge.target, degree + 1)
  }

  // Topological sort
  const queue: string[] = []
  const result: string[] = []

  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId)
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    result.push(nodeId)

    for (const target of adjacency.get(nodeId) ?? []) {
      const newDegree = (inDegree.get(target) ?? 1) - 1
      inDegree.set(target, newDegree)

      if (newDegree === 0) {
        queue.push(target)
      }
    }
  }

  return result
}

/**
 * Build parallel execution layers
 */
function buildParallelLayers(executionOrder: string[], edges: Edge[]): string[][] {
  const layers: string[][] = []
  const nodeLayer = new Map<string, number>()

  // Build dependency map
  const dependencies = new Map<string, Set<string>>()
  for (const edge of edges) {
    const deps = dependencies.get(edge.target) ?? new Set()
    deps.add(edge.source)
    dependencies.set(edge.target, deps)
  }

  // Assign layers
  for (const nodeId of executionOrder) {
    const deps = dependencies.get(nodeId)

    if (!deps || deps.size === 0) {
      // No dependencies - first layer
      nodeLayer.set(nodeId, 0)
    } else {
      // Max layer of dependencies + 1
      let maxDepLayer = -1
      for (const depId of deps) {
        const depLayer = nodeLayer.get(depId) ?? 0
        maxDepLayer = Math.max(maxDepLayer, depLayer)
      }
      nodeLayer.set(nodeId, maxDepLayer + 1)
    }
  }

  // Group by layer
  for (const [nodeId, layer] of nodeLayer) {
    while (layers.length <= layer) {
      layers.push([])
    }
    const layerArray = layers[layer]
    if (layerArray) {
      layerArray.push(nodeId)
    }
  }

  return layers
}

/**
 * Execute a single node with agent
 */
export async function executeNodeWithAgent(
  node: Node<NodeData>,
  inputs: Record<string, unknown>,
  options: WorkflowExecutionOptions = {}
): Promise<TaskResult> {
  const nodeData = node.data as NodeData

  const payload: NodeTaskPayload = {
    type: 'node',
    nodeId: node.id,
    toolRef: nodeData.toolRef,
    inputs,
    config: nodeData.config || {},
  }

  const task = orchestrator.createTask('node', payload, {
    priority: 7, // Higher priority for single node execution
    timeout: options.timeout ?? 30000,
    maxRetries: 2,
  })

  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      const currentTask = orchestrator.getTask(task.id)

      if (!currentTask) {
        clearInterval(checkInterval)
        resolve({
          success: false,
          error: 'Task not found',
          metrics: { executionTime: 0 },
        })
        return
      }

      if (currentTask.status === 'completed' || currentTask.status === 'failed') {
        clearInterval(checkInterval)
        resolve(currentTask.result ?? {
          success: false,
          error: 'No result',
          metrics: { executionTime: 0 },
        })
      }
    }, 100)

    setTimeout(() => {
      clearInterval(checkInterval)
      resolve({
        success: false,
        error: 'Task timeout',
        metrics: { executionTime: task.timeout },
      })
    }, task.timeout + 1000)
  })
}
