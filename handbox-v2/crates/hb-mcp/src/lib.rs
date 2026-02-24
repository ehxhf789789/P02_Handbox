//! hb-mcp: Local MCP (Tool Plane) — server, client, registry, connectors, agent runtime.

pub mod agent_runtime;
pub mod client;
pub mod connector;
pub mod index;
pub mod registry;
pub mod server;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum McpError {
    #[error("server error: {0}")]
    Server(String),
    #[error("client error: {0}")]
    Client(String),
    #[error("tool not found: {0}")]
    ToolNotFound(String),
    #[error("registry error: {0}")]
    Registry(String),
}
