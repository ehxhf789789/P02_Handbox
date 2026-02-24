//! hb-policy: Policy engine — tool whitelists, cost budgets, permission checks.

pub mod budget;
pub mod engine;
pub mod whitelist;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum PolicyError {
    #[error("permission denied: {0}")]
    PermissionDenied(String),
    #[error("budget exceeded: {0}")]
    BudgetExceeded(String),
    #[error("tool not allowed: {0}")]
    ToolNotAllowed(String),
}
