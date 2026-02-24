//! WASM sandbox executor.

use crate::{ExecutorError, ToolInput, ToolOutput};

/// Execute a tool in a WASM sandbox.
pub async fn execute(_module: &str, _input: &ToolInput) -> Result<ToolOutput, ExecutorError> {
    // Phase 3 will implement WASM-based sandboxed execution.
    Err(ExecutorError::UnsupportedRuntime(
        "WASM executor not yet implemented".into(),
    ))
}
