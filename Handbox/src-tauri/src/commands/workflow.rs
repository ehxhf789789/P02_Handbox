// 워크플로우 관리 커맨드

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::BufWriter;
use std::path::Path;
use tauri::api::path::app_data_dir;
use uuid::Uuid;
use chrono::Utc;
use aws_config::BehaviorVersion;

// 문서 처리 라이브러리
use calamine::{Reader, open_workbook, Xlsx, Xls, Ods};
use rust_xlsxwriter::{Workbook as XlsxWorkbook, Format};
use docx_rs::{Docx, Paragraph, Run};
use printpdf::{PdfDocument, Mm, BuiltinFont};
use ppt_rs::generator::{SlideContent, create_pptx_with_content};
use hwpers::writer::HwpWriter;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkflowNode {
    pub id: String,
    pub node_type: String,  // "agent", "knowledge_base", "data_source", "output"
    pub position: Position,
    pub data: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkflowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub source_handle: Option<String>,
    pub target_handle: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Workflow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub nodes: Vec<WorkflowNode>,
    pub edges: Vec<WorkflowEdge>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub success: bool,
    pub outputs: Vec<NodeOutput>,
    pub execution_time_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NodeOutput {
    pub node_id: String,
    pub output: serde_json::Value,
}

/// 워크플로우 저장
#[tauri::command]
pub async fn save_workflow(
    workflow: Workflow,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let config = app_handle.config();
    let data_dir = app_data_dir(&config)
        .ok_or("Failed to get app data directory")?;

    let workflows_dir = data_dir.join("workflows");
    fs::create_dir_all(&workflows_dir)
        .map_err(|e| format!("Failed to create workflows directory: {}", e))?;

    let mut workflow = workflow;
    workflow.updated_at = Utc::now().to_rfc3339();

    if workflow.id.is_empty() {
        workflow.id = Uuid::new_v4().to_string();
        workflow.created_at = workflow.updated_at.clone();
    }

    let file_path = workflows_dir.join(format!("{}.json", workflow.id));
    let json = serde_json::to_string_pretty(&workflow)
        .map_err(|e| format!("Failed to serialize workflow: {}", e))?;

    fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write workflow file: {}", e))?;

    Ok(workflow.id)
}

/// 워크플로우 로드
#[tauri::command]
pub async fn load_workflow(
    workflow_id: String,
    app_handle: tauri::AppHandle,
) -> Result<Workflow, String> {
    let config = app_handle.config();
    let data_dir = app_data_dir(&config)
        .ok_or("Failed to get app data directory")?;

    let file_path = data_dir.join("workflows").join(format!("{}.json", workflow_id));

    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read workflow file: {}", e))?;

    let workflow: Workflow = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse workflow: {}", e))?;

    Ok(workflow)
}

/// 워크플로우 목록 조회
#[tauri::command]
pub async fn list_workflows(
    app_handle: tauri::AppHandle,
) -> Result<Vec<Workflow>, String> {
    let config = app_handle.config();
    let data_dir = app_data_dir(&config)
        .ok_or("Failed to get app data directory")?;

    let workflows_dir = data_dir.join("workflows");

    if !workflows_dir.exists() {
        return Ok(vec![]);
    }

    let mut workflows = Vec::new();

    let entries = fs::read_dir(&workflows_dir)
        .map_err(|e| format!("Failed to read workflows directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.extension().map_or(false, |ext| ext == "json") {
            let content = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read file: {}", e))?;

            if let Ok(workflow) = serde_json::from_str::<Workflow>(&content) {
                workflows.push(workflow);
            }
        }
    }

    // 최신 순 정렬
    workflows.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(workflows)
}

/// 워크플로우 삭제
#[tauri::command]
pub async fn delete_workflow(
    id: String,
    app_handle: tauri::AppHandle,
) -> Result<bool, String> {
    let config = app_handle.config();
    let data_dir = app_data_dir(&config)
        .ok_or("Failed to get app data directory")?;

    let file_path = data_dir.join("workflows").join(format!("{}.json", id));

    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete workflow file: {}", e))?;
        Ok(true)
    } else {
        Err("Workflow not found".to_string())
    }
}

/// 워크플로우 실행
#[tauri::command]
pub async fn execute_workflow(
    workflow: Workflow,
    input: serde_json::Value,
) -> Result<ExecutionResult, String> {
    let start = std::time::Instant::now();

    // 토폴로지 정렬로 실행 순서 결정
    let execution_order = topological_sort(&workflow)?;

    let mut node_outputs: std::collections::HashMap<String, serde_json::Value> =
        std::collections::HashMap::new();

    // 초기 입력 설정
    node_outputs.insert("__input__".to_string(), input);

    let mut outputs = Vec::new();

    // 각 노드 순서대로 실행
    for node_id in execution_order {
        let node = workflow.nodes.iter()
            .find(|n| n.id == node_id)
            .ok_or(format!("Node not found: {}", node_id))?;

        // 이전 노드들의 출력을 입력으로 수집
        let mut node_input = collect_node_inputs(&node.id, &workflow.edges, &node_outputs);

        // input 노드이거나 들어오는 엣지가 없는 경우 초기 입력 사용
        let has_incoming_edges = workflow.edges.iter().any(|e| e.target == node_id);
        if node.node_type == "input" || (!has_incoming_edges && node_input.as_object().map_or(true, |o| o.is_empty())) {
            if let Some(initial_input) = node_outputs.get("__input__") {
                node_input = initial_input.clone();
            }
        }

        // 노드 실행
        let result = execute_node(node, &node_input).await?;

        node_outputs.insert(node_id.clone(), result.clone());

        outputs.push(NodeOutput {
            node_id,
            output: result,
        });
    }

    Ok(ExecutionResult {
        success: true,
        outputs,
        execution_time_ms: start.elapsed().as_millis() as u64,
        error: None,
    })
}

/// 토폴로지 정렬
fn topological_sort(workflow: &Workflow) -> Result<Vec<String>, String> {
    let mut in_degree: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();
    let mut adj: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();

    // 초기화
    for node in &workflow.nodes {
        in_degree.insert(node.id.clone(), 0);
        adj.insert(node.id.clone(), vec![]);
    }

    // 엣지 처리
    for edge in &workflow.edges {
        if let Some(count) = in_degree.get_mut(&edge.target) {
            *count += 1;
        }
        if let Some(neighbors) = adj.get_mut(&edge.source) {
            neighbors.push(edge.target.clone());
        }
    }

    // in-degree가 0인 노드부터 시작
    let mut queue: std::collections::VecDeque<String> =
        in_degree.iter()
            .filter(|(_, &deg)| deg == 0)
            .map(|(id, _)| id.clone())
            .collect();

    let mut result = Vec::new();

    while let Some(node_id) = queue.pop_front() {
        result.push(node_id.clone());

        if let Some(neighbors) = adj.get(&node_id) {
            for neighbor in neighbors {
                if let Some(deg) = in_degree.get_mut(neighbor) {
                    *deg -= 1;
                    if *deg == 0 {
                        queue.push_back(neighbor.clone());
                    }
                }
            }
        }
    }

    if result.len() != workflow.nodes.len() {
        return Err("Workflow contains a cycle".to_string());
    }

    Ok(result)
}

/// 노드 입력 수집
fn collect_node_inputs(
    node_id: &str,
    edges: &[WorkflowEdge],
    outputs: &std::collections::HashMap<String, serde_json::Value>,
) -> serde_json::Value {
    let mut inputs = serde_json::Map::new();

    for edge in edges {
        if edge.target == node_id {
            if let Some(output) = outputs.get(&edge.source) {
                // source_handle이 있으면 사용하고, 없으면 source node id를 키로 사용
                // 이렇게 하면 병합 노드에서 각 브랜치의 결과를 모두 받을 수 있음
                let key = edge.source_handle.clone().unwrap_or_else(|| edge.source.clone());
                inputs.insert(key, output.clone());
            }
        }
    }

    serde_json::Value::Object(inputs)
}

