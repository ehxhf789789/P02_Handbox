//! Docker container executor.

use crate::{ExecutorError, ToolInput, ToolOutput};

/// Execute a tool inside a Docker container.
pub async fn execute(_image: &str, _input: &ToolInput) -> Result<ToolOutput, ExecutorError> {
    // Phase 3 will implement Docker-based isolated execution.
    Err(ExecutorError::UnsupportedRuntime(
        "Docker executor not yet implemented".into(),
    ))
}
