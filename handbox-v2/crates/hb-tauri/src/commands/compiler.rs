//! Compiler command — convert prompt to WorkflowSpec.

use crate::state::AppState;
use hb_core::graph::WorkflowSpec;
use tauri::State;

#[tauri::command]
pub async fn compile_prompt(
    prompt: String,
    state: State<'_, AppState>,
) -> Result<WorkflowSpec, String> {
    let spec = hb_compiler::compile(&prompt)
        .await
        .map_err(|e| format!("Compilation failed: {e}"))?;

    // Store the generated workflow
    let id = spec.id.to_string();
    state.workflows.write().await.insert(id, spec.clone());

    Ok(spec)
}
