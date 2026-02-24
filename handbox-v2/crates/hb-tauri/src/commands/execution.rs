//! Execution commands — run workflows via hb-runner.

use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn execute_workflow(
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
    Ok("\"pending\"".into())
}

#[tauri::command]
pub fn cancel_execution(execution_id: String) -> Result<(), String> {
    let _ex_id: uuid::Uuid = execution_id
        .parse()
        .map_err(|e: uuid::Error| e.to_string())?;
    Ok(())
}
