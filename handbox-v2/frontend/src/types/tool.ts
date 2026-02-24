/**
 * Tool Interface v0.1 — TypeScript mirror of Rust hb-core::tool types.
 * Source of truth: crates/hb-core/src/tool/mod.rs
 */

import type { PortSpec, RetryPolicy } from './graph'

export interface ToolInterface {
  tool_id: string
  version: string
  display_name: string
  description: string
  capability_tags: string[]
  input_schema: PortSchema
  output_schema: PortSchema
  side_effect: SideEffect
  required_permissions: string[]
  cost_hint: CostHint
  error_model: ErrorModel
  runtime: RuntimeSpec
  config_schema: ConfigField[]
}

export interface PortSchema {
  ports: PortSpec[]
}

export type SideEffect = 'none' | 'read' | 'write' | 'network' | 'process'

export interface CostHint {
  time: TimeHint
  monetary: MonetaryHint
  scales_with_input: boolean
  estimated_tokens?: TokenEstimate
}

export type TimeHint = 'instant' | 'fast' | 'medium' | 'slow' | 'very_slow'
export type MonetaryHint = 'free' | 'cheap' | 'moderate' | 'expensive'

export interface TokenEstimate {
  input: number
  output: number
}

export interface ErrorModel {
  error_types: ErrorType[]
  idempotent: boolean
  default_retry: RetryPolicy
}

export interface ErrorType {
  code: string
  description: string
  retryable: boolean
}

export type RuntimeSpec =
  | { kind: 'native' }
  | { kind: 'process'; command: string }
  | { kind: 'python'; script: string }
  | { kind: 'docker'; image: string }
  | { kind: 'wasm'; module: string }
  | { kind: 'mcp'; server_id: string }

export interface ConfigField {
  name: string
  field_type: ConfigFieldType
  label: string
  description?: string
  default_value?: unknown
  required: boolean
  options: ConfigOption[]
}

export type ConfigFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multi_select'
  | 'file_path'
  | 'json'

export interface ConfigOption {
  label: string
  value: unknown
}
