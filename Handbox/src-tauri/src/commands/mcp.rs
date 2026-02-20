// MCP (Model Context Protocol) Server Manager
// JSON-RPC 2.0 over stdio 통신

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use lazy_static::lazy_static;

// ========================================
// MCP 타입 정의
// ========================================

/// MCP 서버 시작 요청
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServerStartRequest {
    pub id: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: Option<HashMap<String, String>>,
    pub cwd: Option<String>,
}

/// MCP 서버 시작 결과
#[derive(Debug, Serialize, Deserialize)]
pub struct MCPServerStartResult {
    pub success: bool,
    pub pid: Option<u32>,
    pub error: Option<String>,
}

/// MCP 서버 상태
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServerStatus {
    pub id: String,
    pub pid: Option<u32>,
    pub status: String, // "running", "stopped", "error"
    pub error: Option<String>,
}

/// MCP 도구 정의
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPToolDefinition {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: serde_json::Value,
}

/// MCP 리소스 정의
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPResourceDefinition {
    pub uri: String,
    pub name: String,
    pub description: Option<String>,
    pub mime_type: Option<String>,
}

/// MCP 서버 기능 목록
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServerCapabilities {
    pub tools: Vec<MCPToolDefinition>,
    pub resources: Vec<MCPResourceDefinition>,
    pub protocol_version: Option<String>,
}

/// MCP 도구 호출 요청
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPToolCallRequest {
    pub server_id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

/// MCP 콘텐츠 타입
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPContent {
    #[serde(rename = "type")]
    pub content_type: String, // "text", "image", "resource"
    pub text: Option<String>,
    pub data: Option<String>, // base64
    pub mime_type: Option<String>,
}

/// MCP 도구 호출 결과
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPToolCallResult {
    pub success: bool,
    pub content: Vec<MCPContent>,
    pub is_error: Option<bool>,
    pub error: Option<String>,
}

// ========================================
// JSON-RPC 메시지
// ========================================

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    params: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<u64>,
    result: Option<serde_json::Value>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcError {
    code: i32,
    message: String,
    data: Option<serde_json::Value>,
}

// ========================================
// MCP 서버 관리
// ========================================

struct MCPServerInstance {
    process: Child,
    request_id: u64,
}

lazy_static! {
    static ref MCP_SERVERS: Arc<Mutex<HashMap<String, MCPServerInstance>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

/// MCP 서버 시작
#[tauri::command]
pub async fn mcp_start_server(request: MCPServerStartRequest) -> Result<MCPServerStartResult, String> {
    let server_id = request.id.clone();

    // 이미 실행 중인 서버 체크
    {
        let servers = MCP_SERVERS.lock().map_err(|e| e.to_string())?;
        if servers.contains_key(&server_id) {
            return Ok(MCPServerStartResult {
                success: false,
                pid: None,
                error: Some("Server already running".to_string()),
            });
        }
    }

    // 프로세스 시작
    let mut cmd = Command::new(&request.command);
    cmd.args(&request.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // 환경 변수 설정
    if let Some(env_vars) = &request.env {
        for (key, value) in env_vars {
            cmd.env(key, value);
        }
    }

    // 작업 디렉토리 설정
    if let Some(cwd) = &request.cwd {
        cmd.current_dir(cwd);
    }

    // Windows에서 콘솔 창 숨기기
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    match cmd.spawn() {
        Ok(child) => {
            let pid = child.id();

            // 서버 인스턴스 저장
            let instance = MCPServerInstance {
                process: child,
                request_id: 0,
            };

            {
                let mut servers = MCP_SERVERS.lock().map_err(|e| e.to_string())?;
                servers.insert(server_id.clone(), instance);
            }

            Ok(MCPServerStartResult {
                success: true,
                pid: Some(pid),
                error: None,
            })
        }
        Err(e) => Ok(MCPServerStartResult {
            success: false,
            pid: None,
            error: Some(format!("Failed to start server: {}", e)),
        }),
    }
}

/// MCP 서버 중지
#[tauri::command]
pub async fn mcp_stop_server(server_id: String) -> Result<bool, String> {
    let mut servers = MCP_SERVERS.lock().map_err(|e| e.to_string())?;

    if let Some(mut instance) = servers.remove(&server_id) {
        match instance.process.kill() {
            Ok(_) => {
                let _ = instance.process.wait();
                Ok(true)
            }
            Err(e) => Err(format!("Failed to stop server: {}", e)),
        }
    } else {
        Ok(false)
    }
}

/// MCP 서버 상태 조회
#[tauri::command]
pub async fn mcp_get_server_status(server_id: String) -> Result<MCPServerStatus, String> {
    let servers = MCP_SERVERS.lock().map_err(|e| e.to_string())?;

    if let Some(instance) = servers.get(&server_id) {
        Ok(MCPServerStatus {
            id: server_id,
            pid: Some(instance.process.id()),
            status: "running".to_string(),
            error: None,
        })
    } else {
        Ok(MCPServerStatus {
            id: server_id,
            pid: None,
            status: "stopped".to_string(),
            error: None,
        })
    }
}

/// MCP 서버 초기화 (핸드셰이크)
#[tauri::command]
pub async fn mcp_initialize(server_id: String) -> Result<MCPServerCapabilities, String> {
    // Initialize 요청 전송
    let init_response = send_mcp_request(
        &server_id,
        "initialize",
        serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "handbox",
                "version": "1.0.0"
            }
        }),
    ).await?;

    // initialized 알림 전송
    send_mcp_notification(&server_id, "notifications/initialized", serde_json::json!({})).await?;

    // tools/list 호출
    let tools_response = send_mcp_request(
        &server_id,
        "tools/list",
        serde_json::json!({}),
    ).await?;

    let tools: Vec<MCPToolDefinition> = if let Some(tools_array) = tools_response.get("tools") {
        serde_json::from_value(tools_array.clone()).unwrap_or_default()
    } else {
        vec![]
    };

    // resources/list 호출
    let resources_response = send_mcp_request(
        &server_id,
        "resources/list",
        serde_json::json!({}),
    ).await.unwrap_or_default();

    let resources: Vec<MCPResourceDefinition> = if let Some(resources_array) = resources_response.get("resources") {
        serde_json::from_value(resources_array.clone()).unwrap_or_default()
    } else {
        vec![]
    };

    let protocol_version = init_response
        .get("protocolVersion")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok(MCPServerCapabilities {
        tools,
        resources,
        protocol_version,
    })
}

