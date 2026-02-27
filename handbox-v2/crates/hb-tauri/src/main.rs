//! Handbox v2 — Tauri application entry point.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod state;

use commands::agent::AgentOrchestratorState;
use commands::collaboration::CollaborationState;
use commands::marketplace::MarketplaceState;
use commands::mcp::McpState;
use state::AppState;
use std::path::PathBuf;
use std::sync::Arc;

fn main() {
    tracing_subscriber::fmt::init();

    let data_dir = dirs_data_dir().unwrap_or_else(|| PathBuf::from("."));
    let app_state = AppState::new(data_dir);

    // Initialize trace store
    if let Err(e) = app_state.init_trace_store() {
        tracing::warn!("Failed to init trace store: {e}");
    }

    // Initialize MCP state
    let mcp_state = McpState::default();

    // Initialize Agent Orchestrator state
    let agent_state = Arc::new(AgentOrchestratorState::default());

    // Initialize Collaboration state
    let collab_state = Arc::new(CollaborationState::default());

    // Initialize Marketplace state
    let marketplace_state = Arc::new(MarketplaceState::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .manage(mcp_state)
        .manage(agent_state)
        .manage(collab_state)
        .manage(marketplace_state)
        .invoke_handler(tauri::generate_handler![
            // Workflow CRUD
            commands::workflow::create_workflow,
            commands::workflow::get_workflow,
            commands::workflow::list_workflows,
            commands::workflow::update_workflow,
            commands::workflow::delete_workflow,
            commands::workflow::import_workflow,
            commands::workflow::export_workflow_file,
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
            // LLM
            commands::llm::set_bedrock_credentials,
            commands::llm::set_bedrock_region,
            commands::llm::set_openai_api_key,
            commands::llm::set_anthropic_api_key,
            commands::llm::clear_llm_credentials,
            commands::llm::set_local_llm_endpoint,
            commands::llm::test_llm_connection,
            commands::llm::list_llm_models,
            commands::llm::invoke_llm,
            commands::llm::create_embedding,
            commands::llm::get_credential_status,
            // GIS
            commands::gis::gis_read_geojson,
            commands::gis::gis_read_shapefile,
            commands::gis::gis_read_geopackage,
            commands::gis::gis_write_geojson,
            commands::gis::gis_calculate_bounds,
            commands::gis::gis_calculate_centroid,
            commands::gis::gis_calculate_area,
            commands::gis::gis_calculate_length,
            commands::gis::gis_property_statistics,
            commands::gis::gis_filter_features,
            // IFC
            commands::ifc::ifc_read_file,
            commands::ifc::ifc_parse_content,
            commands::ifc::ifc_extract_hierarchy,
            commands::ifc::ifc_get_element_summary,
            commands::ifc::ifc_get_entity_properties,
            commands::ifc::ifc_get_entity_quantities,
            commands::ifc::ifc_search_entities,
            commands::ifc::ifc_get_statistics,
            commands::ifc::ifc_export_summary_json,
            commands::ifc::ifc_export_elements_csv,
            // MCP
            commands::mcp::mcp_add_server,
            commands::mcp::mcp_remove_server,
            commands::mcp::mcp_connect_server,
            commands::mcp::mcp_disconnect_server,
            commands::mcp::mcp_list_servers,
            commands::mcp::mcp_get_tools,
            commands::mcp::mcp_call_tool,
            commands::mcp::mcp_health_check,
            // Agent Orchestration
            commands::agent::agent_start_orchestrator,
            commands::agent::agent_stop_orchestrator,
            commands::agent::agent_register,
            commands::agent::agent_unregister,
            commands::agent::agent_update_status,
            commands::agent::agent_list_instances,
            commands::agent::agent_get_instance,
            commands::agent::agent_create_task,
            commands::agent::agent_assign_task,
            commands::agent::agent_start_task,
            commands::agent::agent_complete_task,
            commands::agent::agent_cancel_task,
            commands::agent::agent_get_task,
            commands::agent::agent_list_tasks,
            commands::agent::agent_get_pending_tasks,
            commands::agent::agent_get_stats,
            commands::agent::agent_get_events,
            commands::agent::agent_update_config,
            commands::agent::agent_get_config,
            commands::agent::agent_process_pending,
            // Collaboration
            commands::collaboration::collab_create_session,
            commands::collaboration::collab_join_session,
            commands::collaboration::collab_leave_session,
            commands::collaboration::collab_get_session,
            commands::collaboration::collab_list_sessions,
            commands::collaboration::collab_update_cursor,
            commands::collaboration::collab_update_selection,
            commands::collaboration::collab_send_message,
            commands::collaboration::collab_get_chat_history,
            commands::collaboration::collab_add_reaction,
            commands::collaboration::collab_remove_reaction,
            commands::collaboration::collab_broadcast_change,
            commands::collaboration::collab_get_events,
            commands::collaboration::collab_create_invite,
            commands::collaboration::collab_get_invite,
            commands::collaboration::collab_accept_invite,
            commands::collaboration::collab_update_settings,
            commands::collaboration::collab_heartbeat,
            commands::collaboration::collab_close_session,
            // Marketplace
            commands::marketplace::marketplace_search,
            commands::marketplace::marketplace_get_workflow,
            commands::marketplace::marketplace_get_featured,
            commands::marketplace::marketplace_get_popular,
            commands::marketplace::marketplace_get_categories,
            commands::marketplace::marketplace_download,
            commands::marketplace::marketplace_like,
            commands::marketplace::marketplace_unlike,
            commands::marketplace::marketplace_is_liked,
            commands::marketplace::marketplace_get_reviews,
            commands::marketplace::marketplace_submit_review,
            commands::marketplace::marketplace_create_collection,
            commands::marketplace::marketplace_add_to_collection,
            commands::marketplace::marketplace_remove_from_collection,
            commands::marketplace::marketplace_get_collections,
            commands::marketplace::marketplace_get_downloads,
            commands::marketplace::marketplace_get_likes,
            commands::marketplace::marketplace_publish,
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
