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
  selectedEdgeId: string | null

  // Drag state for Tauri/WebKit compatibility
  draggingToolId: string | null

  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect

  addNode: (node: Node<NodeData>) => void
  addEdgeRaw: (edge: Edge) => void
  removeNode: (id: string) => void
  removeEdge: (id: string) => void
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void
  updateNodeLabel: (nodeId: string, label: string) => void
  clearAll: () => void

  // Drag actions
  setDraggingTool: (toolId: string | null) => void

  // Serialization
  getWorkflowJson: () => string
}

export const useWorkflowStore = create<WorkflowState>()((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  draggingToolId: null,

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

  addEdgeRaw: (edge) => {
    set({ edges: [...get().edges, edge] })
  },

  removeNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    })
  },

  removeEdge: (id) => {
    set({
      edges: get().edges.filter((e) => e.id !== id),
      selectedEdgeId: get().selectedEdgeId === id ? null : get().selectedEdgeId,
    })
  },

  selectNode: (id) => {
    set({ selectedNodeId: id, selectedEdgeId: null })
  },

  selectEdge: (id) => {
    set({ selectedEdgeId: id, selectedNodeId: null })
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

  setDraggingTool: (toolId) => {
    set({ draggingToolId: toolId })
  },

  getWorkflowJson: () => {
    const { nodes, edges } = get()

    // Convert ReactFlow format to WorkflowSpec format for backend
    const workflowSpec = {
      version: '0.1.0',
      id: crypto.randomUUID(),
      meta: {
        name: 'Untitled Workflow',
        description: 'Created in Handbox Editor',
      },
      variables: [],
      nodes: nodes.map((node) => {
        const data = node.data as NodeData
        return {
          kind: 'primitive',
          id: node.id,
          tool_ref: data.toolRef,
          config: data.config || {},
          position: node.position,
          label: data.label,
          disabled: false,
        }
      }),
      edges: edges.map((edge) => ({
        id: edge.id,
        source_node: edge.source,
        source_port: edge.sourceHandle || 'output',
        target_node: edge.target,
        target_port: edge.targetHandle || 'input',
        kind: 'data',
      })),
      required_packs: [],
    }

    return JSON.stringify(workflowSpec, null, 2)
  },
}))
