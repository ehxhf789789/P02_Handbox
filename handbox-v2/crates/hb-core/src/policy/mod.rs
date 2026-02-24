//! Policy types — permissions, cost limits, and tool whitelists.

use crate::tool::Permission;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Permission set (attached to a project or workflow)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionSet {
    /// Granted permissions (e.g. "fs.read", "network.outbound").
    pub granted: Vec<Permission>,

    /// Explicitly denied permissions (overrides granted).
    #[serde(default)]
    pub denied: Vec<Permission>,
}

impl PermissionSet {
    pub fn is_allowed(&self, perm: &Permission) -> bool {
        if self.denied.contains(perm) {
            return false;
        }
        self.granted.contains(perm)
    }
}

// ---------------------------------------------------------------------------
// Cost limit
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostLimit {
    /// Maximum wall-clock time for the entire execution (seconds).
    #[serde(default)]
    pub max_execution_time_secs: Option<u64>,

    /// Maximum wall-clock time per node (seconds).
    #[serde(default)]
    pub max_node_time_secs: Option<u64>,

    /// Maximum monetary cost in USD (for LLM calls, etc.).
    #[serde(default)]
    pub max_cost_usd: Option<f64>,

    /// Maximum total tokens consumed.
    #[serde(default)]
    pub max_tokens: Option<u64>,
}

// ---------------------------------------------------------------------------
// Tool whitelist
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolWhitelist {
    /// If non-empty, only these tool IDs may be used.
    #[serde(default)]
    pub allowed_tools: Vec<String>,

    /// These tool IDs are always blocked.
    #[serde(default)]
    pub blocked_tools: Vec<String>,
}

impl ToolWhitelist {
    pub fn is_tool_allowed(&self, tool_id: &str) -> bool {
        if self.blocked_tools.iter().any(|t| t == tool_id) {
            return false;
        }
        if self.allowed_tools.is_empty() {
            return true;
        }
        self.allowed_tools.iter().any(|t| t == tool_id)
    }
}

// ---------------------------------------------------------------------------
// Composite policy (everything together)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    pub permissions: PermissionSet,
    pub cost_limit: CostLimit,
    pub tool_whitelist: ToolWhitelist,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_set_check() {
        let ps = PermissionSet {
            granted: vec![Permission::new("fs.read"), Permission::new("fs.write")],
            denied: vec![Permission::new("fs.write")],
        };

        assert!(ps.is_allowed(&Permission::new("fs.read")));
        assert!(!ps.is_allowed(&Permission::new("fs.write"))); // denied overrides
        assert!(!ps.is_allowed(&Permission::new("network.outbound"))); // not granted
    }

    #[test]
    fn tool_whitelist_check() {
        let wl = ToolWhitelist {
            allowed_tools: vec!["core-tools/file-read".into()],
            blocked_tools: vec!["core-tools/shell-exec".into()],
        };

        assert!(wl.is_tool_allowed("core-tools/file-read"));
        assert!(!wl.is_tool_allowed("core-tools/file-write")); // not in allowed
        assert!(!wl.is_tool_allowed("core-tools/shell-exec")); // blocked
    }

    #[test]
    fn empty_whitelist_allows_all() {
        let wl = ToolWhitelist {
            allowed_tools: vec![],
            blocked_tools: vec![],
        };
        assert!(wl.is_tool_allowed("anything"));
    }
}
