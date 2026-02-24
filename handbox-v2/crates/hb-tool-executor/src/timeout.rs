//! Timeout and resource limit wrappers.

use crate::{ExecutorError, ToolOutput};
use std::future::Future;
use std::time::Duration;
use tokio::time::timeout;

/// Wrap a tool execution future with a timeout.
pub async fn with_timeout<F>(
    timeout_ms: u64,
    fut: F,
) -> Result<ToolOutput, ExecutorError>
where
    F: Future<Output = Result<ToolOutput, ExecutorError>>,
{
    match timeout(Duration::from_millis(timeout_ms), fut).await {
        Ok(result) => result,
        Err(_) => Err(ExecutorError::Timeout(timeout_ms)),
    }
}
