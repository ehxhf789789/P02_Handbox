//! Agent Runtime — manages agent lifecycle, tool access policies, and sub-agent limits.
//!
//! An agent is a special entity that can autonomously call other tools in a loop,
//! make decisions, and produce structured results. The runtime enforces policies
//! such as which tools an agent may use, iteration limits, and sub-agent depth.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;

// ============================================================================
// Types
// ============================================================================

/// Agent execution mode.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentMode {
    /// Fully autonomous — agent decides when to stop.
    Auto,
    /// Planning only — agent produces a plan but doesn't execute.
    Plan,
    /// Execute only — agent follows a pre-defined plan.
    Execute,
}

impl Default for AgentMode {
    fn default() -> Self {
        Self::Auto
    }
}

/// Configuration for an agent instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    /// Unique agent ID.
    pub agent_id: String,
    /// Human-readable name.
    pub name: String,
    /// Execution mode.
    #[serde(default)]
    pub mode: AgentMode,
    /// Maximum iterations before forced stop.
    #[serde(default = "default_max_iterations")]
    pub max_iterations: usize,
    /// Maximum sub-agent nesting depth.
    #[serde(default = "default_max_depth")]
    pub max_depth: usize,
    /// Tool access policy.
    #[serde(default)]
    pub tool_policy: ToolPolicy,
    /// Optional system prompt override.
    pub system_prompt: Option<String>,
    /// Optional model ID override.
    pub model_id: Option<String>,
}

fn default_max_iterations() -> usize {
    20
}
fn default_max_depth() -> usize {
    3
}

/// Policy governing which tools an agent may call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPolicy {
    /// Allowlist mode: if non-empty, only these tools are allowed.
    #[serde(default)]
    pub allowed: HashSet<String>,
    /// Denylist: these tools are always blocked (takes precedence over allowed).
    #[serde(default)]
    pub denied: HashSet<String>,
}

impl Default for ToolPolicy {
    fn default() -> Self {
        Self {
            allowed: HashSet::new(),
            denied: HashSet::new(),
        }
    }
}

impl ToolPolicy {
    /// Check if a tool is permitted under this policy.
    pub fn is_allowed(&self, tool_ref: &str) -> bool {
        // Deny list always takes precedence
        if self.denied.contains(tool_ref) {
            return false;
        }
        // If allow list is empty, everything (not denied) is allowed
        if self.allowed.is_empty() {
            return true;
        }
        // Otherwise must be in allow list
        self.allowed.contains(tool_ref)
    }
}

/// Descriptor for a tool available to agents.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDescriptor {
    pub tool_ref: String,
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

/// A single step in an agent execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStep {
    pub iteration: usize,
    pub action: String,
    pub tool_ref: Option<String>,
    pub input: Option<serde_json::Value>,
    pub output: Option<serde_json::Value>,
    pub duration_ms: u64,
}

/// Final result of an agent execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResult {
    pub agent_id: String,
    pub final_answer: Option<String>,
    pub steps: Vec<AgentStep>,
    pub total_iterations: usize,
    pub total_duration_ms: u64,
    pub stopped_reason: StopReason,
}

/// Why the agent stopped.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    /// Agent decided it was done.
    Completed,
    /// Hit max iteration limit.
    MaxIterations,
    /// Cancelled by user/system.
    Cancelled,
    /// An unrecoverable error occurred.
    Error,
}

// ============================================================================
// Agent Runtime
// ============================================================================

/// Manages active agents, enforces policies, and tracks lifecycle.
pub struct AgentRuntime {
    /// Active agent configs by agent_id.
    agents: Arc<RwLock<HashMap<String, AgentConfig>>>,
    /// Available tools that agents can call.
    available_tools: Arc<RwLock<Vec<ToolDescriptor>>>,
    /// Current nesting depth per agent chain.
    depth_tracker: Arc<RwLock<HashMap<String, usize>>>,
}

