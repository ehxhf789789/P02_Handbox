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
import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { PrimitiveNode } from './PrimitiveNode'
import { CompositeNode } from './CompositeNode'
import { InlineNodeEditor } from './InlineNodeEditor'
import { NodeContextMenu } from './NodeContextMenu'
import { FullscreenPreviewModal } from './previews/FullscreenPreviewModal'
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
  const { nodeStatuses, nodeDetails, edgeFlowStatuses, updateNodeStatus, updateNodeDetail } = useExecutionStore()

  // Node output tooltip state
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

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

  // Node hover handlers for output tooltip
  const onNodeMouseEnter = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const detail = nodeDetails[node.id]
      if (detail?.output || detail?.error) {
        setHoveredNodeId(node.id)
        setTooltipPos({ x: event.clientX + 16, y: event.clientY - 8 })
      }
    },
    [nodeDetails]
  )

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null)
  }, [])

  // Edge styling based on execution data flow
  const styledEdges = useMemo(() => {
    return edges.map((e) => {
      const isSelected = e.id === selectedEdgeId
      if (isSelected) {
        return { ...e, selected: true, style: { stroke: '#f43f5e', strokeWidth: 3 } }
      }

      const flowStatus = edgeFlowStatuses[e.id]
      const sourceStatus = nodeStatuses[e.source]
      const targetStatus = nodeStatuses[e.target]

      // Data flow visualization: color edges based on execution state
      if (flowStatus === 'active' || sourceStatus === 'running') {
        // Data is flowing through this edge — cyan pulse
        return {
          ...e,
          animated: true,
          style: { stroke: '#06b6d4', strokeWidth: 3, filter: 'drop-shadow(0 0 4px rgba(6,182,212,0.6))' },
        }
      }
      if (flowStatus === 'completed' || (sourceStatus === 'completed' && (targetStatus === 'completed' || targetStatus === 'running'))) {
        // Data has flowed through — green
        return {
          ...e,
          animated: false,
          style: { stroke: '#22c55e', strokeWidth: 2.5 },
        }
      }
      if (flowStatus === 'failed' || sourceStatus === 'failed') {
        // Error in source — red
        return {
          ...e,
          animated: false,
          style: { stroke: '#ef4444', strokeWidth: 2, opacity: 0.6 },
        }
      }
      if (sourceStatus === 'pending' || targetStatus === 'pending') {
        // Waiting — dimmed
        return {
          ...e,
          animated: true,
          style: { stroke: '#525252', strokeWidth: 1.5, opacity: 0.5 },
        }
      }

      // Default
      return {
        ...e,
        style: { stroke: '#525252', strokeWidth: 2 },
      }
    })
  }, [edges, selectedEdgeId, edgeFlowStatuses, nodeStatuses])

  // Format output preview for tooltip
  const getOutputPreview = useCallback((nodeId: string): string | null => {
    const detail = nodeDetails[nodeId]
    if (!detail) return null
    if (detail.error) return `Error: ${detail.error.slice(0, 150)}`
    if (detail.output === undefined || detail.output === null) return null
    const text = typeof detail.output === 'string'
      ? detail.output
      : JSON.stringify(detail.output, null, 2)
    return text.length > 200 ? text.slice(0, 200) + '...' : text
  }, [nodeDetails])

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
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
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

      {/* Node output tooltip — shows data preview on hover */}
      {hoveredNodeId && (() => {
        const preview = getOutputPreview(hoveredNodeId)
        const detail = nodeDetails[hoveredNodeId]
        if (!preview && !detail) return null
        return (
          <div
            className="fixed z-50 pointer-events-none max-w-xs"
            style={{ left: tooltipPos.x, top: tooltipPos.y }}
          >
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                  detail?.status === 'completed' ? 'bg-emerald-900/60 text-emerald-400' :
                  detail?.status === 'failed' ? 'bg-red-900/60 text-red-400' :
                  detail?.status === 'running' ? 'bg-blue-900/60 text-blue-400' :
                  'bg-neutral-800 text-neutral-400'
                }`}>
                  {detail?.status ?? 'idle'}
                </span>
                {detail?.duration_ms !== undefined && (
                  <span className="text-[10px] text-neutral-500">{detail.duration_ms}ms</span>
                )}
              </div>
              {preview && (
                <pre className="text-[10px] text-neutral-300 font-mono whitespace-pre-wrap break-all max-h-32 overflow-hidden">
                  {preview}
                </pre>
              )}
            </div>
          </div>
        )
      })()}

      {/* Fullscreen preview modal */}
      <FullscreenPreviewModal />
    </div>
  )
}
