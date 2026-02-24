//! hb-project: Project/Workspace management with SQLite persistence.

use hb_core::project::WorkspaceConfig;
use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error("database error: {0}")]
    Database(String),
    #[error("project not found: {0}")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(String),
}

/// Project manager — CRUD for workspaces, backed by SQLite.
pub struct ProjectManager {
    conn: Option<Mutex<Connection>>,
}

impl Default for ProjectManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ProjectManager {
    pub fn new() -> Self {
        Self { conn: None }
    }

    /// Open or create the project database at the given path.
    pub fn open(path: &Path) -> Result<Self, ProjectError> {
        let conn =
            Connection::open(path).map_err(|e| ProjectError::Database(e.to_string()))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                root_path TEXT NOT NULL,
                config_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );",
        )
        .map_err(|e| ProjectError::Database(e.to_string()))?;

        Ok(Self {
            conn: Some(Mutex::new(conn)),
        })
    }

    pub fn create_workspace(&self, config: &WorkspaceConfig) -> Result<Uuid, ProjectError> {
        let id = Uuid::new_v4();
        let now = chrono::Utc::now().to_rfc3339();

        if let Some(conn) = &self.conn {
            let conn = conn.lock().map_err(|e| ProjectError::Database(e.to_string()))?;
            let config_json =
                serde_json::to_string(config).map_err(|e| ProjectError::Database(e.to_string()))?;
            conn.execute(
                "INSERT INTO projects (id, name, root_path, config_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    id.to_string(),
                    config.name,
                    config.root_path,
                    config_json,
                    now,
                    now,
                ],
            )
            .map_err(|e| ProjectError::Database(e.to_string()))?;
        }

        Ok(id)
    }

    pub fn get_workspace(&self, id: Uuid) -> Result<WorkspaceConfig, ProjectError> {
        let conn = self
            .conn
            .as_ref()
            .ok_or_else(|| ProjectError::Database("No database".into()))?;
        let conn = conn.lock().map_err(|e| ProjectError::Database(e.to_string()))?;

        let config_json: String = conn
            .query_row(
                "SELECT config_json FROM projects WHERE id = ?1",
                rusqlite::params![id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| ProjectError::NotFound(id.to_string()))?;

        serde_json::from_str(&config_json).map_err(|e| ProjectError::Database(e.to_string()))
    }

    pub fn list_workspaces(&self) -> Result<Vec<WorkspaceConfig>, ProjectError> {
        let conn = match &self.conn {
            Some(c) => c,
            None => return Ok(vec![]),
        };
        let conn = conn.lock().map_err(|e| ProjectError::Database(e.to_string()))?;

        let mut stmt = conn
            .prepare("SELECT config_json FROM projects ORDER BY created_at DESC")
            .map_err(|e| ProjectError::Database(e.to_string()))?;

        let configs: Vec<WorkspaceConfig> = stmt
            .query_map([], |row| {
                let json: String = row.get(0)?;
                Ok(json)
            })
            .map_err(|e| ProjectError::Database(e.to_string()))?
            .filter_map(|r| r.ok())
            .filter_map(|json| serde_json::from_str(&json).ok())
            .collect();

        Ok(configs)
    }

    pub fn delete_workspace(&self, id: Uuid) -> Result<(), ProjectError> {
        let conn = self
            .conn
            .as_ref()
            .ok_or_else(|| ProjectError::Database("No database".into()))?;
        let conn = conn.lock().map_err(|e| ProjectError::Database(e.to_string()))?;

        conn.execute(
            "DELETE FROM projects WHERE id = ?1",
            rusqlite::params![id.to_string()],
        )
        .map_err(|e| ProjectError::Database(e.to_string()))?;

        Ok(())
    }
}