/// 개별 노드 실행
pub async fn execute_node(
    node: &WorkflowNode,
    input: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let node_type = node.node_type.as_str();

    // 노드 타입별 카테고리 분류
    match node_type {
        // 입출력 & 제어 노드
        "input" => {
            // 입력 데이터에서 텍스트 추출
            let text = input.get("text")
                .or_else(|| input.get("query"))
                .and_then(|v| v.as_str())
                .unwrap_or("");

            Ok(serde_json::json!({
                "type": "input",
                "text": text,
                "query": text,
                "data": input,
                "config": node.data.clone()
            }))
        }
        "output" => {
            Ok(input.clone())
        }
        "prompt-template" => {
            let template = node.data.get("config")
                .and_then(|c| c.get("template"))
                .and_then(|t| t.as_str())
                .unwrap_or("");

            // 입력에서 텍스트 추출
            let input_text = extract_text_from_input(input);

            // 템플릿 렌더링 - {{input}}, {{text}}, {{query}} 등의 변수 치환
            let mut rendered = template.to_string();
            rendered = rendered.replace("{{input}}", &input_text);
            rendered = rendered.replace("{{text}}", &input_text);
            rendered = rendered.replace("{{query}}", &input_text);
            rendered = rendered.replace("{{original_text}}", &input_text);

            // 입력 객체의 특정 필드도 치환 가능하게
            if let Some(obj) = input.as_object() {
                for (key, value) in obj {
                    // 소스 노드 ID가 키인 경우, 해당 노드의 값들을 변수로 사용
                    if let Some(inner_obj) = value.as_object() {
                        for (inner_key, inner_value) in inner_obj {
                            let placeholder = format!("{{{{{}}}}}", inner_key);
                            if let Some(str_val) = inner_value.as_str() {
                                rendered = rendered.replace(&placeholder, str_val);
                            } else {
                                rendered = rendered.replace(&placeholder, &inner_value.to_string());
                            }
                        }
                    }
                    // 직접 값인 경우
                    let placeholder = format!("{{{{{}}}}}", key);
                    if let Some(str_val) = value.as_str() {
                        rendered = rendered.replace(&placeholder, str_val);
                    }
                }
            }

            Ok(serde_json::json!({
                "type": "prompt",
                "template": template,
                "input": input,
                "input_text": input_text,
                "rendered": rendered
            }))
        }
        "conditional" | "loop" => {
            Ok(serde_json::json!({
                "type": "control",
                "node_type": node_type,
                "input": input,
                "output": input
            }))
        }
        // 로컬 파일/폴더 노드
        "local-folder" => {
            let folder_path = node.data.get("config")
                .and_then(|c| c.get("folder_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let file_filter = node.data.get("config")
                .and_then(|c| c.get("file_filter"))
                .and_then(|f| f.as_str())
                .unwrap_or("");
            let include_subfolders = node.data.get("config")
                .and_then(|c| c.get("include_subfolders"))
                .and_then(|i| i.as_bool())
                .unwrap_or(false);
            let read_content = node.data.get("config")
                .and_then(|c| c.get("read_content"))
                .and_then(|r| r.as_bool())
                .unwrap_or(true);

            if folder_path.is_empty() {
                return Ok(serde_json::json!({
                    "type": "local_folder",
                    "status": "error",
                    "error": "폴더 경로가 설정되지 않았습니다"
                }));
            }

            // 폴더 내 파일 목록 가져오기
            match load_folder_files(folder_path, file_filter, include_subfolders, read_content) {
                Ok(files) => {
                    let file_count = files.len();
                    Ok(serde_json::json!({
                        "type": "local_folder",
                        "folder_path": folder_path,
                        "status": "loaded",
                        "file_count": file_count,
                        "files": files
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "local_folder",
                        "folder_path": folder_path,
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "local-file" => {
            let file_path = node.data.get("config")
                .and_then(|c| c.get("file_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let encoding = node.data.get("config")
                .and_then(|c| c.get("encoding"))
                .and_then(|e| e.as_str())
                .unwrap_or("utf-8");

            if file_path.is_empty() {
                return Ok(serde_json::json!({
                    "type": "local_file",
                    "status": "error",
                    "error": "파일 경로가 설정되지 않았습니다"
                }));
            }

            // 파일 읽기
            match load_single_file(file_path, encoding) {
                Ok(content) => {
                    Ok(serde_json::json!({
                        "type": "local_file",
                        "file_path": file_path,
                        "status": "loaded",
                        "content": content,
                        "size_bytes": content.len()
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "local_file",
                        "file_path": file_path,
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }

        "merge" => {
            // 병합 노드: 모든 입력 브랜치의 결과를 결합하여 출력
            let mut merged_results = Vec::new();
            let mut summary_lines = Vec::new();

            if let Some(inputs_obj) = input.as_object() {
                for (source_id, value) in inputs_obj {
                    // 서비스 이름 추출
                    let service_name = value.get("service")
                        .and_then(|s| s.as_str())
                        .unwrap_or(source_id.as_str());

                    // 상태 확인
                    let status = value.get("status").and_then(|s| s.as_str()).unwrap_or("unknown");
                    let is_success = status == "executed" || status == "success";
                    let status_icon = if is_success { "✅" } else if status == "error" { "❌" } else { "⚠️" };

                    // 각 브랜치의 결과에서 핵심 정보 추출
                    let (branch_result, display_text) = if let Some(translated) = value.get("translated_text").and_then(|t| t.as_str()) {
                        let target_lang = value.get("target_language").and_then(|l| l.as_str()).unwrap_or("?");
                        let lang_name = match target_lang {
                            "en" => "영어",
                            "ja" => "일본어",
                            "zh" => "중국어",
                            "ko" => "한국어",
                            _ => target_lang
                        };
                        (format!("[{}] {}", target_lang, translated), format!("{} {} ({}): {}", status_icon, service_name.to_uppercase(), lang_name, translated))
                    } else if let Some(sentiment) = value.get("sentiment").and_then(|s| s.as_str()) {
                        let sentiment_kr = match sentiment {
                            "POSITIVE" => "긍정적 😊",
                            "NEGATIVE" => "부정적 😞",
                            "NEUTRAL" => "중립 😐",
                            "MIXED" => "복합 🤔",
                            _ => sentiment
                        };
                        (format!("[감정] {}", sentiment), format!("{} {} 감정분석: {}", status_icon, service_name.to_uppercase(), sentiment_kr))
                    } else if let Some(error) = value.get("error").and_then(|e| e.as_str()) {
                        (format!("[오류] {}", error), format!("{} {} 오류: {}", status_icon, service_name.to_uppercase(), error))
                    } else if let Some(extracted) = value.get("extracted_text").and_then(|e| e.as_str()) {
                        (format!("[추출] {}", extracted), format!("{} {} 텍스트 추출 완료", status_icon, service_name.to_uppercase()))
                    } else {
                        (format!("[{}] 처리됨", service_name), format!("{} {} 처리 완료", status_icon, service_name.to_uppercase()))
                    };

                    merged_results.push(serde_json::json!({
                        "source": source_id,
                        "service": service_name,
                        "status": status,
                        "success": is_success,
                        "result": branch_result
                    }));

                    summary_lines.push(display_text);
                }
            }

            // 요약 헤더
            let success_count = merged_results.iter().filter(|r| r.get("success").and_then(|s| s.as_bool()).unwrap_or(false)).count();
            let total_count = merged_results.len();
            let header = format!("📊 실행 결과 ({}/{} 성공)\n{}", success_count, total_count, "─".repeat(30));

            let summary = format!("{}\n{}", header, summary_lines.join("\n"));

            Ok(serde_json::json!({
                "type": "merge",
                "branches": total_count,
                "success_count": success_count,
                "results": merged_results,
                "summary": summary
            }))
        }

        // 에이전트 노드
        "agent" | "custom-agent" | "rag-agent" | "chain-agent" => {
            let agent_config = &node.data;
            let prompt = agent_config.get("prompt")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            Ok(serde_json::json!({
                "type": "agent_response",
                "agent_type": node_type,
                "input": input,
                "prompt": prompt,
                "status": "executed",
                "response": format!("Agent {} executed successfully", node_type)
            }))
        }

        // Bedrock 모델 노드
        node_type if node_type.starts_with("model-") => {
            // 모델 ID 매핑 (노드 타입 -> AWS Bedrock 모델 ID)
            // 주의: Claude 3.5 Sonnet v2 등 최신 모델은 inference profile이 필요할 수 있음
            // 여기서는 직접 호출 가능한 모델 ID를 기본으로 사용
            let raw_model_id = node.data.get("config")
                .and_then(|c| c.get("modelId"))
                .and_then(|m| m.as_str())
                .map(|s| s.to_string());

            // 잘못된 모델 ID 자동 수정 (us. 접두사 제거, v2 -> v1 변환)
            let model_id = match raw_model_id {
                Some(id) => {
                    // us. 접두사가 있거나 v2 버전인 경우 수정
                    if id.starts_with("us.") || id.contains("20241022-v2") {
                        // 노드 타입에 따라 올바른 모델 ID 반환
                        match node_type {
                            "model-claude-3-5-sonnet" => "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string(),
                            "model-claude-3-opus" => "anthropic.claude-3-opus-20240229-v1:0".to_string(),
                            "model-claude-3-sonnet" => "anthropic.claude-3-sonnet-20240229-v1:0".to_string(),
                            "model-claude-3-haiku" => "anthropic.claude-3-haiku-20240307-v1:0".to_string(),
                            _ => "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string(), // 기본값
                        }
                    } else {
                        id
                    }
                }
                None => match node_type {
                    // Claude 모델 - 직접 호출 가능한 버전 사용
                    "model-claude-3-5-sonnet" => "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string(),
                    "model-claude-3-opus" => "anthropic.claude-3-opus-20240229-v1:0".to_string(),
                    "model-claude-3-sonnet" => "anthropic.claude-3-sonnet-20240229-v1:0".to_string(),
                    "model-claude-3-haiku" => "anthropic.claude-3-haiku-20240307-v1:0".to_string(),
                    "model-claude-instant" => "anthropic.claude-instant-v1".to_string(),
                    // Llama 모델
                    "model-llama-3-1-405b" => "meta.llama3-1-405b-instruct-v1:0".to_string(),
                    "model-llama-3-1-70b" => "meta.llama3-1-70b-instruct-v1:0".to_string(),
                    "model-llama-3-1-8b" => "meta.llama3-1-8b-instruct-v1:0".to_string(),
                    // Titan 모델
                    "model-titan-text-premier" => "amazon.titan-text-premier-v1:0".to_string(),
                    "model-titan-text-express" => "amazon.titan-text-express-v1".to_string(),
                    // Mistral 모델
                    "model-mistral-large" => "mistral.mistral-large-2402-v1:0".to_string(),
                    _ => node_type.to_string(),
                }
            };

            // 입력 텍스트 추출
            let user_input = extract_text_from_input(input);

            if user_input.is_empty() {
                return Ok(serde_json::json!({
                    "type": "model_response",
                    "model": node_type,
                    "model_id": model_id,
                    "status": "error",
                    "error": "입력 텍스트가 없습니다"
                }));
            }

            // 시스템 프롬프트 (선택적)
            let system_prompt = node.data.get("config")
                .and_then(|c| c.get("system_prompt"))
                .and_then(|s| s.as_str())
                .unwrap_or("");

            // Bedrock API 호출
            match invoke_bedrock_model(&model_id, &user_input, system_prompt).await {
                Ok(response) => {
                    Ok(serde_json::json!({
                        "type": "model_response",
                        "model": node_type,
                        "model_id": model_id,
                        "input": user_input,
                        "status": "executed",
                        "response": response
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "model_response",
                        "model": node_type,
                        "model_id": model_id,
                        "input": user_input,
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }

        // Bedrock 플랫폼 기능
        "bedrock-guardrails" => {
            let guardrail_id = node.data.get("config")
                .and_then(|c| c.get("guardrailId"))
                .and_then(|g| g.as_str())
                .unwrap_or("default");
            Ok(serde_json::json!({
                "type": "guardrails",
                "guardrail_id": guardrail_id,
                "input": input,
                "status": "filtered",
                "output": input
            }))
        }
        "bedrock-agents" | "bedrock-knowledge-base" | "bedrock-fine-tuning"
        | "bedrock-evaluation" | "bedrock-provisioned" | "bedrock-batch" => {
            Ok(serde_json::json!({
                "type": "bedrock_platform",
                "feature": node_type,
                "input": input,
                "status": "executed",
                "output": input
            }))
        }

        // AWS AI/ML 서비스
        "aws-bedrock" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "bedrock",
                "input": input,
                "status": "ready",
                "output": input
            }))
        }
        "aws-textract" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "textract",
                "input": input,
                "status": "executed",
                "extracted_text": "Textract OCR placeholder - connect AWS to extract actual text"
            }))
        }
        "aws-comprehend" | "aws-comprehend-medical" => {
            // 입력 텍스트 추출
            let text_to_analyze = extract_text_from_input(input);

            if text_to_analyze.is_empty() {
                return Ok(serde_json::json!({
                    "type": "aws_service",
                    "service": "comprehend",
                    "input": input,
                    "status": "error",
                    "error": "분석할 텍스트가 없습니다"
                }));
            }

            // 언어 코드 (기본값 한국어)
            let language_code = node.data.get("config")
                .and_then(|c| c.get("languageCode"))
                .and_then(|l| l.as_str())
                .unwrap_or("ko");

            // 분석 기능 선택
            let features = node.data.get("config")
                .and_then(|c| c.get("features"))
                .and_then(|f| f.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>())
                .unwrap_or_else(|| vec!["SENTIMENT"]);

            // AWS Comprehend API 호출
            match analyze_text_comprehend(&text_to_analyze, language_code, &features).await {
                Ok(result) => {
                    Ok(serde_json::json!({
                        "type": "aws_service",
                        "service": "comprehend",
                        "input": input,
                        "original_text": text_to_analyze,
                        "language": language_code,
                        "status": "executed",
                        "sentiment": result.get("sentiment").cloned().unwrap_or(serde_json::json!("UNKNOWN")),
                        "sentiment_scores": result.get("sentiment_scores").cloned().unwrap_or(serde_json::json!({})),
                        "entities": result.get("entities").cloned().unwrap_or(serde_json::json!([])),
                        "key_phrases": result.get("key_phrases").cloned().unwrap_or(serde_json::json!([]))
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "aws_service",
                        "service": "comprehend",
                        "input": input,
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "aws-translate" => {
            // 입력 텍스트 추출
            let text_to_translate = extract_text_from_input(input);

            if text_to_translate.is_empty() {
                return Ok(serde_json::json!({
                    "type": "aws_service",
                    "service": "translate",
                    "input": input,
                    "status": "error",
                    "error": "번역할 텍스트가 없습니다"
                }));
            }

            // 노드 설정에서 언어 코드 추출 (PropertyPanel은 source_lang/target_lang 사용)
            let source_lang = node.data.get("config")
                .and_then(|c| c.get("source_lang").or_else(|| c.get("sourceLanguage")))
                .and_then(|s| s.as_str())
                .unwrap_or("auto");
            let target_lang = node.data.get("config")
                .and_then(|c| c.get("target_lang").or_else(|| c.get("targetLanguage")))
                .and_then(|t| t.as_str())
                .unwrap_or("en");

            // AWS Translate API 호출
            match translate_text(&text_to_translate, source_lang, target_lang).await {
                Ok(translated) => {
                    Ok(serde_json::json!({
                        "type": "aws_service",
                        "service": "translate",
                        "input": input,
                        "original_text": text_to_translate,
                        "source_language": source_lang,
                        "target_language": target_lang,
                        "status": "executed",
                        "translated_text": translated
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "aws_service",
                        "service": "translate",
                        "input": input,
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "aws-polly" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "polly",
                "input": input,
                "status": "executed",
                "audio_url": "audio_placeholder.mp3"
            }))
        }
        "aws-transcribe" | "aws-transcribe-medical" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "transcribe",
                "input": input,
                "status": "executed",
                "transcript": "Transcription placeholder"
            }))
        }
        "aws-rekognition" | "aws-rekognition-video" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "rekognition",
                "input": input,
                "status": "executed",
                "labels": [],
                "faces": []
            }))
        }
        "aws-kendra" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "kendra",
                "input": input,
                "status": "executed",
                "results": []
            }))
        }
        "aws-lex" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "lex",
                "input": input,
                "status": "executed",
                "intent": "DefaultIntent",
                "response": "Lex response placeholder"
            }))
        }
        "aws-sagemaker" | "aws-sagemaker-endpoints" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "sagemaker",
                "input": input,
                "status": "executed",
                "prediction": {}
            }))
        }
        "aws-personalize" | "aws-forecast" | "aws-fraud-detector" | "aws-codewhisperer" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": node_type.trim_start_matches("aws-"),
                "input": input,
                "status": "executed",
                "output": input
            }))
        }

        // AWS 스토리지/DB
        "aws-s3" | "aws-s3-glacier" | "s3" => {
            let bucket = node.data.get("config")
                .and_then(|c| c.get("bucket"))
                .and_then(|b| b.as_str())
                .unwrap_or("default-bucket");
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "s3",
                "bucket": bucket,
                "input": input,
                "status": "executed",
                "objects": []
            }))
        }
        "aws-dynamodb" | "aws-dynamodb-streams" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "dynamodb",
                "input": input,
                "status": "executed",
                "items": []
            }))
        }
        "aws-opensearch" | "opensearch" => {
            let index = node.data.get("config")
                .and_then(|c| c.get("indexName"))
                .and_then(|i| i.as_str())
                .unwrap_or("default-index");
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "opensearch",
                "index": index,
                "input": input,
                "status": "executed",
                "hits": []
            }))
        }
        "aws-rds" | "aws-aurora" | "aws-elasticache" | "aws-documentdb"
        | "aws-neptune" | "aws-timestream" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": node_type.trim_start_matches("aws-"),
                "input": input,
                "status": "executed",
                "result": {}
            }))
        }

        // AWS 컴퓨팅
        "aws-lambda" | "aws-lambda-layers" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "lambda",
                "input": input,
                "status": "executed",
                "response": {}
            }))
        }
        "aws-step-functions" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "step-functions",
                "input": input,
                "status": "executed",
                "execution_arn": "placeholder"
            }))
        }
        "aws-ec2" | "aws-ecs" | "aws-fargate" | "aws-batch" | "aws-app-runner" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": node_type.trim_start_matches("aws-"),
                "input": input,
                "status": "executed"
            }))
        }

        // AWS 통합/메시징
        "aws-eventbridge" | "aws-eventbridge-scheduler" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "eventbridge",
                "input": input,
                "status": "executed"
            }))
        }
        "aws-sqs" | "aws-sns" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": node_type.trim_start_matches("aws-"),
                "input": input,
                "status": "message_sent"
            }))
        }
        "aws-api-gateway" | "aws-appsync" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": node_type.trim_start_matches("aws-"),
                "input": input,
                "status": "executed",
                "response": {}
            }))
        }
        "aws-kinesis" | "aws-kinesis-firehose" | "aws-msk" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": "kinesis",
                "input": input,
                "status": "stream_processed"
            }))
        }

        // AWS 분석
        "aws-glue" | "aws-glue-crawler" | "aws-athena" | "aws-redshift"
        | "aws-quicksight" | "aws-cloudwatch" | "aws-cloudwatch-logs" | "aws-xray" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": node_type.trim_start_matches("aws-"),
                "input": input,
                "status": "executed",
                "result": {}
            }))
        }

        // AWS 보안
        "aws-iam" | "aws-iam-roles" | "aws-secrets-manager" | "aws-kms"
        | "aws-cognito" | "aws-waf" | "aws-shield" | "aws-guardduty" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": node_type.trim_start_matches("aws-"),
                "input": input,
                "status": "executed"
            }))
        }

        // AWS 미디어
        "aws-mediaconvert" | "aws-elemental" | "aws-ivs" => {
            Ok(serde_json::json!({
                "type": "aws_service",
                "service": node_type.trim_start_matches("aws-"),
                "input": input,
                "status": "executed"
            }))
        }

        // 데이터 처리 노드
        "knowledge-base" | "knowledge_base" => {
            let query = input.get("query")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            Ok(serde_json::json!({
                "type": "knowledge_base_result",
                "query": query,
                "results": []
            }))
        }
        "document-loader" => {
            Ok(serde_json::json!({
                "type": "document",
                "input": input,
                "status": "loaded",
                "content": "Document content placeholder"
            }))
        }
        "text-splitter" | "chunker" => {
            // 입력 텍스트 추출
            let text_to_split = extract_text_from_input(input);

            if text_to_split.is_empty() {
                return Ok(serde_json::json!({
                    "type": "chunks",
                    "input": input,
                    "status": "error",
                    "error": "분할할 텍스트가 없습니다"
                }));
            }

            // 설정 값 추출
            let chunk_size = node.data.get("config")
                .and_then(|c| c.get("chunk_size"))
                .and_then(|s| s.as_i64())
                .unwrap_or(1000) as usize;
            let chunk_overlap = node.data.get("config")
                .and_then(|c| c.get("chunk_overlap"))
                .and_then(|o| o.as_i64())
                .unwrap_or(200) as usize;
            let split_by = node.data.get("config")
                .and_then(|c| c.get("split_by"))
                .and_then(|s| s.as_str())
                .unwrap_or("paragraph");

            // 텍스트 분할 로직
            let chunks = split_text(&text_to_split, chunk_size, chunk_overlap, split_by);

            Ok(serde_json::json!({
                "type": "chunks",
                "input": input,
                "original_length": text_to_split.len(),
                "chunk_size": chunk_size,
                "chunk_overlap": chunk_overlap,
                "split_by": split_by,
                "status": "executed",
                "chunk_count": chunks.len(),
                "chunks": chunks
            }))
        }
        "embedder" => {
            // 입력 텍스트 또는 청크 추출
            let texts_to_embed = if let Some(chunks) = input.get("chunks").and_then(|c| c.as_array()) {
                // 이전 text-splitter의 청크를 사용
                chunks.iter()
                    .filter_map(|c| c.get("text").and_then(|t| t.as_str()).map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            } else {
                // 단일 텍스트 사용
                let text = extract_text_from_input(input);
                if text.is_empty() {
                    vec![]
                } else {
                    vec![text]
                }
            };

            if texts_to_embed.is_empty() {
                return Ok(serde_json::json!({
                    "type": "embeddings",
                    "input": input,
                    "status": "error",
                    "error": "임베딩할 텍스트가 없습니다"
                }));
            }

            let model = node.data.get("config")
                .and_then(|c| c.get("model"))
                .and_then(|m| m.as_str())
                .unwrap_or("amazon.titan-embed-text-v2:0");

            // AWS Bedrock Titan 임베딩 API 호출
            match generate_embeddings(&texts_to_embed, model).await {
                Ok(embeddings) => {
                    let embedding_dim = embeddings.first().map(|e| e.len()).unwrap_or(0);
                    Ok(serde_json::json!({
                        "type": "embeddings",
                        "model": model,
                        "input": input,
                        "status": "executed",
                        "text_count": texts_to_embed.len(),
                        "embedding_dim": embedding_dim,
                        "embeddings": embeddings.iter().enumerate().map(|(i, e)| {
                            serde_json::json!({
                                "index": i,
                                "text": texts_to_embed.get(i).unwrap_or(&String::new()),
                                "embedding": e,
                                "dimension": e.len()
                            })
                        }).collect::<Vec<_>>()
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "embeddings",
                        "model": model,
                        "input": input,
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "vector-search" => {
            let top_k = node.data.get("config")
                .and_then(|c| c.get("topK"))
                .and_then(|k| k.as_i64())
                .unwrap_or(5);
            Ok(serde_json::json!({
                "type": "search_results",
                "input": input,
                "top_k": top_k,
                "results": []
            }))
        }

        // 레거시 호환
        "data_source" | "bedrock" | "textract" => {
            Ok(serde_json::json!({
                "type": "data",
                "data": node.data.clone()
            }))
        }

        // 외부 API 노드들
        "api-generic" => {
            let api_url = node.data.get("config")
                .and_then(|c| c.get("api_url"))
                .and_then(|u| u.as_str())
                .unwrap_or("");
            let method = node.data.get("config")
                .and_then(|c| c.get("method"))
                .and_then(|m| m.as_str())
                .unwrap_or("GET");
            let headers_json = node.data.get("config")
                .and_then(|c| c.get("headers"))
                .and_then(|h| h.as_str())
                .unwrap_or("{}");
            let body = node.data.get("config")
                .and_then(|c| c.get("body"))
                .and_then(|b| b.as_str())
                .unwrap_or("");

            if api_url.is_empty() {
                return Ok(serde_json::json!({
                    "type": "api",
                    "service": "generic",
                    "status": "error",
                    "error": "API URL이 설정되지 않았습니다"
                }));
            }

            // HTTP 요청 실행
            match call_external_api(api_url, method, headers_json, body).await {
                Ok(response) => {
                    Ok(serde_json::json!({
                        "type": "api",
                        "service": "generic",
                        "url": api_url,
                        "method": method,
                        "status": "executed",
                        "response": response
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "api",
                        "service": "generic",
                        "url": api_url,
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "api-analyzer" => {
            // API 분석기는 AI 호출이 필요하므로 placeholder로 처리
            Ok(serde_json::json!({
                "type": "api",
                "service": "analyzer",
                "status": "ready",
                "message": "API 분석기는 PropertyPanel에서 'AI로 API 구조 분석' 버튼을 클릭하세요"
            }))
        }
        // 한국 공공 데이터 API
        "api-kipris" => {
            let api_key = node.data.get("config")
                .and_then(|c| c.get("api_key"))
                .and_then(|k| k.as_str())
                .unwrap_or("");
            let query = node.data.get("config")
                .and_then(|c| c.get("query"))
                .and_then(|q| q.as_str())
                .unwrap_or("");
            let search_type = node.data.get("config")
                .and_then(|c| c.get("search_type"))
                .and_then(|s| s.as_str())
                .unwrap_or("patent");
            let num_of_rows = node.data.get("config")
                .and_then(|c| c.get("num_of_rows"))
                .and_then(|n| n.as_i64())
                .unwrap_or(10);

            if api_key.is_empty() {
                return Ok(serde_json::json!({
                    "type": "api",
                    "service": "kipris",
                    "status": "error",
                    "error": "KIPRIS API 키가 설정되지 않았습니다. plus.kipris.or.kr에서 발급받으세요."
                }));
            }

            // KIPRIS API 호출
            let url = format!(
                "http://plus.kipris.or.kr/kipo-api/kipi/{}/searchService?ServiceKey={}&searchText={}&numOfRows={}",
                search_type, api_key, query, num_of_rows
            );

            match call_external_api(&url, "GET", "{}", "").await {
                Ok(response) => {
                    Ok(serde_json::json!({
                        "type": "api",
                        "service": "kipris",
                        "search_type": search_type,
                        "query": query,
                        "status": "executed",
                        "response": response
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "api",
                        "service": "kipris",
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "api-scienceon" | "api-kisti" | "api-data-go-kr" | "api-public-data" | "api-ntis" | "api-riss" | "api-kostat" | "api-cnt-db" => {
            let api_key = node.data.get("config")
                .and_then(|c| c.get("api_key"))
                .and_then(|k| k.as_str())
                .unwrap_or("");
            let service_name = node_type.trim_start_matches("api-");

            if api_key.is_empty() {
                return Ok(serde_json::json!({
                    "type": "api",
                    "service": service_name,
                    "status": "error",
                    "error": format!("{} API 키가 설정되지 않았습니다", service_name.to_uppercase())
                }));
            }

            // 서비스별 URL 구성 (공공데이터포털의 경우 service_url 사용)
            let service_url = node.data.get("config")
                .and_then(|c| c.get("service_url"))
                .and_then(|u| u.as_str())
                .unwrap_or("");
            let query = node.data.get("config")
                .and_then(|c| c.get("query"))
                .and_then(|q| q.as_str())
                .unwrap_or("");

            if service_url.is_empty() && query.is_empty() {
                return Ok(serde_json::json!({
                    "type": "api",
                    "service": service_name,
                    "status": "error",
                    "error": "서비스 URL 또는 검색어가 필요합니다"
                }));
            }

            // URL 구성
            let url = if !service_url.is_empty() {
                if service_url.contains("?") {
                    format!("{}&serviceKey={}", service_url, api_key)
                } else {
                    format!("{}?serviceKey={}", service_url, api_key)
                }
            } else {
                // 기본 URL 형식 (서비스별로 다름)
                format!("https://api.example.com/{}?key={}&query={}", service_name, api_key, query)
            };

            match call_external_api(&url, "GET", "{}", "").await {
                Ok(response) => {
                    Ok(serde_json::json!({
                        "type": "api",
                        "service": service_name,
                        "query": query,
                        "status": "executed",
                        "response": response
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "api",
                        "service": service_name,
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }

        // 문서 파싱 노드
        "doc-csv-parser" => {
            let file_path = node.data.get("config")
                .and_then(|c| c.get("file_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let delimiter = node.data.get("config")
                .and_then(|c| c.get("delimiter"))
                .and_then(|d| d.as_str())
                .unwrap_or(",");
            let has_header = node.data.get("config")
                .and_then(|c| c.get("has_header"))
                .and_then(|h| h.as_bool())
                .unwrap_or(true);

            // 파일 또는 입력에서 CSV 데이터 로드
            let csv_content = if !file_path.is_empty() {
                match load_single_file(file_path, "utf-8") {
                    Ok(content) => content,
                    Err(e) => return Ok(serde_json::json!({
                        "type": "doc_parser",
                        "format": "csv",
                        "status": "error",
                        "error": e
                    }))
                }
            } else {
                extract_text_from_input(input)
            };

            if csv_content.is_empty() {
                return Ok(serde_json::json!({
                    "type": "doc_parser",
                    "format": "csv",
                    "status": "error",
                    "error": "CSV 데이터가 없습니다"
                }));
            }

            // CSV 파싱
            match parse_csv(&csv_content, delimiter, has_header) {
                Ok((headers, rows)) => {
                    Ok(serde_json::json!({
                        "type": "doc_parser",
                        "format": "csv",
                        "file_path": file_path,
                        "status": "executed",
                        "headers": headers,
                        "row_count": rows.len(),
                        "column_count": headers.len(),
                        "data": rows,
                        "text": csv_content
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "doc_parser",
                        "format": "csv",
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "doc-json-parser" => {
            let file_path = node.data.get("config")
                .and_then(|c| c.get("file_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let json_path = node.data.get("config")
                .and_then(|c| c.get("json_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");

            // 파일 또는 입력에서 JSON 데이터 로드
            let json_content = if !file_path.is_empty() {
                match load_single_file(file_path, "utf-8") {
                    Ok(content) => content,
                    Err(e) => return Ok(serde_json::json!({
                        "type": "doc_parser",
                        "format": "json",
                        "status": "error",
                        "error": e
                    }))
                }
            } else {
                extract_text_from_input(input)
            };

            if json_content.is_empty() {
                return Ok(serde_json::json!({
                    "type": "doc_parser",
                    "format": "json",
                    "status": "error",
                    "error": "JSON 데이터가 없습니다"
                }));
            }

            // JSON 파싱
            match serde_json::from_str::<serde_json::Value>(&json_content) {
                Ok(parsed) => {
                    // json_path가 있으면 해당 경로 추출
                    let result = if !json_path.is_empty() {
                        extract_json_path(&parsed, json_path)
                    } else {
                        parsed.clone()
                    };

                    Ok(serde_json::json!({
                        "type": "doc_parser",
                        "format": "json",
                        "file_path": file_path,
                        "json_path": json_path,
                        "status": "executed",
                        "data": result,
                        "original": parsed
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "doc_parser",
                        "format": "json",
                        "status": "error",
                        "error": format!("JSON 파싱 오류: {}", e)
                    }))
                }
            }
        }
        "doc-xml-parser" => {
            let file_path = node.data.get("config")
                .and_then(|c| c.get("file_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");

            // 파일 또는 입력에서 XML 데이터 로드
            let xml_content = if !file_path.is_empty() {
                match load_single_file(file_path, "utf-8") {
                    Ok(content) => content,
                    Err(e) => return Ok(serde_json::json!({
                        "type": "doc_parser",
                        "format": "xml",
                        "status": "error",
                        "error": e
                    }))
                }
            } else {
                extract_text_from_input(input)
            };

            if xml_content.is_empty() {
                return Ok(serde_json::json!({
                    "type": "doc_parser",
                    "format": "xml",
                    "status": "error",
                    "error": "XML 데이터가 없습니다"
                }));
            }

            // 간단한 XML 정보 추출 (전체 파싱은 복잡)
            Ok(serde_json::json!({
                "type": "doc_parser",
                "format": "xml",
                "file_path": file_path,
                "status": "executed",
                "content_length": xml_content.len(),
                "text": xml_content,
                "preview": if xml_content.len() > 500 { &xml_content[..500] } else { &xml_content }
            }))
        }
        "doc-pdf-parser" => {
            let file_path = node.data.get("config")
                .and_then(|c| c.get("file_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");

            if file_path.is_empty() {
                return Ok(serde_json::json!({
                    "type": "doc_parser",
                    "format": "pdf",
                    "status": "error",
                    "error": "PDF 파일 경로가 설정되지 않았습니다"
                }));
            }

            // PDF 텍스트 추출
            match parse_pdf_document(file_path) {
                Ok(text) => {
                    let preview = if text.chars().count() > 500 {
                        text.chars().take(500).collect::<String>() + "..."
                    } else {
                        text.clone()
                    };
                    Ok(serde_json::json!({
                        "type": "doc_parser",
                        "format": "pdf",
                        "file_path": file_path,
                        "status": "parsed",
                        "text": text,
                        "preview": preview,
                        "char_count": text.chars().count()
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "doc_parser",
                        "format": "pdf",
                        "file_path": file_path,
                        "status": "error",
                        "error": e,
                        "suggestion": "AWS Textract 노드 사용을 권장합니다"
                    }))
                }
            }
        }
        "doc-excel-parser" => {
            let file_path = node.data.get("config")
                .and_then(|c| c.get("file_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let sheet_name = node.data.get("config")
                .and_then(|c| c.get("sheet_name"))
                .and_then(|s| s.as_str());

            if file_path.is_empty() {
                return Ok(serde_json::json!({
                    "type": "doc_parser",
                    "format": "excel",
                    "status": "error",
                    "error": "Excel 파일 경로가 설정되지 않았습니다"
                }));
            }

            // Excel 파싱
            match parse_excel_document(file_path, sheet_name) {
                Ok(data) => {
                    Ok(serde_json::json!({
                        "type": "doc_parser",
                        "format": "excel",
                        "file_path": file_path,
                        "status": "parsed",
                        "data": data
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "doc_parser",
                        "format": "excel",
                        "file_path": file_path,
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "doc-hwp-parser" => {
            // HWP 파서 (hwpers 라이브러리 사용)
            let file_path = node.data.get("config")
                .and_then(|c| c.get("file_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");

            if file_path.is_empty() {
                return Ok(serde_json::json!({
                    "type": "doc_parser",
                    "format": "hwp",
                    "status": "error",
                    "error": "HWP 파일 경로가 설정되지 않았습니다"
                }));
            }

            // HWP 파일 파싱
            let parse_hwp = || -> Result<String, String> {
                use hwpers::HwpReader;

                let reader = HwpReader::from_file(file_path)
                    .map_err(|e| format!("HWP 파일 읽기 실패: {}", e))?;

                // extract_text()는 String을 직접 반환
                let text = reader.extract_text();

                Ok(text)
            };

            match parse_hwp() {
                Ok(text) => {
                    Ok(serde_json::json!({
                        "type": "doc_parser",
                        "format": "hwp",
                        "file_path": file_path,
                        "status": "parsed",
                        "text": text,
                        "char_count": text.chars().count()
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "doc_parser",
                        "format": "hwp",
                        "file_path": file_path,
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "doc-word-parser" | "doc-ppt-parser" => {
            let file_path = node.data.get("config")
                .and_then(|c| c.get("file_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let format = node_type.trim_start_matches("doc-").trim_end_matches("-parser");

            if file_path.is_empty() {
                return Ok(serde_json::json!({
                    "type": "doc_parser",
                    "format": format,
                    "status": "error",
                    "error": format!("{} 파일 경로가 설정되지 않았습니다", format.to_uppercase())
                }));
            }

            // Word, PPT는 AWS Textract 사용 권장
            Ok(serde_json::json!({
                "type": "doc_parser",
                "format": format,
                "file_path": file_path,
                "status": "pending",
                "message": format!("{} 파싱은 AWS Textract 노드를 사용하세요. 복잡한 문서 형식을 정확하게 추출할 수 있습니다.", format.to_uppercase()),
                "suggestion": "aws-textract 노드 사용 권장"
            }))
        }

        // 문서 내보내기 노드
        "export-csv" => {
            let output_path = node.data.get("config")
                .and_then(|c| c.get("output_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let delimiter = node.data.get("config")
                .and_then(|c| c.get("delimiter"))
                .and_then(|d| d.as_str())
                .unwrap_or(",");

            // 입력 데이터 확인
            let data = input.get("data").cloned().unwrap_or_else(|| input.clone());

            match export_to_csv(&data, output_path, delimiter) {
                Ok(csv_content) => {
                    Ok(serde_json::json!({
                        "type": "export",
                        "format": "csv",
                        "output_path": output_path,
                        "status": "executed",
                        "content": csv_content,
                        "saved": !output_path.is_empty()
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "export",
                        "format": "csv",
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "export-json" => {
            let output_path = node.data.get("config")
                .and_then(|c| c.get("output_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let pretty = node.data.get("config")
                .and_then(|c| c.get("pretty"))
                .and_then(|p| p.as_bool())
                .unwrap_or(true);

            let data = input.get("data").cloned().unwrap_or_else(|| input.clone());
            let json_content = if pretty {
                serde_json::to_string_pretty(&data).unwrap_or_else(|_| "{}".to_string())
            } else {
                serde_json::to_string(&data).unwrap_or_else(|_| "{}".to_string())
            };

            if !output_path.is_empty() {
                if let Err(e) = fs::write(output_path, &json_content) {
                    return Ok(serde_json::json!({
                        "type": "export",
                        "format": "json",
                        "status": "error",
                        "error": format!("파일 저장 오류: {}", e)
                    }));
                }
            }

            Ok(serde_json::json!({
                "type": "export",
                "format": "json",
                "output_path": output_path,
                "status": "executed",
                "content": json_content,
                "saved": !output_path.is_empty()
            }))
        }
        "export-markdown" => {
            let output_path = node.data.get("config")
                .and_then(|c| c.get("output_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let template = node.data.get("config")
                .and_then(|c| c.get("template"))
                .and_then(|t| t.as_str())
                .unwrap_or("default");
            let title = node.data.get("config")
                .and_then(|c| c.get("title"))
                .and_then(|t| t.as_str())
                .unwrap_or("Document");
            let custom_template = node.data.get("config")
                .and_then(|c| c.get("custom_template"))
                .and_then(|t| t.as_str())
                .unwrap_or("");

            let text = extract_text_from_input(input);
            let content = apply_markdown_template(&text, template, title, custom_template);

            if !output_path.is_empty() {
                if let Err(e) = fs::write(output_path, &content) {
                    return Ok(serde_json::json!({
                        "type": "export",
                        "format": "markdown",
                        "status": "error",
                        "error": format!("파일 저장 오류: {}", e)
                    }));
                }
            }

            Ok(serde_json::json!({
                "type": "export",
                "format": "markdown",
                "template": template,
                "output_path": output_path,
                "status": "executed",
                "content": content,
                "saved": !output_path.is_empty()
            }))
        }
        "export-html" => {
            let output_path = node.data.get("config")
                .and_then(|c| c.get("output_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let template = node.data.get("config")
                .and_then(|c| c.get("template"))
                .and_then(|t| t.as_str())
                .unwrap_or("default");
            let title = node.data.get("config")
                .and_then(|c| c.get("title"))
                .and_then(|t| t.as_str())
                .unwrap_or("Document");
            let custom_template = node.data.get("config")
                .and_then(|c| c.get("custom_template"))
                .and_then(|t| t.as_str())
                .unwrap_or("");

            let text = extract_text_from_input(input);
            let data = input.get("data").cloned().unwrap_or_else(|| input.clone());
            let content = apply_html_template(&text, &data, template, title, custom_template);

            if !output_path.is_empty() {
                if let Err(e) = fs::write(output_path, &content) {
                    return Ok(serde_json::json!({
                        "type": "export",
                        "format": "html",
                        "status": "error",
                        "error": format!("파일 저장 오류: {}", e)
                    }));
                }
            }

            Ok(serde_json::json!({
                "type": "export",
                "format": "html",
                "template": template,
                "output_path": output_path,
                "status": "executed",
                "content": content,
                "saved": !output_path.is_empty()
            }))
        }
        // 출력 템플릿 노드 (내보내기용 템플릿 정의)
        "output-template" => {
            let template_type = node.data.get("config")
                .and_then(|c| c.get("template_type"))
                .and_then(|t| t.as_str())
                .unwrap_or("markdown");
            let template_content = node.data.get("config")
                .and_then(|c| c.get("template_content"))
                .and_then(|t| t.as_str())
                .unwrap_or("");
            let variables = node.data.get("config")
                .and_then(|c| c.get("variables"))
                .cloned()
                .unwrap_or(serde_json::json!({}));

            // 템플릿에서 {{변수}} 치환
            let text = extract_text_from_input(input);
            let mut rendered = template_content.to_string();

            // 기본 변수 치환
            rendered = rendered.replace("{{content}}", &text);
            rendered = rendered.replace("{{date}}", &Utc::now().format("%Y-%m-%d").to_string());
            rendered = rendered.replace("{{datetime}}", &Utc::now().format("%Y-%m-%d %H:%M:%S").to_string());

            // 사용자 정의 변수 치환
            if let Some(vars) = variables.as_object() {
                for (key, value) in vars {
                    let placeholder = format!("{{{{{}}}}}", key);
                    let val_str = match value {
                        serde_json::Value::String(s) => s.clone(),
                        _ => value.to_string(),
                    };
                    rendered = rendered.replace(&placeholder, &val_str);
                }
            }

            // 입력 데이터의 필드들도 변수로 사용 가능
            if let Some(input_obj) = input.as_object() {
                for (key, value) in input_obj {
                    let placeholder = format!("{{{{{}}}}}", key);
                    let val_str = match value {
                        serde_json::Value::String(s) => s.clone(),
                        _ => value.to_string(),
                    };
                    rendered = rendered.replace(&placeholder, &val_str);
                }
            }

            Ok(serde_json::json!({
                "type": "output_template",
                "template_type": template_type,
                "status": "rendered",
                "content": rendered,
                "output": rendered
            }))
        }
        "export-pdf" => {
            let output_path = node.data.get("config")
                .and_then(|c| c.get("output_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let title = node.data.get("config")
                .and_then(|c| c.get("title"))
                .and_then(|t| t.as_str())
                .unwrap_or("Document");

            let text = extract_text_from_input(input);

            if output_path.is_empty() {
                return Ok(serde_json::json!({
                    "type": "export",
                    "format": "pdf",
                    "status": "error",
                    "error": "출력 파일 경로가 설정되지 않았습니다"
                }));
            }

            match export_to_pdf(&text, output_path, title) {
                Ok(_) => {
                    Ok(serde_json::json!({
                        "type": "export",
                        "format": "pdf",
                        "output_path": output_path,
                        "status": "executed",
                        "saved": true,
                        "message": "PDF 파일이 성공적으로 생성되었습니다"
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "export",
                        "format": "pdf",
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "export-excel" => {
            let output_path = node.data.get("config")
                .and_then(|c| c.get("output_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let sheet_name = node.data.get("config")
                .and_then(|c| c.get("sheet_name"))
                .and_then(|s| s.as_str())
                .unwrap_or("Sheet1");

            let data = input.get("data").cloned().unwrap_or_else(|| input.clone());

            if output_path.is_empty() {
                return Ok(serde_json::json!({
                    "type": "export",
                    "format": "excel",
                    "status": "error",
                    "error": "출력 파일 경로가 설정되지 않았습니다"
                }));
            }

            match export_to_excel(&data, output_path, sheet_name) {
                Ok(_) => {
                    Ok(serde_json::json!({
                        "type": "export",
                        "format": "excel",
                        "output_path": output_path,
                        "status": "executed",
                        "saved": true,
                        "message": "Excel 파일이 성공적으로 생성되었습니다"
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "export",
                        "format": "excel",
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "export-word" => {
            let output_path = node.data.get("config")
                .and_then(|c| c.get("output_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let title = node.data.get("config")
                .and_then(|c| c.get("title"))
                .and_then(|t| t.as_str())
                .unwrap_or("Document");

            let text = extract_text_from_input(input);

            if output_path.is_empty() {
                return Ok(serde_json::json!({
                    "type": "export",
                    "format": "word",
                    "status": "error",
                    "error": "출력 파일 경로가 설정되지 않았습니다"
                }));
            }

            match export_to_docx(&text, output_path, title) {
                Ok(_) => {
                    Ok(serde_json::json!({
                        "type": "export",
                        "format": "word",
                        "output_path": output_path,
                        "status": "executed",
                        "saved": true,
                        "message": "Word 문서가 성공적으로 생성되었습니다"
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "export",
                        "format": "word",
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "export-ppt" => {
            let output_path = node.data.get("config")
                .and_then(|c| c.get("output_path"))
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let title = node.data.get("config")
                .and_then(|c| c.get("title"))
                .and_then(|t| t.as_str())
                .unwrap_or("Presentation");

            let text = extract_text_from_input(input);

            if output_path.is_empty() {
                return Ok(serde_json::json!({
                    "type": "export",
                    "format": "ppt",
                    "status": "error",
                    "error": "출력 파일 경로가 설정되지 않았습니다"
                }));
            }

            match export_to_pptx(&text, output_path, title) {
                Ok(_) => {
                    Ok(serde_json::json!({
                        "type": "export",
                        "format": "ppt",
                        "output_path": output_path,
                        "status": "executed",
                        "saved": true,
                        "message": "PowerPoint 파일이 성공적으로 생성되었습니다"
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "export",
                        "format": "ppt",
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "export-hwp" => {
            // HWP 파일 생성 (hwpers 라이브러리 사용)
            let content = input.get("content")
                .and_then(|c| c.as_str())
                .or_else(|| input.get("text").and_then(|t| t.as_str()))
                .unwrap_or("내용 없음");

            let title = node.data.get("config")
                .and_then(|c| c.get("title"))
                .and_then(|t| t.as_str())
                .unwrap_or("문서");

            let file_name = node.data.get("config")
                .and_then(|c| c.get("fileName"))
                .and_then(|f| f.as_str())
                .unwrap_or("output");

            let output_path = node.data.get("config")
                .and_then(|c| c.get("outputPath"))
                .and_then(|p| p.as_str())
                .unwrap_or("./output");

            // HWP 파일 생성
            let create_hwp = || -> Result<String, String> {
                // 출력 디렉토리 확인/생성
                let output_dir = std::path::Path::new(output_path);
                if !output_dir.exists() {
                    fs::create_dir_all(output_dir)
                        .map_err(|e| format!("디렉토리 생성 실패: {}", e))?;
                }

                // HWP 문서 생성
                let mut writer = HwpWriter::new();

                // 제목 추가 (중앙 정렬)
                writer.add_aligned_paragraph(
                    title,
                    hwpers::writer::style::ParagraphAlignment::Center
                ).map_err(|e| format!("제목 추가 실패: {}", e))?;

                // 빈 줄 추가
                writer.add_paragraph("").map_err(|e| format!("단락 추가 실패: {}", e))?;

                // 내용을 단락별로 분리하여 추가
                for paragraph in content.split('\n') {
                    if !paragraph.is_empty() {
                        writer.add_paragraph(paragraph)
                            .map_err(|e| format!("단락 추가 실패: {}", e))?;
                    } else {
                        writer.add_paragraph("")
                            .map_err(|e| format!("빈 단락 추가 실패: {}", e))?;
                    }
                }

                // 페이지 설정 (A4)
                writer.set_custom_page_size(
                    210.0, 297.0,
                    hwpers::model::page_layout::PageOrientation::Portrait
                ).map_err(|e| format!("페이지 설정 실패: {}", e))?;

                // 여백 설정 (20mm)
                writer.set_page_margins_mm(20.0, 20.0, 20.0, 20.0);

                // 파일 저장
                let file_path = format!("{}/{}.hwp", output_path, file_name);
                writer.save_to_file(&file_path)
                    .map_err(|e| format!("파일 저장 실패: {}", e))?;

                Ok(file_path)
            };

            match create_hwp() {
                Ok(file_path) => {
                    Ok(serde_json::json!({
                        "type": "export",
                        "format": "hwp",
                        "filePath": file_path,
                        "status": "executed",
                        "saved": true,
                        "message": "HWP 파일이 성공적으로 생성되었습니다"
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "export",
                        "format": "hwp",
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }

        // 자동화/트리거 노드
        "timer" | "scheduler" | "interval" => {
            let interval_ms = node.data.get("config")
                .and_then(|c| c.get("interval_ms"))
                .and_then(|i| i.as_i64())
                .unwrap_or(60000);
            let schedule = node.data.get("config")
                .and_then(|c| c.get("schedule"))
                .and_then(|s| s.as_str())
                .unwrap_or("");

            Ok(serde_json::json!({
                "type": "automation",
                "trigger_type": node_type,
                "interval_ms": interval_ms,
                "schedule": schedule,
                "status": "configured",
                "message": "트리거가 설정되었습니다. 실제 스케줄 실행은 백그라운드 서비스에서 관리됩니다.",
                "input": input,
                "output": input
            }))
        }
        "webhook" => {
            let webhook_url = node.data.get("config")
                .and_then(|c| c.get("webhook_url"))
                .and_then(|u| u.as_str())
                .unwrap_or("");
            let method = node.data.get("config")
                .and_then(|c| c.get("method"))
                .and_then(|m| m.as_str())
                .unwrap_or("POST");

            if webhook_url.is_empty() {
                return Ok(serde_json::json!({
                    "type": "automation",
                    "trigger_type": "webhook",
                    "status": "error",
                    "error": "Webhook URL이 설정되지 않았습니다"
                }));
            }

            // Webhook 호출
            let body = serde_json::to_string(input).unwrap_or_else(|_| "{}".to_string());
            match call_external_api(webhook_url, method, "{\"Content-Type\": \"application/json\"}", &body).await {
                Ok(response) => {
                    Ok(serde_json::json!({
                        "type": "automation",
                        "trigger_type": "webhook",
                        "url": webhook_url,
                        "method": method,
                        "status": "executed",
                        "response": response
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "automation",
                        "trigger_type": "webhook",
                        "url": webhook_url,
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "alarm" => {
            let alarm_time = node.data.get("config")
                .and_then(|c| c.get("alarm_time"))
                .and_then(|t| t.as_str())
                .unwrap_or("");
            let message = node.data.get("config")
                .and_then(|c| c.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("알람!");

            Ok(serde_json::json!({
                "type": "automation",
                "trigger_type": "alarm",
                "alarm_time": alarm_time,
                "message": message,
                "status": "configured",
                "input": input,
                "output": input
            }))
        }

        // 액션 노드
        "shell-command" => {
            let command = node.data.get("config")
                .and_then(|c| c.get("command"))
                .and_then(|cmd| cmd.as_str())
                .unwrap_or("");
            let working_dir = node.data.get("config")
                .and_then(|c| c.get("working_dir"))
                .and_then(|d| d.as_str())
                .unwrap_or("");
            let timeout_secs = node.data.get("config")
                .and_then(|c| c.get("timeout_secs"))
                .and_then(|t| t.as_i64())
                .unwrap_or(30);

            if command.is_empty() {
                return Ok(serde_json::json!({
                    "type": "action",
                    "action_type": "shell_command",
                    "status": "error",
                    "error": "실행할 명령어가 없습니다"
                }));
            }

            // 보안상 위험한 명령어 차단
            let dangerous_commands = ["rm -rf", "del /f", "format", "mkfs", ":(){:|:&};:"];
            for dangerous in &dangerous_commands {
                if command.to_lowercase().contains(dangerous) {
                    return Ok(serde_json::json!({
                        "type": "action",
                        "action_type": "shell_command",
                        "status": "error",
                        "error": "보안상 실행이 차단된 명령어입니다"
                    }));
                }
            }

            // 명령어 실행
            match execute_shell_command(command, working_dir, timeout_secs as u64).await {
                Ok((stdout, stderr, exit_code)) => {
                    Ok(serde_json::json!({
                        "type": "action",
                        "action_type": "shell_command",
                        "command": command,
                        "working_dir": working_dir,
                        "status": if exit_code == 0 { "executed" } else { "failed" },
                        "exit_code": exit_code,
                        "stdout": stdout,
                        "stderr": stderr,
                        "text": stdout
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "action",
                        "action_type": "shell_command",
                        "command": command,
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "notification" => {
            let title = node.data.get("config")
                .and_then(|c| c.get("title"))
                .and_then(|t| t.as_str())
                .unwrap_or("알림");
            let message = node.data.get("config")
                .and_then(|c| c.get("message"))
                .and_then(|m| m.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| extract_text_from_input(input));

            Ok(serde_json::json!({
                "type": "action",
                "action_type": "notification",
                "title": title,
                "message": message,
                "status": "executed",
                "input": input
            }))
        }
        "email-sender" | "email-receiver" => {
            Ok(serde_json::json!({
                "type": "action",
                "action_type": node_type,
                "status": "pending",
                "message": "이메일 기능은 AWS SES 또는 SMTP 설정이 필요합니다",
                "input": input
            }))
        }
        "screenshot" => {
            Ok(serde_json::json!({
                "type": "action",
                "action_type": "screenshot",
                "status": "pending",
                "message": "스크린샷 기능은 시스템 권한이 필요합니다",
                "input": input
            }))
        }

        // 매크로 노드
        "keyboard-macro" | "mouse-macro" | "macro-recorder" | "macro-player" => {
            Ok(serde_json::json!({
                "type": "macro",
                "macro_type": node_type,
                "status": "pending",
                "message": "매크로 기능은 시스템 권한과 추가 라이브러리가 필요합니다",
                "input": input
            }))
        }

        // BIM/건설 노드
        "ifc-viewer" | "revit-viewer" | "ifc-parser" | "bim-quantity" | "clash-detection" => {
            Ok(serde_json::json!({
                "type": "bim",
                "feature": node_type,
                "status": "pending",
                "message": "BIM 기능은 IFC 파서 라이브러리가 필요합니다",
                "input": input
            }))
        }

        // MCP 노드
        "mcp-server" | "mcp-tool" | "mcp-resource" | "mcp-prompt" => {
            let endpoint = node.data.get("config")
                .and_then(|c| c.get("endpoint"))
                .and_then(|e| e.as_str())
                .unwrap_or("");

            Ok(serde_json::json!({
                "type": "mcp",
                "mcp_type": node_type,
                "endpoint": endpoint,
                "status": "configured",
                "message": "MCP 프로토콜 연결 준비됨",
                "input": input
            }))
        }

        // 시각화 노드
        "viz-result-viewer" | "viz-json-viewer" => {
            let data = input.get("data").cloned()
                .or_else(|| input.get("response").cloned())
                .unwrap_or_else(|| input.clone());

            Ok(serde_json::json!({
                "type": "visualization",
                "viz_type": "json",
                "status": "executed",
                "data": data,
                "formatted": serde_json::to_string_pretty(&data).unwrap_or_else(|_| "{}".to_string())
            }))
        }
        "viz-table-viewer" => {
            let data = input.get("data").cloned()
                .or_else(|| input.get("rows").cloned())
                .unwrap_or_else(|| input.clone());

            Ok(serde_json::json!({
                "type": "visualization",
                "viz_type": "table",
                "status": "executed",
                "data": data
            }))
        }
        "viz-chart" => {
            let chart_type = node.data.get("config")
                .and_then(|c| c.get("chart_type"))
                .and_then(|t| t.as_str())
                .unwrap_or("bar");

            Ok(serde_json::json!({
                "type": "visualization",
                "viz_type": "chart",
                "chart_type": chart_type,
                "status": "executed",
                "data": input,
                "message": "차트 데이터가 준비되었습니다. 프론트엔드에서 렌더링됩니다."
            }))
        }
        "viz-markdown-viewer" => {
            let markdown = extract_text_from_input(input);

            Ok(serde_json::json!({
                "type": "visualization",
                "viz_type": "markdown",
                "status": "executed",
                "markdown": markdown
            }))
        }
        "viz-diff-viewer" | "viz-flow-diagram" => {
            Ok(serde_json::json!({
                "type": "visualization",
                "viz_type": node_type.trim_start_matches("viz-"),
                "status": "executed",
                "data": input
            }))
        }

        // 지식베이스 노드
        "kb-create" | "kb-ingest" | "kb-query" | "kb-update" => {
            let kb_id = node.data.get("config")
                .and_then(|c| c.get("knowledge_base_id"))
                .and_then(|k| k.as_str())
                .unwrap_or("");

            Ok(serde_json::json!({
                "type": "knowledge_base",
                "operation": node_type.trim_start_matches("kb-"),
                "knowledge_base_id": kb_id,
                "status": if kb_id.is_empty() { "error" } else { "configured" },
                "error": if kb_id.is_empty() { Some("Knowledge Base ID가 필요합니다") } else { None::<&str> },
                "message": "AWS Bedrock Knowledge Base와 연동됩니다",
                "input": input
            }))
        }

        // 벡터 DB 노드
        "vector-pinecone" | "vector-chroma" | "vector-faiss" | "vector-opensearch" => {
            let db_type = node_type.trim_start_matches("vector-");
            let index_name = node.data.get("config")
                .and_then(|c| c.get("index_name"))
                .and_then(|i| i.as_str())
                .unwrap_or("");

            Ok(serde_json::json!({
                "type": "vector_db",
                "db_type": db_type,
                "index_name": index_name,
                "status": "configured",
                "message": format!("{} 벡터 DB 연결 준비됨", db_type.to_uppercase()),
                "input": input
            }))
        }

        // 이미지 생성 노드
        "img-titan-gen" => {
            let prompt = extract_text_from_input(input);
            let width = node.data.get("config")
                .and_then(|c| c.get("width"))
                .and_then(|w| w.as_i64())
                .unwrap_or(1024);
            let height = node.data.get("config")
                .and_then(|c| c.get("height"))
                .and_then(|h| h.as_i64())
                .unwrap_or(1024);

            if prompt.is_empty() {
                return Ok(serde_json::json!({
                    "type": "image_generation",
                    "model": "titan-image",
                    "status": "error",
                    "error": "이미지 생성 프롬프트가 없습니다"
                }));
            }

            // AWS Bedrock Titan Image Generator 호출
            match generate_image_titan(&prompt, width as u32, height as u32).await {
                Ok(image_base64) => {
                    Ok(serde_json::json!({
                        "type": "image_generation",
                        "model": "titan-image",
                        "prompt": prompt,
                        "width": width,
                        "height": height,
                        "status": "executed",
                        "image_base64": image_base64
                    }))
                }
                Err(e) => {
                    Ok(serde_json::json!({
                        "type": "image_generation",
                        "model": "titan-image",
                        "prompt": prompt,
                        "status": "error",
                        "error": e
                    }))
                }
            }
        }
        "img-stable-diffusion" | "img-dalle" | "img-midjourney" | "img-nanobanana" | "img-editor" | "img-upscaler" => {
            let model = node_type.trim_start_matches("img-");
            Ok(serde_json::json!({
                "type": "image_generation",
                "model": model,
                "status": "pending",
                "message": format!("{} 모델은 해당 API 설정이 필요합니다", model.to_uppercase()),
                "input": input
            }))
        }

        // 알 수 없는 타입은 passthrough
        _ => {
            eprintln!("[WARN] Unknown node type: {}, using passthrough", node_type);
            Ok(serde_json::json!({
                "type": "unknown",
                "node_type": node_type,
                "input": input,
                "status": "passthrough",
                "output": input
            }))
        }
    }
}

/// 입력에서 텍스트 추출
fn extract_text_from_input(input: &serde_json::Value) -> String {
    // 직접 텍스트 필드 확인
    if let Some(text) = input.get("text").and_then(|t| t.as_str()) {
        if !text.is_empty() {
            return text.to_string();
        }
    }
    if let Some(query) = input.get("query").and_then(|q| q.as_str()) {
        if !query.is_empty() {
            return query.to_string();
        }
    }

    // response 필드 확인 (모델 응답)
    if let Some(response) = input.get("response").and_then(|r| r.as_str()) {
        if !response.is_empty() {
            return response.to_string();
        }
    }

    // rendered 필드 확인 (프롬프트 템플릿 결과)
    if let Some(rendered) = input.get("rendered").and_then(|r| r.as_str()) {
        if !rendered.is_empty() {
            return rendered.to_string();
        }
    }

    // 입력이 객체인 경우 - 소스 노드 ID가 키인 경우 (새로운 구조)
    if let Some(obj) = input.as_object() {
        for (_key, value) in obj {
            // input 노드에서 온 데이터인 경우 - text/query 필드 우선 확인
            if value.get("type").and_then(|t| t.as_str()) == Some("input") {
                // text 필드 직접 확인
                if let Some(text) = value.get("text").and_then(|t| t.as_str()) {
                    if !text.is_empty() {
                        return text.to_string();
                    }
                }
                if let Some(query) = value.get("query").and_then(|q| q.as_str()) {
                    if !query.is_empty() {
                        return query.to_string();
                    }
                }
                // config.config.text_input 경로 확인
                if let Some(config) = value.get("config") {
                    if let Some(inner_config) = config.get("config") {
                        if let Some(text_input) = inner_config.get("text_input").and_then(|t| t.as_str()) {
                            if !text_input.is_empty() {
                                return text_input.to_string();
                            }
                        }
                    }
                    if let Some(text_input) = config.get("text_input").and_then(|t| t.as_str()) {
                        if !text_input.is_empty() {
                            return text_input.to_string();
                        }
                    }
                }
            }

            // prompt-template 노드에서 온 데이터
            if value.get("type").and_then(|t| t.as_str()) == Some("prompt") {
                if let Some(rendered) = value.get("rendered").and_then(|r| r.as_str()) {
                    if !rendered.is_empty() {
                        return rendered.to_string();
                    }
                }
            }

            // model_response 노드에서 온 데이터
            if value.get("type").and_then(|t| t.as_str()) == Some("model_response") {
                if let Some(response) = value.get("response").and_then(|r| r.as_str()) {
                    if !response.is_empty() {
                        return response.to_string();
                    }
                }
            }

            // 이전 노드의 translated_text 추출 (체인 번역용)
            if let Some(translated) = value.get("translated_text").and_then(|t| t.as_str()) {
                if !translated.is_empty() {
                    return translated.to_string();
                }
            }

            // 일반적인 text/query 필드
            if let Some(text) = value.get("text").and_then(|t| t.as_str()) {
                if !text.is_empty() {
                    return text.to_string();
                }
            }
            if let Some(query) = value.get("query").and_then(|q| q.as_str()) {
                if !query.is_empty() {
                    return query.to_string();
                }
            }
        }
    }

    // default 키에서 확인 (레거시 호환)
    if let Some(default) = input.get("default") {
        let result = extract_text_from_input(default);
        if !result.is_empty() {
            return result;
        }
    }

    // 입력 자체가 문자열인 경우
    if let Some(text) = input.as_str() {
        return text.to_string();
    }

    String::new()
}

/// AWS Translate API 호출 (native-tls 사용 - Windows 시스템 인증서)
async fn translate_text(text: &str, source_lang: &str, target_lang: &str) -> Result<String, String> {
    // 환경 변수에서 리전 가져오기
    let region = std::env::var("AWS_REGION")
        .or_else(|_| std::env::var("AWS_DEFAULT_REGION"))
        .unwrap_or_else(|_| "us-east-1".to_string());

    // native-tls 기반 HTTP 클라이언트 사용 (Windows 시스템 인증서 사용)
    let https_connector = hyper_tls::HttpsConnector::new();
    let hyper_client = aws_smithy_runtime::client::http::hyper_014::HyperClientBuilder::new()
        .build(https_connector);

    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(aws_config::Region::new(region))
        .http_client(hyper_client)
        .load()
        .await;

    let client = aws_sdk_translate::Client::new(&config);

    // auto 언어 감지 처리 - AWS Translate는 "auto"를 지원하지 않음
    // 대신 source language를 생략하면 자동 감지
    let mut request = client
        .translate_text()
        .text(text)
        .target_language_code(target_lang);

    if source_lang != "auto" && !source_lang.is_empty() {
        request = request.source_language_code(source_lang);
    } else {
        // 자동 감지를 위해 ko로 기본 설정 (한국어 입력 가정)
        request = request.source_language_code("ko");
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("AWS Translate 오류: {:?}", e))?;

    Ok(response.translated_text().to_string())
}

/// 외부 API 호출 (범용)
async fn call_external_api(
    url: &str,
    method: &str,
    headers_json: &str,
    body: &str,
) -> Result<serde_json::Value, String> {
    // native-tls 기반 HTTP 클라이언트 사용 (Windows 시스템 인증서 사용)
    let client = reqwest::Client::builder()
        .use_native_tls()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP 클라이언트 생성 오류: {}", e))?;

    // 헤더 파싱
    let headers: std::collections::HashMap<String, String> = serde_json::from_str(headers_json)
        .unwrap_or_default();

    // 요청 빌더 생성
    let mut request_builder = match method.to_uppercase().as_str() {
        "GET" => client.get(url),
        "POST" => client.post(url),
        "PUT" => client.put(url),
        "DELETE" => client.delete(url),
        "PATCH" => client.patch(url),
        _ => return Err(format!("지원하지 않는 HTTP 메서드: {}", method)),
    };

    // 헤더 추가
    for (key, value) in headers {
        request_builder = request_builder.header(&key, &value);
    }

    // Body 추가 (POST, PUT, PATCH인 경우)
    if !body.is_empty() && matches!(method.to_uppercase().as_str(), "POST" | "PUT" | "PATCH") {
        request_builder = request_builder
            .header("Content-Type", "application/json")
            .body(body.to_string());
    }

    // 요청 실행
    let response = request_builder
        .send()
        .await
        .map_err(|e| format!("HTTP 요청 오류: {}", e))?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|e| format!("응답 읽기 오류: {}", e))?;

    // JSON 파싱 시도
    let response_json: serde_json::Value = serde_json::from_str(&response_text)
        .unwrap_or_else(|_| serde_json::json!({
            "raw_response": response_text,
            "is_json": false
        }));

    if status.is_success() {
        Ok(response_json)
    } else {
        Err(format!("HTTP 오류 {}: {}", status.as_u16(), response_text))
    }
}

/// 로컬 폴더 내 파일 목록 및 내용 로드
fn load_folder_files(
    folder_path: &str,
    file_filter: &str,
    include_subfolders: bool,
    read_content: bool,
) -> Result<Vec<serde_json::Value>, String> {
    use std::path::Path;

    let path = Path::new(folder_path);
    if !path.exists() {
        return Err(format!("폴더가 존재하지 않습니다: {}", folder_path));
    }
    if !path.is_dir() {
        return Err(format!("디렉토리가 아닙니다: {}", folder_path));
    }

    let mut files = Vec::new();
    let extensions: Vec<&str> = if file_filter.is_empty() {
        vec![]
    } else {
        file_filter.split(',')
            .map(|s| s.trim().trim_start_matches("*."))
            .collect()
    };

    fn visit_dir(
        dir: &Path,
        files: &mut Vec<serde_json::Value>,
        extensions: &[&str],
        include_subfolders: bool,
        read_content: bool,
    ) -> Result<(), String> {
        let entries = fs::read_dir(dir)
            .map_err(|e| format!("폴더 읽기 오류: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("항목 읽기 오류: {}", e))?;
            let path = entry.path();

            if path.is_dir() {
                if include_subfolders {
                    visit_dir(&path, files, extensions, include_subfolders, read_content)?;
                }
            } else if path.is_file() {
                let file_name = path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("");
                let ext = path.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("");

                // 확장자 필터 적용
                if !extensions.is_empty() && !extensions.contains(&ext) {
                    continue;
                }

                let file_path = path.to_string_lossy().to_string();
                let file_size = path.metadata().map(|m| m.len()).unwrap_or(0);

                let mut file_info = serde_json::json!({
                    "name": file_name,
                    "path": file_path,
                    "extension": ext,
                    "size_bytes": file_size
                });

                // 텍스트 파일 내용 읽기
                if read_content && is_text_file(ext) && file_size < 1_000_000 {
                    if let Ok(content) = fs::read_to_string(&path) {
                        file_info["content"] = serde_json::json!(content);
                    }
                }

                files.push(file_info);
            }
        }
        Ok(())
    }

    visit_dir(path, &mut files, &extensions, include_subfolders, read_content)?;
    Ok(files)
}

/// 단일 파일 로드
fn load_single_file(file_path: &str, encoding: &str) -> Result<String, String> {
    use std::path::Path;

    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", file_path));
    }
    if !path.is_file() {
        return Err(format!("파일이 아닙니다: {}", file_path));
    }

    // UTF-8로 읽기 시도
    match fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(_) => {
            // 바이너리로 읽어서 인코딩 변환 시도
            let bytes = fs::read(path)
                .map_err(|e| format!("파일 읽기 오류: {}", e))?;

            // EUC-KR/CP949 인코딩 처리는 추후 구현
            // 현재는 UTF-8로 시도 후 실패하면 오류 반환
            String::from_utf8(bytes)
                .map_err(|_| format!("파일 인코딩 오류 ({}): UTF-8이 아닌 파일입니다. 인코딩을 확인하세요.", encoding))
        }
    }
}

/// 텍스트 파일 여부 확인
fn is_text_file(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "txt" | "md" | "json" | "csv" | "xml" | "html" | "css" | "js" | "ts" | "py" | "rs" | "log" | "yaml" | "yml" | "toml" | "ini" | "cfg"
    )
}

/// AWS Bedrock 모델 호출
async fn invoke_bedrock_model(model_id: &str, user_input: &str, system_prompt: &str) -> Result<String, String> {
    use aws_sdk_bedrockruntime::primitives::Blob;

    // 환경 변수에서 리전 가져오기
    let region = std::env::var("AWS_REGION")
        .or_else(|_| std::env::var("AWS_DEFAULT_REGION"))
        .unwrap_or_else(|_| "us-east-1".to_string());

    // native-tls 기반 HTTP 클라이언트 사용 (Windows 시스템 인증서 사용)
    let https_connector = hyper_tls::HttpsConnector::new();
    let hyper_client = aws_smithy_runtime::client::http::hyper_014::HyperClientBuilder::new()
        .build(https_connector);

    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(aws_config::Region::new(region))
        .http_client(hyper_client)
        .load()
        .await;

    let client = aws_sdk_bedrockruntime::Client::new(&config);

    // 모델에 따라 요청 형식 결정 (us. 접두사 포함 cross-region inference profile 지원)
    let request_body = if model_id.contains("anthropic.claude") {
        // Claude 모델 (Messages API 형식)
        let messages = vec![
            serde_json::json!({
                "role": "user",
                "content": user_input
            })
        ];

        let mut body = serde_json::json!({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "messages": messages
        });

        // 시스템 프롬프트가 있으면 추가
        if !system_prompt.is_empty() {
            body["system"] = serde_json::json!(system_prompt);
        }

        body
    } else if model_id.contains("meta.llama") {
        // Llama 모델
        let prompt = if system_prompt.is_empty() {
            format!("<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n{}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n", user_input)
        } else {
            format!("<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n", system_prompt, user_input)
        };
        serde_json::json!({
            "prompt": prompt,
            "max_gen_len": 2048,
            "temperature": 0.7
        })
    } else if model_id.contains("amazon.titan") {
        // Titan 모델
        let input_text = if system_prompt.is_empty() {
            user_input.to_string()
        } else {
            format!("{}\n\n{}", system_prompt, user_input)
        };
        serde_json::json!({
            "inputText": input_text,
            "textGenerationConfig": {
                "maxTokenCount": 4096,
                "temperature": 0.7,
                "topP": 0.9
            }
        })
    } else if model_id.contains("mistral") {
        // Mistral 모델
        let prompt = if system_prompt.is_empty() {
            format!("<s>[INST] {} [/INST]", user_input)
        } else {
            format!("<s>[INST] {}\n\n{} [/INST]", system_prompt, user_input)
        };
        serde_json::json!({
            "prompt": prompt,
            "max_tokens": 4096,
            "temperature": 0.7
        })
    } else {
        // 기본 형식 (Claude 형식 사용)
        serde_json::json!({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "messages": [{
                "role": "user",
                "content": user_input
            }]
        })
    };

    let body_bytes = serde_json::to_vec(&request_body)
        .map_err(|e| format!("요청 직렬화 오류: {}", e))?;

    // Bedrock 모델 호출
    let response = client
        .invoke_model()
        .model_id(model_id)
        .content_type("application/json")
        .accept("application/json")
        .body(Blob::new(body_bytes))
        .send()
        .await
        .map_err(|e| format!("Bedrock 호출 오류: {:?}", e))?;

    // 응답 파싱
    let response_body = response.body();
    let response_str = std::str::from_utf8(response_body.as_ref())
        .map_err(|e| format!("응답 디코딩 오류: {}", e))?;

    let response_json: serde_json::Value = serde_json::from_str(response_str)
        .map_err(|e| format!("응답 JSON 파싱 오류: {}", e))?;

    // 모델별 응답 추출
    let result = if model_id.contains("anthropic.claude") {
        // Claude 모델 응답
        response_json["content"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|c| c["text"].as_str())
            .unwrap_or("")
            .to_string()
    } else if model_id.contains("meta.llama") {
        // Llama 모델 응답
        response_json["generation"]
            .as_str()
            .unwrap_or("")
            .to_string()
    } else if model_id.contains("amazon.titan") {
        // Titan 모델 응답
        response_json["results"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|r| r["outputText"].as_str())
            .unwrap_or("")
            .to_string()
    } else if model_id.contains("mistral") {
        // Mistral 모델 응답
        response_json["outputs"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|o| o["text"].as_str())
            .unwrap_or("")
            .to_string()
    } else {
        // 기본: Claude 형식 시도
        response_json["content"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|c| c["text"].as_str())
            .unwrap_or(response_str)
            .to_string()
    };

    if result.is_empty() {
        Err(format!("모델 응답이 비어있습니다. 원본 응답: {}", response_str))
    } else {
        Ok(result)
    }
}

/// AWS Comprehend 텍스트 분석
async fn analyze_text_comprehend(
    text: &str,
    language_code: &str,
    features: &[&str],
) -> Result<serde_json::Value, String> {
    // 환경 변수에서 리전 가져오기
    let region = std::env::var("AWS_REGION")
        .or_else(|_| std::env::var("AWS_DEFAULT_REGION"))
        .unwrap_or_else(|_| "us-east-1".to_string());

    // native-tls 기반 HTTP 클라이언트 사용
    let https_connector = hyper_tls::HttpsConnector::new();
    let hyper_client = aws_smithy_runtime::client::http::hyper_014::HyperClientBuilder::new()
        .build(https_connector);

    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(aws_config::Region::new(region))
        .http_client(hyper_client)
        .load()
        .await;

    let client = aws_sdk_comprehend::Client::new(&config);

    let mut result = serde_json::json!({});

    // 감정 분석
    if features.contains(&"SENTIMENT") {
        let sentiment_response = client
            .detect_sentiment()
            .text(text)
            .language_code(aws_sdk_comprehend::types::LanguageCode::from(language_code))
            .send()
            .await
            .map_err(|e| format!("Comprehend 감정 분석 오류: {:?}", e))?;

        result["sentiment"] = serde_json::json!(format!("{:?}", sentiment_response.sentiment()));
        if let Some(scores) = sentiment_response.sentiment_score() {
            result["sentiment_scores"] = serde_json::json!({
                "positive": scores.positive(),
                "negative": scores.negative(),
                "neutral": scores.neutral(),
                "mixed": scores.mixed()
            });
        }
    }

    // 개체명 인식
    if features.contains(&"ENTITIES") {
        let entities_response = client
            .detect_entities()
            .text(text)
            .language_code(aws_sdk_comprehend::types::LanguageCode::from(language_code))
            .send()
            .await
            .map_err(|e| format!("Comprehend 개체명 인식 오류: {:?}", e))?;

        let entities: Vec<serde_json::Value> = entities_response.entities()
            .iter()
            .map(|e| serde_json::json!({
                "text": e.text().unwrap_or(""),
                "type": format!("{:?}", e.r#type()),
                "score": e.score()
            }))
            .collect();
        result["entities"] = serde_json::json!(entities);
    }

    // 핵심 구문 추출
    if features.contains(&"KEY_PHRASES") {
        let phrases_response = client
            .detect_key_phrases()
            .text(text)
            .language_code(aws_sdk_comprehend::types::LanguageCode::from(language_code))
            .send()
            .await
            .map_err(|e| format!("Comprehend 핵심 구문 추출 오류: {:?}", e))?;

        let phrases: Vec<serde_json::Value> = phrases_response.key_phrases()
            .iter()
            .map(|p| serde_json::json!({
                "text": p.text().unwrap_or(""),
                "score": p.score()
            }))
            .collect();
        result["key_phrases"] = serde_json::json!(phrases);
    }

    Ok(result)
}

/// 텍스트 분할 함수
fn split_text(text: &str, chunk_size: usize, chunk_overlap: usize, split_by: &str) -> Vec<serde_json::Value> {
    let mut chunks = Vec::new();

    match split_by {
        "paragraph" => {
            // 문단 기준 분할
            let paragraphs: Vec<&str> = text.split("\n\n").collect();
            let mut current_chunk = String::new();
            let mut chunk_index = 0;

            for para in paragraphs {
                if current_chunk.len() + para.len() > chunk_size && !current_chunk.is_empty() {
                    chunks.push(serde_json::json!({
                        "index": chunk_index,
                        "text": current_chunk.trim(),
                        "length": current_chunk.trim().len()
                    }));
                    chunk_index += 1;

                    // 오버랩 적용 (UTF-8 문자 경계를 올바르게 처리)
                    if chunk_overlap > 0 && current_chunk.chars().count() > chunk_overlap {
                        let char_count = current_chunk.chars().count();
                        let overlap_start = char_count.saturating_sub(chunk_overlap);
                        current_chunk = current_chunk.chars().skip(overlap_start).collect();
                    } else {
                        current_chunk.clear();
                    }
                }
                if !current_chunk.is_empty() {
                    current_chunk.push_str("\n\n");
                }
                current_chunk.push_str(para);
            }

            // 마지막 청크
            if !current_chunk.trim().is_empty() {
                chunks.push(serde_json::json!({
                    "index": chunk_index,
                    "text": current_chunk.trim(),
                    "length": current_chunk.trim().len()
                }));
            }
        }
        "sentence" => {
            // 문장 기준 분할 (간단한 구현)
            let sentences: Vec<&str> = text.split(|c| c == '.' || c == '!' || c == '?')
                .filter(|s| !s.trim().is_empty())
                .collect();
            let mut current_chunk = String::new();
            let mut chunk_index = 0;

            for sentence in sentences {
                let sentence_with_period = format!("{}. ", sentence.trim());
                if current_chunk.len() + sentence_with_period.len() > chunk_size && !current_chunk.is_empty() {
                    chunks.push(serde_json::json!({
                        "index": chunk_index,
                        "text": current_chunk.trim(),
                        "length": current_chunk.trim().len()
                    }));
                    chunk_index += 1;

                    // UTF-8 문자 경계를 올바르게 처리하기 위해 chars() 사용
                    if chunk_overlap > 0 && current_chunk.chars().count() > chunk_overlap {
                        let char_count = current_chunk.chars().count();
                        let overlap_start = char_count.saturating_sub(chunk_overlap);
                        current_chunk = current_chunk.chars().skip(overlap_start).collect();
                    } else {
                        current_chunk.clear();
                    }
                }
                current_chunk.push_str(&sentence_with_period);
            }

            if !current_chunk.trim().is_empty() {
                chunks.push(serde_json::json!({
                    "index": chunk_index,
                    "text": current_chunk.trim(),
                    "length": current_chunk.trim().len()
                }));
            }
        }
        _ => {
            // 문자 수 기준 분할 (기본)
            let chars: Vec<char> = text.chars().collect();
            let mut i = 0;
            let mut chunk_index = 0;

            while i < chars.len() {
                let end = (i + chunk_size).min(chars.len());
                let chunk_text: String = chars[i..end].iter().collect();

                chunks.push(serde_json::json!({
                    "index": chunk_index,
                    "text": chunk_text,
                    "length": chunk_text.len()
                }));

                chunk_index += 1;
                i += chunk_size.saturating_sub(chunk_overlap);

                if i >= chars.len() {
                    break;
                }
            }
        }
    }

    chunks
}

/// AWS Bedrock Titan 임베딩 생성
async fn generate_embeddings(texts: &[String], model_id: &str) -> Result<Vec<Vec<f32>>, String> {
    use aws_sdk_bedrockruntime::primitives::Blob;

    let region = std::env::var("AWS_REGION")
        .or_else(|_| std::env::var("AWS_DEFAULT_REGION"))
        .unwrap_or_else(|_| "us-east-1".to_string());

    let https_connector = hyper_tls::HttpsConnector::new();
    let hyper_client = aws_smithy_runtime::client::http::hyper_014::HyperClientBuilder::new()
        .build(https_connector);

    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(aws_config::Region::new(region))
        .http_client(hyper_client)
        .load()
        .await;

    let client = aws_sdk_bedrockruntime::Client::new(&config);

    let mut all_embeddings = Vec::new();

    for text in texts {
        let request_body = serde_json::json!({
            "inputText": text
        });

        let body_bytes = serde_json::to_vec(&request_body)
            .map_err(|e| format!("임베딩 요청 직렬화 오류: {}", e))?;

        let response = client
            .invoke_model()
            .model_id(model_id)
            .content_type("application/json")
            .accept("application/json")
            .body(Blob::new(body_bytes))
            .send()
            .await
            .map_err(|e| format!("Bedrock 임베딩 호출 오류: {:?}", e))?;

        let response_body = response.body();
        let response_str = std::str::from_utf8(response_body.as_ref())
            .map_err(|e| format!("임베딩 응답 디코딩 오류: {}", e))?;

        let response_json: serde_json::Value = serde_json::from_str(response_str)
            .map_err(|e| format!("임베딩 응답 JSON 파싱 오류: {}", e))?;

        let embedding: Vec<f32> = response_json["embedding"]
            .as_array()
            .ok_or("임베딩 배열이 없습니다")?
            .iter()
            .filter_map(|v| v.as_f64().map(|f| f as f32))
            .collect();

        all_embeddings.push(embedding);
    }

    Ok(all_embeddings)
}

/// CSV 파싱
fn parse_csv(content: &str, delimiter: &str, has_header: bool) -> Result<(Vec<String>, Vec<serde_json::Value>), String> {
    let delimiter_char = delimiter.chars().next().unwrap_or(',');
    let lines: Vec<&str> = content.lines().collect();

    if lines.is_empty() {
        return Err("CSV 데이터가 비어있습니다".to_string());
    }

    let headers: Vec<String> = if has_header {
        lines[0].split(delimiter_char)
            .map(|s| s.trim().trim_matches('"').to_string())
            .collect()
    } else {
        (0..lines[0].split(delimiter_char).count())
            .map(|i| format!("column_{}", i))
            .collect()
    };

    let data_start = if has_header { 1 } else { 0 };
    let mut rows = Vec::new();

    for (row_idx, line) in lines.iter().skip(data_start).enumerate() {
        let values: Vec<&str> = line.split(delimiter_char).collect();
        let mut row = serde_json::Map::new();

        row.insert("_row_index".to_string(), serde_json::json!(row_idx));

        for (i, value) in values.iter().enumerate() {
            let key = headers.get(i).cloned().unwrap_or_else(|| format!("column_{}", i));
            let clean_value = value.trim().trim_matches('"');

            // 숫자 파싱 시도
            if let Ok(num) = clean_value.parse::<i64>() {
                row.insert(key, serde_json::json!(num));
            } else if let Ok(num) = clean_value.parse::<f64>() {
                row.insert(key, serde_json::json!(num));
            } else {
                row.insert(key, serde_json::json!(clean_value));
            }
        }

        rows.push(serde_json::Value::Object(row));
    }

    Ok((headers, rows))
}

/// JSON 경로 추출
fn extract_json_path(json: &serde_json::Value, path: &str) -> serde_json::Value {
    let parts: Vec<&str> = path.split('.').collect();
    let mut current = json;

    for part in parts {
        // 배열 인덱스 처리 (예: items[0])
        if let Some(bracket_pos) = part.find('[') {
            let key = &part[..bracket_pos];
            let index_str = &part[bracket_pos+1..part.len()-1];

            if !key.is_empty() {
                current = match current.get(key) {
                    Some(v) => v,
                    None => return serde_json::Value::Null,
                };
            }

            if let Ok(index) = index_str.parse::<usize>() {
                current = match current.get(index) {
                    Some(v) => v,
                    None => return serde_json::Value::Null,
                };
            }
        } else {
            current = match current.get(part) {
                Some(v) => v,
                None => return serde_json::Value::Null,
            };
        }
    }

    current.clone()
}

/// CSV 내보내기
fn export_to_csv(data: &serde_json::Value, output_path: &str, delimiter: &str) -> Result<String, String> {
    let delimiter_char = delimiter.chars().next().unwrap_or(',');

    let rows = match data.as_array() {
        Some(arr) => arr,
        None => return Err("데이터가 배열 형식이 아닙니다".to_string()),
    };

    if rows.is_empty() {
        return Err("데이터가 비어있습니다".to_string());
    }

    // 첫 번째 행에서 헤더 추출
    let headers: Vec<String> = match rows[0].as_object() {
        Some(obj) => obj.keys()
            .filter(|k| !k.starts_with('_'))
            .cloned()
            .collect(),
        None => return Err("데이터 행이 객체 형식이 아닙니다".to_string()),
    };

    let mut csv_content = String::new();

    // 헤더 행
    csv_content.push_str(&headers.join(&delimiter_char.to_string()));
    csv_content.push('\n');

    // 데이터 행
    for row in rows {
        if let Some(obj) = row.as_object() {
            let values: Vec<String> = headers.iter()
                .map(|h| {
                    match obj.get(h) {
                        Some(v) => {
                            if v.is_string() {
                                format!("\"{}\"", v.as_str().unwrap_or(""))
                            } else {
                                v.to_string()
                            }
                        }
                        None => String::new()
                    }
                })
                .collect();
            csv_content.push_str(&values.join(&delimiter_char.to_string()));
            csv_content.push('\n');
        }
    }

    // 파일로 저장
    if !output_path.is_empty() {
        fs::write(output_path, &csv_content)
            .map_err(|e| format!("CSV 파일 저장 오류: {}", e))?;
    }

    Ok(csv_content)
}

/// 셸 명령어 실행
async fn execute_shell_command(
    command: &str,
    working_dir: &str,
    timeout_secs: u64,
) -> Result<(String, String, i32), String> {
    use std::process::Stdio;
    use tokio::process::Command;
    use tokio::time::{timeout, Duration};

    // Windows vs Unix 명령어 형식
    #[cfg(windows)]
    let (shell, shell_arg) = ("cmd", "/C");
    #[cfg(not(windows))]
    let (shell, shell_arg) = ("sh", "-c");

    let mut cmd = Command::new(shell);
    cmd.arg(shell_arg)
        .arg(command)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if !working_dir.is_empty() {
        cmd.current_dir(working_dir);
    }

    // 타임아웃과 함께 실행
    let result = timeout(Duration::from_secs(timeout_secs), cmd.output())
        .await
        .map_err(|_| format!("명령어 실행 타임아웃 ({}초)", timeout_secs))?
        .map_err(|e| format!("명령어 실행 오류: {}", e))?;

    let stdout = String::from_utf8_lossy(&result.stdout).to_string();
    let stderr = String::from_utf8_lossy(&result.stderr).to_string();
    let exit_code = result.status.code().unwrap_or(-1);

    Ok((stdout, stderr, exit_code))
}

/// AWS Bedrock Titan 이미지 생성
async fn generate_image_titan(prompt: &str, width: u32, height: u32) -> Result<String, String> {
    use aws_sdk_bedrockruntime::primitives::Blob;

    let region = std::env::var("AWS_REGION")
        .or_else(|_| std::env::var("AWS_DEFAULT_REGION"))
        .unwrap_or_else(|_| "us-east-1".to_string());

    let https_connector = hyper_tls::HttpsConnector::new();
    let hyper_client = aws_smithy_runtime::client::http::hyper_014::HyperClientBuilder::new()
        .build(https_connector);

    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(aws_config::Region::new(region))
        .http_client(hyper_client)
        .load()
        .await;

    let client = aws_sdk_bedrockruntime::Client::new(&config);

    let request_body = serde_json::json!({
        "taskType": "TEXT_IMAGE",
        "textToImageParams": {
            "text": prompt
        },
        "imageGenerationConfig": {
            "numberOfImages": 1,
            "height": height,
            "width": width,
            "cfgScale": 8.0
        }
    });

    let body_bytes = serde_json::to_vec(&request_body)
        .map_err(|e| format!("이미지 생성 요청 직렬화 오류: {}", e))?;

    let response = client
        .invoke_model()
        .model_id("amazon.titan-image-generator-v1")
        .content_type("application/json")
        .accept("application/json")
        .body(Blob::new(body_bytes))
        .send()
        .await
        .map_err(|e| format!("Bedrock 이미지 생성 호출 오류: {:?}", e))?;

    let response_body = response.body();
    let response_str = std::str::from_utf8(response_body.as_ref())
        .map_err(|e| format!("이미지 응답 디코딩 오류: {}", e))?;

    let response_json: serde_json::Value = serde_json::from_str(response_str)
        .map_err(|e| format!("이미지 응답 JSON 파싱 오류: {}", e))?;

    let image_base64 = response_json["images"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .ok_or("이미지 데이터가 없습니다")?
        .to_string();

    Ok(image_base64)
}

// ============================================================
// 문서 처리 헬퍼 함수들
// ============================================================

/// PDF 문서에서 텍스트 추출
fn parse_pdf_document(file_path: &str) -> Result<String, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("파일을 찾을 수 없습니다: {}", file_path));
    }

    let bytes = fs::read(path)
        .map_err(|e| format!("PDF 파일 읽기 오류: {}", e))?;

    pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| format!("PDF 텍스트 추출 오류: {}", e))
}

/// Excel 문서 파싱 (xlsx, xls, ods 지원)
fn parse_excel_document(file_path: &str, sheet_name: Option<&str>) -> Result<serde_json::Value, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("파일을 찾을 수 없습니다: {}", file_path));
    }

    let extension = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // 파일 확장자에 따라 적절한 리더 선택
    let mut result = serde_json::json!({
        "sheets": [],
        "file_path": file_path
    });

    match extension.as_str() {
        "xlsx" => {
            let mut workbook: Xlsx<_> = open_workbook(path)
                .map_err(|e| format!("Excel(xlsx) 파일 열기 오류: {}", e))?;

            let sheet_names = workbook.sheet_names().to_vec();
            let mut sheets_data = Vec::new();

            for name in &sheet_names {
                if let Some(target) = sheet_name {
                    if name != target {
                        continue;
                    }
                }

                if let Ok(range) = workbook.worksheet_range(name) {
                    let rows: Vec<Vec<serde_json::Value>> = range.rows()
                        .map(|row| {
                            row.iter().map(|cell| {
                                match cell {
                                    calamine::Data::Empty => serde_json::Value::Null,
                                    calamine::Data::String(s) => serde_json::json!(s),
                                    calamine::Data::Float(f) => serde_json::json!(f),
                                    calamine::Data::Int(i) => serde_json::json!(i),
                                    calamine::Data::Bool(b) => serde_json::json!(b),
                                    calamine::Data::DateTime(dt) => serde_json::json!(dt.to_string()),
                                    calamine::Data::Error(e) => serde_json::json!(format!("ERROR: {:?}", e)),
                                    _ => serde_json::Value::Null,
                                }
                            }).collect()
                        })
                        .collect();

                    sheets_data.push(serde_json::json!({
                        "name": name,
                        "rows": rows,
                        "row_count": rows.len()
                    }));
                }
            }

            result["sheets"] = serde_json::json!(sheets_data);
            result["sheet_names"] = serde_json::json!(sheet_names);
        }
        "xls" => {
            let mut workbook: Xls<_> = open_workbook(path)
                .map_err(|e| format!("Excel(xls) 파일 열기 오류: {}", e))?;

            let sheet_names = workbook.sheet_names().to_vec();
            let mut sheets_data = Vec::new();

            for name in &sheet_names {
                if let Some(target) = sheet_name {
                    if name != target {
                        continue;
                    }
                }

                if let Ok(range) = workbook.worksheet_range(name) {
                    let rows: Vec<Vec<serde_json::Value>> = range.rows()
                        .map(|row| {
                            row.iter().map(|cell| {
                                match cell {
                                    calamine::Data::Empty => serde_json::Value::Null,
                                    calamine::Data::String(s) => serde_json::json!(s),
                                    calamine::Data::Float(f) => serde_json::json!(f),
                                    calamine::Data::Int(i) => serde_json::json!(i),
                                    calamine::Data::Bool(b) => serde_json::json!(b),
                                    calamine::Data::DateTime(dt) => serde_json::json!(dt.to_string()),
                                    calamine::Data::Error(e) => serde_json::json!(format!("ERROR: {:?}", e)),
                                    _ => serde_json::Value::Null,
                                }
                            }).collect()
                        })
                        .collect();

                    sheets_data.push(serde_json::json!({
                        "name": name,
                        "rows": rows,
                        "row_count": rows.len()
                    }));
                }
            }

            result["sheets"] = serde_json::json!(sheets_data);
            result["sheet_names"] = serde_json::json!(sheet_names);
        }
        "ods" => {
            let mut workbook: Ods<_> = open_workbook(path)
                .map_err(|e| format!("ODS 파일 열기 오류: {}", e))?;

            let sheet_names = workbook.sheet_names().to_vec();
            let mut sheets_data = Vec::new();

            for name in &sheet_names {
                if let Some(target) = sheet_name {
                    if name != target {
                        continue;
                    }
                }

                if let Ok(range) = workbook.worksheet_range(name) {
                    let rows: Vec<Vec<serde_json::Value>> = range.rows()
                        .map(|row| {
                            row.iter().map(|cell| {
                                match cell {
                                    calamine::Data::Empty => serde_json::Value::Null,
                                    calamine::Data::String(s) => serde_json::json!(s),
                                    calamine::Data::Float(f) => serde_json::json!(f),
                                    calamine::Data::Int(i) => serde_json::json!(i),
                                    calamine::Data::Bool(b) => serde_json::json!(b),
                                    calamine::Data::DateTime(dt) => serde_json::json!(dt.to_string()),
                                    calamine::Data::Error(e) => serde_json::json!(format!("ERROR: {:?}", e)),
                                    _ => serde_json::Value::Null,
                                }
                            }).collect()
                        })
                        .collect();

                    sheets_data.push(serde_json::json!({
                        "name": name,
                        "rows": rows,
                        "row_count": rows.len()
                    }));
                }
            }

            result["sheets"] = serde_json::json!(sheets_data);
            result["sheet_names"] = serde_json::json!(sheet_names);
        }
        _ => {
            return Err(format!("지원하지 않는 Excel 형식입니다: {}", extension));
        }
    }

    Ok(result)
}

/// PDF 파일로 내보내기
fn export_to_pdf(text: &str, output_path: &str, title: &str) -> Result<(), String> {
    let (doc, page1, layer1) = PdfDocument::new(title, Mm(210.0), Mm(297.0), "Layer 1");
    let current_layer = doc.get_page(page1).get_layer(layer1);

    // 내장 폰트 사용 (한글은 제한적으로 지원)
    let font = doc.add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| format!("폰트 로드 오류: {:?}", e))?;

    // 텍스트를 라인별로 분할하여 PDF에 추가
    let lines: Vec<&str> = text.lines().collect();
    let font_size = 12.0;
    let line_height = 5.0;
    let margin_top = 280.0;
    let margin_left = 20.0;
    let max_lines_per_page = 50;

    let mut current_y = margin_top;
    let mut line_count = 0;
    let mut current_layer_ref = current_layer;

    for line in lines {
        if line_count >= max_lines_per_page {
            // 새 페이지 추가
            let (new_page, new_layer) = doc.add_page(Mm(210.0), Mm(297.0), "Layer 1");
            current_layer_ref = doc.get_page(new_page).get_layer(new_layer);
            current_y = margin_top;
            line_count = 0;
        }

        // ASCII가 아닌 문자는 ?로 대체 (내장 폰트 한계)
        let safe_line: String = line.chars()
            .map(|c| if c.is_ascii() { c } else { '?' })
            .collect();

        current_layer_ref.use_text(&safe_line, font_size, Mm(margin_left), Mm(current_y), &font);
        current_y -= line_height;
        line_count += 1;
    }

    // 파일 저장
    let file = fs::File::create(output_path)
        .map_err(|e| format!("PDF 파일 생성 오류: {}", e))?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer)
        .map_err(|e| format!("PDF 저장 오류: {:?}", e))?;

    Ok(())
}

/// Excel 파일로 내보내기
fn export_to_excel(data: &serde_json::Value, output_path: &str, sheet_name: &str) -> Result<(), String> {
    let mut workbook = XlsxWorkbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name(sheet_name)
        .map_err(|e| format!("시트 이름 설정 오류: {}", e))?;

    // 헤더 포맷
    let header_format = Format::new().set_bold();

    // 데이터 유형에 따라 처리
    if let Some(arr) = data.as_array() {
        // 배열 데이터
        if let Some(first) = arr.first() {
            if let Some(obj) = first.as_object() {
                // 객체 배열인 경우 - 헤더 추가
                let headers: Vec<&String> = obj.keys().collect();
                for (col, header) in headers.iter().enumerate() {
                    worksheet.write_string_with_format(0, col as u16, *header, &header_format)
                        .map_err(|e| format!("헤더 쓰기 오류: {}", e))?;
                }

                // 데이터 행 추가
                for (row_idx, item) in arr.iter().enumerate() {
                    if let Some(obj) = item.as_object() {
                        for (col, key) in headers.iter().enumerate() {
                            if let Some(value) = obj.get(*key) {
                                write_excel_cell(worksheet, (row_idx + 1) as u32, col as u16, value)?;
                            }
                        }
                    }
                }
            } else {
                // 단순 배열인 경우
                for (row_idx, item) in arr.iter().enumerate() {
                    write_excel_cell(worksheet, row_idx as u32, 0, item)?;
                }
            }
        }
    } else if let Some(obj) = data.as_object() {
        // 단일 객체인 경우 키-값 형태로 출력
        worksheet.write_string_with_format(0, 0, "Key", &header_format)
            .map_err(|e| format!("헤더 쓰기 오류: {}", e))?;
        worksheet.write_string_with_format(0, 1, "Value", &header_format)
            .map_err(|e| format!("헤더 쓰기 오류: {}", e))?;

        for (row_idx, (key, value)) in obj.iter().enumerate() {
            worksheet.write_string((row_idx + 1) as u32, 0, key)
                .map_err(|e| format!("키 쓰기 오류: {}", e))?;
            write_excel_cell(worksheet, (row_idx + 1) as u32, 1, value)?;
        }
    } else {
        // 단일 값인 경우
        write_excel_cell(worksheet, 0, 0, data)?;
    }

    workbook.save(output_path)
        .map_err(|e| format!("Excel 파일 저장 오류: {}", e))?;

    Ok(())
}

/// Excel 셀에 값 쓰기 헬퍼
fn write_excel_cell(worksheet: &mut rust_xlsxwriter::Worksheet, row: u32, col: u16, value: &serde_json::Value) -> Result<(), String> {
    match value {
        serde_json::Value::Null => {
            worksheet.write_string(row, col, "")
                .map_err(|e| format!("셀 쓰기 오류: {}", e))?;
        }
        serde_json::Value::Bool(b) => {
            worksheet.write_boolean(row, col, *b)
                .map_err(|e| format!("셀 쓰기 오류: {}", e))?;
        }
        serde_json::Value::Number(n) => {
            if let Some(f) = n.as_f64() {
                worksheet.write_number(row, col, f)
                    .map_err(|e| format!("셀 쓰기 오류: {}", e))?;
            } else if let Some(i) = n.as_i64() {
                worksheet.write_number(row, col, i as f64)
                    .map_err(|e| format!("셀 쓰기 오류: {}", e))?;
            }
        }
        serde_json::Value::String(s) => {
            worksheet.write_string(row, col, s)
                .map_err(|e| format!("셀 쓰기 오류: {}", e))?;
        }
        _ => {
            // 배열이나 객체는 JSON 문자열로 변환
            let s = serde_json::to_string(value).unwrap_or_default();
            worksheet.write_string(row, col, &s)
                .map_err(|e| format!("셀 쓰기 오류: {}", e))?;
        }
    }
    Ok(())
}

/// Word(DOCX) 파일로 내보내기
fn export_to_docx(text: &str, output_path: &str, _title: &str) -> Result<(), String> {
    let mut docx = Docx::new();

    // 텍스트를 문단별로 분할하여 추가
    for para_text in text.split("\n\n") {
        let paragraph = Paragraph::new().add_run(Run::new().add_text(para_text));
        docx = docx.add_paragraph(paragraph);
    }

    // 빈 문단이면 하나의 문단이라도 추가
    if text.trim().is_empty() {
        let paragraph = Paragraph::new().add_run(Run::new().add_text(""));
        docx = docx.add_paragraph(paragraph);
    }

    // 파일 저장
    let file = fs::File::create(output_path)
        .map_err(|e| format!("DOCX 파일 생성 오류: {}", e))?;
    docx.build().pack(file)
        .map_err(|e| format!("DOCX 저장 오류: {}", e))?;

    Ok(())
}

/// PowerPoint(PPTX) 파일로 내보내기
fn export_to_pptx(text: &str, output_path: &str, title: &str) -> Result<(), String> {
    let mut slides = Vec::new();

    // 텍스트를 슬라이드별로 분할 (더블 줄바꿈 기준)
    let paragraphs: Vec<&str> = text.split("\n\n")
        .filter(|p| !p.trim().is_empty())
        .collect();

    // 제목 슬라이드
    let mut title_slide = SlideContent::new(title);
    title_slide = title_slide.add_bullet("Generated by CNT Agent Studio");
    slides.push(title_slide);

    // 최대 슬라이드당 bullet 포인트 수
    let max_bullets_per_slide = 6;
    let mut current_bullets: Vec<&str> = Vec::new();
    let mut slide_number = 1;

    for para in &paragraphs {
        // 문단을 줄 단위로 분할하여 bullet으로 사용
        let lines: Vec<&str> = para.lines()
            .filter(|l| !l.trim().is_empty())
            .collect();

        for line in lines {
            if current_bullets.len() >= max_bullets_per_slide {
                // 새 슬라이드 생성
                let mut content_slide = SlideContent::new(&format!("페이지 {}", slide_number));
                for bullet in &current_bullets {
                    content_slide = content_slide.add_bullet(bullet);
                }
                slides.push(content_slide);
                slide_number += 1;
                current_bullets.clear();
            }
            current_bullets.push(line);
        }
    }

    // 남은 콘텐츠 처리
    if !current_bullets.is_empty() {
        let mut content_slide = SlideContent::new(&format!("페이지 {}", slide_number));
        for bullet in &current_bullets {
            content_slide = content_slide.add_bullet(bullet);
        }
        slides.push(content_slide);
    }

    // 텍스트가 없으면 빈 슬라이드라도 하나 추가
    if paragraphs.is_empty() {
        let content_slide = SlideContent::new("내용")
            .add_bullet("(내용 없음)");
        slides.push(content_slide);
    }

    // PPTX 데이터 생성 및 파일 저장
    let pptx_data = create_pptx_with_content(title, slides)
        .map_err(|e| format!("PPTX 생성 오류: {:?}", e))?;

    fs::write(output_path, pptx_data)
        .map_err(|e| format!("PPTX 파일 저장 오류: {}", e))?;

    Ok(())
}

// ============================================================
// 내보내기 템플릿 함수들
// ============================================================

/// Markdown 템플릿 적용
fn apply_markdown_template(content: &str, template: &str, title: &str, custom_template: &str) -> String {
    let date = Utc::now().format("%Y-%m-%d").to_string();

    match template {
        "report" => format!(r#"# {}

> 생성일: {}

---

{}

---

*이 문서는 CNT Agent Studio에서 자동 생성되었습니다.*
"#, title, date, content),

        "technical" => format!(r#"# {}

## 개요

{}

## 세부 내용

{}

## 참고사항

- 자동 생성 문서
- 생성일: {}

---
"#, title, content.lines().next().unwrap_or(""), content, date),

        "meeting" => format!(r#"# 회의록: {}

**날짜**: {}

## 회의 내용

{}

## 결정사항

-

## 후속 조치

-

---
*작성: CNT Agent Studio*
"#, title, date, content),

        "api_doc" => format!(r#"# API 문서: {}

## 엔드포인트

{}

## 요청/응답

```json
{{}}
```

## 설명

{}

---
*최종 업데이트: {}*
"#, title, content.lines().next().unwrap_or(""), content, date),

        "custom" if !custom_template.is_empty() => {
            custom_template
                .replace("{{title}}", title)
                .replace("{{content}}", content)
                .replace("{{date}}", &date)
        }

        _ => format!("# {}\n\n{}", title, content),
    }
}

/// HTML 템플릿 적용
fn apply_html_template(content: &str, data: &serde_json::Value, template: &str, title: &str, custom_template: &str) -> String {
    let date = Utc::now().format("%Y-%m-%d").to_string();

    match template {
        "dashboard" => format!(r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #1a1a2e; color: #eee; min-height: 100vh; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 2rem; text-align: center; }}
        .header h1 {{ font-size: 2rem; margin-bottom: 0.5rem; }}
        .header p {{ opacity: 0.8; }}
        .container {{ max-width: 1200px; margin: 2rem auto; padding: 0 1rem; }}
        .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }}
        .card {{ background: #16213e; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }}
        .card h3 {{ color: #667eea; margin-bottom: 1rem; font-size: 1.1rem; }}
        .card-content {{ line-height: 1.6; white-space: pre-wrap; }}
        .stats {{ display: flex; gap: 2rem; justify-content: center; margin-top: 1rem; }}
        .stat {{ text-align: center; }}
        .stat-value {{ font-size: 2rem; font-weight: bold; color: #667eea; }}
        .stat-label {{ font-size: 0.8rem; opacity: 0.7; }}
        .footer {{ text-align: center; padding: 2rem; opacity: 0.6; font-size: 0.8rem; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>{}</h1>
        <p>Generated on {}</p>
    </div>
    <div class="container">
        <div class="grid">
            <div class="card">
                <h3>Overview</h3>
                <div class="card-content">{}</div>
            </div>
        </div>
    </div>
    <div class="footer">
        CNT Agent Studio Dashboard
    </div>
</body>
</html>"#, title, title, date, content.replace("<", "&lt;").replace(">", "&gt;")),

        "report" => format!(r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <style>
        body {{ font-family: 'Malgun Gothic', 'Noto Sans KR', sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.8; background: #fff; color: #333; }}
        h1 {{ border-bottom: 3px solid #667eea; padding-bottom: 0.5rem; color: #333; }}
        .meta {{ color: #666; font-size: 0.9rem; margin-bottom: 2rem; }}
        .content {{ white-space: pre-wrap; background: #f8f9fa; padding: 1.5rem; border-radius: 8px; }}
        .footer {{ margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #ddd; font-size: 0.8rem; color: #888; }}
    </style>
</head>
<body>
    <h1>{}</h1>
    <div class="meta">작성일: {}</div>
    <div class="content">{}</div>
    <div class="footer">Generated by CNT Agent Studio</div>
</body>
</html>"#, title, title, date, content.replace("<", "&lt;").replace(">", "&gt;")),

        "flowchart" => {
            // Mermaid.js 기반 플로우차트 템플릿
            format!(r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <style>
        body {{ font-family: 'Segoe UI', sans-serif; background: #f5f5f5; padding: 2rem; }}
        .container {{ max-width: 1000px; margin: 0 auto; background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }}
        h1 {{ color: #333; margin-bottom: 1.5rem; }}
        .mermaid {{ text-align: center; margin: 2rem 0; }}
        .description {{ background: #f8f9fa; padding: 1rem; border-radius: 8px; margin-top: 1.5rem; white-space: pre-wrap; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>{}</h1>
        <div class="mermaid">
{}
        </div>
        <div class="description">{}</div>
    </div>
    <script>mermaid.initialize({{ startOnLoad: true, theme: 'default' }});</script>
</body>
</html>"#, title, title, content, "Flow diagram generated by CNT Agent Studio")
        }

        "table" => {
            // 데이터를 테이블로 변환
            let table_html = if let Some(arr) = data.as_array() {
                let mut html = String::from("<table><thead><tr>");
                if let Some(first) = arr.first() {
                    if let Some(obj) = first.as_object() {
                        for key in obj.keys() {
                            html.push_str(&format!("<th>{}</th>", key));
                        }
                    }
                }
                html.push_str("</tr></thead><tbody>");
                for item in arr {
                    if let Some(obj) = item.as_object() {
                        html.push_str("<tr>");
                        for value in obj.values() {
                            let val_str = match value {
                                serde_json::Value::String(s) => s.clone(),
                                _ => value.to_string(),
                            };
                            html.push_str(&format!("<td>{}</td>", val_str));
                        }
                        html.push_str("</tr>");
                    }
                }
                html.push_str("</tbody></table>");
                html
            } else {
                format!("<pre>{}</pre>", content)
            };

            format!(r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <style>
        body {{ font-family: 'Segoe UI', sans-serif; padding: 2rem; background: #f5f5f5; }}
        .container {{ max-width: 1200px; margin: 0 auto; background: white; padding: 2rem; border-radius: 12px; }}
        h1 {{ color: #333; margin-bottom: 1.5rem; }}
        table {{ width: 100%; border-collapse: collapse; }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
        th {{ background: #667eea; color: white; }}
        tr:hover {{ background: #f5f5f5; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>{}</h1>
        {}
    </div>
</body>
</html>"#, title, title, table_html)
        }

        "custom" if !custom_template.is_empty() => {
            custom_template
                .replace("{{title}}", title)
                .replace("{{content}}", content)
                .replace("{{date}}", &date)
                .replace("{{data}}", &serde_json::to_string_pretty(data).unwrap_or_default())
        }

        _ => format!(r#"<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <style>
        body {{ font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }}
        pre {{ background: #f5f5f5; padding: 1rem; border-radius: 8px; overflow-x: auto; }}
    </style>
</head>
<body>
    <h1>{}</h1>
    <pre>{}</pre>
</body>
</html>"#, title, title, content.replace("<", "&lt;").replace(">", "&gt;")),
    }
}
