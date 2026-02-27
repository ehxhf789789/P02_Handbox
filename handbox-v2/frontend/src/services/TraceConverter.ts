/**
 * TraceConverter — Converts execution traces into reusable workflows.
 *
 * Features:
 * - Extract workflow structure from LLM traces
 * - Parameterize inputs for reusability
 * - Detect parallel execution opportunities
 * - Generate optimized node configurations
 */

import type { Node, Edge } from '@xyflow/react'
import type { LLMTrace, ExecutionTrace } from '@/stores/traceStore'
import type { NodeData } from '@/stores/workflowStore'
import type { LLMProvider } from '@/types'

/** Parameter definition for workflow inputs */
export interface WorkflowParameter {
  id: string
  name: string
  type: 'string' | 'number' | 'boolean' | 'file' | 'json'
  defaultValue?: unknown
  description?: string
  required: boolean
}

/** Converted workflow structure */
export interface ConvertedWorkflow {
  id: string
  name: string
  description?: string
  version: string
  createdAt: string
  sourceTraceId?: string

  /** Input parameters */
  parameters: WorkflowParameter[]

  /** Nodes in the workflow */
  nodes: ConvertedNode[]

  /** Edges connecting nodes */
  edges: ConvertedEdge[]

  /** Metadata from conversion */
  metadata: {
    originalStepCount: number
    optimizedNodeCount: number
    estimatedCost?: number
    avgLatencyMs?: number
  }
}

export interface ConvertedNode {
  id: string
  type: 'primitive' | 'llm' | 'input' | 'output'
  label: string
  toolRef: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  inputs: { name: string; type: string }[]
  outputs: { name: string; type: string }[]

  /** Original trace data for reference */
  sourceTraceId?: string

  /** Model override if LLM node */
  modelOverride?: {
    provider: LLMProvider
    modelId: string
  }
}

export interface ConvertedEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

/** Conversion options */
export interface ConversionOptions {
  /** Include all steps or optimize */
  includeAllSteps?: boolean

  /** Parameterize detected inputs */
  parameterizeInputs?: boolean

  /** Add error handling nodes */
  addErrorHandling?: boolean

  /** Detect and enable parallel execution */
  optimizeParallel?: boolean

  /** Preserve model overrides from trace */
  preserveModelOverrides?: boolean

  /** Default layout direction */
  layoutDirection?: 'horizontal' | 'vertical'
}

const DEFAULT_OPTIONS: ConversionOptions = {
  includeAllSteps: true,
  parameterizeInputs: true,
  addErrorHandling: false,
  optimizeParallel: false,
  preserveModelOverrides: true,
  layoutDirection: 'horizontal',
}

/**
 * Convert an execution trace to a reusable workflow
 */
export function convertTraceToWorkflow(
  trace: ExecutionTrace,
  name: string,
  options: ConversionOptions = {}
): ConvertedWorkflow {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Extract LLM calls from trace
  const llmSteps = trace.llmTraces.filter((t) => t.status === 'completed')

  // Detect parameters from prompts
  const parameters = opts.parameterizeInputs
    ? detectParameters(llmSteps)
    : []

  // Convert LLM traces to nodes
  const nodes = convertLLMTracesToNodes(llmSteps, opts)

  // Generate edges based on execution order
  const edges = generateEdges(nodes)

  // Calculate metadata
  const metadata = {
    originalStepCount: llmSteps.length,
    optimizedNodeCount: nodes.length,
    estimatedCost: calculateEstimatedCost(llmSteps),
    avgLatencyMs: calculateAvgLatency(llmSteps),
  }

  return {
    id: crypto.randomUUID(),
    name,
    description: `Converted from trace: ${trace.workflowName || trace.id}`,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    sourceTraceId: trace.id,
    parameters,
    nodes,
    edges,
    metadata,
  }
}

/**
 * Detect parameterizable inputs from LLM prompts
 */
