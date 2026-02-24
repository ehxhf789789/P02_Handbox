//! Trace types — evidence records for every node execution.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// NodeSpan — one row per node execution
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSpan {
    /// Unique span identifier.
    pub span_id: Uuid,

    /// The workflow execution this span belongs to.
    pub execution_id: Uuid,

    /// Node instance ID within the workflow.
    pub node_id: String,

    /// Tool reference used ("pack_id/tool_id@version").
    pub tool_ref: String,

    /// Snapshot of inputs as JSON.
    pub input_json: serde_json::Value,

    /// Snapshot of outputs as JSON (null if failed).
    pub output_json: Option<serde_json::Value>,

    /// Snapshot of configuration.
    pub config_json: serde_json::Value,

    /// When execution started.
    pub started_at: DateTime<Utc>,

    /// When execution completed (None if still running).
    pub completed_at: Option<DateTime<Utc>>,

    /// Duration in milliseconds (None if still running).
    pub duration_ms: Option<i64>,

    /// Execution outcome.
    pub status: ExecutionStatus,

    /// Error message if failed.
    pub error: Option<String>,

    /// Whether the result was served from cache.
    pub cache_hit: bool,

    /// Environment snapshot (platform version, OS, tool version, etc.).
    pub environment: ExecutionEnvironment,
}

// ---------------------------------------------------------------------------
// Execution status
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Skipped,
    CacheHit,
    Cancelled,
}

// ---------------------------------------------------------------------------
// Environment snapshot
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionEnvironment {
    pub platform_version: String,
    pub os: String,
    pub tool_version: String,
    #[serde(default)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Workflow-level execution record
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionRecord {
    pub execution_id: Uuid,
    pub workflow_id: Uuid,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub status: ExecutionStatus,
    pub total_nodes: u32,
    pub completed_nodes: u32,
    pub failed_nodes: u32,
    pub cache_hits: u32,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_node_span() {
        let span = NodeSpan {
            span_id: Uuid::new_v4(),
            execution_id: Uuid::new_v4(),
            node_id: "n1".into(),
            tool_ref: "core-tools/file-read@1.0.0".into(),
            input_json: serde_json::json!({"path": "/tmp/test.txt"}),
            output_json: Some(serde_json::json!({"content": "hello"})),
            config_json: serde_json::json!({}),
            started_at: Utc::now(),
            completed_at: Some(Utc::now()),
            duration_ms: Some(42),
            status: ExecutionStatus::Completed,
            error: None,
            cache_hit: false,
            environment: ExecutionEnvironment {
                platform_version: "0.1.0".into(),
                os: "windows".into(),
                tool_version: "1.0.0".into(),
                extra: Default::default(),
            },
        };

        let json = serde_json::to_string(&span).unwrap();
        let back: NodeSpan = serde_json::from_str(&json).unwrap();
        assert_eq!(back.node_id, "n1");
        assert_eq!(back.status, ExecutionStatus::Completed);
    }
}
