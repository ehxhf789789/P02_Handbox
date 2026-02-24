//! Tool Registry — stores and looks up ToolInterface definitions.
//! Also provides scan_packs() for loading tool definitions from pack directories.

use hb_core::tool::{CapabilityTag, ToolInterface};
use std::collections::HashMap;
use std::path::Path;

/// In-memory tool registry.
#[derive(Debug, Default)]
pub struct ToolRegistry {
    tools: HashMap<String, ToolInterface>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a tool. Overwrites if the same tool_id already exists.
    pub fn register(&mut self, tool: ToolInterface) {
        self.tools.insert(tool.tool_id.clone(), tool);
    }

    /// Look up a tool by its fully-qualified ID.
    pub fn get(&self, tool_id: &str) -> Option<&ToolInterface> {
        self.tools.get(tool_id)
    }

    /// List all registered tools.
    pub fn list(&self) -> Vec<&ToolInterface> {
        self.tools.values().collect()
    }

    /// Search tools by capability tag prefix.
    pub fn search_by_capability(&self, tag: &CapabilityTag) -> Vec<&ToolInterface> {
        self.tools
            .values()
            .filter(|t| t.capability_tags.iter().any(|ct| tag.matches(ct)))
            .collect()
    }

    /// Number of registered tools.
    pub fn len(&self) -> usize {
        self.tools.len()
    }

    pub fn is_empty(&self) -> bool {
        self.tools.is_empty()
    }
}

/// Scan a packs directory and load all tool definitions.
/// Each pack is a subdirectory containing a `manifest.json` and a `tools/` directory
/// with individual tool JSON files.
pub fn scan_packs(packs_dir: &str) -> Result<Vec<ToolInterface>, String> {
    let packs_path = Path::new(packs_dir);
    if !packs_path.exists() {
        return Err(format!("Packs directory not found: {packs_dir}"));
    }

    let mut tools = Vec::new();

    let entries = std::fs::read_dir(packs_path)
        .map_err(|e| format!("Failed to read packs dir: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
        let pack_path = entry.path();

        if !pack_path.is_dir() {
            continue;
        }

        let tools_dir = pack_path.join("tools");
        if !tools_dir.exists() {
            continue;
        }

        let tool_entries = std::fs::read_dir(&tools_dir)
            .map_err(|e| format!("Failed to read tools dir: {e}"))?;

        for tool_entry in tool_entries {
            let tool_entry = tool_entry.map_err(|e| format!("Failed to read tool entry: {e}"))?;
            let tool_path = tool_entry.path();

            if tool_path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }

            let content = std::fs::read_to_string(&tool_path)
                .map_err(|e| format!("Failed to read {}: {e}", tool_path.display()))?;

            match serde_json::from_str::<ToolInterface>(&content) {
                Ok(tool) => tools.push(tool),
                Err(e) => {
                    tracing::warn!("Failed to parse {}: {e}", tool_path.display());
                }
            }
        }
    }

    Ok(tools)
}
