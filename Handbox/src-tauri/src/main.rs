// CNT Agent Studio - Rust Backend
// Tauri + AWS SDK 통합

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod aws;
mod agents;

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
