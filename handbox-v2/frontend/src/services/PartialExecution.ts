/**
 * PartialExecution — Service for partial workflow re-execution.
 *
 * Enables:
 * - Re-running specific nodes
 * - Re-running from a node downstream
 * - Re-running only failed nodes
 * - Re-running with cached inputs
 */

import { invoke } from '@tauri-apps/api/core'
import type { Node, Edge } from '@xyflow/react'
import type { NodeData } from '@/stores/workflowStore'
import type { ExecutionStatus } from '@/types/trace'

export type PartialExecutionMode =
  | 'single'        // Run only the selected node
  | 'downstream'    // Run the selected node and all downstream
  | 'upstream'      // Run all upstream nodes needed for selected
  | 'failed'        // Re-run only failed nodes
  | 'from-cache'    // Run using cached inputs where available

export interface PartialExecutionOptions {
  mode: PartialExecutionMode
  targetNodeId: string
  useCachedInputs?: boolean
  skipCompleted?: boolean
}

export interface PartialExecutionResult {
  success: boolean
  executedNodes: string[]
  skippedNodes: string[]
  failedNodes: string[]
  outputs: Record<string, unknown>
  error?: string
}

/**
 * Build dependency graph from nodes and edges
 */
export function buildDependencyGraph(
  nodes: Node<NodeData>[],
  edges: Edge[]
): {
  upstream: Map<string, Set<string>>    // node -> its dependencies
  downstream: Map<string, Set<string>>  // node -> nodes that depend on it
} {
  const upstream = new Map<string, Set<string>>()
  const downstream = new Map<string, Set<string>>()

  // Initialize all nodes
  for (const node of nodes) {
    upstream.set(node.id, new Set())
    downstream.set(node.id, new Set())
  }

  // Build graph from edges
  for (const edge of edges) {
    const source = edge.source
    const target = edge.target

    // Target depends on source
    upstream.get(target)?.add(source)
    // Source has target as downstream
    downstream.get(source)?.add(target)
  }

  return { upstream, downstream }
}

/**
 * Get all upstream nodes (dependencies) for a given node
 */
export function getUpstreamNodes(
  nodeId: string,
  upstream: Map<string, Set<string>>,
  visited = new Set<string>()
): Set<string> {
  if (visited.has(nodeId)) return visited

  visited.add(nodeId)

  const deps = upstream.get(nodeId) || new Set()
  for (const dep of deps) {
    getUpstreamNodes(dep, upstream, visited)
  }

  return visited
}

/**
 * Get all downstream nodes for a given node
 */
export function getDownstreamNodes(
  nodeId: string,
  downstream: Map<string, Set<string>>,
  visited = new Set<string>()
): Set<string> {
  if (visited.has(nodeId)) return visited

  visited.add(nodeId)

  const deps = downstream.get(nodeId) || new Set()
  for (const dep of deps) {
    getDownstreamNodes(dep, downstream, visited)
  }

  return visited
}

/**
 * Determine which nodes to execute based on mode
 */
export function getNodesForExecution(
  options: PartialExecutionOptions,
  nodes: Node<NodeData>[],
  edges: Edge[],
  nodeStatuses: Record<string, ExecutionStatus>
): string[] {
  const { mode, targetNodeId } = options
  const { upstream, downstream } = buildDependencyGraph(nodes, edges)

  switch (mode) {
    case 'single':
      return [targetNodeId]

    case 'downstream': {
      const downstreamSet = getDownstreamNodes(targetNodeId, downstream)
      // Sort by topological order
      return sortTopologically(Array.from(downstreamSet), nodes, edges)
    }

    case 'upstream': {
      const upstreamSet = getUpstreamNodes(targetNodeId, upstream)
      return sortTopologically(Array.from(upstreamSet), nodes, edges)
    }

    case 'failed': {
      const failedNodes = nodes.filter(n =>
        nodeStatuses[n.id] === 'failed'
      ).map(n => n.id)
      return sortTopologically(failedNodes, nodes, edges)
    }

    case 'from-cache': {
      // Get all nodes that don't have cache hits
      const uncachedNodes = nodes.filter(n =>
        nodeStatuses[n.id] !== 'cache_hit' && nodeStatuses[n.id] !== 'completed'
      ).map(n => n.id)
      return sortTopologically(uncachedNodes, nodes, edges)
    }

    default:
      return [targetNodeId]
  }
}

/**
 * Sort nodes in topological order for execution
 */
