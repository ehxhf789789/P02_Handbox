//! Tool Interface v0.1 — the contract every tool must satisfy.

use crate::graph::{PortSpec, RetryPolicy};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// ToolInterface
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInterface {
    /// Fully-qualified identifier: "{pack_id}/{tool_name}"
    pub tool_id: String,

    /// Semantic version.
    pub version: String,

    /// Human-friendly name.
    pub display_name: String,

    /// What this tool does.
    pub description: String,

    /// Hierarchical capability tags (e.g. "rag.ingest", "file.parse.pdf").
    pub capability_tags: Vec<CapabilityTag>,

    /// Input port declarations.
    pub input_schema: PortSchema,

    /// Output port declarations.
    pub output_schema: PortSchema,

    /// Side-effect classification.
    pub side_effect: SideEffect,

    /// Required runtime permissions.
    pub required_permissions: Vec<Permission>,

    /// Cost & performance hints for the scheduler / policy engine.
    pub cost_hint: CostHint,

    /// Error taxonomy for this tool.
    pub error_model: ErrorModel,

    /// How to invoke this tool.
    pub runtime: RuntimeSpec,

    /// Optional tool-level configuration fields.
    #[serde(default)]
    pub config_schema: Vec<ConfigField>,
}

// ---------------------------------------------------------------------------
// Capability tags
// ---------------------------------------------------------------------------

/// A dot-separated hierarchical tag, e.g. "rag.ingest".
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(transparent)]
pub struct CapabilityTag(pub String);

impl CapabilityTag {
    pub fn new(tag: impl Into<String>) -> Self {
        Self(tag.into())
    }

    /// Check whether `self` is a prefix of (or equal to) `other`.
    pub fn matches(&self, other: &CapabilityTag) -> bool {
        other.0.starts_with(&self.0)
    }
}

// ---------------------------------------------------------------------------
// Port schema
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortSchema {
    pub ports: Vec<PortSpec>,
}

// ---------------------------------------------------------------------------
// Side effect
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SideEffect {
    None,
    Read,
    Write,
    Network,
    Process,
}

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(transparent)]
pub struct Permission(pub String);

impl Permission {
    pub fn new(perm: impl Into<String>) -> Self {
        Self(perm.into())
    }
}

// ---------------------------------------------------------------------------
// Cost hint
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostHint {
    pub time: TimeHint,
    pub monetary: MonetaryHint,
    #[serde(default)]
    pub scales_with_input: bool,
    #[serde(default)]
    pub estimated_tokens: Option<TokenEstimate>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TimeHint {
    Instant,
    Fast,
    Medium,
    Slow,
    VerySlow,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MonetaryHint {
    Free,
    Cheap,
    Moderate,
    Expensive,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct TokenEstimate {
    pub input: u64,
    pub output: u64,
}

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorModel {
    pub error_types: Vec<ErrorType>,
    /// Whether repeated invocations with the same input are safe.
    pub idempotent: bool,
    pub default_retry: RetryPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorType {
    pub code: String,
    pub description: String,
    pub retryable: bool,
}

// ---------------------------------------------------------------------------
// Runtime specification
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RuntimeSpec {
    Native,
    Process {
        command: String,
    },
    Python {
        script: String,
    },
    Docker {
        image: String,
    },
    Wasm {
        module: String,
    },
    Mcp {
        server_id: String,
    },
}

// ---------------------------------------------------------------------------
// Config field (for tool-level settings UI)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigField {
    pub name: String,
    pub field_type: ConfigFieldType,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub default_value: Option<serde_json::Value>,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub options: Vec<ConfigOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConfigFieldType {
    String,
    Number,
    Boolean,
    Select,
    MultiSelect,
    FilePath,
    Json,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigOption {
    pub label: String,
    pub value: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::{PortSpec, PortType};

    #[test]
    fn round_trip_tool_interface() {
        let tool = ToolInterface {
            tool_id: "core-tools/file-read".into(),
            version: "1.0.0".into(),
            display_name: "File Read".into(),
            description: "Reads a file from disk".into(),
            capability_tags: vec![CapabilityTag::new("file.read")],
            input_schema: PortSchema {
                ports: vec![PortSpec {
                    name: "path".into(),
                    port_type: PortType::String,
                    description: Some("File path".into()),
                    required: true,
                    default_value: None,
                }],
            },
            output_schema: PortSchema {
                ports: vec![PortSpec {
                    name: "content".into(),
                    port_type: PortType::String,
                    description: Some("File content".into()),
                    required: true,
                    default_value: None,
                }],
            },
            side_effect: SideEffect::Read,
            required_permissions: vec![Permission::new("fs.read")],
            cost_hint: CostHint {
                time: TimeHint::Instant,
                monetary: MonetaryHint::Free,
                scales_with_input: true,
                estimated_tokens: None,
            },
            error_model: ErrorModel {
                error_types: vec![ErrorType {
                    code: "FILE_NOT_FOUND".into(),
                    description: "File does not exist".into(),
                    retryable: false,
                }],
                idempotent: true,
                default_retry: Default::default(),
            },
            runtime: RuntimeSpec::Native,
            config_schema: vec![],
        };

        let json = serde_json::to_string_pretty(&tool).unwrap();
        let back: ToolInterface = serde_json::from_str(&json).unwrap();
        assert_eq!(back.tool_id, "core-tools/file-read");
        assert_eq!(back.side_effect, SideEffect::Read);
    }

    #[test]
    fn capability_tag_matching() {
        let parent = CapabilityTag::new("file");
        let child = CapabilityTag::new("file.read");
        let unrelated = CapabilityTag::new("network");

        assert!(parent.matches(&child));
        assert!(parent.matches(&parent));
        assert!(!parent.matches(&unrelated));
    }
}
