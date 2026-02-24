//! SQLite-backed trace storage.

use crate::TraceError;
use hb_core::trace::{ExecutionEnvironment, ExecutionStatus, NodeSpan};
use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;
use uuid::Uuid;

/// Trace store backed by a single SQLite database.
/// Uses Mutex<Connection> for thread safety (rusqlite::Connection is !Sync).
pub struct TraceStore {
    conn: Mutex<Connection>,
}

impl TraceStore {
    /// Open (or create) the trace database at the given path.
    pub fn open(path: &Path) -> Result<Self, TraceError> {
        let conn =
            Connection::open(path).map_err(|e| TraceError::Database(e.to_string()))?;
        let store = Self { conn: Mutex::new(conn) };
        store.initialize_schema()?;
        Ok(store)
    }

    /// Create an in-memory trace store (useful for testing).
    pub fn in_memory() -> Result<Self, TraceError> {
        let conn =
            Connection::open_in_memory().map_err(|e| TraceError::Database(e.to_string()))?;
        let store = Self { conn: Mutex::new(conn) };
        store.initialize_schema()?;
        Ok(store)
    }

    fn initialize_schema(&self) -> Result<(), TraceError> {
        let conn = self.conn.lock().map_err(|e| TraceError::Database(e.to_string()))?;
        conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS traces (
                    span_id TEXT PRIMARY KEY,
                    execution_id TEXT NOT NULL,
                    node_id TEXT NOT NULL,
                    tool_ref TEXT NOT NULL,
                    input_json TEXT NOT NULL,
                    output_json TEXT,
                    config_json TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    completed_at TEXT,
                    duration_ms INTEGER,
                    status TEXT NOT NULL,
                    error TEXT,
                    cache_hit BOOLEAN NOT NULL DEFAULT 0,
                    environment_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_traces_execution
                    ON traces(execution_id);
                CREATE INDEX IF NOT EXISTS idx_traces_node
                    ON traces(node_id);",
            )
            .map_err(|e| TraceError::Database(e.to_string()))?;
        Ok(())
    }

    /// Insert a node span into the trace store.
    pub fn insert_span(&self, span: &NodeSpan) -> Result<(), TraceError> {
        let conn = self.conn.lock().map_err(|e| TraceError::Database(e.to_string()))?;
        conn.execute(
                "INSERT INTO traces (
                    span_id, execution_id, node_id, tool_ref,
                    input_json, output_json, config_json,
                    started_at, completed_at, duration_ms,
                    status, error, cache_hit, environment_json
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                rusqlite::params![
                    span.span_id.to_string(),
                    span.execution_id.to_string(),
                    span.node_id,
                    span.tool_ref,
                    span.input_json.to_string(),
                    span.output_json.as_ref().map(|v| v.to_string()),
                    span.config_json.to_string(),
                    span.started_at.to_rfc3339(),
                    span.completed_at.map(|t| t.to_rfc3339()),
                    span.duration_ms,
                    serde_json::to_string(&span.status).unwrap_or_default(),
                    span.error,
                    span.cache_hit,
                    serde_json::to_string(&span.environment).unwrap_or_default(),
                ],
            )
            .map_err(|e| TraceError::Database(e.to_string()))?;
        Ok(())
    }

