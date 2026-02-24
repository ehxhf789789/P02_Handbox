//! Trace query commands — backed by AppState.

use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_traces(
    execution_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let guard = state.trace_store.read().await;
    let store = guard.as_ref().ok_or("Trace store not initialized")?;
    let ex_id: uuid::Uuid = execution_id
        .parse()
        .map_err(|e: uuid::Error| e.to_string())?;
    let spans = store
        .query_spans_by_execution(ex_id)
        .map_err(|e| e.to_string())?;
    let values: Vec<serde_json::Value> = spans
        .iter()
        .filter_map(|s| serde_json::to_value(s).ok())
        .collect();
    Ok(values)
}

#[tauri::command]
pub async fn get_span(
    span_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let guard = state.trace_store.read().await;
    let store = guard.as_ref().ok_or("Trace store not initialized")?;
    let sp_id: uuid::Uuid = span_id
        .parse()
        .map_err(|e: uuid::Error| e.to_string())?;
    let span = store
        .query_span(sp_id)
        .map_err(|e| e.to_string())?
        .ok_or("Span not found")?;
    serde_json::to_value(&span).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_traces(
    execution_id: String,
    _format: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let guard = state.trace_store.read().await;
    let store = guard.as_ref().ok_or("Trace store not initialized")?;
    let ex_id: uuid::Uuid = execution_id
        .parse()
        .map_err(|e: uuid::Error| e.to_string())?;
    let spans = store
        .query_spans_by_execution(ex_id)
        .map_err(|e| e.to_string())?;
    hb_trace::export::export_json(&spans).map_err(|e| e.to_string())
}
