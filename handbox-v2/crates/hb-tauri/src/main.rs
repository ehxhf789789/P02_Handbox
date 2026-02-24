//! Handbox v2 — Tauri application entry point.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod state;

use state::AppState;
use std::path::PathBuf;

fn main() {
    tracing_subscriber::fmt::init();

    let data_dir = dirs_data_dir().unwrap_or_else(|| PathBuf::from("."));
    let app_state = AppState::new(data_dir);

    // Initialize trace store
    if let Err(e) = app_state.init_trace_store() {
        tracing::warn!("Failed to init trace store: {e}");
    }

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // Workflow CRUD
            commands::workflow::create_workflow,
            commands::workflow::get_workflow,
            commands::workflow::list_workflows,
            commands::workflow::update_workflow,
            commands::workflow::delete_workflow,
            commands::workflow::import_workflow,
            // Execution
            commands::execution::execute_workflow,
            commands::execution::get_execution_status,
            commands::execution::cancel_execution,
            // Project management
            commands::project::create_project,
            commands::project::get_project,
            commands::project::list_projects,
            // Tool registry
            commands::tool::list_tools,
            commands::tool::get_tool,
            commands::tool::search_tools,
            commands::tool::load_packs,
            // Trace
            commands::trace::get_traces,
            commands::trace::get_span,
            commands::trace::export_traces,
            // Pack management
            commands::pack::list_packs,
            commands::pack::get_pack,
            commands::pack::install_pack,
            // Compiler
            commands::compiler::compile_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error running Handbox");
}

fn dirs_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA")
            .ok()
            .map(|p| PathBuf::from(p).join("Handbox"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        dirs::data_dir().map(|p| p.join("handbox"))
    }
}
