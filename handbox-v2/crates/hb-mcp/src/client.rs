//! External MCP client — connects to remote MCP servers via stdio, SSE, or WebSocket.

use crate::McpError;
use reqwest::Client as HttpClient;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

/// Transport type for MCP connection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Transport {
    /// stdio transport — spawn a local process and communicate via stdin/stdout.
    Stdio { command: String, args: Vec<String> },
    /// SSE transport — HTTP Server-Sent Events (not yet implemented).
    Sse { url: String },
    /// WebSocket transport (not yet implemented).
    WebSocket { url: String },
}

impl Transport {
    /// Parse a URL-like string into a Transport.
    /// Examples:
    /// - "stdio:///path/to/server" or "stdio://npx -y @modelcontextprotocol/server-filesystem"
    /// - "http://localhost:3000/mcp" (SSE)
    /// - "ws://localhost:3000/mcp" (WebSocket)
    pub fn parse(url: &str) -> Result<Self, McpError> {
        if url.starts_with("stdio://") {
            let command_str = url.strip_prefix("stdio://").unwrap_or("");
            let parts: Vec<&str> = command_str.split_whitespace().collect();
            if parts.is_empty() {
                return Err(McpError::Client("Empty stdio command".into()));
            }
            Ok(Transport::Stdio {
                command: parts[0].to_string(),
                args: parts[1..].iter().map(|s| s.to_string()).collect(),
            })
        } else if url.starts_with("http://") || url.starts_with("https://") {
            Ok(Transport::Sse { url: url.to_string() })
        } else if url.starts_with("ws://") || url.starts_with("wss://") {
            Ok(Transport::WebSocket { url: url.to_string() })
        } else {
            Err(McpError::Client(format!("Unknown transport: {url}")))
        }
    }
}

/// MCP client that connects to an external MCP server.
pub struct McpClient {
    transport: Transport,
    initialized: bool,
    request_id: AtomicI64,
    // For stdio transport
    child_process: Option<Arc<Mutex<StdioProcess>>>,
    // For SSE transport
    sse_client: Option<Arc<SseClient>>,
}

struct StdioProcess {
    child: Child,
    stdin: tokio::process::ChildStdin,
    stdout_reader: BufReader<tokio::process::ChildStdout>,
}

/// SSE client for HTTP-based MCP communication.
struct SseClient {
    http_client: HttpClient,
    base_url: String,
    session_id: Mutex<Option<String>>,
}

impl Default for McpClient {
    fn default() -> Self {
        Self {
            transport: Transport::Stdio {
                command: String::new(),
                args: vec![],
            },
            initialized: false,
            request_id: AtomicI64::new(1),
            child_process: None,
            sse_client: None,
        }
    }
}

impl McpClient {
    pub fn new(server_url: &str) -> Result<Self, McpError> {
        let transport = Transport::parse(server_url)?;
        Ok(Self {
            transport,
            initialized: false,
            request_id: AtomicI64::new(1),
            child_process: None,
            sse_client: None,
        })
    }

    /// Create a client with an explicit transport.
    pub fn with_transport(transport: Transport) -> Self {
        Self {
            transport,
            initialized: false,
            request_id: AtomicI64::new(1),
            child_process: None,
            sse_client: None,
        }
    }

    fn next_id(&self) -> i64 {
        self.request_id.fetch_add(1, Ordering::SeqCst)
    }

    /// Initialize the connection to the MCP server.
    pub async fn initialize(&mut self) -> Result<ServerInfo, McpError> {
        // Clone transport to avoid borrow checker issues
        let transport = self.transport.clone();
        match transport {
            Transport::Stdio { command, args } => {
                self.initialize_stdio(&command, &args).await
            }
            Transport::Sse { url } => {
                self.initialize_sse(&url).await
            }
            Transport::WebSocket { url } => {
                // WebSocket not yet implemented
                tracing::warn!("WebSocket transport not yet implemented: {url}");
                self.initialized = true;
                Ok(ServerInfo {
                    name: format!("ws({})", url),
                    version: "unknown".into(),
                })
            }
        }
    }

