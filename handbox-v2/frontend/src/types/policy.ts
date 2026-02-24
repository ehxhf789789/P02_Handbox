/**
 * Policy types — TypeScript mirror of Rust hb-core::policy types.
 * Source of truth: crates/hb-core/src/policy/mod.rs
 */

export interface PermissionSet {
  granted: string[]
  denied: string[]
}

export interface CostLimit {
  max_execution_time_secs?: number
  max_node_time_secs?: number
  max_cost_usd?: number
  max_tokens?: number
}

export interface ToolWhitelist {
  allowed_tools: string[]
  blocked_tools: string[]
}

export interface Policy {
  permissions: PermissionSet
  cost_limit: CostLimit
  tool_whitelist: ToolWhitelist
}