function detectParameters(traces: LLMTrace[]): WorkflowParameter[] {
  const parameters: WorkflowParameter[] = []
  const seenNames = new Set<string>()

  // Common patterns for parameters in prompts
  const patterns = [
    /\{\{(\w+)\}\}/g,           // {{variable}}
    /\$\{(\w+)\}/g,             // ${variable}
    /<(\w+)>/g,                  // <variable>
    /\[(\w+)\]/g,                // [variable]
  ]

  for (const trace of traces) {
    const prompt = trace.prompt

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(prompt)) !== null) {
        const name = match[1]
        if (name && !seenNames.has(name)) {
          seenNames.add(name)
          parameters.push({
            id: crypto.randomUUID(),
            name: name,
            type: 'string',
            required: true,
            description: `Detected from prompt: "${prompt.slice(0, 50)}..."`,
          })
        }
      }
    }
  }

  // If no parameters detected, create a default input parameter
  if (parameters.length === 0 && traces.length > 0) {
    parameters.push({
      id: crypto.randomUUID(),
      name: 'input',
      type: 'string',
      required: true,
      description: 'Primary input for the workflow',
    })
  }

  return parameters
}

/**
 * Convert LLM traces to workflow nodes
 */
function convertLLMTracesToNodes(
  traces: LLMTrace[],
  options: ConversionOptions
): ConvertedNode[] {
  const nodes: ConvertedNode[] = []
  const spacing = options.layoutDirection === 'horizontal' ? { x: 250, y: 0 } : { x: 0, y: 150 }

  // Add input node
  nodes.push({
    id: 'input_node',
    type: 'input',
    label: 'Input',
    toolRef: 'workflow-input',
    category: 'control',
    position: { x: 50, y: 200 },
    config: {},
    inputs: [],
    outputs: [{ name: 'data', type: 'any' }],
  })

  // Convert each LLM trace to a node
  traces.forEach((trace, index) => {
    const nodeId = `llm_${index + 1}`

    // Determine node label from prompt
    const label = generateNodeLabel(trace, index)

    const node: ConvertedNode = {
      id: nodeId,
      type: 'llm',
      label,
      toolRef: 'llm-chat',
      category: 'ai',
      position: {
        x: 50 + (index + 1) * spacing.x + (index + 1) * 50,
        y: 200 + (index + 1) * spacing.y,
      },
      config: {
        prompt: trace.prompt,
        systemPrompt: trace.systemPrompt || '',
        temperature: 0.7,
        maxTokens: 4096,
      },
      inputs: [{ name: 'context', type: 'string' }],
      outputs: [{ name: 'response', type: 'string' }],
      sourceTraceId: trace.id,
    }

    // Preserve model override if enabled
    if (options.preserveModelOverrides && trace.provider && trace.modelId) {
      node.modelOverride = {
        provider: trace.provider,
        modelId: trace.modelId,
      }
    }

    nodes.push(node)
  })

  // Add output node
  nodes.push({
    id: 'output_node',
    type: 'output',
    label: 'Output',
    toolRef: 'workflow-output',
    category: 'control',
    position: {
      x: 50 + (traces.length + 1) * spacing.x + (traces.length + 1) * 50,
      y: 200,
    },
    config: {},
    inputs: [{ name: 'result', type: 'any' }],
    outputs: [],
  })

  return nodes
}

/**
 * Generate a descriptive label from LLM trace
 */
function generateNodeLabel(trace: LLMTrace, index: number): string {
  const prompt = trace.prompt.toLowerCase()

  // Common task patterns
  if (prompt.includes('analyze') || prompt.includes('분석')) {
    return `Analyze ${index + 1}`
  }
  if (prompt.includes('summarize') || prompt.includes('요약')) {
    return `Summarize ${index + 1}`
  }
  if (prompt.includes('translate') || prompt.includes('번역')) {
    return `Translate ${index + 1}`
  }
  if (prompt.includes('generate') || prompt.includes('생성')) {
    return `Generate ${index + 1}`
  }
  if (prompt.includes('review') || prompt.includes('검토')) {
    return `Review ${index + 1}`
  }
  if (prompt.includes('code') || prompt.includes('코드')) {
    return `Code ${index + 1}`
  }
  if (prompt.includes('search') || prompt.includes('검색')) {
    return `Search ${index + 1}`
  }
  if (prompt.includes('extract') || prompt.includes('추출')) {
    return `Extract ${index + 1}`
  }

  return `LLM Step ${index + 1}`
}

/**
 * Generate edges connecting nodes in sequence
 */
