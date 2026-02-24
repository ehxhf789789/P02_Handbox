//! Project/Workspace management commands.

use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn create_project(
    name: String,
    root_path: String,
    _state: State<'_, AppState>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4();
    let _ = (&name, &root_path);
    Ok(id.to_string())
}

#[tauri::command]
pub async fn get_project(
    id: String,
    _state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let _id: uuid::Uuid = id.parse().map_err(|e: uuid::Error| e.to_string())?;
    Err("not yet implemented".into())
}

#[tauri::command]
pub async fn list_projects(
    _state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}
