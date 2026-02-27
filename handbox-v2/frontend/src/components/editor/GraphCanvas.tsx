/**
 * GraphCanvas — main workflow graph editor using XYFlow v12.
 */

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react'
import { useCallback, useRef, useState, useEffect } from 'react'
import { PrimitiveNode } from './PrimitiveNode'
import { CompositeNode } from './CompositeNode'
import { InlineNodeEditor } from './InlineNodeEditor'
import { NodeContextMenu } from './NodeContextMenu'
import { useWorkflowStore, type NodeData } from '@/stores/workflowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { getToolDef, getCategoryColor } from '@/data/toolCatalog'
import { executePartial, type PartialExecutionMode } from '@/services/PartialExecution'

// Custom CSS for Controls visibility
import './GraphCanvas.css'

const nodeTypes = {
  primitive: PrimitiveNode,
  composite: CompositeNode,
}

let nodeIdCounter = 1

export function GraphCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
    selectEdge,
    selectedNodeId,
    selectedEdgeId,
    removeNode,
    removeEdge,
    draggingToolId,
    setDraggingTool,
    updateNodeConfig,
    updateNodeLabel,
  } = useWorkflowStore()

  const reactFlowInstance = useReactFlow()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // Inline editor state
  const [editingNode, setEditingNode] = useState<{
    node: Node<NodeData>
    position: { x: number; y: number }
  } | null>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    node: Node<NodeData>
    position: { x: number; y: number }
  } | null>(null)

  // Execution store
  const { nodeStatuses, nodeDetails, updateNodeStatus, updateNodeDetail } = useExecutionStore()

  // Keyboard shortcut: Delete or Backspace to remove selected node or edge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete selected node
        if (selectedNodeId) {
          e.preventDefault()
          removeNode(selectedNodeId)
          selectNode(null)
          return
        }
        // Delete selected edge
        if (selectedEdgeId) {
          e.preventDefault()
          removeEdge(selectedEdgeId)
          selectEdge(null)
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, selectedEdgeId, removeNode, removeEdge, selectNode, selectEdge])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(true)
    console.log('[GraphCanvas] onDragEnter')
  }, [])

  const onDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    // Only set false if leaving the wrapper itself
    if (event.currentTarget === event.target) {
      setIsDragOver(false)
    }
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDragOver(false)

      console.log('[GraphCanvas] onDrop triggered')
      console.log('[GraphCanvas] dataTransfer types:', event.dataTransfer.types)
      console.log('[GraphCanvas] draggingToolId from store:', draggingToolId)

      // Try custom MIME type first, then fallback to text/plain, then store
      let toolId = event.dataTransfer.getData('application/handbox-tool')
      console.log('[GraphCanvas] handbox-tool:', toolId)
      if (!toolId) {
        toolId = event.dataTransfer.getData('text/plain')
        console.log('[GraphCanvas] text/plain fallback:', toolId)
      }
      // Final fallback: use store (for Tauri/WebKit compatibility)
      if (!toolId && draggingToolId) {
        toolId = draggingToolId
        console.log('[GraphCanvas] store fallback:', toolId)
      }
      if (!toolId) {
        console.log('[GraphCanvas] No toolId found, aborting')
        return
      }

      const tool = getToolDef(toolId)
      console.log('[GraphCanvas] tool:', tool)
      if (!tool) return

      // Convert screen coordinates to flow coordinates (accounts for zoom/pan)
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode: Node<NodeData> = {
        id: `node_${nodeIdCounter++}`,
        type: 'primitive',
        position,
        data: {
          label: tool.label,
          toolRef: tool.id,
          category: tool.category,
          config: Object.fromEntries(
            tool.configFields.map((f) => [f.name, f.default ?? ''])
          ),
          inputs: tool.inputs,
          outputs: tool.outputs,
        },
      }

      addNode(newNode)
      setDraggingTool(null) // Clear dragging state
      console.log('[GraphCanvas] Node added:', newNode.id)
    },
    [addNode, reactFlowInstance, draggingToolId, setDraggingTool]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id)
    },
    [selectNode]
  )

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      selectEdge(edge.id)
    },
    [selectEdge]
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
    selectEdge(null)
    setEditingNode(null)
  }, [selectNode, selectEdge])

  // Double-click to open inline editor
  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      setEditingNode({
        node: node as Node<NodeData>,
        position: { x: event.clientX + 20, y: event.clientY - 20 },
      })
    },
    []
  )

  // Save inline edits
  const handleInlineEditorSave = useCallback(
    (nodeId: string, updates: Partial<NodeData>) => {
      if (updates.label) {
        updateNodeLabel(nodeId, updates.label)
      }
      if (updates.config) {
        updateNodeConfig(nodeId, updates.config)
      }
    },
    [updateNodeLabel, updateNodeConfig]
  )

  // Right-click context menu
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      setContextMenu({
        node: node as Node<NodeData>,
        position: { x: event.clientX, y: event.clientY },
      })
    },
    []
  )

  // Partial execution handler
  const handlePartialExecute = useCallback(
    async (mode: PartialExecutionMode) => {
      if (!contextMenu) return

      const cachedOutputs: Record<string, unknown> = {}
      Object.entries(nodeDetails).forEach(([nodeId, detail]) => {
        if (detail.output) {
          cachedOutputs[nodeId] = detail.output
        }
      })

      await executePartial(
        { mode, targetNodeId: contextMenu.node.id },
        nodes as Node<NodeData>[],
        edges,
        nodeStatuses,
        cachedOutputs,
        {
          onNodeStart: (nodeId) => updateNodeStatus(nodeId, 'running'),
          onNodeComplete: (nodeId, output) => {
            updateNodeStatus(nodeId, 'completed')
            updateNodeDetail(nodeId, { status: 'completed', output })
          },
          onNodeFailed: (nodeId, error) => {
            updateNodeStatus(nodeId, 'failed')
            updateNodeDetail(nodeId, { status: 'failed', error })
          },
        }
      )

      setContextMenu(null)
    },
    [contextMenu, nodes, edges, nodeStatuses, nodeDetails, updateNodeStatus, updateNodeDetail]
  )

  // Duplicate node
  const handleDuplicateNode = useCallback(() => {
    if (!contextMenu) return

    const sourceNode = contextMenu.node
    const newNode: Node<NodeData> = {
      id: `node_${nodeIdCounter++}`,
      type: sourceNode.type,
      position: {
        x: sourceNode.position.x + 50,
        y: sourceNode.position.y + 50,
      },
      data: { ...sourceNode.data, label: `${sourceNode.data.label} (copy)` },
    }

    addNode(newNode)
    setContextMenu(null)
  }, [contextMenu, addNode])

  return (
    <div
      ref={reactFlowWrapper}
      className={`w-full h-full ${isDragOver ? 'ring-2 ring-violet-500/50 ring-inset' : ''}`}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges.map((e) => ({
          ...e,
          selected: e.id === selectedEdgeId,
          style: e.id === selectedEdgeId
            ? { stroke: '#f43f5e', strokeWidth: 3 }
            : { stroke: '#525252', strokeWidth: 2 },
        }))}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#525252', strokeWidth: 2 },
        }}
        style={{ background: '#0a0a0a' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#262626"
        />
        <Controls
          position="bottom-right"
          style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
        />
        <MiniMap
          position="bottom-left"
          style={{
            background: '#141414',
            border: '1px solid #333',
            borderRadius: 8,
          }}
          maskColor="rgba(0,0,0,0.7)"
          nodeColor={(node) => {
            const data = node.data as NodeData | undefined
            return data ? getCategoryColor(data.category) : '#666'
          }}
        />
      </ReactFlow>

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-neutral-600 text-sm">
              왼쪽 팔레트에서 노드를 드래그하여 워크플로우를 만드세요
            </p>
            <p className="text-neutral-700 text-xs mt-1">
              Drag nodes from the palette to create a workflow
            </p>
          </div>
        </div>
      )}

      {/* Inline Node Editor */}
      {editingNode && (
        <InlineNodeEditor
          node={editingNode.node}
          position={editingNode.position}
          onClose={() => setEditingNode(null)}
          onSave={handleInlineEditorSave}
        />
      )}

      {/* Node Context Menu */}
      {contextMenu && (
        <NodeContextMenu
          node={contextMenu.node}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onEdit={() => {
            setEditingNode({
              node: contextMenu.node,
              position: contextMenu.position,
            })
            setContextMenu(null)
          }}
          onExecute={handlePartialExecute}
          onDelete={() => {
            removeNode(contextMenu.node.id)
            setContextMenu(null)
          }}
          onDuplicate={handleDuplicateNode}
          onDebug={() => {
            console.log('[Debug] Node:', contextMenu.node)
            console.log('[Debug] Status:', nodeStatuses[contextMenu.node.id])
            console.log('[Debug] Details:', nodeDetails[contextMenu.node.id])
            setContextMenu(null)
          }}
        />
      )}
    </div>
  )
}