    /// Query all spans for a given execution ID.
    pub fn query_spans_by_execution(&self, execution_id: Uuid) -> Result<Vec<NodeSpan>, TraceError> {
        let conn = self.conn.lock().map_err(|e| TraceError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
                "SELECT span_id, execution_id, node_id, tool_ref,
                        input_json, output_json, config_json,
                        started_at, completed_at, duration_ms,
                        status, error, cache_hit, environment_json
                 FROM traces WHERE execution_id = ?1
                 ORDER BY started_at ASC",
            )
            .map_err(|e| TraceError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(rusqlite::params![execution_id.to_string()], |row| {
                Ok(RawSpanRow {
                    span_id: row.get(0)?,
                    execution_id: row.get(1)?,
                    node_id: row.get(2)?,
                    tool_ref: row.get(3)?,
                    input_json: row.get(4)?,
                    output_json: row.get(5)?,
                    config_json: row.get(6)?,
                    started_at: row.get(7)?,
                    completed_at: row.get(8)?,
                    duration_ms: row.get(9)?,
                    status: row.get(10)?,
                    error: row.get(11)?,
                    cache_hit: row.get(12)?,
                    environment_json: row.get(13)?,
                })
            })
            .map_err(|e| TraceError::Database(e.to_string()))?;

        let mut spans = Vec::new();
        for row in rows {
            let raw = row.map_err(|e| TraceError::Database(e.to_string()))?;
            spans.push(raw_to_span(raw)?);
        }
        Ok(spans)
    }

    /// Query a single span by its ID.
    pub fn query_span(&self, span_id: Uuid) -> Result<Option<NodeSpan>, TraceError> {
        let conn = self.conn.lock().map_err(|e| TraceError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
                "SELECT span_id, execution_id, node_id, tool_ref,
                        input_json, output_json, config_json,
                        started_at, completed_at, duration_ms,
                        status, error, cache_hit, environment_json
                 FROM traces WHERE span_id = ?1",
            )
            .map_err(|e| TraceError::Database(e.to_string()))?;

        let mut rows = stmt
            .query_map(rusqlite::params![span_id.to_string()], |row| {
                Ok(RawSpanRow {
                    span_id: row.get(0)?,
                    execution_id: row.get(1)?,
                    node_id: row.get(2)?,
                    tool_ref: row.get(3)?,
                    input_json: row.get(4)?,
                    output_json: row.get(5)?,
                    config_json: row.get(6)?,
                    started_at: row.get(7)?,
                    completed_at: row.get(8)?,
                    duration_ms: row.get(9)?,
                    status: row.get(10)?,
                    error: row.get(11)?,
                    cache_hit: row.get(12)?,
                    environment_json: row.get(13)?,
                })
            })
            .map_err(|e| TraceError::Database(e.to_string()))?;

        match rows.next() {
            Some(row) => {
                let raw = row.map_err(|e| TraceError::Database(e.to_string()))?;
                Ok(Some(raw_to_span(raw)?))
            }
            None => Ok(None),
        }
    }
}

/// Internal row struct for SQLite queries.
struct RawSpanRow {
    span_id: String,
    execution_id: String,
    node_id: String,
    tool_ref: String,
    input_json: String,
    output_json: Option<String>,
    config_json: String,
    started_at: String,
    completed_at: Option<String>,
    duration_ms: Option<i64>,
    status: String,
    error: Option<String>,
    cache_hit: bool,
    environment_json: String,
}

fn raw_to_span(raw: RawSpanRow) -> Result<NodeSpan, TraceError> {
    let parse_err = |field: &str, e: String| TraceError::Database(format!("{field}: {e}"));

    Ok(NodeSpan {
        span_id: raw
            .span_id
            .parse()
            .map_err(|e: uuid::Error| parse_err("span_id", e.to_string()))?,
        execution_id: raw
            .execution_id
            .parse()
            .map_err(|e: uuid::Error| parse_err("execution_id", e.to_string()))?,
        node_id: raw.node_id,
        tool_ref: raw.tool_ref,
        input_json: serde_json::from_str(&raw.input_json)
            .map_err(|e| parse_err("input_json", e.to_string()))?,
        output_json: raw
            .output_json
            .map(|s| serde_json::from_str(&s))
            .transpose()
            .map_err(|e| parse_err("output_json", e.to_string()))?,
        config_json: serde_json::from_str(&raw.config_json)
            .map_err(|e| parse_err("config_json", e.to_string()))?,
        started_at: chrono::DateTime::parse_from_rfc3339(&raw.started_at)
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .map_err(|e| parse_err("started_at", e.to_string()))?,
        completed_at: raw
            .completed_at
            .map(|s| {
                chrono::DateTime::parse_from_rfc3339(&s)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
            })
            .transpose()
            .map_err(|e| parse_err("completed_at", e.to_string()))?,
        duration_ms: raw.duration_ms,
        status: serde_json::from_str(&raw.status).unwrap_or(ExecutionStatus::Pending),
        error: raw.error,
        cache_hit: raw.cache_hit,
        environment: serde_json::from_str(&raw.environment_json).unwrap_or(
            ExecutionEnvironment {
                platform_version: "unknown".into(),
                os: "unknown".into(),
                tool_version: "unknown".into(),
                extra: Default::default(),
            },
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use hb_core::trace::ExecutionEnvironment;

    #[test]
    fn insert_and_query() {
        let store = TraceStore::in_memory().unwrap();
        let exec_id = Uuid::new_v4();

        let span = NodeSpan {
            span_id: Uuid::new_v4(),
            execution_id: exec_id,
            node_id: "n1".into(),
            tool_ref: "core/echo@1.0".into(),
            input_json: serde_json::json!({"msg": "hi"}),
            output_json: Some(serde_json::json!({"result": "hi"})),
            config_json: serde_json::json!({}),
            started_at: Utc::now(),
            completed_at: Some(Utc::now()),
            duration_ms: Some(5),
            status: ExecutionStatus::Completed,
            error: None,
            cache_hit: false,
            environment: ExecutionEnvironment {
                platform_version: "0.1.0".into(),
                os: "test".into(),
                tool_version: "1.0.0".into(),
                extra: Default::default(),
            },
        };

        store.insert_span(&span).unwrap();

        // Query by execution
        let spans = store.query_spans_by_execution(exec_id).unwrap();
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].node_id, "n1");

        // Query single span
        let found = store.query_span(span.span_id).unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().tool_ref, "core/echo@1.0");

        // Query non-existent
        let missing = store.query_span(Uuid::new_v4()).unwrap();
        assert!(missing.is_none());
    }
}