impl Default for AgentRuntime {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentRuntime {
    pub fn new() -> Self {
        Self {
            agents: Arc::new(RwLock::new(HashMap::new())),
            available_tools: Arc::new(RwLock::new(Vec::new())),
            depth_tracker: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register available tools that agents can call.
    pub async fn register_tools(&self, tools: Vec<ToolDescriptor>) {
        let mut available = self.available_tools.write().await;
        *available = tools;
    }

    /// Add a tool to the available set.
    pub async fn add_tool(&self, tool: ToolDescriptor) {
        let mut available = self.available_tools.write().await;
        available.push(tool);
    }

    /// Get all available tools.
    pub async fn list_tools(&self) -> Vec<ToolDescriptor> {
        self.available_tools.read().await.clone()
    }

    /// Register an agent config. Returns error if depth limit exceeded.
    pub async fn register_agent(
        &self,
        config: AgentConfig,
        parent_agent_id: Option<&str>,
    ) -> Result<(), AgentRuntimeError> {
        // Check depth limit
        if let Some(parent_id) = parent_agent_id {
            let depths = self.depth_tracker.read().await;
            let parent_depth = depths.get(parent_id).copied().unwrap_or(0);
            if parent_depth + 1 > config.max_depth {
                return Err(AgentRuntimeError::DepthLimitExceeded {
                    agent_id: config.agent_id.clone(),
                    max_depth: config.max_depth,
                    current_depth: parent_depth + 1,
                });
            }
            drop(depths);

            let mut depths = self.depth_tracker.write().await;
            depths.insert(config.agent_id.clone(), parent_depth + 1);
        } else {
            let mut depths = self.depth_tracker.write().await;
            depths.insert(config.agent_id.clone(), 0);
        }

        let mut agents = self.agents.write().await;
        agents.insert(config.agent_id.clone(), config);
        Ok(())
    }

    /// Unregister an agent (cleanup after completion).
    pub async fn unregister_agent(&self, agent_id: &str) {
        let mut agents = self.agents.write().await;
        agents.remove(agent_id);
        let mut depths = self.depth_tracker.write().await;
        depths.remove(agent_id);
    }

    /// Get agent config by ID.
    pub async fn get_agent(&self, agent_id: &str) -> Option<AgentConfig> {
        let agents = self.agents.read().await;
        agents.get(agent_id).cloned()
    }

    /// List all active agents.
    pub async fn list_agents(&self) -> Vec<AgentConfig> {
        let agents = self.agents.read().await;
        agents.values().cloned().collect()
    }

    /// Get tools allowed for a specific agent, filtered by its policy.
    pub async fn get_allowed_tools(&self, agent_id: &str) -> Result<Vec<ToolDescriptor>, AgentRuntimeError> {
        let agents = self.agents.read().await;
        let config = agents.get(agent_id).ok_or_else(|| AgentRuntimeError::AgentNotFound {
            agent_id: agent_id.to_string(),
        })?;
        let policy = &config.tool_policy;

        let available = self.available_tools.read().await;
        let filtered: Vec<ToolDescriptor> = available
            .iter()
            .filter(|t| policy.is_allowed(&t.tool_ref))
            .cloned()
            .collect();
        Ok(filtered)
    }

    /// Check if an agent is allowed to call a specific tool.
    pub async fn check_tool_access(
        &self,
        agent_id: &str,
        tool_ref: &str,
    ) -> Result<bool, AgentRuntimeError> {
        let agents = self.agents.read().await;
        let config = agents.get(agent_id).ok_or_else(|| AgentRuntimeError::AgentNotFound {
            agent_id: agent_id.to_string(),
        })?;
        Ok(config.tool_policy.is_allowed(tool_ref))
    }

    /// Get current nesting depth for an agent.
    pub async fn get_depth(&self, agent_id: &str) -> usize {
        let depths = self.depth_tracker.read().await;
        depths.get(agent_id).copied().unwrap_or(0)
    }
}

// ============================================================================
// Errors
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentRuntimeError {
    AgentNotFound { agent_id: String },
    DepthLimitExceeded { agent_id: String, max_depth: usize, current_depth: usize },
    ToolDenied { agent_id: String, tool_ref: String },
    IterationLimit { agent_id: String, max_iterations: usize },
}

impl std::fmt::Display for AgentRuntimeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AgentNotFound { agent_id } => write!(f, "Agent not found: {agent_id}"),
            Self::DepthLimitExceeded {
                agent_id,
                max_depth,
                current_depth,
            } => write!(
                f,
                "Agent {agent_id} depth limit exceeded: {current_depth} > {max_depth}"
            ),
            Self::ToolDenied { agent_id, tool_ref } => {
                write!(f, "Agent {agent_id} denied access to tool: {tool_ref}")
            }
            Self::IterationLimit {
                agent_id,
                max_iterations,
            } => write!(
                f,
                "Agent {agent_id} hit iteration limit: {max_iterations}"
            ),
        }
    }
}

