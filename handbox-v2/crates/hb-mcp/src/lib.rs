//! hb-mcp: Local MCP (Tool Plane) — server, client, registry, connectors, agent runtime.

pub mod agent_runtime;
pub mod client;
pub mod connector;
pub mod index;
pub mod registry;
pub mod server;

// Re-export commonly used types
pub use client::{McpClient, RemoteTool, ServerInfo, Transport};
pub use connector::{
    ConnectorError, ConnectorRegistry, DataConnector, DataQuery, DataResult, DataSchema,
    FileConnector, RestApiConnector,
};
pub use agent_runtime::{
    AgentConfig, AgentMode, AgentResult, AgentRuntime, AgentRuntimeError, AgentStep,
    StopReason, ToolDescriptor, ToolPolicy,
};

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
