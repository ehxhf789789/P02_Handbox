//! Project/Workspace types — per-project isolation of data, indexes, and settings.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::policy::Policy;

// ---------------------------------------------------------------------------
// Workspace config
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConfig {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub root_path: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,

    /// Data sources registered in this workspace.
    #[serde(default)]
    pub data_sources: Vec<DataSource>,

    /// Index configurations.
    #[serde(default)]
    pub indexes: Vec<IndexConfig>,

    /// Default policy for workflows in this workspace.
    #[serde(default)]
    pub default_policy: Option<Policy>,

    /// LLM provider configurations.
    #[serde(default)]
    pub llm_providers: Vec<LlmProviderConfig>,
}

// ---------------------------------------------------------------------------
// Data source
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSource {
    pub id: String,
    pub name: String,
    pub kind: DataSourceKind,
    pub path_or_uri: String,
    #[serde(default)]
    pub metadata: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DataSourceKind {
    LocalFile,
    LocalDirectory,
    Database,
    Api,
    S3,
    WebUrl,
}

// ---------------------------------------------------------------------------
// Index config
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexConfig {
    pub id: String,
    pub name: String,
    pub data_source_id: String,
    pub embedding_model: String,
    pub chunk_size: u32,
    pub chunk_overlap: u32,
    #[serde(default)]
    pub metadata: serde_json::Map<String, serde_json::Value>,
}

// ---------------------------------------------------------------------------
// LLM provider config
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmProviderConfig {
    pub id: String,
    pub name: String,
    pub provider_type: LlmProviderType,
    /// API key or credential reference (stored separately in keyring).
    pub credential_ref: String,
    #[serde(default)]
    pub default_model: Option<String>,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LlmProviderType {
    OpenAi,
    Anthropic,
    AwsBedrock,
    GoogleVertex,
    Ollama,
    Custom,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_workspace_config() {
        let ws = WorkspaceConfig {
            id: Uuid::new_v4(),
            name: "My Project".into(),
            description: Some("Test workspace".into()),
            root_path: "/home/user/project".into(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            data_sources: vec![DataSource {
                id: "ds1".into(),
                name: "Docs folder".into(),
                kind: DataSourceKind::LocalDirectory,
                path_or_uri: "/home/user/project/docs".into(),
                metadata: Default::default(),
            }],
            indexes: vec![],
            default_policy: None,
            llm_providers: vec![LlmProviderConfig {
                id: "openai".into(),
                name: "OpenAI".into(),
                provider_type: LlmProviderType::OpenAi,
                credential_ref: "keyring:openai-api-key".into(),
                default_model: Some("gpt-4".into()),
                enabled: true,
            }],
        };

        let json = serde_json::to_string_pretty(&ws).unwrap();
        let back: WorkspaceConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.name, "My Project");
        assert_eq!(back.data_sources.len(), 1);
    }
}
