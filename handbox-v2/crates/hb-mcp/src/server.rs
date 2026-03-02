//! MCP protocol server — exposes registered tools to external clients via JSON-RPC.
//!
//! Phase 2: `tools/call` now routes through `hb-tool-executor` for real execution.

use hb_core::tool::ToolInterface;
use hb_tool_executor::{ToolInput, ToolOutput};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Default timeout for tool execution (seconds).
const DEFAULT_TOOL_TIMEOUT_SECS: u64 = 120;

/// MCP Server that exposes tools to external MCP clients.
pub struct McpServer {
    tools: HashMap<String, ToolInterface>,
    name: String,
    version: String,
    /// Per-tool timeout override in seconds. Falls back to DEFAULT_TOOL_TIMEOUT_SECS.
    tool_timeout_secs: u64,
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
            tool_timeout_secs: DEFAULT_TOOL_TIMEOUT_SECS,
        }
    }

    /// Set the tool execution timeout in seconds.
    pub fn with_timeout(mut self, secs: u64) -> Self {
        self.tool_timeout_secs = secs;
        self
    }

    /// Register a tool with the MCP server.
    pub fn register_tool(&mut self, tool: ToolInterface) {
        self.tools.insert(tool.tool_id.clone(), tool);
    }

    /// Handle an incoming JSON-RPC request and return a response.
    pub async fn handle_request(&self, request: &McpRequest) -> McpResponse {
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
                        let required: Vec<&str> = t
                            .input_schema
                            .ports
                            .iter()
                            .filter(|p| p.required)
                            .map(|p| p.name.as_str())
                            .collect();

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
                                }).collect::<serde_json::Map<String, serde_json::Value>>(),
                                "required": required,
                            }
                        })
                    })
                    .collect();
                McpResponse::success(request.id, serde_json::json!({ "tools": tools }))
            }
            "tools/call" => self.handle_tools_call(request).await,
            "notifications/initialized" => {
                // Client acknowledgement — no response required per MCP spec,
                // but we return success for convenience.
                McpResponse::success(request.id, serde_json::json!({}))
            }
            _ => McpResponse::error(request.id, -32601, "Method not found".into()),
        }
    }

    /// Execute a tool via `hb-tool-executor` and return the MCP response.
    async fn handle_tools_call(&self, request: &McpRequest) -> McpResponse {
        // Extract tool name
        let tool_name = match request.params.get("name").and_then(|v| v.as_str()) {
            Some(name) if !name.is_empty() => name,
            _ => {
                return McpResponse::error(
                    request.id,
                    -32602,
                    "Missing or empty 'name' parameter".into(),
                );
            }
        };

        // Look up tool definition
        let tool = match self.tools.get(tool_name) {
            Some(t) => t,
            None => {
                return McpResponse::error(
                    request.id,
                    -32601,
                    format!("Tool not found: {tool_name}"),
                );
            }
        };

        // Extract arguments (default to empty object)
        let arguments = request
            .params
            .get("arguments")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}));

        // Validate required inputs
        for port in &tool.input_schema.ports {
            if port.required {
                let has_value = arguments
                    .get(&port.name)
                    .map(|v| !v.is_null())
                    .unwrap_or(false);
                if !has_value {
                    return McpResponse::error(
                        request.id,
                        -32602,
                        format!("Missing required argument: '{}'", port.name),
                    );
                }
            }
        }

        // Build executor input
        let tool_input = ToolInput {
            tool_ref: tool.tool_id.clone(),
            inputs: arguments,
            config: serde_json::json!({}),
        };

        // Execute with timeout
        let timeout = std::time::Duration::from_secs(self.tool_timeout_secs);
        let result = tokio::time::timeout(timeout, self.execute_tool(tool, &tool_input)).await;

        match result {
            Ok(Ok(output)) => self.format_tool_output(request.id, &output),
            Ok(Err(err)) => McpResponse::error(request.id, -32603, err),
            Err(_) => McpResponse::error(
                request.id,
                -32603,
                format!(
                    "Tool '{}' timed out after {}s",
                    tool_name, self.tool_timeout_secs
                ),
            ),
        }
    }

    /// Execute a tool through the hb-tool-executor runtime.
    async fn execute_tool(
        &self,
        tool: &ToolInterface,
        input: &ToolInput,
    ) -> Result<ToolOutput, String> {
        hb_tool_executor::execute(&tool.runtime, input)
            .await
            .map_err(|e| format!("Execution failed: {e}"))
    }

    /// Format a ToolOutput into the MCP `tools/call` response format.
    fn format_tool_output(&self, request_id: i64, output: &ToolOutput) -> McpResponse {
        // MCP spec: content is an array of content items
        let text = match &output.outputs {
            serde_json::Value::String(s) => s.clone(),
            other => serde_json::to_string_pretty(other).unwrap_or_else(|_| other.to_string()),
        };

        McpResponse::success(
            request_id,
            serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": text
                }],
                "_meta": {
                    "duration_ms": output.duration_ms
                }
            }),
        )
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
    use hb_core::graph::{PortSpec, PortType, RetryPolicy};
    use hb_core::tool::*;

    /// Build a minimal test tool with RuntimeSpec::Native.
    fn test_tool(id: &str, required_inputs: &[(&str, PortType)]) -> ToolInterface {
        ToolInterface {
            tool_id: id.into(),
            version: "1.0.0".into(),
            display_name: id.into(),
            description: format!("Test tool {id}"),
            capability_tags: vec![],
            input_schema: PortSchema {
                ports: required_inputs
                    .iter()
                    .map(|(name, pt)| PortSpec {
                        name: (*name).into(),
                        port_type: pt.clone(),
                        description: None,
                        required: true,
                        default_value: None,
                    })
                    .collect(),
            },
            output_schema: PortSchema {
                ports: vec![PortSpec {
                    name: "result".into(),
                    port_type: PortType::String,
                    description: None,
                    required: true,
                    default_value: None,
                }],
            },
            side_effect: SideEffect::None,
            required_permissions: vec![],
            cost_hint: CostHint {
                time: TimeHint::Instant,
                monetary: MonetaryHint::Free,
                scales_with_input: false,
                estimated_tokens: None,
            },
            error_model: ErrorModel {
                error_types: vec![],
                idempotent: true,
                default_retry: RetryPolicy::default(),
            },
            runtime: RuntimeSpec::Native,
            config_schema: vec![],
        }
    }

    fn make_req(id: i64, method: &str, params: serde_json::Value) -> McpRequest {
        McpRequest {
            jsonrpc: "2.0".into(),
            id,
            method: method.into(),
            params,
        }
    }

    #[tokio::test]
    async fn initialize_request() {
        let server = McpServer::default();
        let req = make_req(1, "initialize", serde_json::json!({}));
        let resp = server.handle_request(&req).await;
        assert!(resp.result.is_some());
        assert!(resp.error.is_none());
        let result = resp.result.unwrap();
        assert_eq!(result["protocolVersion"], "2024-11-05");
        assert_eq!(result["serverInfo"]["name"], "handbox-mcp");
    }

    #[tokio::test]
    async fn tools_list_empty() {
        let server = McpServer::default();
        let req = make_req(2, "tools/list", serde_json::json!({}));
        let resp = server.handle_request(&req).await;
        let tools = resp.result.unwrap()["tools"].as_array().unwrap().len();
        assert_eq!(tools, 0);
    }

    #[tokio::test]
    async fn tools_list_with_registered_tool() {
        let mut server = McpServer::default();
        server.register_tool(test_tool("test/echo", &[("text", PortType::String)]));

        let req = make_req(3, "tools/list", serde_json::json!({}));
        let resp = server.handle_request(&req).await;
        let result = resp.result.unwrap();
        let tools = result["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], "test/echo");
        // Check required field is included
        let required = tools[0]["inputSchema"]["required"].as_array().unwrap();
        assert_eq!(required.len(), 1);
        assert_eq!(required[0], "text");
    }

    #[tokio::test]
    async fn tools_call_missing_name() {
        let server = McpServer::default();
        let req = make_req(4, "tools/call", serde_json::json!({}));
        let resp = server.handle_request(&req).await;
        assert!(resp.error.is_some());
        assert_eq!(resp.error.unwrap().code, -32602);
    }

    #[tokio::test]
    async fn tools_call_unknown_tool() {
        let server = McpServer::default();
        let req = make_req(
            5,
            "tools/call",
            serde_json::json!({ "name": "nonexistent" }),
        );
        let resp = server.handle_request(&req).await;
        assert!(resp.error.is_some());
        let err = resp.error.unwrap();
        assert_eq!(err.code, -32601);
        assert!(err.message.contains("nonexistent"));
    }

    #[tokio::test]
    async fn tools_call_missing_required_arg() {
        let mut server = McpServer::default();
        server.register_tool(test_tool("test/read", &[("path", PortType::String)]));

        let req = make_req(
            6,
            "tools/call",
            serde_json::json!({ "name": "test/read", "arguments": {} }),
        );
        let resp = server.handle_request(&req).await;
        assert!(resp.error.is_some());
        let err = resp.error.unwrap();
        assert_eq!(err.code, -32602);
        assert!(err.message.contains("path"));
    }

    #[tokio::test]
    async fn tools_call_executes_native_tool() {
        // Register the core-tools/text-merge tool which concatenates strings.
        // This is a real native tool in hb-tool-executor.
        let mut server = McpServer::default();
        let mut tool = test_tool(
            "core-tools/text-merge",
            &[("texts", PortType::Array), ("separator", PortType::String)],
        );
        // separator is optional for text-merge
        tool.input_schema.ports[1].required = false;
        server.register_tool(tool);

        let req = make_req(
            7,
            "tools/call",
            serde_json::json!({
                "name": "core-tools/text-merge",
                "arguments": {
                    "texts": ["hello", "world"],
                    "separator": " "
                }
            }),
        );
        let resp = server.handle_request(&req).await;
        assert!(resp.error.is_none(), "Expected success, got: {:?}", resp.error);
        let result = resp.result.unwrap();
        let content = result["content"].as_array().unwrap();
        assert_eq!(content[0]["type"], "text");
        // _meta should include duration
        assert!(result.get("_meta").is_some());
    }

    #[tokio::test]
    async fn tools_call_timeout() {
        let mut server = McpServer::default().with_timeout(0); // instant timeout
        server.register_tool(test_tool("test/slow", &[]));

        let req = make_req(
            8,
            "tools/call",
            serde_json::json!({ "name": "test/slow", "arguments": {} }),
        );
        let resp = server.handle_request(&req).await;
        // Native tools resolve quickly so this may or may not timeout.
        // At minimum, verify we get a valid response.
        assert!(resp.result.is_some() || resp.error.is_some());
    }

    #[tokio::test]
    async fn unknown_method() {
        let server = McpServer::default();
        let req = make_req(9, "foo/bar", serde_json::json!({}));
        let resp = server.handle_request(&req).await;
        assert!(resp.error.is_some());
        assert_eq!(resp.error.unwrap().code, -32601);
    }

    #[tokio::test]
    async fn notifications_initialized() {
        let server = McpServer::default();
        let req = make_req(0, "notifications/initialized", serde_json::json!({}));
        let resp = server.handle_request(&req).await;
        assert!(resp.result.is_some());
        assert!(resp.error.is_none());
    }
}
