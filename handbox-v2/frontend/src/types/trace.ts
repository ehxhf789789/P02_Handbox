/**
 * Trace types — TypeScript mirror of Rust hb-core::trace types.
 * Source of truth: crates/hb-core/src/trace/mod.rs
 */

export interface NodeSpan {
  span_id: string
  execution_id: string
  node_id: string
  tool_ref: string
  input_json: unknown
  output_json: unknown | null
  config_json: unknown
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  status: ExecutionStatus
  error: string | null
  cache_hit: boolean
  environment: ExecutionEnvironment
}

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cache_hit'
  | 'cancelled'

export interface ExecutionEnvironment {
  platform_version: string
  os: string
  tool_version: string
  extra: Record<string, unknown>
}

export interface ExecutionRecord {
  execution_id: string
  workflow_id: string
  started_at: string
  completed_at: string | null
  status: ExecutionStatus
  total_nodes: number
  completed_nodes: number
  failed_nodes: number
  cache_hits: number
}