/// MCP 도구 목록 조회
#[tauri::command]
pub async fn mcp_list_tools(server_id: String) -> Result<Vec<MCPToolDefinition>, String> {
    let response = send_mcp_request(
        &server_id,
        "tools/list",
        serde_json::json!({}),
    ).await?;

    if let Some(tools_array) = response.get("tools") {
        let tools: Vec<MCPToolDefinition> = serde_json::from_value(tools_array.clone())
            .map_err(|e| format!("Failed to parse tools: {}", e))?;
        Ok(tools)
    } else {
        Ok(vec![])
    }
}

/// MCP 도구 호출
#[tauri::command]
pub async fn mcp_call_tool(request: MCPToolCallRequest) -> Result<MCPToolCallResult, String> {
    let response = send_mcp_request(
        &request.server_id,
        "tools/call",
        serde_json::json!({
            "name": request.tool_name,
            "arguments": request.arguments
        }),
    ).await?;

    // 응답 파싱
    let content: Vec<MCPContent> = if let Some(content_array) = response.get("content") {
        serde_json::from_value(content_array.clone()).unwrap_or_default()
    } else {
        vec![]
    };

    let is_error = response.get("isError").and_then(|v| v.as_bool());

    Ok(MCPToolCallResult {
        success: !is_error.unwrap_or(false),
        content,
        is_error,
        error: None,
    })
}

/// MCP 리소스 조회
#[tauri::command]
pub async fn mcp_get_resource(server_id: String, uri: String) -> Result<MCPContent, String> {
    let response = send_mcp_request(
        &server_id,
        "resources/read",
        serde_json::json!({
            "uri": uri
        }),
    ).await?;

    if let Some(contents) = response.get("contents").and_then(|v| v.as_array()) {
        if let Some(first) = contents.first() {
            let content: MCPContent = serde_json::from_value(first.clone())
                .map_err(|e| format!("Failed to parse content: {}", e))?;
            return Ok(content);
        }
    }

    Err("No content returned".to_string())
}

