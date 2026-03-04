/**
 * AgentCanvasBridge — listens for "workflow-update" Tauri events
 * and mutates the workflow canvas (workflowStore) accordingly.
 *
 * Features:
 * - Smart port matching: resolves port names to actual toolCatalog ports
 * - set_config: agent can set node config (file_path, prompt, etc.)
 * - select_node: agent can highlight a node needing user attention
 * - Real-time node highlighting when agent calls tools
 */

import { useWorkflowStore, type NodeData } from '@/stores/workflowStore'
import { useExecutionStore } from '@/stores/executionStore'
import { getToolDef, allTools, type ToolDef } from '@/data/toolCatalog'
import { safeListen } from '@/utils/tauri'
import type { Node, Edge } from '@xyflow/react'

interface WorkflowNodeDef {
  id?: string
  tool_ref: string
  label?: string
  config?: Record<string, unknown>
  position?: { x: number; y: number }
}

interface WorkflowEdgeDef {
  source: string
  source_port?: string
  target: string
  target_port?: string
}

interface WorkflowUpdateEvent {
  type: 'create' | 'add_node' | 'remove_node' | 'connect' | 'set_config' | 'select_node'
    | 'update_node' | 'remove_edge' | 'list_request'
  // create
  nodes?: WorkflowNodeDef[]
  edges?: WorkflowEdgeDef[]
  clear_existing?: boolean
  // add_node
  tool_ref?: string
  label?: string
  config?: Record<string, unknown>
  position?: { x: number; y: number }
  // remove_node / set_config / select_node / update_node
  node_id?: string
  // connect / remove_edge
  source?: string
  source_port?: string
  target?: string
  target_port?: string
  // remove_edge
  edge_id?: string
}

let agentNodeCounter = 1000

// ── Port Resolution ──────────────────────────────────────────────

/**
 * Resolve an output port name: if the exact name exists on the tool, use it.
 * Otherwise, try fuzzy matching or fall back to the first output port.
 */
function resolveOutputPort(toolDef: ToolDef | undefined, portName: string): string {
  if (!toolDef || toolDef.outputs.length === 0) return portName

  // Exact match
  if (toolDef.outputs.some(o => o.name === portName)) return portName

  // Fuzzy: LLM might use "text" but actual port is "content"
  const portAliases: Record<string, string[]> = {
    content: ['text', 'output', 'data', 'result', 'body'],
    response: ['answer', 'reply', 'output', 'result', 'text'],
    summary: ['text', 'output', 'result'],
    success: ['result', 'ok', 'done'],
    path: ['file', 'output_path', 'filepath'],
    chunks: ['parts', 'segments'],
    results: ['output', 'matches', 'items'],
  }

  for (const out of toolDef.outputs) {
    const aliases = portAliases[out.name] || []
    if (aliases.includes(portName)) return out.name
  }

  // Last resort: return first output port
  return toolDef.outputs[0]?.name ?? portName
}

/**
 * Resolve an input port name: if the exact name exists on the tool, use it.
 * Otherwise, try fuzzy matching or fall back to the first input port.
 */
function resolveInputPort(toolDef: ToolDef | undefined, portName: string): string {
  if (!toolDef || toolDef.inputs.length === 0) return portName

  // Exact match
  if (toolDef.inputs.some(i => i.name === portName)) return portName

  // Fuzzy: LLM might use "text" but actual port is "prompt"
  const portAliases: Record<string, string[]> = {
    prompt: ['text', 'input', 'query', 'question', 'message'],
    context: ['background', 'info', 'data', 'text', 'pdf_content'],
    path: ['file', 'file_path', 'filepath', 'input_path', 'source'],
    content: ['text', 'data', 'body', 'input', 'analysis'],
    text: ['input', 'content', 'data', 'source'],
    data: ['input', 'content', 'json_string'],
    items: ['input', 'array', 'list'],
  }

  for (const inp of toolDef.inputs) {
    const aliases = portAliases[inp.name] || []
    if (aliases.includes(portName)) return inp.name
  }

  // Last resort: return first input port
  return toolDef.inputs[0]?.name ?? portName
}

