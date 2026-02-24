//! Execution Context — runtime state shared across all nodes in one execution.

use hb_core::policy::Policy;
use hb_core::trace::ExecutionStatus;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Shared execution context passed to every node during a workflow run.
#[derive(Debug)]
pub struct ExecutionContext {
    pub execution_id: Uuid,
    pub policy: Option<Policy>,
    /// Per-node outputs collected during execution.
    pub node_outputs: Arc<RwLock<HashMap<String, serde_json::Value>>>,
    /// Per-node statuses.
    pub node_statuses: Arc<RwLock<HashMap<String, ExecutionStatus>>>,
}

impl ExecutionContext {
    pub fn new(execution_id: Uuid, policy: Option<Policy>) -> Self {
        Self {
            execution_id,
            policy,
            node_outputs: Arc::new(RwLock::new(HashMap::new())),
            node_statuses: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn set_output(&self, node_id: &str, output: serde_json::Value) {
        self.node_outputs
            .write()
            .await
            .insert(node_id.to_string(), output);
    }

    pub async fn get_output(&self, node_id: &str) -> Option<serde_json::Value> {
        self.node_outputs.read().await.get(node_id).cloned()
    }

    pub async fn set_status(&self, node_id: &str, status: ExecutionStatus) {
        self.node_statuses
            .write()
            .await
            .insert(node_id.to_string(), status);
    }
}
