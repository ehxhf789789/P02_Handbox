/**
 * useGraph — hook for graph editing operations.
 * Wraps workflowStore with convenient imperative methods.
 */

import { useCallback } from 'react'
import { useWorkflowStore, type NodeData } from '@/stores/workflowStore'
import type { Node } from '@xyflow/react'

export function useGraph() {
  const { nodes, edges, addNode, removeNode, clearAll } = useWorkflowStore()

  const addNodeAtPosition = useCallback(
    (toolRef: string, label: string, x: number, y: number, config?: Record<string, unknown>, category?: string) => {
      const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const node: Node<NodeData> = {
        id,
        type: 'primitive',
        position: { x, y },
        data: {
          label,
          toolRef,
          category: category ?? 'general',
          config: config ?? {},
          inputs: [],
          outputs: [],
        },
      }
      addNode(node)
      return id
    },
    [addNode],
  )

  const removeNodeById = useCallback(
    (nodeId: string) => {
      removeNode(nodeId)
    },
    [removeNode],
  )

  const clear = useCallback(() => {
    clearAll()
  }, [clearAll])

  const getNodeById = useCallback(
    (nodeId: string) => {
      return nodes.find((n) => n.id === nodeId) ?? null
    },
    [nodes],
  )

  return {
    nodes,
    edges,
    addNodeAtPosition,
    removeNodeById,
    getNodeById,
    clear,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  }
}
