//! Project/Workspace management commands.

use crate::state::AppState;
use serde_json::json;
use tauri::State;

#[tauri::command]
pub async fn create_project(
    name: String,
    description: Option<String>,
    _root_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let pm = state.project_manager.read().await;

    let config = hb_core::project::WorkspaceConfig {
        id: uuid::Uuid::new_v4(),
        name: name.clone(),
        description,
        root_path: _root_path.unwrap_or_default(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        data_sources: vec![],
        indexes: vec![],
        default_policy: None,
        llm_providers: vec![],
    };

    let id = pm.create_workspace(&config).map_err(|e| e.to_string())?;

    // Create project directories (memory, plan)
    let project_dir = state.data_dir.join("projects").join(id.to_string());
    let memory_dir = project_dir.join("memory");
    std::fs::create_dir_all(&memory_dir).map_err(|e| format!("Failed to create project dir: {e}"))?;

    // Create empty plan.md
    let plan_path = project_dir.join("plan.md");
    if !plan_path.exists() {
        std::fs::write(&plan_path, "").map_err(|e| format!("Failed to create plan file: {e}"))?;
    }

    Ok(json!({
        "id": id.to_string(),
        "name": name,
        "description": config.description,
        "created_at": config.created_at.to_rfc3339(),
    }))
}

#[tauri::command]
pub async fn get_project(
    id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let pm = state.project_manager.read().await;
    let uuid: uuid::Uuid = id.parse().map_err(|e: uuid::Error| e.to_string())?;
    let ws = pm.get_workspace(uuid).map_err(|e| e.to_string())?;

    Ok(json!({
        "id": ws.id.to_string(),
        "name": ws.name,
        "description": ws.description,
        "root_path": ws.root_path,
        "created_at": ws.created_at.to_rfc3339(),
        "updated_at": ws.updated_at.to_rfc3339(),
    }))
}

#[tauri::command]
pub async fn list_projects(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let pm = state.project_manager.read().await;
    let workspaces = pm.list_workspaces().map_err(|e| e.to_string())?;

    Ok(workspaces.into_iter().map(|ws| {
        json!({
            "id": ws.id.to_string(),
            "name": ws.name,
            "description": ws.description,
            "created_at": ws.created_at.to_rfc3339(),
            "updated_at": ws.updated_at.to_rfc3339(),
        })
    }).collect())
}

#[tauri::command]
pub async fn delete_project(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pm = state.project_manager.read().await;
    let uuid: uuid::Uuid = id.parse().map_err(|e: uuid::Error| e.to_string())?;
    pm.delete_workspace(uuid).map_err(|e| e.to_string())?;

    // Clean up project directory
    let project_dir = state.data_dir.join("projects").join(&id);
    if project_dir.exists() {
        let _ = std::fs::remove_dir_all(&project_dir);
    }

    Ok(())
}