// ── Fuzzy Tool Resolution ─────────────────────────────────────────

/**
 * Common LLM mistakes → correct tool_ref.
 * Agent may hallucinate tool names; map them to real catalog entries.
 */
const toolRefAliases: Record<string, string> = {
  'pdf-to-text': 'pdf-read',
  'read-pdf': 'pdf-read',
  'read-file': 'file-read',
  'write-file': 'file-write',
  'chat': 'llm-chat',
  'llm': 'llm-chat',
  'summarize': 'llm-summarize',
  'split-text': 'text-split',
  'merge-text': 'text-merge',
  'template': 'text-template',
  'regex': 'regex-extract',
  'parse-json': 'json-parse',
  'filter': 'data-filter',
  'csv': 'csv-read',
  'export-pdf': 'to-pdf',
  'export-excel': 'to-excel',
  'if': 'condition',
  'branch': 'condition',
  'for-each': 'loop',
  'iterate': 'loop',
  'wait': 'delay',
  'sleep': 'delay',
}

/**
 * Resolve a tool_ref to a ToolDef. Tries:
 * 1. Exact match in catalog
 * 2. Known alias mapping
 * 3. Fuzzy: strip prefixes, partial match
 */
function resolveToolDef(toolRef: string): { toolDef: ToolDef | undefined; resolvedRef: string } {
  // 1. Exact match
  const exact = getToolDef(toolRef)
  if (exact) return { toolDef: exact, resolvedRef: toolRef }

  // 2. Known alias
  const alias = toolRefAliases[toolRef]
  if (alias) {
    const aliased = getToolDef(alias)
    if (aliased) return { toolDef: aliased, resolvedRef: alias }
  }

  // 3. Fuzzy: normalize and search
  const normalized = toolRef.toLowerCase().replace(/[_\s]/g, '-')
  const fuzzy = allTools.find(t =>
    t.id === normalized ||
    t.id.includes(normalized) ||
    normalized.includes(t.id)
  )
  if (fuzzy) return { toolDef: fuzzy, resolvedRef: fuzzy.id }

  // Not found — return undefined
  return { toolDef: undefined, resolvedRef: toolRef }
}

// ── Node & Edge Creation ─────────────────────────────────────────

/** Default ports for nodes with unknown tool_ref */
const defaultInputs = [{ name: 'input', type: 'any' }]
const defaultOutputs = [{ name: 'output', type: 'any' }]

function createCanvasNode(def: WorkflowNodeDef): Node<NodeData> {
  const { toolDef, resolvedRef } = resolveToolDef(def.tool_ref)
  const id = def.id || `agent_node_${agentNodeCounter++}`

  // Use resolved ref for catalog lookup, but keep original for display if no match
  const inputs = toolDef?.inputs?.map(i => ({ name: i.name, type: i.type }))
    || (def.tool_ref !== resolvedRef ? [] : defaultInputs)
  const outputs = toolDef?.outputs?.map(o => ({ name: o.name, type: o.type }))
    || (def.tool_ref !== resolvedRef ? [] : defaultOutputs)

  return {
    id,
    type: 'primitive',
    position: def.position || { x: 100 + (agentNodeCounter % 5) * 250, y: 100 + Math.floor(agentNodeCounter / 5) * 150 },
    data: {
      label: def.label || toolDef?.label || def.tool_ref,
      toolRef: resolvedRef,
      category: toolDef?.category || 'general',
      config: def.config || {},
      inputs,
      outputs,
    },
  }
}

/** Map of created node IDs to their tool_refs for port resolution */
const nodeToolRefMap = new Map<string, string>()

