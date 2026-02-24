import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useState } from 'react'
import { GraphCanvas } from './components/editor/GraphCanvas'
import { NodePalette } from './components/editor/NodePalette'
import { PropertyPanel } from './components/editor/PropertyPanel'
import { Toolbar } from './components/editor/Toolbar'
import { ExecutionPanel } from './components/execution/ExecutionPanel'
import { CompilerPanel } from './components/compiler/CompilerPanel'
import { useWorkflowStore } from './stores/workflowStore'

export function App() {
  const [showExecPanel, setShowExecPanel] = useState(false)
  const [showCompiler, setShowCompiler] = useState(false)
  const addNode = useWorkflowStore((s) => s.addNode)

  const handleCompilerGenerated = (nodes: unknown[], _edges: unknown[]) => {
    // For now, add generated nodes/edges to the canvas
    // Phase 2 will parse full WorkflowSpec from compiler
    if (Array.isArray(nodes)) {
      for (const n of nodes) {
        const node = n as { id?: string; label?: string; tool_ref?: string; position?: { x: number; y: number } }
        if (node.id) {
          addNode({
            id: node.id,
            type: 'primitive',
            position: node.position ?? { x: Math.random() * 600, y: Math.random() * 400 },
            data: {
              label: node.label ?? node.id,
              toolRef: node.tool_ref ?? 'unknown',
              category: 'ai',
              config: {},
              inputs: [],
              outputs: [],
            },
          })
        }
      }
    }
  }

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-screen w-screen bg-neutral-950 text-neutral-100 overflow-hidden">
        {/* Top Toolbar */}
        <Toolbar
          onToggleExecPanel={() => setShowExecPanel((v) => !v)}
          onOpenCompiler={() => setShowCompiler(true)}
        />

        {/* Main content area */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Node Palette */}
          <NodePalette />

          {/* Center: Graph Canvas + optional Execution Panel */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 min-h-0">
              <GraphCanvas />
            </div>

            {/* Bottom: Execution Panel */}
            {showExecPanel && (
              <div className="h-64 border-t border-neutral-800">
                <ExecutionPanel />
              </div>
            )}
          </div>

          {/* Right: Property Panel */}
          <PropertyPanel />
        </div>

        {/* Compiler Modal */}
        {showCompiler && (
          <CompilerPanel
            onClose={() => setShowCompiler(false)}
            onGenerated={handleCompilerGenerated}
          />
        )}
      </div>
    </ReactFlowProvider>
  )
}
