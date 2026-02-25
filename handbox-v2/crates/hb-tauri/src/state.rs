//! Application state shared across all Tauri commands.

use hb_mcp::registry::ToolRegistry;
use hb_project::ProjectManager;
use hb_trace::store::TraceStore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use hb_core::graph::WorkflowSpec;

/// LLM credentials storage
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LLMCredentials {
    // AWS Bedrock uses Access Key authentication (Signature V4)
    pub aws_access_key_id: Option<String>,
    pub aws_secret_access_key: Option<String>,
    pub bedrock_region: Option<String>,
    // Other providers
    pub openai_api_key: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub local_endpoint: Option<String>,
}

impl LLMCredentials {
    /// Load credentials from file
    pub fn load(path: &PathBuf) -> Self {
        if path.exists() {
            match fs::read_to_string(path) {
                Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
                Err(_) => Self::default(),
            }
        } else {
            Self::default()
        }
    }

    /// Save credentials to file
    pub fn save(&self, path: &PathBuf) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let content = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(path, content).map_err(|e| e.to_string())
    }
}

/// Shared application state, managed by Tauri.
pub struct AppState {
    /// Tool registry (loaded from packs).
    pub tool_registry: Arc<RwLock<ToolRegistry>>,

    /// Trace store (SQLite).
    pub trace_store: Arc<RwLock<Option<TraceStore>>>,

    /// Project manager.
    pub project_manager: Arc<RwLock<ProjectManager>>,

    /// In-memory workflow storage (Phase 1; Phase 2 will use SQLite).
    pub workflows: Arc<RwLock<HashMap<String, WorkflowSpec>>>,

    /// LLM credentials (persistent storage).
    pub llm_credentials: Arc<RwLock<LLMCredentials>>,

    /// Data directory for the app.
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        // Load credentials from file
        let creds_path = data_dir.join("llm_credentials.json");
        let credentials = LLMCredentials::load(&creds_path);

        // Set environment variables from saved credentials
        // AWS Bedrock credentials
        if let Some(ref key_id) = credentials.aws_access_key_id {
            std::env::set_var("AWS_ACCESS_KEY_ID", key_id);
        }
        if let Some(ref secret_key) = credentials.aws_secret_access_key {
            std::env::set_var("AWS_SECRET_ACCESS_KEY", secret_key);
        }
        if let Some(ref region) = credentials.bedrock_region {
            std::env::set_var("AWS_REGION", region);
        }
        if let Some(ref key) = credentials.openai_api_key {
            std::env::set_var("OPENAI_API_KEY", key);
        }
        if let Some(ref key) = credentials.anthropic_api_key {
            std::env::set_var("ANTHROPIC_API_KEY", key);
        }
        if let Some(ref endpoint) = credentials.local_endpoint {
            std::env::set_var("LOCAL_LLM_ENDPOINT", endpoint);
        }

        Self {
            tool_registry: Arc::new(RwLock::new(ToolRegistry::new())),
            trace_store: Arc::new(RwLock::new(None)),
            project_manager: Arc::new(RwLock::new(ProjectManager::new())),
            workflows: Arc::new(RwLock::new(HashMap::new())),
            llm_credentials: Arc::new(RwLock::new(credentials)),
            data_dir,
        }
    }

    /// Get the credentials file path
    pub fn credentials_path(&self) -> PathBuf {
        self.data_dir.join("llm_credentials.json")
    }

    /// Initialize trace store at data_dir/traces.db
    pub fn init_trace_store(&self) -> Result<(), String> {
        let path = self.data_dir.join("traces.db");
        let store =
            TraceStore::open(&path).map_err(|e| format!("Failed to open trace store: {e}"))?;
        // We can't await here in a sync context, so we use try_write
        if let Ok(mut guard) = self.trace_store.try_write() {
            *guard = Some(store);
        }
        Ok(())
    }
}
