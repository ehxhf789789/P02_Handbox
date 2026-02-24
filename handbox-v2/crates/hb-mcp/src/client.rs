//! External MCP client — connects to remote MCP servers.

use crate::McpError;
use serde::{Deserialize, Serialize};

/// MCP client that connects to an external MCP server.
pub struct McpClient {
    server_url: String,
    initialized: bool,
}

impl Default for McpClient {
    fn default() -> Self {
        Self {
            server_url: String::new(),
            initialized: false,
        }
    }
}

impl McpClient {
    pub fn new(server_url: &str) -> Self {
        Self {
            server_url: server_url.into(),
            initialized: false,
        }
    }

    /// Initialize the connection to the MCP server.
    pub async fn initialize(&mut self) -> Result<ServerInfo, McpError> {
        // Phase 2: actual TCP/stdio connection
        self.initialized = true;
        Ok(ServerInfo {
            name: format!("remote({})", self.server_url),
            version: "unknown".into(),
        })
    }

    /// List tools available on the remote server.
    pub async fn list_tools(&self) -> Result<Vec<RemoteTool>, McpError> {
        if !self.initialized {
            return Err(McpError::Client("Not initialized".into()));
        }
        // Phase 2: actual JSON-RPC call
        Ok(vec![])
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
        // Phase 2: actual JSON-RPC call
        let _ = (name, arguments);
        Err(McpError::Client("Remote execution not yet implemented".into()))
    }

    pub fn is_initialized(&self) -> bool {
        self.initialized
    }

    pub fn server_url(&self) -> &str {
        &self.server_url
    }
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
