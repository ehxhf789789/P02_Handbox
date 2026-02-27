//! Execution commands — run workflows via hb-runner with real-time status streaming.

use crate::state::AppState;
use hb_runner::{ExecutionContext, NodeStatusEvent};
use tauri::{AppHandle, Emitter, State};

/// Event name for node status updates
const NODE_STATUS_EVENT: &str = "node-status";

#[tauri::command]
pub async fn execute_workflow(
    workflow_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let workflows = state.workflows.read().await;
    let spec = workflows
        .get(&workflow_id)
        .ok_or_else(|| format!("Workflow not found: {workflow_id}"))?
        .clone();
    drop(workflows); // Release lock before execution

    // Create execution context with status callback
    let app_clone = app.clone();
    let ctx = ExecutionContext::default().with_status_callback(move |event: NodeStatusEvent| {
        // Emit event to frontend
        if let Err(e) = app_clone.emit(NODE_STATUS_EVENT, &event) {
            tracing::warn!("Failed to emit node status event: {e}");
        }
    });

    // Execute with streaming
    let record = hb_runner::execute_with_context(&spec, ctx)
        .await
        .map_err(|e| format!("Execution failed: {e}"))?;

    serde_json::to_value(&record).map_err(|e| e.to_string())
}

/// Execute workflow without streaming (simpler API)
#[tauri::command]
pub async fn execute_workflow_simple(
    workflow_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let workflows = state.workflows.read().await;
    let spec = workflows
        .get(&workflow_id)
        .ok_or_else(|| format!("Workflow not found: {workflow_id}"))?;

    let record = hb_runner::execute(spec)
        .await
        .map_err(|e| format!("Execution failed: {e}"))?;

    serde_json::to_value(&record).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_execution_status(execution_id: String) -> Result<String, String> {
    let _ex_id: uuid::Uuid = execution_id
        .parse()
        .map_err(|e: uuid::Error| e.to_string())?;
    // TODO: Track execution status in state
    Ok("\"pending\"".into())
}

#[tauri::command]
pub fn cancel_execution(execution_id: String) -> Result<(), String> {
    let _ex_id: uuid::Uuid = execution_id
        .parse()
        .map_err(|e: uuid::Error| e.to_string())?;
    // TODO: Implement cancellation via ExecutionContext.cancelled flag
    Ok(())
}
