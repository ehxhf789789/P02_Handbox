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

#[derive(serde::Serialize)]
pub struct ExportResult {
    pub path: String,
}

#[tauri::command]
pub async fn export_workflow_file(
    content: String,
    filename: String,
    state: State<'_, AppState>,
) -> Result<ExportResult, String> {
    // Get documents directory or use data_dir
    let docs_dir = dirs::document_dir()
        .or_else(|| dirs::download_dir())
        .unwrap_or_else(|| state.data_dir.clone());

    // Create Handbox exports directory
    let export_dir = docs_dir.join("Handbox").join("exports");
    std::fs::create_dir_all(&export_dir)
        .map_err(|e| format!("Failed to create export directory: {e}"))?;

    // Write file
    let file_path = export_dir.join(&filename);
    std::fs::write(&file_path, &content)
        .map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(ExportResult {
        path: file_path.to_string_lossy().to_string(),
    })
}
