//! Python venv executor.

use crate::{ExecutorError, ToolInput, ToolOutput};

/// Execute a Python script in a virtual environment.
pub async fn execute(_script: &str, _input: &ToolInput) -> Result<ToolOutput, ExecutorError> {
    // Phase 2 will create/reuse a Python venv and execute the script.
    Err(ExecutorError::UnsupportedRuntime(
        "Python executor not yet implemented".into(),
    ))
}