    async fn initialize_stdio(&mut self, command: &str, args: &[String]) -> Result<ServerInfo, McpError> {
        // Spawn the MCP server process
        let mut child = Command::new(command)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| McpError::Client(format!("Failed to spawn MCP server: {e}")))?;

        let stdin = child.stdin.take()
            .ok_or_else(|| McpError::Client("Failed to get stdin".into()))?;
        let stdout = child.stdout.take()
            .ok_or_else(|| McpError::Client("Failed to get stdout".into()))?;

        let process = StdioProcess {
            child,
            stdin,
            stdout_reader: BufReader::new(stdout),
        };

        self.child_process = Some(Arc::new(Mutex::new(process)));

        // Send initialize request
        let request = JsonRpcRequest {
            jsonrpc: "2.0".into(),
            id: self.next_id(),
            method: "initialize".into(),
            params: serde_json::json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "handbox",
                    "version": "0.1.0"
                }
            }),
        };

        let response = self.send_request(&request).await?;

        let name = response
            .get("serverInfo")
            .and_then(|s| s.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("unknown")
            .to_string();
        let version = response
            .get("serverInfo")
            .and_then(|s| s.get("version"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        // Send initialized notification
        let notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        self.send_notification(&notification).await?;

        self.initialized = true;
        Ok(ServerInfo { name, version })
    }

    /// Initialize SSE transport.
    async fn initialize_sse(&mut self, url: &str) -> Result<ServerInfo, McpError> {
        let http_client = HttpClient::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| McpError::Client(format!("Failed to create HTTP client: {e}")))?;

        let sse_client = SseClient {
            http_client,
            base_url: url.to_string(),
            session_id: Mutex::new(None),
        };

        self.sse_client = Some(Arc::new(sse_client));

        // Send initialize request via SSE
        let request = JsonRpcRequest {
            jsonrpc: "2.0".into(),
            id: self.next_id(),
            method: "initialize".into(),
            params: serde_json::json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "handbox",
                    "version": "0.1.0"
                }
            }),
        };

        let response = self.send_request_sse(&request).await?;

        let name = response
            .get("serverInfo")
            .and_then(|s| s.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("unknown")
            .to_string();
        let version = response
            .get("serverInfo")
            .and_then(|s| s.get("version"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        // Store session ID if provided
        if let Some(session_id) = response.get("sessionId").and_then(|s| s.as_str()) {
            if let Some(ref sse) = self.sse_client {
                *sse.session_id.lock().await = Some(session_id.to_string());
            }
        }

        // Send initialized notification
        let notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        self.send_notification_sse(&notification).await?;

        self.initialized = true;
        Ok(ServerInfo { name, version })
    }

    async fn send_request(&self, request: &JsonRpcRequest) -> Result<serde_json::Value, McpError> {
        // Route to appropriate transport
        if self.sse_client.is_some() {
            return self.send_request_sse(request).await;
        }

        let process = self.child_process.as_ref()
            .ok_or_else(|| McpError::Client("No stdio process".into()))?;

        let mut process = process.lock().await;

        // Write request as JSON line
        let request_json = serde_json::to_string(request)
            .map_err(|e| McpError::Client(format!("JSON serialization error: {e}")))?;

        process.stdin.write_all(request_json.as_bytes()).await
            .map_err(|e| McpError::Client(format!("Failed to write to stdin: {e}")))?;
        process.stdin.write_all(b"\n").await
            .map_err(|e| McpError::Client(format!("Failed to write newline: {e}")))?;
        process.stdin.flush().await
            .map_err(|e| McpError::Client(format!("Failed to flush stdin: {e}")))?;

        // Read response
        let mut line = String::new();
        process.stdout_reader.read_line(&mut line).await
            .map_err(|e| McpError::Client(format!("Failed to read from stdout: {e}")))?;

        let response: JsonRpcResponse = serde_json::from_str(&line)
            .map_err(|e| McpError::Client(format!("Invalid JSON-RPC response: {e}")))?;

        if let Some(error) = response.error {
            return Err(McpError::Client(format!("JSON-RPC error {}: {}", error.code, error.message)));
        }

        response.result.ok_or_else(|| McpError::Client("No result in response".into()))
    }

    async fn send_notification(&self, notification: &serde_json::Value) -> Result<(), McpError> {
        // Route to appropriate transport
        if self.sse_client.is_some() {
            return self.send_notification_sse(notification).await;
        }

        let process = self.child_process.as_ref()
            .ok_or_else(|| McpError::Client("No stdio process".into()))?;

        let mut process = process.lock().await;

        let json = serde_json::to_string(notification)
            .map_err(|e| McpError::Client(format!("JSON serialization error: {e}")))?;

        process.stdin.write_all(json.as_bytes()).await
            .map_err(|e| McpError::Client(format!("Failed to write notification: {e}")))?;
        process.stdin.write_all(b"\n").await
            .map_err(|e| McpError::Client(format!("Failed to write newline: {e}")))?;
        process.stdin.flush().await
            .map_err(|e| McpError::Client(format!("Failed to flush: {e}")))?;

        Ok(())
    }

    /// Send a JSON-RPC request via SSE transport.
    async fn send_request_sse(&self, request: &JsonRpcRequest) -> Result<serde_json::Value, McpError> {
        let sse = self.sse_client.as_ref()
            .ok_or_else(|| McpError::Client("No SSE client".into()))?;

        let request_json = serde_json::to_string(request)
            .map_err(|e| McpError::Client(format!("JSON serialization error: {e}")))?;

        // Build request with optional session ID
        let mut req_builder = sse.http_client
            .post(&sse.base_url)
            .header("Content-Type", "application/json")
            .header("Accept", "text/event-stream");

        if let Some(session_id) = sse.session_id.lock().await.as_ref() {
            req_builder = req_builder.header("X-Session-Id", session_id);
        }

        let response = req_builder
            .body(request_json)
            .send()
            .await
            .map_err(|e| McpError::Client(format!("SSE request failed: {e}")))?;

        if !response.status().is_success() {
            return Err(McpError::Client(format!(
                "SSE request failed with status: {}",
                response.status()
            )));
        }

        // Parse SSE response - look for JSON-RPC result
        let body = response.text().await
            .map_err(|e| McpError::Client(format!("Failed to read SSE response: {e}")))?;

        // SSE format: "data: {...}\n\n"
        // Parse the event stream and extract the JSON-RPC response
        for line in body.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(json_rpc) = serde_json::from_str::<JsonRpcResponse>(data) {
                    if let Some(error) = json_rpc.error {
                        return Err(McpError::Client(format!(
                            "JSON-RPC error {}: {}",
                            error.code, error.message
                        )));
                    }
                    if let Some(result) = json_rpc.result {
                        return Ok(result);
                    }
                }
            }
        }

        // Fallback: try parsing the entire body as JSON
        let json_rpc: JsonRpcResponse = serde_json::from_str(&body)
            .map_err(|e| McpError::Client(format!("Invalid SSE response JSON: {e}")))?;

        if let Some(error) = json_rpc.error {
            return Err(McpError::Client(format!(
                "JSON-RPC error {}: {}",
                error.code, error.message
            )));
        }

        json_rpc.result.ok_or_else(|| McpError::Client("No result in SSE response".into()))
    }

    /// Send a JSON-RPC notification via SSE transport.
    async fn send_notification_sse(&self, notification: &serde_json::Value) -> Result<(), McpError> {
        let sse = self.sse_client.as_ref()
            .ok_or_else(|| McpError::Client("No SSE client".into()))?;

        let json = serde_json::to_string(notification)
            .map_err(|e| McpError::Client(format!("JSON serialization error: {e}")))?;

        let mut req_builder = sse.http_client
            .post(&sse.base_url)
            .header("Content-Type", "application/json");

        if let Some(session_id) = sse.session_id.lock().await.as_ref() {
            req_builder = req_builder.header("X-Session-Id", session_id);
        }

        let response = req_builder
            .body(json)
            .send()
            .await
            .map_err(|e| McpError::Client(format!("SSE notification failed: {e}")))?;

        if !response.status().is_success() {
            return Err(McpError::Client(format!(
                "SSE notification failed with status: {}",
                response.status()
            )));
        }

        Ok(())
    }

    /// List tools available on the remote server.
    pub async fn list_tools(&self) -> Result<Vec<RemoteTool>, McpError> {
        if !self.initialized {
            return Err(McpError::Client("Not initialized".into()));
        }

        let request = JsonRpcRequest {
            jsonrpc: "2.0".into(),
            id: self.next_id(),
            method: "tools/list".into(),
            params: serde_json::json!({}),
        };

        let response = self.send_request(&request).await?;

        let tools_json = response.get("tools")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default();

        let tools: Vec<RemoteTool> = tools_json
            .into_iter()
            .filter_map(|t| {
                Some(RemoteTool {
                    name: t.get("name")?.as_str()?.to_string(),
                    description: t.get("description")
                        .and_then(|d| d.as_str())
                        .unwrap_or("")
                        .to_string(),
                    input_schema: t.get("inputSchema").cloned().unwrap_or(serde_json::json!({})),
                })
            })
            .collect();

        Ok(tools)
    }

    /// Call a tool on the remote server.
    pub async fn call_tool(
        &self,
        name: &str,
        arguments: serde_json::Value,
    ) -> Result<serde_json::Value, McpError> {
        if !self.initialized {
            return Err(McpError::Client("Not initialized".into()));
        }

        let request = JsonRpcRequest {
            jsonrpc: "2.0".into(),
            id: self.next_id(),
            method: "tools/call".into(),
            params: serde_json::json!({
                "name": name,
                "arguments": arguments
            }),
        };

        let response = self.send_request(&request).await?;

        // MCP tools/call returns { content: [...] }
        // Extract the text content if present
        if let Some(content) = response.get("content").and_then(|c| c.as_array()) {
            for item in content {
                if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                    if let Some(text) = item.get("text") {
                        return Ok(text.clone());
                    }
                }
            }
        }

        Ok(response)
    }

    pub fn is_initialized(&self) -> bool {
        self.initialized
    }

    /// Shutdown the MCP connection gracefully.
    pub async fn shutdown(&mut self) -> Result<(), McpError> {
        if let Some(process) = self.child_process.take() {
            let mut process = process.lock().await;
            // Kill the child process
            let _ = process.child.kill().await;
        }
        self.initialized = false;
        Ok(())
    }
}