/// 모든 MCP 서버 목록 조회
#[tauri::command]
pub async fn mcp_list_servers() -> Result<Vec<MCPServerStatus>, String> {
    let servers = MCP_SERVERS.lock().map_err(|e| e.to_string())?;

    let statuses: Vec<MCPServerStatus> = servers
        .iter()
        .map(|(id, instance)| MCPServerStatus {
            id: id.clone(),
            pid: Some(instance.process.id()),
            status: "running".to_string(),
            error: None,
        })
        .collect();

    Ok(statuses)
}

// ========================================
// 내부 헬퍼 함수
// ========================================

/// MCP 요청 타임아웃 (초)
const MCP_REQUEST_TIMEOUT_SECS: u64 = 60;

/// MCP 서버에 JSON-RPC 요청 전송 (타임아웃 포함)
async fn send_mcp_request(
    server_id: &str,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    use std::time::Duration;
    use tokio::time::timeout;

    let server_id = server_id.to_string();
    let method = method.to_string();
    let method_for_error = method.clone(); // 에러 메시지용 복사본

    // 블로킹 I/O를 별도 스레드에서 실행하고 타임아웃 적용
    let result = timeout(
        Duration::from_secs(MCP_REQUEST_TIMEOUT_SECS),
        tokio::task::spawn_blocking(move || {
            send_mcp_request_blocking(&server_id, &method, params)
        })
    ).await;

    match result {
        Ok(Ok(inner_result)) => inner_result,
        Ok(Err(e)) => Err(format!("MCP task panicked: {}", e)),
        Err(_) => Err(format!(
            "MCP request timed out after {} seconds. Method: {}",
            MCP_REQUEST_TIMEOUT_SECS, method_for_error
        )),
    }
}

/// MCP 서버에 JSON-RPC 요청 전송 (블로킹 버전 - spawn_blocking에서 호출)
fn send_mcp_request_blocking(
    server_id: &str,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut servers = MCP_SERVERS.lock().map_err(|e| e.to_string())?;

    let instance = servers.get_mut(server_id)
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    instance.request_id += 1;
    let request_id = instance.request_id;

    let request = JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: request_id,
        method: method.to_string(),
        params: Some(params),
    };

    let request_json = serde_json::to_string(&request)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;

    // stdin으로 요청 전송
    let stdin = instance.process.stdin.as_mut()
        .ok_or("stdin not available")?;

    writeln!(stdin, "{}", request_json)
        .map_err(|e| format!("Failed to write to stdin: {}", e))?;

    stdin.flush()
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    // stdout에서 응답 읽기 (spawn_blocking 내에서 실행되므로 tokio 런타임 블로킹 안됨)
    let stdout = instance.process.stdout.as_mut()
        .ok_or("stdout not available")?;

    let mut reader = BufReader::new(stdout);
    let mut response_line = String::new();

    reader.read_line(&mut response_line)
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if response_line.is_empty() {
        return Err("MCP server returned empty response".to_string());
    }

    let response: JsonRpcResponse = serde_json::from_str(&response_line)
        .map_err(|e| format!("Failed to parse response: {} - raw: {}", e, response_line))?;

    if let Some(error) = response.error {
        return Err(format!("MCP error: {} (code: {})", error.message, error.code));
    }

    Ok(response.result.unwrap_or(serde_json::Value::Null))
}

/// MCP 서버에 JSON-RPC 알림 전송 (응답 없음)
async fn send_mcp_notification(
    server_id: &str,
    method: &str,
    params: serde_json::Value,
) -> Result<(), String> {
    let mut servers = MCP_SERVERS.lock().map_err(|e| e.to_string())?;

    let instance = servers.get_mut(server_id)
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    let notification = serde_json::json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params
    });

    let notification_json = serde_json::to_string(&notification)
        .map_err(|e| format!("Failed to serialize notification: {}", e))?;

    let stdin = instance.process.stdin.as_mut()
        .ok_or("stdin not available")?;

    writeln!(stdin, "{}", notification_json)
        .map_err(|e| format!("Failed to write notification: {}", e))?;

    stdin.flush()
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    Ok(())
}
