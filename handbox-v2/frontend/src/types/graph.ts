/**
 * Graph DSL v0.1 — TypeScript mirror of Rust hb-core::graph types.
 * Source of truth: crates/hb-core/src/graph/mod.rs
 */

// ---------------------------------------------------------------------------
// WorkflowSpec
// ---------------------------------------------------------------------------

export interface WorkflowSpec {
  version: '0.1.0'
  id: string
  meta: WorkflowMeta
  variables: VariableSpec[]
  nodes: NodeEntry[]
  edges: EdgeSpec[]
  required_packs: PackDependency[]
}

export interface WorkflowMeta {
  name: string
  description: string
  author?: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface VariableSpec {
  name: string
  description?: string
  var_type: PortType
  default_value?: unknown
  required: boolean
}

// ---------------------------------------------------------------------------
// Node entries (discriminated union)
// ---------------------------------------------------------------------------

export type NodeEntry =
  | PrimitiveNodeEntry
  | CompositeNodeEntry
  | ConditionalNodeEntry
  | LoopNodeEntry

export interface PrimitiveNodeEntry {
  kind: 'primitive'
  id: string
  tool_ref: string
  config: Record<string, unknown>
  position?: Position
  label?: string
  disabled: boolean
  retry?: RetryPolicy
  cache?: CachePolicy
}

export interface CompositeNodeEntry {
  kind: 'composite'
  id: string
  subgraph: SubgraphSpec
  input_ports: PortSpec[]
  output_ports: PortSpec[]
  input_mapping: PortMapping[]
  output_mapping: PortMapping[]
  position?: Position
  label?: string
}

export interface ConditionalNodeEntry {
  kind: 'conditional'
  id: string
  condition_kind: 'if' | 'switch'
  condition_expr: string
  branches: Branch[]
  default_branch?: SubgraphSpec
}

export interface LoopNodeEntry {
  kind: 'loop'
  id: string
  loop_kind: 'for_each' | 'while' | 'repeat'
  body: SubgraphSpec
  max_iterations: number
  condition_expr?: string
  items_expr?: string
}

// ---------------------------------------------------------------------------
// Sub-graph
// ---------------------------------------------------------------------------

export interface SubgraphSpec {
  nodes: NodeEntry[]
  edges: EdgeSpec[]
}

// ---------------------------------------------------------------------------
// Edge
// ---------------------------------------------------------------------------

export interface EdgeSpec {
  id: string
  source_node: string
  source_port: string
  target_node: string
  target_port: string
  kind: EdgeKind
  transform?: string
}

export type EdgeKind = 'data' | 'control' | 'error'

// ---------------------------------------------------------------------------
// Port
// ---------------------------------------------------------------------------

export interface PortSpec {
  name: string
  port_type: PortType
  description?: string
  required: boolean
  default_value?: unknown
}

export type PortType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'json'
  | 'array'
  | 'binary'
  | 'any'

export interface PortMapping {
  external_port: string
  node: string
  port: string
}

// ---------------------------------------------------------------------------
// Position, Retry, Cache
// ---------------------------------------------------------------------------

export interface Position {
  x: number
  y: number
}

export interface RetryPolicy {
  max_retries: number
  backoff_ms: number
  backoff_multiplier: number
  max_backoff_ms: number
}

export interface CachePolicy {
  enabled: boolean
  ttl_secs: number
}

export interface Branch {
  label: string
  value: unknown
  body: SubgraphSpec
}

export interface PackDependency {
  pack_id: string
  version_range: string
}
