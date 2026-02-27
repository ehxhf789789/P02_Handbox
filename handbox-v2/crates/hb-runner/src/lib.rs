//! hb-runner: DAG execution engine with parallel scheduling, caching, and partial re-execution.

pub mod cache;
pub mod context;
pub mod partial;
pub mod retry;
pub mod scheduler;

// Re-export commonly used types
pub use cache::ExecutionCache;
pub use scheduler::{ExecutionContext, NodeStatusEvent, StatusCallback};

use hb_core::graph::WorkflowSpec;
use hb_core::trace::ExecutionRecord;
use std::sync::Arc;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum RunnerError {
    #[error("scheduling error: {0}")]
    Scheduling(String),
    #[error("node execution failed: node={node_id}, error={message}")]
    NodeExecution { node_id: String, message: String },
    #[error("cache error: {0}")]
    Cache(String),
    #[error("policy violation: {0}")]
    PolicyViolation(String),
    #[error("cancelled")]
    Cancelled,
}

/// Execute a workflow and return the execution record.
pub async fn execute(spec: &WorkflowSpec) -> Result<ExecutionRecord, RunnerError> {
    let execution_id = Uuid::new_v4();
    let record = scheduler::run_dag(execution_id, spec).await?;
    Ok(record)
}

/// Execute a workflow with a status callback for streaming updates.
pub async fn execute_with_callback<F>(
    spec: &WorkflowSpec,
    callback: F,
) -> Result<ExecutionRecord, RunnerError>
where
    F: Fn(NodeStatusEvent) + Send + Sync + 'static,
{
    let execution_id = Uuid::new_v4();
    let ctx = ExecutionContext::default().with_status_callback(callback);
    scheduler::run_dag_with_context(execution_id, spec, ctx).await
}

/// Execute a workflow with full execution context.
pub async fn execute_with_context(
    spec: &WorkflowSpec,
    ctx: ExecutionContext,
) -> Result<ExecutionRecord, RunnerError> {
    let execution_id = Uuid::new_v4();
    scheduler::run_dag_with_context(execution_id, spec, ctx).await
}

/// Execute a workflow with caching enabled.
pub async fn execute_with_cache(
    spec: &WorkflowSpec,
    cache: Arc<ExecutionCache>,
) -> Result<ExecutionRecord, RunnerError> {
    let execution_id = Uuid::new_v4();
    let ctx = ExecutionContext::default().with_cache(cache);
    scheduler::run_dag_with_context(execution_id, spec, ctx).await
}
