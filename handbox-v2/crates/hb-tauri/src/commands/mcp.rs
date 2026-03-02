//! MCP Commands - Model Context Protocol server management
//!
//! Provides Tauri commands for connecting to and managing MCP servers,
//! discovering tools, and invoking tool calls.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::io::{BufRead, BufReader, Write};
use tauri::{command, State};
use tokio::sync::Mutex;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub transport: McpTransport,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpTransport {
    Stdio,
    Sse,
    WebSocket,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerStatus {
    pub id: String,
    pub name: String,
    pub status: String, // "connected", "disconnected", "error"
    pub tools: Vec<McpTool>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolCallRequest {
    pub server_id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolCallResult {
    pub success: bool,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpJsonRpcRequest {
    pub jsonrpc: String,
    pub id: u64,
    pub method: String,
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpJsonRpcResponse {
    pub jsonrpc: String,
    pub id: u64,
    pub result: Option<serde_json::Value>,
    pub error: Option<McpJsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpJsonRpcError {
    pub code: i32,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

// ============================================================================
// State Management
// ============================================================================

pub struct McpServerProcess {
    pub config: McpServerConfig,
    /// Stdio transport: raw child process
    pub process: Option<Child>,
    /// SSE/WebSocket transport: async MCP client from hb-mcp
    pub async_client: Option<Arc<tokio::sync::Mutex<hb_mcp::McpClient>>>,
    pub status: String,
    pub tools: Vec<McpTool>,
    pub request_id: u64,
}

pub struct McpState {
    pub servers: Arc<Mutex<HashMap<String, McpServerProcess>>>,
}

impl Default for McpState {
    fn default() -> Self {
        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

// ============================================================================
// Commands - Server Management
// ============================================================================

/// Add a new MCP server configuration
#[command]
pub async fn mcp_add_server(
    state: State<'_, McpState>,
    config: McpServerConfig,
) -> Result<String, String> {
    let mut servers = state.servers.lock().await;

    let id = config.id.clone();

    servers.insert(id.clone(), McpServerProcess {
        config,
        process: None,
        async_client: None,
        status: "disconnected".to_string(),
        tools: vec![],
        request_id: 0,
    });

    Ok(id)
}

/// Remove an MCP server
#[command]
pub async fn mcp_remove_server(
    state: State<'_, McpState>,
    server_id: String,
) -> Result<(), String> {
    let mut servers = state.servers.lock().await;

    // Kill process if running
    if let Some(mut server) = servers.remove(&server_id) {
        if let Some(mut process) = server.process.take() {
            let _ = process.kill();
        }
    }

    Ok(())
}

/// Connect to an MCP server (start process for stdio)
#[command]
pub async fn mcp_connect_server(
    state: State<'_, McpState>,
    server_id: String,
) -> Result<McpServerStatus, String> {
    let mut servers = state.servers.lock().await;

    let server = servers.get_mut(&server_id)
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    match server.config.transport {
        McpTransport::Stdio => {
            let command = server.config.command.as_ref()
                .ok_or("No command specified for stdio transport")?;

            let mut cmd = Command::new(command);

            if let Some(args) = &server.config.args {
                cmd.args(args);
            }

            if let Some(env) = &server.config.env {
                for (key, value) in env {
                    cmd.env(key, value);
                }
            }

            cmd.stdin(Stdio::piped())
               .stdout(Stdio::piped())
               .stderr(Stdio::piped());

            let process = cmd.spawn()
                .map_err(|e| format!("Failed to start process: {}", e))?;

            server.process = Some(process);
            server.status = "connected".to_string();

            // Initialize and discover tools — blocking I/O wrapped with timeout
            let discover_result = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                tokio::task::spawn_blocking({
                    // Take process temporarily for blocking discovery
                    let mut process = server.process.take().unwrap();
                    let req_id = server.request_id;
                    move || {
                        let result = discover_tools_from_process(&mut process, req_id);
                        (process, result)
                    }
                }),
            ).await;

            match discover_result {
                Ok(Ok((process, Ok((tools, new_req_id))))) => {
                    server.process = Some(process);
                    server.request_id = new_req_id;
                    server.tools = tools.clone();
                    Ok(McpServerStatus {
                        id: server_id,
                        name: server.config.name.clone(),
                        status: "connected".to_string(),
                        tools,
                        error: None,
                    })
                }
                Ok(Ok((process, Err(e)))) => {
                    server.process = Some(process);
                    server.status = "error".to_string();
                    Err(format!("Tool discovery failed: {e}"))
                }
                Ok(Err(e)) => {
                    server.status = "error".to_string();
                    Err(format!("Discovery task panicked: {e}"))
                }
                Err(_) => {
                    server.status = "error".to_string();
                    // Kill the process on timeout
                    if let Some(mut p) = server.process.take() {
                        let _ = p.kill();
                    }
                    Err("Tool discovery timed out (30s)".to_string())
                }
            }
        }
        McpTransport::Sse => {
            let url = server.config.url.as_ref()
                .ok_or("No URL specified for SSE transport")?;

            let mut client = hb_mcp::McpClient::new(url)
                .map_err(|e| format!("Failed to create SSE client: {e}"))?;

            let init_result = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                client.initialize(),
            ).await;

            match init_result {
                Ok(Ok(_server_info)) => {
                    // Discover tools
                    let tools = match client.list_tools().await {
                        Ok(remote_tools) => remote_tools.iter().map(|t| McpTool {
                            name: t.name.clone(),
                            description: t.description.clone(),
                            input_schema: t.input_schema.clone(),
                        }).collect(),
                        Err(e) => {
                            tracing::warn!("SSE tool discovery failed: {e}");
                            vec![]
                        }
                    };

                    server.async_client = Some(Arc::new(tokio::sync::Mutex::new(client)));
                    server.status = "connected".to_string();
                    server.tools = tools.clone();

                    Ok(McpServerStatus {
                        id: server_id,
                        name: server.config.name.clone(),
                        status: "connected".to_string(),
                        tools,
                        error: None,
                    })
                }
                Ok(Err(e)) => {
                    server.status = "error".to_string();
                    Err(format!("SSE initialization failed: {e}"))
                }
                Err(_) => {
                    server.status = "error".to_string();
                    Err("SSE connection timed out (30s)".to_string())
                }
            }
        }
        McpTransport::WebSocket => {
            let url = server.config.url.as_ref()
                .ok_or("No URL specified for WebSocket transport")?;

            let mut client = hb_mcp::McpClient::new(url)
                .map_err(|e| format!("Failed to create WebSocket client: {e}"))?;

            let init_result = tokio::time::timeout(
                std::time::Duration::from_secs(30),
                client.initialize(),
            ).await;

            match init_result {
                Ok(Ok(_server_info)) => {
                    let tools = match client.list_tools().await {
                        Ok(remote_tools) => remote_tools.iter().map(|t| McpTool {
                            name: t.name.clone(),
                            description: t.description.clone(),
                            input_schema: t.input_schema.clone(),
                        }).collect(),
                        Err(e) => {
                            tracing::warn!("WebSocket tool discovery failed: {e}");
                            vec![]
                        }
                    };

                    server.async_client = Some(Arc::new(tokio::sync::Mutex::new(client)));
                    server.status = "connected".to_string();
                    server.tools = tools.clone();

                    Ok(McpServerStatus {
                        id: server_id,
                        name: server.config.name.clone(),
                        status: "connected".to_string(),
                        tools,
                        error: None,
                    })
                }
                Ok(Err(e)) => {
                    server.status = "error".to_string();
                    Err(format!("WebSocket initialization failed: {e}"))
                }
                Err(_) => {
                    server.status = "error".to_string();
                    Err("WebSocket connection timed out (30s)".to_string())
                }
            }
        }
    }
}

/// Disconnect from an MCP server
#[command]
pub async fn mcp_disconnect_server(
    state: State<'_, McpState>,
    server_id: String,
) -> Result<(), String> {
    let mut servers = state.servers.lock().await;

    if let Some(server) = servers.get_mut(&server_id) {
        if let Some(mut process) = server.process.take() {
            let _ = process.kill();
        }
        if let Some(client) = server.async_client.take() {
            let mut client = client.lock().await;
            let _ = client.shutdown().await;
        }
        server.status = "disconnected".to_string();
        server.tools.clear();
    }

    Ok(())
}

/// Get status of all MCP servers
#[command]
pub async fn mcp_list_servers(
    state: State<'_, McpState>,
) -> Result<Vec<McpServerStatus>, String> {
    let servers = state.servers.lock().await;

    Ok(servers.values()
        .map(|s| McpServerStatus {
            id: s.config.id.clone(),
            name: s.config.name.clone(),
            status: s.status.clone(),
            tools: s.tools.clone(),
            error: None,
        })
        .collect())
}

/// Get tools from a specific server
#[command]
pub async fn mcp_get_tools(
    state: State<'_, McpState>,
    server_id: String,
) -> Result<Vec<McpTool>, String> {
    let servers = state.servers.lock().await;

    let server = servers.get(&server_id)
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    Ok(server.tools.clone())
}

// ============================================================================
// Commands - Tool Execution
// ============================================================================

/// Call a tool on an MCP server
#[command]
pub async fn mcp_call_tool(
    state: State<'_, McpState>,
    request: McpToolCallRequest,
) -> Result<McpToolCallResult, String> {
    let mut servers = state.servers.lock().await;

    let server = servers.get_mut(&request.server_id)
        .ok_or_else(|| format!("Server not found: {}", request.server_id))?;

    if server.status != "connected" {
        return Err("Server not connected".to_string());
    }

    match server.config.transport {
        McpTransport::Stdio => {
            // Take process for blocking call, with timeout
            let mut process = server.process.take()
                .ok_or("No process running")?;
            let req_id = server.request_id;
            let tool_name = request.tool_name.clone();
            let arguments = request.arguments.clone();

            let call_result = tokio::time::timeout(
                std::time::Duration::from_secs(60),
                tokio::task::spawn_blocking(move || {
                    let result = call_tool_on_process(&mut process, req_id, &tool_name, &arguments);
                    (process, result)
                }),
            ).await;

            match call_result {
                Ok(Ok((process, Ok((result, new_req_id))))) => {
                    server.process = Some(process);
                    server.request_id = new_req_id;
                    Ok(result)
                }
                Ok(Ok((process, Err(e)))) => {
                    server.process = Some(process);
                    Err(e)
                }
                Ok(Err(e)) => {
                    server.status = "error".to_string();
                    Err(format!("Tool call task panicked: {e}"))
                }
                Err(_) => {
                    server.status = "error".to_string();
                    Err("Tool call timed out (60s)".to_string())
                }
            }
        }
        McpTransport::Sse | McpTransport::WebSocket => {
            let client = server.async_client.as_ref()
                .ok_or("No async client available")?
                .clone();

            // Drop lock before async call
            let tool_name = request.tool_name.clone();
            let arguments = request.arguments.clone();
            drop(servers);

            let call_result = tokio::time::timeout(
                std::time::Duration::from_secs(60),
                async {
                    let client = client.lock().await;
                    client.call_tool(&tool_name, arguments).await
                },
            ).await;

            match call_result {
                Ok(Ok(output)) => Ok(McpToolCallResult {
                    success: true,
                    output: Some(output),
                    error: None,
                }),
                Ok(Err(e)) => Ok(McpToolCallResult {
                    success: false,
                    output: None,
                    error: Some(format!("{e}")),
                }),
                Err(_) => {
                    // Re-lock to update status
                    let mut servers = state.servers.lock().await;
                    if let Some(s) = servers.get_mut(&request.server_id) {
                        s.status = "error".to_string();
                    }
                    Err("Tool call timed out (60s)".to_string())
                }
            }
        }
    }
}

// ============================================================================
// Commands - Health Check
// ============================================================================

/// Check if an MCP server is healthy
#[command]
pub async fn mcp_health_check(
    state: State<'_, McpState>,
    server_id: String,
) -> Result<bool, String> {
    let servers = state.servers.lock().await;

    if let Some(server) = servers.get(&server_id) {
        match server.config.transport {
            McpTransport::Stdio => {
                Ok(server.process.is_some() && server.status == "connected")
            }
            McpTransport::Sse | McpTransport::WebSocket => {
                Ok(server.async_client.is_some() && server.status == "connected")
            }
        }
    } else {
        Ok(false)
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Discover tools from an MCP stdio process. This is blocking I/O —
/// always call from `spawn_blocking`. Returns (tools, updated_request_id).
fn discover_tools_from_process(
    process: &mut Child,
    mut request_id: u64,
) -> Result<(Vec<McpTool>, u64), String> {
    let stdin = process.stdin.as_mut()
        .ok_or("Failed to get stdin")?;
    let stdout = process.stdout.as_mut()
        .ok_or("Failed to get stdout")?;

    // Send initialize request
    request_id += 1;
    let init_request = McpJsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: request_id,
        method: "initialize".to_string(),
        params: Some(serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": {} },
            "clientInfo": { "name": "handbox", "version": "2.0.0" }
        })),
    };

    let request_json = serde_json::to_string(&init_request)
        .map_err(|e| format!("Failed to serialize request: {e}"))?;
    writeln!(stdin, "{}", request_json)
        .map_err(|e| format!("Failed to write to stdin: {e}"))?;
    stdin.flush().map_err(|e| format!("Failed to flush stdin: {e}"))?;

    // Read initialize response
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line)
        .map_err(|e| format!("Failed to read response: {e}"))?;

    // Send initialized notification
    let notif_json = serde_json::to_string(&McpJsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: 0,
        method: "notifications/initialized".to_string(),
        params: None,
    }).map_err(|e| format!("Failed to serialize notification: {e}"))?;

    let stdin = process.stdin.as_mut().ok_or("Failed to get stdin")?;
    writeln!(stdin, "{}", notif_json)
        .map_err(|e| format!("Failed to write notification: {e}"))?;
    stdin.flush().map_err(|e| format!("Failed to flush stdin: {e}"))?;

    // Request tools list
    request_id += 1;
    let tools_json = serde_json::to_string(&McpJsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: request_id,
        method: "tools/list".to_string(),
        params: None,
    }).map_err(|e| format!("Failed to serialize tools request: {e}"))?;

    let stdin = process.stdin.as_mut().ok_or("Failed to get stdin")?;
    writeln!(stdin, "{}", tools_json)
        .map_err(|e| format!("Failed to write tools request: {e}"))?;
    stdin.flush().map_err(|e| format!("Failed to flush stdin: {e}"))?;

    // Read tools response
    let stdout = process.stdout.as_mut().ok_or("Failed to get stdout")?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line)
        .map_err(|e| format!("Failed to read tools response: {e}"))?;

    let response: McpJsonRpcResponse = serde_json::from_str(&line)
        .map_err(|e| format!("Failed to parse tools response: {e}"))?;

    let tools = if let Some(result) = response.result {
        result.get("tools")
            .and_then(|t| t.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|t| {
                        Some(McpTool {
                            name: t.get("name")?.as_str()?.to_string(),
                            description: t.get("description")
                                .and_then(|d| d.as_str())
                                .unwrap_or("")
                                .to_string(),
                            input_schema: t.get("inputSchema")
                                .cloned()
                                .unwrap_or(serde_json::json!({})),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        vec![]
    };

    Ok((tools, request_id))
}

/// Call a tool on an MCP stdio process. Blocking I/O —
/// always call from `spawn_blocking`. Returns (result, updated_request_id).
fn call_tool_on_process(
    process: &mut Child,
    mut request_id: u64,
    tool_name: &str,
    arguments: &serde_json::Value,
) -> Result<(McpToolCallResult, u64), String> {
    let stdin = process.stdin.as_mut()
        .ok_or("Failed to get stdin")?;

    request_id += 1;
    let request = McpJsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: request_id,
        method: "tools/call".to_string(),
        params: Some(serde_json::json!({
            "name": tool_name,
            "arguments": arguments
        })),
    };

    let request_json = serde_json::to_string(&request)
        .map_err(|e| format!("Failed to serialize request: {e}"))?;
    writeln!(stdin, "{}", request_json)
        .map_err(|e| format!("Failed to write request: {e}"))?;
    stdin.flush().map_err(|e| format!("Failed to flush stdin: {e}"))?;

    let stdout = process.stdout.as_mut()
        .ok_or("Failed to get stdout")?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line)
        .map_err(|e| format!("Failed to read response: {e}"))?;

    let response: McpJsonRpcResponse = serde_json::from_str(&line)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    if let Some(error) = response.error {
        return Ok((McpToolCallResult {
            success: false,
            output: None,
            error: Some(error.message),
        }, request_id));
    }

    Ok((McpToolCallResult {
        success: true,
        output: response.result,
        error: None,
    }, request_id))
}

impl PartialEq for McpTransport {
    fn eq(&self, other: &Self) -> bool {
        matches!(
            (self, other),
            (McpTransport::Stdio, McpTransport::Stdio) |
            (McpTransport::Sse, McpTransport::Sse) |
            (McpTransport::WebSocket, McpTransport::WebSocket)
        )
    }
}

// ============================================================================
// Raw API (for dispatch_tool / agent loop — no Tauri State<> parameter)
// ============================================================================

/// List all connected MCP servers and their tools (raw, no State<>).
pub async fn mcp_list_servers_raw(
    state: &McpState,
) -> Result<Vec<McpServerStatus>, String> {
    let servers = state.servers.lock().await;

    Ok(servers.values()
        .map(|s| McpServerStatus {
            id: s.config.id.clone(),
            name: s.config.name.clone(),
            status: s.status.clone(),
            tools: s.tools.clone(),
            error: None,
        })
        .collect())
}

/// Get tools from a specific MCP server (raw, no State<>).
pub async fn mcp_get_tools_raw(
    state: &McpState,
    server_id: &str,
) -> Result<Vec<McpTool>, String> {
    let servers = state.servers.lock().await;

    let server = servers.get(server_id)
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    if server.status != "connected" {
        return Err(format!("Server '{}' is not connected (status: {})", server_id, server.status));
    }

    Ok(server.tools.clone())
}

/// Call a tool on a connected MCP server (raw, no State<>).
/// Uses spawn_blocking + timeout for safe async context usage.
pub async fn mcp_call_tool_raw(
    state: &McpState,
    server_id: &str,
    tool_name: &str,
    arguments: &serde_json::Value,
) -> Result<McpToolCallResult, String> {
    let mut servers = state.servers.lock().await;

    let server = servers.get_mut(server_id)
        .ok_or_else(|| format!("Server not found: {}", server_id))?;

    if server.status != "connected" {
        return Err(format!("Server '{}' is not connected (status: {})", server_id, server.status));
    }

    match server.config.transport {
        McpTransport::Stdio => {
            let mut process = server.process.take()
                .ok_or("No process running")?;
            let req_id = server.request_id;
            let tn = tool_name.to_string();
            let args = arguments.clone();

            // Drop lock before blocking call
            let process_result = {
                drop(servers);
                tokio::time::timeout(
                    std::time::Duration::from_secs(60),
                    tokio::task::spawn_blocking(move || {
                        let result = call_tool_on_process(&mut process, req_id, &tn, &args);
                        (process, result)
                    }),
                ).await
            };

            // Re-lock to restore process
            let mut servers = state.servers.lock().await;
            let server = servers.get_mut(server_id)
                .ok_or_else(|| format!("Server lost: {}", server_id))?;

            match process_result {
                Ok(Ok((process, Ok((result, new_req_id))))) => {
                    server.process = Some(process);
                    server.request_id = new_req_id;
                    Ok(result)
                }
                Ok(Ok((process, Err(e)))) => {
                    server.process = Some(process);
                    Err(e)
                }
                Ok(Err(e)) => {
                    server.status = "error".to_string();
                    Err(format!("Tool call task panicked: {e}"))
                }
                Err(_) => {
                    server.status = "error".to_string();
                    Err("MCP tool call timed out (60s)".to_string())
                }
            }
        }
        McpTransport::Sse | McpTransport::WebSocket => {
            let client = server.async_client.as_ref()
                .ok_or("No async client available")?
                .clone();
            let tn = tool_name.to_string();
            let args = arguments.clone();
            drop(servers);

            let call_result = tokio::time::timeout(
                std::time::Duration::from_secs(60),
                async {
                    let client = client.lock().await;
                    client.call_tool(&tn, args).await
                },
            ).await;

            match call_result {
                Ok(Ok(output)) => Ok(McpToolCallResult {
                    success: true,
                    output: Some(output),
                    error: None,
                }),
                Ok(Err(e)) => Ok(McpToolCallResult {
                    success: false,
                    output: None,
                    error: Some(format!("{e}")),
                }),
                Err(_) => {
                    let mut servers = state.servers.lock().await;
                    if let Some(s) = servers.get_mut(server_id) {
                        s.status = "error".to_string();
                    }
                    Err("MCP tool call timed out (60s)".to_string())
                }
            }
        }
    }
}

/// Get all available MCP tools across all connected servers (raw, no State<>).
pub async fn mcp_get_all_tools_raw(
    state: &McpState,
) -> Result<Vec<(String, McpTool)>, String> {
    let servers = state.servers.lock().await;

    let mut all_tools = Vec::new();
    for (server_id, server) in servers.iter() {
        if server.status == "connected" {
            for tool in &server.tools {
                all_tools.push((server_id.clone(), tool.clone()));
            }
        }
    }

    Ok(all_tools)
}
