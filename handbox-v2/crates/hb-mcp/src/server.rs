//! MCP protocol server — exposes registered tools to external clients via JSON-RPC.

use hb_core::tool::ToolInterface;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// MCP Server that exposes tools to external MCP clients.
pub struct McpServer {
    tools: HashMap<String, ToolInterface>,
    name: String,
    version: String,
}

impl Default for McpServer {
    fn default() -> Self {
        Self::new("handbox-mcp", "0.1.0")
    }
}

impl McpServer {
    pub fn new(name: &str, version: &str) -> Self {
        Self {
            tools: HashMap::new(),
            name: name.into(),
            version: version.into(),
        }
    }

    /// Register a tool with the MCP server.
    pub fn register_tool(&mut self, tool: ToolInterface) {
        self.tools.insert(tool.tool_id.clone(), tool);
    }

    /// Handle an incoming JSON-RPC request and return a response.
    pub fn handle_request(&self, request: &McpRequest) -> McpResponse {
        match request.method.as_str() {
            "initialize" => {
                let result = serde_json::json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": { "listChanged": false }
                    },
                    "serverInfo": {
                        "name": self.name,
                        "version": self.version,
                    }
                });
                McpResponse::success(request.id, result)
            }
            "tools/list" => {
                let tools: Vec<serde_json::Value> = self
                    .tools
                    .values()
                    .map(|t| {
                        serde_json::json!({
                            "name": t.tool_id,
                            "description": t.description,
                            "inputSchema": {
                                "type": "object",
                                "properties": t.input_schema.ports.iter().map(|p| {
                                    (p.name.clone(), serde_json::json!({
                                        "type": format!("{:?}", p.port_type).to_lowercase(),
                                        "description": p.description.as_deref().unwrap_or("")
                                    }))
                                }).collect::<serde_json::Map<String, serde_json::Value>>()
                            }
                        })
                    })
                    .collect();
                McpResponse::success(request.id, serde_json::json!({ "tools": tools }))
            }
            "tools/call" => {
                let tool_name = request
                    .params
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if self.tools.contains_key(tool_name) {
                    // Phase 2: actually execute the tool
                    McpResponse::success(
                        request.id,
                        serde_json::json!({
                            "content": [{
                                "type": "text",
                                "text": format!("Tool {tool_name} executed (stub)")
                            }]
                        }),
                    )
                } else {
                    McpResponse::error(
                        request.id,
                        -32601,
                        format!("Tool not found: {tool_name}"),
                    )
                }
            }
            _ => McpResponse::error(request.id, -32601, "Method not found".into()),
        }
    }

    /// Number of registered tools.
    pub fn tool_count(&self) -> usize {
        self.tools.len()
    }
}

/// MCP JSON-RPC request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpRequest {
    pub jsonrpc: String,
    pub id: i64,
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

/// MCP JSON-RPC response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResponse {
    pub jsonrpc: String,
    pub id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<McpError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpError {
    pub code: i64,
    pub message: String,
}

impl McpResponse {
    pub fn success(id: i64, result: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            id,
            result: Some(result),
            error: None,
        }
    }

    pub fn error(id: i64, code: i64, message: String) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            id,
            result: None,
            error: Some(McpError { code, message }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_request() {
        let server = McpServer::default();
        let req = McpRequest {
            jsonrpc: "2.0".into(),
            id: 1,
            method: "initialize".into(),
            params: serde_json::json!({}),
        };
        let resp = server.handle_request(&req);
        assert!(resp.result.is_some());
        assert!(resp.error.is_none());
    }

    #[test]
    fn tools_list_empty() {
        let server = McpServer::default();
        let req = McpRequest {
            jsonrpc: "2.0".into(),
            id: 2,
            method: "tools/list".into(),
            params: serde_json::json!({}),
        };
        let resp = server.handle_request(&req);
        let tools = resp.result.unwrap()["tools"].as_array().unwrap().len();
        assert_eq!(tools, 0);
    }
}
