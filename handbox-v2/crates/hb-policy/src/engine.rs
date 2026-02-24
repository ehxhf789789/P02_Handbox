//! Policy evaluation engine.

use crate::PolicyError;
use hb_core::policy::Policy;
use hb_core::tool::ToolInterface;

/// Check whether a tool is allowed under the given policy.
pub fn check_tool_allowed(policy: &Policy, tool: &ToolInterface) -> Result<(), PolicyError> {
    // 1. Tool whitelist
    if !policy.tool_whitelist.is_tool_allowed(&tool.tool_id) {
        return Err(PolicyError::ToolNotAllowed(tool.tool_id.clone()));
    }

    // 2. Permission check
    for perm in &tool.required_permissions {
        if !policy.permissions.is_allowed(perm) {
            return Err(PolicyError::PermissionDenied(format!(
                "tool {} requires permission {} which is not granted",
                tool.tool_id, perm.0
            )));
        }
    }

    Ok(())
}
