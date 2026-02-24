//! Pack manifest v0.1 — extension unit with tools, templates, and composites.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// PackManifest
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackManifest {
    /// Schema version (always "0.1.0" for this release).
    pub pack_version: String,

    /// Unique pack identifier (e.g. "rag-pack").
    pub id: String,

    /// Semantic version.
    pub version: String,

    /// Human-friendly name.
    pub name: String,

    /// What this pack provides.
    pub description: String,

    /// Pack author.
    pub author: String,

    /// License identifier (SPDX).
    pub license: String,

    /// Minimum Handbox platform version required.
    pub platform_version: String,

    /// Other packs this one depends on.
    #[serde(default)]
    pub dependencies: Vec<PackDependencySpec>,

    /// Categorisation for the UI.
    pub category: PackCategory,

    /// Relative paths to tool definition files within the pack.
    pub tools: Vec<String>,

    /// Relative paths to workflow template files.
    #[serde(default)]
    pub templates: Vec<String>,

    /// Relative paths to composite node definitions.
    #[serde(default)]
    pub composites: Vec<String>,

    /// Runtime requirements the host must satisfy.
    #[serde(default)]
    pub runtime_requirements: Option<RuntimeRequirements>,
}

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackDependencySpec {
    pub pack_id: String,
    pub version_range: String,
    #[serde(default)]
    pub optional: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PackCategory {
    Core,
    Ai,
    Rag,
    Data,
    Document,
    Export,
    Integration,
    Ml,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeRequirements {
    #[serde(default)]
    pub python: Option<String>,
    #[serde(default)]
    pub docker: Option<bool>,
    #[serde(default)]
    pub native_deps: Vec<String>,
    #[serde(default)]
    pub os: Vec<String>,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_pack_manifest() {
        let manifest = PackManifest {
            pack_version: "0.1.0".into(),
            id: "rag-pack".into(),
            version: "1.0.0".into(),
            name: "RAG Pack".into(),
            description: "Retrieval Augmented Generation tools".into(),
            author: "Handbox Team".into(),
            license: "MIT".into(),
            platform_version: "0.1.0".into(),
            dependencies: vec![PackDependencySpec {
                pack_id: "llm-pack".into(),
                version_range: "^1.0.0".into(),
                optional: false,
            }],
            category: PackCategory::Rag,
            tools: vec!["tools/chunk.json".into(), "tools/embed.json".into()],
            templates: vec!["templates/rag-basic.json".into()],
            composites: vec![],
            runtime_requirements: Some(RuntimeRequirements {
                python: Some(">=3.10".into()),
                docker: None,
                native_deps: vec![],
                os: vec![],
            }),
        };

        let json = serde_json::to_string_pretty(&manifest).unwrap();
        let back: PackManifest = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "rag-pack");
        assert_eq!(back.category, PackCategory::Rag);
    }
}
