//! Tool whitelist management.

use hb_core::policy::ToolWhitelist;

/// Create a permissive whitelist that allows everything.
pub fn allow_all() -> ToolWhitelist {
    ToolWhitelist {
        allowed_tools: vec![],
        blocked_tools: vec![],
    }
}

/// Create a whitelist from explicit allow/block lists.
pub fn from_lists(allowed: Vec<String>, blocked: Vec<String>) -> ToolWhitelist {
    ToolWhitelist {
        allowed_tools: allowed,
        blocked_tools: blocked,
    }
}
