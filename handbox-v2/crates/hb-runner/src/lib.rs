//! hb-runner: DAG execution engine with parallel scheduling, caching, and partial re-execution.

pub mod cache;
pub mod context;
pub mod partial;
pub mod retry;
pub mod scheduler;

use hb_core::graph::WorkflowSpec;
use hb_core::trace::ExecutionRecord;
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
