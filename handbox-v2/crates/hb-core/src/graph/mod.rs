//! Graph DSL v0.1 — ReactFlow-independent executable workflow specification.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// WorkflowSpec — top-level graph
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowSpec {
    /// Schema version (always "0.1.0" for this release).
    pub version: String,

    /// Unique workflow identifier.
    #[serde(default = "Uuid::new_v4")]
    pub id: Uuid,

    /// Human-readable metadata.
    pub meta: WorkflowMeta,

    /// Runtime-injectable variables.
    #[serde(default)]
    pub variables: Vec<VariableSpec>,

    /// Nodes in the graph (polymorphic).
    pub nodes: Vec<NodeEntry>,

    /// Edges connecting ports between nodes.
    pub edges: Vec<EdgeSpec>,

    /// Packs required by this workflow.
    #[serde(default)]
    pub required_packs: Vec<PackDependency>,
}

impl Default for WorkflowSpec {
    fn default() -> Self {
        Self {
            version: "0.1.0".into(),
            id: Uuid::new_v4(),
            meta: WorkflowMeta::default(),
            variables: Vec::new(),
            nodes: Vec::new(),
            edges: Vec::new(),
            required_packs: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowMeta {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "Utc::now")]
    pub created_at: DateTime<Utc>,
    #[serde(default = "Utc::now")]
    pub updated_at: DateTime<Utc>,
}

impl Default for WorkflowMeta {
    fn default() -> Self {
        Self {
            name: String::new(),
            description: String::new(),
            author: None,
            tags: Vec::new(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
}

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableSpec {
    pub name: String,
    pub description: Option<String>,
    pub var_type: PortType,
    pub default_value: Option<serde_json::Value>,
    pub required: bool,
}

// ---------------------------------------------------------------------------
// Node entries — polymorphic via enum
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum NodeEntry {
    #[serde(rename = "primitive")]
    Primitive(NodeSpec),
    #[serde(rename = "composite")]
    Composite(CompositeNodeSpec),
    #[serde(rename = "conditional")]
    Conditional(ConditionalSpec),
    #[serde(rename = "loop")]
    Loop(LoopSpec),
}

impl NodeEntry {
    pub fn id(&self) -> &str {
        match self {
            NodeEntry::Primitive(n) => &n.id,
            NodeEntry::Composite(n) => &n.id,
            NodeEntry::Conditional(n) => &n.id,
            NodeEntry::Loop(n) => &n.id,
        }
    }
}

// ---------------------------------------------------------------------------
// Primitive Node
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSpec {
    pub id: String,

    /// Tool reference: "pack_id/tool_id@version"
    pub tool_ref: String,

    /// Configuration values passed to the tool.
    #[serde(default)]
    pub config: serde_json::Map<String, serde_json::Value>,

    /// UI-only position hint.
    #[serde(default)]
    pub position: Option<Position>,

    /// Display label (falls back to tool display_name).
    #[serde(default)]
    pub label: Option<String>,

    /// If true, this node is skipped during execution.
    #[serde(default)]
    pub disabled: bool,

    /// Per-node retry policy override.
    #[serde(default)]
    pub retry: Option<RetryPolicy>,

    /// Per-node cache policy override.
    #[serde(default)]
    pub cache: Option<CachePolicy>,
}

// ---------------------------------------------------------------------------
// Composite Node (sub-graph)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompositeNodeSpec {
    pub id: String,

    /// The embedded sub-graph.
    pub subgraph: SubgraphSpec,

    /// Exposed input ports.
    pub input_ports: Vec<PortSpec>,

    /// Exposed output ports.
    pub output_ports: Vec<PortSpec>,

    /// External input port → internal node.port
    #[serde(default)]
    pub input_mapping: Vec<PortMapping>,

    /// Internal node.port → external output port
    #[serde(default)]
    pub output_mapping: Vec<PortMapping>,

    #[serde(default)]
    pub position: Option<Position>,

    #[serde(default)]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubgraphSpec {
    pub nodes: Vec<NodeEntry>,
    pub edges: Vec<EdgeSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortMapping {
    /// The external port name on the composite node.
    pub external_port: String,
    /// The internal node ID.
    pub node: String,
    /// The internal port name.
    pub port: String,
}

// ---------------------------------------------------------------------------
// Conditional
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionalSpec {
    pub id: String,
    pub kind: ConditionalKind,
    /// Expression evaluated to determine the branch (JMESPath or simple comparison).
    pub condition_expr: String,
    /// Named branches mapping condition results to sub-graphs.
    pub branches: Vec<Branch>,
    /// Fallback branch when no condition matches.
    #[serde(default)]
    pub default_branch: Option<SubgraphSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConditionalKind {
    If,
    Switch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Branch {
    pub label: String,
    pub value: serde_json::Value,
    pub body: SubgraphSpec,
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopSpec {
    pub id: String,
    pub kind: LoopKind,
    pub body: SubgraphSpec,
    pub max_iterations: u32,
    /// For `while` loops: expression that must be truthy to continue.
    #[serde(default)]
    pub condition_expr: Option<String>,
    /// For `for_each` loops: JMESPath selecting items from an upstream port.
    #[serde(default)]
    pub items_expr: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LoopKind {
    ForEach,
    While,
    Repeat,
}

// ---------------------------------------------------------------------------
// Edge
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeSpec {
    #[serde(default = "default_edge_id")]
    pub id: String,
    pub source_node: String,
    pub source_port: String,
    pub target_node: String,
    pub target_port: String,
    #[serde(default)]
    pub kind: EdgeKind,
    /// Optional JMESPath transform applied to data flowing through this edge.
    #[serde(default)]
    pub transform: Option<String>,
}

fn default_edge_id() -> String {
    Uuid::new_v4().to_string()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EdgeKind {
    #[default]
    Data,
    Control,
    Error,
}

// ---------------------------------------------------------------------------
// Port
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortSpec {
    pub name: String,
    pub port_type: PortType,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub default_value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PortType {
    String,
    Number,
    Boolean,
    Json,
    Array,
    Binary,
    Any,
}

// ---------------------------------------------------------------------------
// Position (UI hint)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

// ---------------------------------------------------------------------------
// Retry / Cache policies
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub max_retries: u32,
    pub backoff_ms: u64,
    pub backoff_multiplier: f64,
    #[serde(default = "default_max_backoff")]
    pub max_backoff_ms: u64,
}

fn default_max_backoff() -> u64 {
    30_000
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_retries: 3,
            backoff_ms: 1_000,
            backoff_multiplier: 2.0,
            max_backoff_ms: 30_000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachePolicy {
    /// Whether caching is enabled for this node.
    pub enabled: bool,
    /// Time-to-live in seconds (0 = no expiry).
    #[serde(default)]
    pub ttl_secs: u64,
}

impl Default for CachePolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            ttl_secs: 0,
        }
    }
}

// ---------------------------------------------------------------------------
// Pack dependency (lightweight reference inside WorkflowSpec)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackDependency {
    pub pack_id: String,
    pub version_range: String,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_workflow_spec() {
        let spec = WorkflowSpec {
            version: "0.1.0".into(),
            id: Uuid::new_v4(),
            meta: WorkflowMeta {
                name: "test-workflow".into(),
                description: "A test".into(),
                ..Default::default()
            },
            variables: vec![],
            nodes: vec![NodeEntry::Primitive(NodeSpec {
                id: "n1".into(),
                tool_ref: "core-tools/file-read@1.0.0".into(),
                config: Default::default(),
                position: Some(Position { x: 0.0, y: 0.0 }),
                label: Some("Read File".into()),
                disabled: false,
                retry: None,
                cache: None,
            })],
            edges: vec![],
            required_packs: vec![PackDependency {
                pack_id: "core-tools".into(),
                version_range: "^1.0.0".into(),
            }],
        };

        let json = serde_json::to_string_pretty(&spec).unwrap();
        let deserialized: WorkflowSpec = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.version, "0.1.0");
        assert_eq!(deserialized.nodes.len(), 1);
    }

    #[test]
    fn node_entry_tagged_serde() {
        let node = NodeEntry::Primitive(NodeSpec {
            id: "n1".into(),
            tool_ref: "core-tools/echo@1.0.0".into(),
            config: Default::default(),
            position: None,
            label: None,
            disabled: false,
            retry: None,
            cache: None,
        });
        let json = serde_json::to_value(&node).unwrap();
        assert_eq!(json["kind"], "primitive");

        let back: NodeEntry = serde_json::from_value(json).unwrap();
        assert_eq!(back.id(), "n1");
    }
}
