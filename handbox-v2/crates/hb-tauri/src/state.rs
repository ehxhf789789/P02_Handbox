//! Application state shared across all Tauri commands.

use hb_mcp::registry::ToolRegistry;
use hb_project::ProjectManager;
use hb_trace::store::TraceStore;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use hb_core::graph::WorkflowSpec;

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

    /// Data directory for the app.
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            tool_registry: Arc::new(RwLock::new(ToolRegistry::new())),
            trace_store: Arc::new(RwLock::new(None)),
            project_manager: Arc::new(RwLock::new(ProjectManager::new())),
            workflows: Arc::new(RwLock::new(HashMap::new())),
            data_dir,
        }
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
