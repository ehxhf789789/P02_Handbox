// Handbox - Universal Sandbox Platform
// Tauri + AWS SDK + MCP 통합

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod aws;
mod agents;
mod tools;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            // 워크플로우 관리
            commands::workflow::save_workflow,
            commands::workflow::load_workflow,
            commands::workflow::execute_workflow,
            commands::workflow::list_workflows,
            commands::workflow::delete_workflow,

            // AWS 서비스
            commands::aws_service::set_aws_credentials,
            commands::aws_service::clear_aws_credentials,
            commands::aws_service::test_aws_connection,
            commands::aws_service::invoke_bedrock,
            commands::aws_service::create_embedding,
            commands::aws_service::search_knowledge_base,
            commands::aws_service::upload_to_s3,
            commands::aws_service::set_bedrock_api_key,
            commands::aws_service::clear_bedrock_api_key,
            commands::aws_service::has_bedrock_api_key,

            // 에이전트 관리
            commands::agent::create_agent,
            commands::agent::list_agents,
            commands::agent::execute_agent,

            // 지식베이스 관리
            commands::knowledge_base::create_knowledge_base,
            commands::knowledge_base::add_documents,
            commands::knowledge_base::query_knowledge_base,
            commands::knowledge_base::save_knowledge_base_local,
            commands::knowledge_base::load_knowledge_base_local,
            commands::knowledge_base::list_local_knowledge_bases,

            // 파일 시스템
            commands::file_system::get_file_info,
            commands::file_system::scan_folder,
            commands::file_system::read_file_content,
            commands::file_system::parse_pdf,
            commands::file_system::select_file,
            commands::file_system::select_folder,

            // CLI / 스크립트 실행
            commands::cli::execute_cli,
            commands::cli::execute_python_script,
            commands::cli::detect_cli_providers,
            commands::cli::get_cli_provider_info,
            commands::cli::test_aws_cli_credentials,
            commands::cli::ollama_chat,
            commands::cli::execute_cli_with_env,

            // Credential Vault (보안 자격증명 저장소)
            commands::credentials::credential_store,
            commands::credentials::credential_retrieve,
            commands::credentials::credential_delete,
            commands::credentials::credential_get_metadata,
            commands::credentials::credential_has_provider,
            commands::credentials::credential_store_aws,
            commands::credentials::credential_retrieve_aws,

            // MCP Server Manager
            commands::mcp::mcp_start_server,
            commands::mcp::mcp_stop_server,
            commands::mcp::mcp_get_server_status,
            commands::mcp::mcp_initialize,
            commands::mcp::mcp_list_tools,
            commands::mcp::mcp_call_tool,
            commands::mcp::mcp_get_resource,
            commands::mcp::mcp_list_servers,

            // Phase 3: 데이터 로더
            commands::data_loader::parse_excel,
            commands::data_loader::parse_csv,
            commands::data_loader::detect_file_type,
            commands::data_loader::load_text_file,

            // Phase 3: 로컬 저장소 (SQLite/JSON)
            commands::local_storage::sqlite_init,
            commands::local_storage::sqlite_create_table,
            commands::local_storage::sqlite_save,
            commands::local_storage::sqlite_save_batch,
            commands::local_storage::sqlite_query,
            commands::local_storage::sqlite_list_tables,
            commands::local_storage::json_file_save,
            commands::local_storage::json_file_load,
            commands::local_storage::json_file_append,

            // Phase 3: 벡터 저장소
            commands::vector_store::vector_create_index,
            commands::vector_store::vector_list_indices,
            commands::vector_store::vector_add,
            commands::vector_store::vector_search,
            commands::vector_store::vector_text_search,
            commands::vector_store::vector_hybrid_search,
            commands::vector_store::vector_delete_index,

            // ═══════════════════════════════════════
            // Tier 1 도구 시스템 — 새 커맨드
            // ═══════════════════════════════════════

            // IO 도구
            commands::tool_io::tool_file_read,
            commands::tool_io::tool_file_write,
            commands::tool_io::tool_file_list,
            commands::tool_io::tool_file_info,
            commands::tool_io::tool_http_request,

            // Transform 도구
            commands::tool_transform::tool_json_query,
            commands::tool_transform::tool_json_parse,
            commands::tool_transform::tool_json_stringify,
            commands::tool_transform::tool_csv_parse,
            commands::tool_transform::tool_csv_stringify,
            commands::tool_transform::tool_text_split,
            commands::tool_transform::tool_text_regex,
            commands::tool_transform::tool_text_template,
            commands::tool_transform::tool_xml_parse,

            // Storage 도구
            commands::tool_storage::tool_kv_set,
            commands::tool_storage::tool_kv_get,
            commands::tool_storage::tool_kv_delete,
            commands::tool_storage::tool_kv_list,
            commands::tool_storage::tool_vector_store,
            commands::tool_storage::tool_vector_search,
            commands::tool_storage::tool_vector_hybrid_search,
            commands::tool_storage::tool_sqlite_query,
            commands::tool_storage::tool_sqlite_schema,

            // Document 도구
            commands::tool_doc::tool_doc_parse,
            commands::tool_doc::tool_doc_convert,

            // Process 도구
            commands::tool_process::tool_shell_exec,
            commands::tool_process::tool_code_eval,

            // ═══════════════════════════════════════
            // Tier 2 플러그인 시스템
            // ═══════════════════════════════════════
            commands::plugin_manager::plugin_install,
            commands::plugin_manager::plugin_uninstall,
            commands::plugin_manager::plugin_list,
            commands::plugin_manager::plugin_list_available,
            commands::plugin_manager::plugin_update_manifest,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
