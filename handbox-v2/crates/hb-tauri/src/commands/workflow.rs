//! Workflow CRUD commands — backed by in-memory store.

use crate::state::AppState;
use hb_core::graph::WorkflowSpec;
use tauri::State;

#[tauri::command]
pub async fn create_workflow(
    name: String,
    description: String,
    state: State<'_, AppState>,
) -> Result<WorkflowSpec, String> {
    let spec = WorkflowSpec {
        meta: hb_core::graph::WorkflowMeta {
            name,
            description,
            ..Default::default()
        },
        ..Default::default()
    };
    let id = spec.id.to_string();
    state.workflows.write().await.insert(id, spec.clone());
    Ok(spec)
}

#[tauri::command]
pub async fn get_workflow(
    id: String,
    state: State<'_, AppState>,
) -> Result<WorkflowSpec, String> {
    state
        .workflows
        .read()
        .await
        .get(&id)
        .cloned()
        .ok_or_else(|| format!("Workflow not found: {id}"))
}

#[tauri::command]
pub async fn list_workflows(
    state: State<'_, AppState>,
) -> Result<Vec<WorkflowSpec>, String> {
    Ok(state.workflows.read().await.values().cloned().collect())
}

#[tauri::command]
pub async fn update_workflow(
    spec: WorkflowSpec,
    state: State<'_, AppState>,
) -> Result<WorkflowSpec, String> {
    let id = spec.id.to_string();
    state.workflows.write().await.insert(id, spec.clone());
    Ok(spec)
}

#[tauri::command]
pub async fn delete_workflow(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.workflows.write().await.remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn import_workflow(
    json: String,
    state: State<'_, AppState>,
) -> Result<WorkflowSpec, String> {
    let spec: WorkflowSpec =
        serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {e}"))?;
    let id = spec.id.to_string();
    state.workflows.write().await.insert(id, spec.clone());
    Ok(spec)
}