impl std::error::Error for AgentRuntimeError {}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_config(id: &str) -> AgentConfig {
        AgentConfig {
            agent_id: id.to_string(),
            name: format!("Agent {id}"),
            mode: AgentMode::Auto,
            max_iterations: 10,
            max_depth: 3,
            tool_policy: ToolPolicy::default(),
            system_prompt: None,
            model_id: None,
        }
    }

    fn sample_tool(ref_name: &str) -> ToolDescriptor {
        ToolDescriptor {
            tool_ref: ref_name.to_string(),
            name: ref_name.to_string(),
            description: format!("Tool {ref_name}"),
            parameters: serde_json::json!({}),
        }
    }

    #[test]
    fn tool_policy_default_allows_all() {
        let policy = ToolPolicy::default();
        assert!(policy.is_allowed("any-tool"));
        assert!(policy.is_allowed("file-read"));
    }

    #[test]
    fn tool_policy_allowlist() {
        let mut policy = ToolPolicy::default();
        policy.allowed.insert("file-read".to_string());
        policy.allowed.insert("file-write".to_string());
        assert!(policy.is_allowed("file-read"));
        assert!(policy.is_allowed("file-write"));
        assert!(!policy.is_allowed("shell-exec"));
    }

    #[test]
    fn tool_policy_denylist_overrides_allowlist() {
        let mut policy = ToolPolicy::default();
        policy.allowed.insert("shell-exec".to_string());
        policy.denied.insert("shell-exec".to_string());
        // Deny takes precedence
        assert!(!policy.is_allowed("shell-exec"));
    }

    #[tokio::test]
    async fn register_and_list_agents() {
        let rt = AgentRuntime::new();
        let cfg = sample_config("a1");
        rt.register_agent(cfg.clone(), None).await.unwrap();
        let agents = rt.list_agents().await;
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].agent_id, "a1");
    }

    #[tokio::test]
    async fn unregister_agent_removes_it() {
        let rt = AgentRuntime::new();
        rt.register_agent(sample_config("a1"), None).await.unwrap();
        rt.unregister_agent("a1").await;
        assert!(rt.get_agent("a1").await.is_none());
        assert_eq!(rt.get_depth("a1").await, 0);
    }

    #[tokio::test]
    async fn depth_limit_enforced() {
        let rt = AgentRuntime::new();
        let mut cfg = sample_config("root");
        cfg.max_depth = 2;
        rt.register_agent(cfg, None).await.unwrap();

        let mut child = sample_config("child");
        child.max_depth = 2;
        rt.register_agent(child, Some("root")).await.unwrap();
        assert_eq!(rt.get_depth("child").await, 1);

        let mut grandchild = sample_config("grandchild");
        grandchild.max_depth = 2;
        rt.register_agent(grandchild, Some("child")).await.unwrap();
        assert_eq!(rt.get_depth("grandchild").await, 2);

        // One more should fail
        let mut too_deep = sample_config("too-deep");
        too_deep.max_depth = 2;
        let result = rt.register_agent(too_deep, Some("grandchild")).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn get_allowed_tools_filters_by_policy() {
        let rt = AgentRuntime::new();
        rt.register_tools(vec![
            sample_tool("file-read"),
            sample_tool("file-write"),
            sample_tool("shell-exec"),
        ])
        .await;

        let mut cfg = sample_config("a1");
        cfg.tool_policy.denied.insert("shell-exec".to_string());
        rt.register_agent(cfg, None).await.unwrap();

        let tools = rt.get_allowed_tools("a1").await.unwrap();
        let refs: Vec<&str> = tools.iter().map(|t| t.tool_ref.as_str()).collect();
        assert!(refs.contains(&"file-read"));
        assert!(refs.contains(&"file-write"));
        assert!(!refs.contains(&"shell-exec"));
    }

    #[tokio::test]
    async fn check_tool_access_unknown_agent() {
        let rt = AgentRuntime::new();
        let result = rt.check_tool_access("nonexistent", "file-read").await;
        assert!(result.is_err());
    }
}