impl Drop for McpClient {
    fn drop(&mut self) {
        // Note: async cleanup not possible in Drop, so process may be orphaned
        // Users should call shutdown() explicitly for graceful cleanup
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: i64,
    method: String,
    params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: i64,
    #[serde(default)]
    result: Option<serde_json::Value>,
    #[serde(default)]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteTool {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_stdio_transport() {
        let transport = Transport::parse("stdio://npx -y @modelcontextprotocol/server-filesystem /tmp").unwrap();
        match transport {
            Transport::Stdio { command, args } => {
                assert_eq!(command, "npx");
                assert_eq!(args, vec!["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]);
            }
            _ => panic!("Expected Stdio transport"),
        }
    }

    #[test]
    fn parse_sse_transport() {
        let transport = Transport::parse("http://localhost:3000/mcp").unwrap();
        match transport {
            Transport::Sse { url } => {
                assert_eq!(url, "http://localhost:3000/mcp");
            }
            _ => panic!("Expected SSE transport"),
        }
    }

    #[test]
    fn parse_ws_transport() {
        let transport = Transport::parse("ws://localhost:3000/mcp").unwrap();
        match transport {
            Transport::WebSocket { url } => {
                assert_eq!(url, "ws://localhost:3000/mcp");
            }
            _ => panic!("Expected WebSocket transport"),
        }
    }
}