function createCanvasEdge(def: WorkflowEdgeDef): Edge {
  const sourceToolRef = nodeToolRefMap.get(def.source)
  const targetToolRef = nodeToolRefMap.get(def.target)
  const sourceToolDef = sourceToolRef ? resolveToolDef(sourceToolRef).toolDef : undefined
  const targetToolDef = targetToolRef ? resolveToolDef(targetToolRef).toolDef : undefined

  // Resolve port names via smart matching
  const sourceHandle = resolveOutputPort(sourceToolDef, def.source_port || 'output')
  const targetHandle = resolveInputPort(targetToolDef, def.target_port || 'input')

  return {
    id: `agent_edge_${def.source}_${def.target}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    source: def.source,
    target: def.target,
    sourceHandle,
    targetHandle,
    type: 'smoothstep',
    animated: true,
  }
}

// ── Also resolve from existing canvas nodes ────────────────────────

function populateNodeToolRefMapFromCanvas() {
  const { nodes } = useWorkflowStore.getState()
  for (const node of nodes) {
    const data = node.data as NodeData
    if (data.toolRef) {
      nodeToolRefMap.set(node.id, data.toolRef)
    }
  }
}

// Tool name → toolRef mapping for agent ↔ canvas sync
const agentToolToCanvasRef: Record<string, string[]> = {
  file_read: ['file-read'],
  file_write: ['file-write'],
  file_edit: ['file-write'],
  file_edit_lines: ['file-write'],
  bash_execute: ['bash-execute', 'shell'],
  grep_search: ['grep-search', 'code-search'],
  glob_search: ['file-read'],
  web_search: ['web-search'],
  web_fetch: ['web-fetch', 'http-fetch'],
  git_status: ['git-status'],
  git_diff: ['git-status'],
  git_log: ['git-status'],
  git_commit: ['git-status'],
  vector_store: ['vector-store'],
  vector_search: ['vector-search'],
  mcp_call: ['mcp-tool'],
  workflow_create: ['agent-task'],
  workflow_add_node: ['agent-task'],
}

function findMatchingCanvasNode(agentTool: string): string | null {
  const refs = agentToolToCanvasRef[agentTool]
  if (!refs) return null

  const { nodes } = useWorkflowStore.getState()
  for (const node of nodes) {
    const data = node.data as NodeData
    if (refs.includes(data.toolRef)) {
      return node.id
    }
  }
  return null
}

interface AgentStreamEvent {
  type: string
  conversation_id?: string
  tool?: string
  [key: string]: unknown
}

/**
 * Set up listener for workflow-update events from the agent backend.
 * Also sets up agent-stream listener for real-time node highlighting.
 * Returns an unlisten function for cleanup.
 */
export async function setupAgentCanvasListener(): Promise<() => void> {
  const unlistenWorkflow = await safeListen<WorkflowUpdateEvent>('workflow-update', (event) => {
    const store = useWorkflowStore.getState()
    const payload = event.payload

    switch (payload.type) {
      case 'create': {
        if (payload.clear_existing) {
          store.clearAll()
          nodeToolRefMap.clear()
        }

        // First pass: create all nodes and record resolved tool_refs
        for (const nodeDef of payload.nodes || []) {
          const node = createCanvasNode(nodeDef)
          store.addNode(node)
          const nodeId = nodeDef.id || node.id
          // Store the RESOLVED toolRef (after alias/fuzzy matching)
          nodeToolRefMap.set(nodeId, (node.data as NodeData).toolRef)
        }

        // Second pass: create edges with smart port resolution
        populateNodeToolRefMapFromCanvas()
        for (const edgeDef of payload.edges || []) {
          store.addEdgeRaw(createCanvasEdge(edgeDef))
        }

        // Auto-select first node that needs config input
        const createdNodes = payload.nodes || []
        const firstNeedingInput = createdNodes.find(n => {
          const { toolDef: td } = resolveToolDef(n.tool_ref)
          return td && td.configFields.length > 0 && (!n.config || Object.keys(n.config).length === 0)
        })
        if (firstNeedingInput && firstNeedingInput.id) {
          store.selectNode(firstNeedingInput.id)
        }
        break
      }

      case 'add_node': {
        if (payload.tool_ref) {
          const node = createCanvasNode({
            tool_ref: payload.tool_ref,
            label: payload.label,
            config: payload.config,
            position: payload.position,
          })
          store.addNode(node)
          nodeToolRefMap.set(node.id, (node.data as NodeData).toolRef)
        }
        break
      }

      case 'remove_node': {
        if (payload.node_id) {
          store.removeNode(payload.node_id)
          nodeToolRefMap.delete(payload.node_id)
        }
        break
      }

      case 'connect': {
        if (payload.source && payload.target) {
          populateNodeToolRefMapFromCanvas()
          store.addEdgeRaw(createCanvasEdge({
            source: payload.source,
            source_port: payload.source_port,
            target: payload.target,
            target_port: payload.target_port,
          }))
        }
        break
      }

      case 'set_config': {
        if (payload.node_id && payload.config) {
          store.updateNodeConfig(payload.node_id, payload.config)
          // Select the node so user can see the config change
          store.selectNode(payload.node_id)
        }
        break
      }

      case 'select_node': {
        if (payload.node_id) {
          store.selectNode(payload.node_id)
        }
        break
      }

      case 'update_node': {
        if (payload.node_id) {
          // Update label if provided
          if (payload.label) {
            store.updateNodeLabel(payload.node_id, payload.label)
          }
          // Update position if provided
          if (payload.position) {
            const { nodes } = store
            const updated = nodes.map(n =>
              n.id === payload.node_id
                ? { ...n, position: payload.position! }
                : n
            )
            useWorkflowStore.setState({ nodes: updated })
          }
          // Select the updated node for visual feedback
          store.selectNode(payload.node_id)
        }
        break
      }

      case 'remove_edge': {
        const { edges } = store
        if (payload.edge_id) {
          // Remove by exact edge ID
          store.removeEdge(payload.edge_id)
        } else if (payload.source && payload.target) {
          // Remove by source + target match
          const match = edges.find(e =>
            e.source === payload.source && e.target === payload.target
          )
          if (match) {
            store.removeEdge(match.id)
          }
        }
        break
      }

      case 'list_request': {
        // Respond with current canvas state summary
        const { nodes, edges } = store
        const summary = {
          node_count: nodes.length,
          edge_count: edges.length,
          nodes: nodes.map(n => ({
            id: n.id,
            label: (n.data as NodeData).label,
            toolRef: (n.data as NodeData).toolRef,
            position: n.position,
          })),
          edges: edges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          })),
        }
        // Emit response back to Rust backend
        import('@tauri-apps/api/event').then(({ emit }) => {
          emit('workflow-list-response', JSON.stringify(summary))
        }).catch(err => console.error('[AgentCanvasBridge] Failed to emit list response:', err))
        break
      }
    }
  })

  // Workflow execute listener: agent requests canvas execution
  const unlistenExecute = await safeListen<{ source: string; conversation_id?: string }>('workflow-execute-request', () => {
    // Dynamically import to avoid circular dependency; fire-and-forget with error logging
    import('@/services/canvasExecutor').then(({ executeCanvasWorkflow }) => {
      executeCanvasWorkflow().catch(err => console.error('[AgentCanvasBridge] Workflow execution failed:', err))
    }).catch(err => console.error('[AgentCanvasBridge] Failed to import canvasExecutor:', err))
  })

  // Agent stream listener: highlight canvas nodes when agent calls matching tools
  let highlightTimer: ReturnType<typeof setTimeout> | null = null

  const unlistenAgent = await safeListen<AgentStreamEvent>('agent-stream', (event) => {
    const payload = event.payload
    const execStore = useExecutionStore.getState()

    if (payload.type === 'tool_call' && payload.tool) {
      const matchedNodeId = findMatchingCanvasNode(payload.tool as string)
      if (matchedNodeId) {
        execStore.setAgentHighlightNode(matchedNodeId)

        if (highlightTimer) clearTimeout(highlightTimer)
        highlightTimer = setTimeout(() => {
          useExecutionStore.getState().setAgentHighlightNode(null)
        }, 3000)
      }
    } else if (payload.type === 'observation') {
      if (highlightTimer) clearTimeout(highlightTimer)
      highlightTimer = setTimeout(() => {
        useExecutionStore.getState().setAgentHighlightNode(null)
      }, 1000)
    }
  })

  return () => {
    unlistenWorkflow()
    unlistenExecute()
    unlistenAgent()
    if (highlightTimer) clearTimeout(highlightTimer)
  }
}
