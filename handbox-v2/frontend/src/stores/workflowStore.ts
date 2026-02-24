/**
 * Workflow store — manages the graph state for the editor.
 */

import { create } from 'zustand'
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Connection,
} from '@xyflow/react'

export interface NodeData extends Record<string, unknown> {
  label: string
  toolRef: string
  category: string
  config: Record<string, unknown>
  inputs: { name: string; type: string }[]
  outputs: { name: string; type: string }[]
}

interface WorkflowState {
  nodes: Node<NodeData>[]
  edges: Edge[]
  selectedNodeId: string | null

  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect

  addNode: (node: Node<NodeData>) => void
  removeNode: (id: string) => void
  selectNode: (id: string | null) => void
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void
  updateNodeLabel: (nodeId: string, label: string) => void
  clearAll: () => void

  // Serialization
  getWorkflowJson: () => string
}

export const useWorkflowStore = create<WorkflowState>()((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) as Node<NodeData>[] })
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) })
  },

  onConnect: (connection: Connection) => {
    set({ edges: addEdge({ ...connection, type: 'smoothstep', animated: true }, get().edges) })
  },

  addNode: (node) => {
    set({ nodes: [...get().nodes, node] })
  },

  removeNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    })
  },

  selectNode: (id) => {
    set({ selectedNodeId: id })
  },

  updateNodeConfig: (nodeId, config) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, config } } : n
      ),
    })
  },

  updateNodeLabel: (nodeId, label) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
      ),
    })
  },

  clearAll: () => {
    set({ nodes: [], edges: [], selectedNodeId: null })
  },

  getWorkflowJson: () => {
    const { nodes, edges } = get()
    return JSON.stringify({ nodes, edges }, null, 2)
  },
}))
