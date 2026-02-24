//! hb-tool-executor: Isolated tool execution via multiple runtimes.

pub mod docker;
pub mod local;
pub mod python;
pub mod timeout;
pub mod wasm;

use hb_core::tool::RuntimeSpec;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ExecutorError {
    #[error("execution failed: {0}")]
    ExecutionFailed(String),
    #[error("timeout after {0}ms")]
    Timeout(u64),
    #[error("runtime not supported: {0}")]
    UnsupportedRuntime(String),
    #[error("process error: {0}")]
    Process(String),
}

/// Input passed to a tool executor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInput {
    pub tool_ref: String,
    pub inputs: serde_json::Value,
    pub config: serde_json::Value,
}

/// Output returned from a tool executor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutput {
    pub outputs: serde_json::Value,
    pub duration_ms: u64,
}

/// Execute a tool using the appropriate runtime.
pub async fn execute(
    runtime: &RuntimeSpec,
    input: &ToolInput,
) -> Result<ToolOutput, ExecutorError> {
    match runtime {
        RuntimeSpec::Native => local::execute_native(input).await,
        RuntimeSpec::Process { command } => local::execute_process(command, input).await,
        RuntimeSpec::Python { script } => python::execute(script, input).await,
        RuntimeSpec::Docker { image } => docker::execute(image, input).await,
        RuntimeSpec::Wasm { module } => wasm::execute(module, input).await,
        RuntimeSpec::Mcp { server_id } => {
            Err(ExecutorError::UnsupportedRuntime(format!(
                "MCP server_id={server_id} — use hb-mcp crate"
            )))
        }
    }
}
