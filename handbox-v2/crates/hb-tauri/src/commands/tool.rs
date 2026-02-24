//! Tool registry commands — backed by AppState.

use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_tools(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let registry = state.tool_registry.read().await;
    let tools: Vec<serde_json::Value> = registry
        .list()
        .iter()
        .filter_map(|t| serde_json::to_value(t).ok())
        .collect();
    Ok(tools)
}

#[tauri::command]
pub async fn get_tool(
    tool_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let registry = state.tool_registry.read().await;
    let tool = registry
        .get(&tool_id)
        .ok_or_else(|| format!("Tool not found: {tool_id}"))?;
    serde_json::to_value(tool).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_tools(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let registry = state.tool_registry.read().await;
    let tag = hb_core::tool::CapabilityTag::new(&query);
    let tools: Vec<serde_json::Value> = registry
        .search_by_capability(&tag)
        .iter()
        .filter_map(|t| serde_json::to_value(t).ok())
        .collect();
    Ok(tools)
}

#[tauri::command]
pub async fn load_packs(
    packs_dir: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let tools = hb_mcp::registry::scan_packs(&packs_dir).map_err(|e| e.to_string())?;
    let count = tools.len();
    let mut registry = state.tool_registry.write().await;
    for tool in tools {
        registry.register(tool);
    }
    Ok(count)
}
