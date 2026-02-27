//! MCP Commands - Model Context Protocol server management
//!
//! Provides Tauri commands for connecting to and managing MCP servers,
//! discovering tools, and invoking tool calls.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::io::{BufRead, BufReader, Write};
use tauri::{command, State};

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
    pub process: Option<Child>,
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
    let mut servers = state.servers.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let id = config.id.clone();

    servers.insert(id.clone(), McpServerProcess {
        config,
        process: None,
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
    let mut servers = state.servers.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

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
    let mut servers = state.servers.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

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

            // Initialize and discover tools
            let tools = discover_tools_stdio(server)?;
            server.tools = tools.clone();

            Ok(McpServerStatus {
                id: server_id,
                name: server.config.name.clone(),
                status: "connected".to_string(),
                tools,
                error: None,
            })
        }
        McpTransport::Sse => {
            // SSE transport - requires HTTP client
            server.status = "connected".to_string();

            Ok(McpServerStatus {
                id: server_id,
                name: server.config.name.clone(),
                status: "connected".to_string(),
                tools: vec![],
                error: Some("SSE transport not fully implemented".to_string()),
            })
        }
        McpTransport::WebSocket => {
            // WebSocket transport - requires async WebSocket client
            server.status = "connected".to_string();

            Ok(McpServerStatus {
                id: server_id,
                name: server.config.name.clone(),
                status: "connected".to_string(),
                tools: vec![],
                error: Some("WebSocket transport not fully implemented".to_string()),
            })
        }
    }
}

/// Disconnect from an MCP server
#[command]
pub async fn mcp_disconnect_server(
    state: State<'_, McpState>,
    server_id: String,
) -> Result<(), String> {
    let mut servers = state.servers.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    if let Some(server) = servers.get_mut(&server_id) {
        if let Some(mut process) = server.process.take() {
            let _ = process.kill();
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
    let servers = state.servers.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

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
    let servers = state.servers.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

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
    let mut servers = state.servers.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let server = servers.get_mut(&request.server_id)
        .ok_or_else(|| format!("Server not found: {}", request.server_id))?;

    if server.status != "connected" {
        return Err("Server not connected".to_string());
    }

    match server.config.transport {
        McpTransport::Stdio => {
            call_tool_stdio(server, &request.tool_name, &request.arguments)
        }
        McpTransport::Sse | McpTransport::WebSocket => {
            Err("Tool calling not implemented for this transport".to_string())
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
    let servers = state.servers.lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    if let Some(server) = servers.get(&server_id) {
        // For stdio, check if process is still running
        if server.config.transport == McpTransport::Stdio {
            if server.process.is_some() {
                // Can't check without mutable reference, assume healthy if process exists
                return Ok(server.status == "connected");
            }
        }
        Ok(server.status == "connected")
    } else {
        Ok(false)
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn discover_tools_stdio(server: &mut McpServerProcess) -> Result<Vec<McpTool>, String> {
    let process = server.process.as_mut()
        .ok_or("No process running")?;

    let stdin = process.stdin.as_mut()
        .ok_or("Failed to get stdin")?;

    let stdout = process.stdout.as_mut()
        .ok_or("Failed to get stdout")?;

    // Send initialize request
    server.request_id += 1;
    let init_request = McpJsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: server.request_id,
        method: "initialize".to_string(),
        params: Some(serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {}
            },
            "clientInfo": {
                "name": "handbox",
                "version": "2.0.0"
            }
        })),
    };

    let request_json = serde_json::to_string(&init_request)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;

    writeln!(stdin, "{}", request_json)
        .map_err(|e| format!("Failed to write to stdin: {}", e))?;

    stdin.flush()
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    // Read response (with timeout simulation - just read one line)
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();

    reader.read_line(&mut line)
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Send initialized notification
    let initialized = McpJsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: 0, // notifications don't have id
        method: "notifications/initialized".to_string(),
        params: None,
    };

    let notif_json = serde_json::to_string(&initialized)
        .map_err(|e| format!("Failed to serialize notification: {}", e))?;

    // Need to re-get stdin since we moved it
    let stdin = process.stdin.as_mut()
        .ok_or("Failed to get stdin")?;

    writeln!(stdin, "{}", notif_json)
        .map_err(|e| format!("Failed to write notification: {}", e))?;

    stdin.flush()
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    // Request tools list
    server.request_id += 1;
    let tools_request = McpJsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: server.request_id,
        method: "tools/list".to_string(),
        params: None,
    };

    let tools_json = serde_json::to_string(&tools_request)
        .map_err(|e| format!("Failed to serialize tools request: {}", e))?;

    let stdin = process.stdin.as_mut()
        .ok_or("Failed to get stdin")?;

    writeln!(stdin, "{}", tools_json)
        .map_err(|e| format!("Failed to write tools request: {}", e))?;

    stdin.flush()
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    // Read tools response
    let stdout = process.stdout.as_mut()
        .ok_or("Failed to get stdout")?;

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();

    reader.read_line(&mut line)
        .map_err(|e| format!("Failed to read tools response: {}", e))?;

    let response: McpJsonRpcResponse = serde_json::from_str(&line)
        .map_err(|e| format!("Failed to parse tools response: {}", e))?;

    if let Some(result) = response.result {
        if let Some(tools_array) = result.get("tools").and_then(|t| t.as_array()) {
            let tools: Vec<McpTool> = tools_array.iter()
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
                .collect();

            return Ok(tools);
        }
    }

    Ok(vec![])
}

fn call_tool_stdio(
    server: &mut McpServerProcess,
    tool_name: &str,
    arguments: &serde_json::Value,
) -> Result<McpToolCallResult, String> {
    let process = server.process.as_mut()
        .ok_or("No process running")?;

    let stdin = process.stdin.as_mut()
        .ok_or("Failed to get stdin")?;

    // Send tool call request
    server.request_id += 1;
    let request = McpJsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: server.request_id,
        method: "tools/call".to_string(),
        params: Some(serde_json::json!({
            "name": tool_name,
            "arguments": arguments
        })),
    };

    let request_json = serde_json::to_string(&request)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;

    writeln!(stdin, "{}", request_json)
        .map_err(|e| format!("Failed to write request: {}", e))?;

    stdin.flush()
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;

    // Read response
    let stdout = process.stdout.as_mut()
        .ok_or("Failed to get stdout")?;

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();

    reader.read_line(&mut line)
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let response: McpJsonRpcResponse = serde_json::from_str(&line)
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if let Some(error) = response.error {
        return Ok(McpToolCallResult {
            success: false,
            output: None,
            error: Some(error.message),
        });
    }

    Ok(McpToolCallResult {
        success: true,
        output: response.result,
        error: None,
    })
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