export function sortTopologically(
  nodeIds: string[],
  nodes: Node<NodeData>[],
  edges: Edge[]
): string[] {
  const nodeSet = new Set(nodeIds)
  const { upstream } = buildDependencyGraph(nodes, edges)

  const result: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(nodeId: string) {
    if (!nodeSet.has(nodeId)) return
    if (visited.has(nodeId)) return
    if (visiting.has(nodeId)) {
      // Cycle detected, but we'll continue
      console.warn(`Cycle detected involving node: ${nodeId}`)
      return
    }

    visiting.add(nodeId)

    // Visit dependencies first
    const deps = upstream.get(nodeId) || new Set()
    for (const dep of deps) {
      if (nodeSet.has(dep)) {
        visit(dep)
      }
    }

    visiting.delete(nodeId)
    visited.add(nodeId)
    result.push(nodeId)
  }

  for (const nodeId of nodeIds) {
    visit(nodeId)
  }

  return result
}

/**
 * Execute partial workflow
 */
export async function executePartial(
  options: PartialExecutionOptions,
  nodes: Node<NodeData>[],
  edges: Edge[],
  nodeStatuses: Record<string, ExecutionStatus>,
  cachedOutputs: Record<string, unknown>,
  callbacks: {
    onNodeStart: (nodeId: string) => void
    onNodeComplete: (nodeId: string, output: unknown) => void
    onNodeFailed: (nodeId: string, error: string) => void
  }
): Promise<PartialExecutionResult> {
  const nodesToExecute = getNodesForExecution(options, nodes, edges, nodeStatuses)
  const executedNodes: string[] = []
  const skippedNodes: string[] = []
  const failedNodes: string[] = []
  const outputs: Record<string, unknown> = { ...cachedOutputs }

  try {
    // Try to use Tauri backend for partial execution
    const result = await invoke<PartialExecutionResult>('execute_partial', {
      nodeIds: nodesToExecute,
      cachedInputs: options.useCachedInputs ? cachedOutputs : {},
    })
    return result
  } catch (error) {
    console.warn('[PartialExecution] Backend not available, using simulation:', error)

    // Simulate execution
    for (const nodeId of nodesToExecute) {
      const node = nodes.find(n => n.id === nodeId)
      if (!node) continue

      // Skip if completed and skipCompleted is true
      if (options.skipCompleted && nodeStatuses[nodeId] === 'completed') {
        skippedNodes.push(nodeId)
        continue
      }

      try {
        callbacks.onNodeStart(nodeId)

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300))

        // Generate mock output
        const output = {
          nodeId,
          result: `Output from ${node.data.label}`,
          timestamp: new Date().toISOString(),
        }

        outputs[nodeId] = output
        executedNodes.push(nodeId)
        callbacks.onNodeComplete(nodeId, output)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        failedNodes.push(nodeId)
        callbacks.onNodeFailed(nodeId, errorMsg)
      }
    }

    return {
      success: failedNodes.length === 0,
      executedNodes,
      skippedNodes,
      failedNodes,
      outputs,
      error: failedNodes.length > 0 ? `${failedNodes.length} node(s) failed` : undefined,
    }
  }
}

/**
 * Check if a node can be re-executed (has all required inputs)
 */
export function canReExecute(
  nodeId: string,
  nodes: Node<NodeData>[],
  edges: Edge[],
  cachedOutputs: Record<string, unknown>
): { canExecute: boolean; missingInputs: string[] } {
  const { upstream } = buildDependencyGraph(nodes, edges)
  const deps = upstream.get(nodeId) || new Set()

  const missingInputs: string[] = []

  for (const dep of deps) {
    if (!cachedOutputs[dep]) {
      missingInputs.push(dep)
    }
  }

  return {
    canExecute: missingInputs.length === 0,
    missingInputs,
  }
}

/**
 * Get execution order visualization
 */
export function getExecutionPlan(
  options: PartialExecutionOptions,
  nodes: Node<NodeData>[],
  edges: Edge[],
  nodeStatuses: Record<string, ExecutionStatus>
): Array<{
  nodeId: string
  label: string
  action: 'execute' | 'skip' | 'use-cache'
  reason: string
}> {
  const nodesToExecute = new Set(getNodesForExecution(options, nodes, edges, nodeStatuses))

  return nodes.map(node => {
    const willExecute = nodesToExecute.has(node.id)
    const isCached = nodeStatuses[node.id] === 'cache_hit'
    const isCompleted = nodeStatuses[node.id] === 'completed'

    if (willExecute) {
      return {
        nodeId: node.id,
        label: node.data.label,
        action: 'execute' as const,
        reason: options.mode === 'single' ? 'Selected node' :
                options.mode === 'downstream' ? 'Downstream of selected' :
                options.mode === 'upstream' ? 'Dependency of selected' :
                options.mode === 'failed' ? 'Previously failed' :
                'Needs execution',
      }
    } else if (isCached || isCompleted) {
      return {
        nodeId: node.id,
        label: node.data.label,
        action: 'use-cache' as const,
        reason: 'Using cached output',
      }
    } else {
      return {
        nodeId: node.id,
        label: node.data.label,
        action: 'skip' as const,
        reason: 'Not in execution path',
      }
    }
  })
}