function generateEdges(nodes: ConvertedNode[]): ConvertedEdge[] {
  const edges: ConvertedEdge[] = []

  for (let i = 0; i < nodes.length - 1; i++) {
    const source = nodes[i]
    const target = nodes[i + 1]

    if (source && target) {
      edges.push({
        id: `edge_${source.id}_${target.id}`,
        source: source.id,
        sourceHandle: source.outputs[0]?.name || 'output',
        target: target.id,
        targetHandle: target.inputs[0]?.name || 'input',
      })
    }
  }

  return edges
}

/**
 * Calculate estimated cost from traces
 */
function calculateEstimatedCost(traces: LLMTrace[]): number {
  // Rough cost estimation per 1K tokens
  const costPer1KTokens: Record<LLMProvider, { input: number; output: number }> = {
    openai: { input: 0.01, output: 0.03 },
    anthropic: { input: 0.003, output: 0.015 },
    bedrock: { input: 0.003, output: 0.015 },
    local: { input: 0, output: 0 },
  }

  let totalCost = 0

  for (const trace of traces) {
    if (trace.usage) {
      const costs = costPer1KTokens[trace.provider] || costPer1KTokens.openai
      totalCost += (trace.usage.inputTokens / 1000) * costs.input
      totalCost += (trace.usage.outputTokens / 1000) * costs.output
    }
  }

  return Math.round(totalCost * 1000) / 1000 // Round to 3 decimal places
}

/**
 * Calculate average latency
 */
function calculateAvgLatency(traces: LLMTrace[]): number {
  if (traces.length === 0) return 0
  const totalLatency = traces.reduce((sum, t) => sum + t.latencyMs, 0)
  return Math.round(totalLatency / traces.length)
}

/**
 * Convert a simple prompt to a single-node workflow
 */
export function convertPromptToWorkflow(
  prompt: string,
  systemPrompt?: string,
  name?: string
): ConvertedWorkflow {
  const workflowName = name || 'Single Prompt Workflow'

  const nodes: ConvertedNode[] = [
    {
      id: 'input_node',
      type: 'input',
      label: 'Input',
      toolRef: 'workflow-input',
      category: 'control',
      position: { x: 50, y: 200 },
      config: {},
      inputs: [],
      outputs: [{ name: 'data', type: 'any' }],
    },
    {
      id: 'llm_1',
      type: 'llm',
      label: 'LLM Process',
      toolRef: 'llm-chat',
      category: 'ai',
      position: { x: 300, y: 200 },
      config: {
        prompt,
        systemPrompt: systemPrompt || '',
        temperature: 0.7,
        maxTokens: 4096,
      },
      inputs: [{ name: 'context', type: 'string' }],
      outputs: [{ name: 'response', type: 'string' }],
    },
    {
      id: 'output_node',
      type: 'output',
      label: 'Output',
      toolRef: 'workflow-output',
      category: 'control',
      position: { x: 550, y: 200 },
      config: {},
      inputs: [{ name: 'result', type: 'any' }],
      outputs: [],
    },
  ]

  const edges: ConvertedEdge[] = [
    {
      id: 'edge_input_llm',
      source: 'input_node',
      sourceHandle: 'data',
      target: 'llm_1',
      targetHandle: 'context',
    },
    {
      id: 'edge_llm_output',
      source: 'llm_1',
      sourceHandle: 'response',
      target: 'output_node',
      targetHandle: 'result',
    },
  ]

  return {
    id: crypto.randomUUID(),
    name: workflowName,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    parameters: [
      {
        id: crypto.randomUUID(),
        name: 'input',
        type: 'string',
        required: true,
        description: 'Input data for the workflow',
      },
    ],
    nodes,
    edges,
    metadata: {
      originalStepCount: 1,
      optimizedNodeCount: 3,
    },
  }
}

/**
 * Apply a converted workflow to the editor
 */
export function applyWorkflowToEditor(
  workflow: ConvertedWorkflow,
  addNode: (node: Node<NodeData>) => void,
  addEdge: (edge: Edge) => void,
  clearAll: () => void
): void {
  // Clear existing workflow
  clearAll()

  // Add all nodes
  for (const node of workflow.nodes) {
    addNode({
      id: node.id,
      type: 'primitive',
      position: node.position,
      data: {
        label: node.label,
        toolRef: node.toolRef,
        category: node.category,
        config: node.config,
        inputs: node.inputs,
        outputs: node.outputs,
      } as NodeData,
    })
  }

  // Add all edges
  for (const edge of workflow.edges) {
    addEdge({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: 'smoothstep',
      animated: true,
    })
  }
}
