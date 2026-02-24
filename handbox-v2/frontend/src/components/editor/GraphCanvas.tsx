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
} from '@xyflow/react'
import { useCallback, useRef } from 'react'
import { PrimitiveNode } from './PrimitiveNode'
import { CompositeNode } from './CompositeNode'
import { useWorkflowStore, type NodeData } from '@/stores/workflowStore'
import { getToolDef, getCategoryColor } from '@/data/toolCatalog'

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
  } = useWorkflowStore()

  const reactFlowInstance = useReactFlow()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const toolId = event.dataTransfer.getData('application/handbox-tool')
      if (!toolId) return

      const tool = getToolDef(toolId)
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
          toolRef: tool.icon,
          category: tool.category,
          config: Object.fromEntries(
            tool.configFields.map((f) => [f.name, f.default ?? ''])
          ),
          inputs: tool.inputs,
          outputs: tool.outputs,
        },
      }

      addNode(newNode)
    },
    [addNode, reactFlowInstance]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id)
    },
    [selectNode]
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  return (
    <div ref={reactFlowWrapper} className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
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
    </div>
  )
}
