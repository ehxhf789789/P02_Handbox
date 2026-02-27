//! Cache — input-hash-based caching backed by SQLite.
//!
//! cache_key = hash(tool_ref + tool_version, sorted(input_values), config, data_source_version?)

use crate::RunnerError;
use rusqlite::{Connection, params};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::sync::Mutex;

/// Thread-safe cache backed by SQLite.
pub struct ExecutionCache {
    conn: Mutex<Connection>,
}

impl ExecutionCache {
    /// Create a new cache with the given SQLite database path.
    pub fn new(db_path: &Path) -> Result<Self, RunnerError> {
        let conn = Connection::open(db_path)
            .map_err(|e| RunnerError::Cache(format!("Failed to open cache DB: {e}")))?;

        // Create cache table if not exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS execution_cache (
                cache_key TEXT PRIMARY KEY,
                output_json TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                expires_at TEXT,
                hit_count INTEGER DEFAULT 0
            )",
            [],
        )
        .map_err(|e| RunnerError::Cache(format!("Failed to create cache table: {e}")))?;

        // Create index on expires_at for cleanup
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_expires_at ON execution_cache(expires_at)",
            [],
        )
        .map_err(|e| RunnerError::Cache(format!("Failed to create index: {e}")))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Create an in-memory cache (for testing).
    pub fn in_memory() -> Result<Self, RunnerError> {
        let conn = Connection::open_in_memory()
            .map_err(|e| RunnerError::Cache(format!("Failed to open in-memory DB: {e}")))?;

        conn.execute(
            "CREATE TABLE execution_cache (
                cache_key TEXT PRIMARY KEY,
                output_json TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                expires_at TEXT,
                hit_count INTEGER DEFAULT 0
            )",
            [],
        )
        .map_err(|e| RunnerError::Cache(format!("Failed to create cache table: {e}")))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Look up a cached result.
    pub fn lookup(&self, cache_key: &str) -> Result<Option<serde_json::Value>, RunnerError> {
        let conn = self.conn.lock().map_err(|_| RunnerError::Cache("Lock poisoned".into()))?;

        // Check if entry exists and is not expired
        let result: Result<(String, i64), _> = conn.query_row(
            "SELECT output_json, hit_count FROM execution_cache
             WHERE cache_key = ?1
             AND (expires_at IS NULL OR expires_at > datetime('now'))",
            params![cache_key],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );

        match result {
            Ok((output_json, hit_count)) => {
                // Update hit count
                let _ = conn.execute(
                    "UPDATE execution_cache SET hit_count = ?1 WHERE cache_key = ?2",
                    params![hit_count + 1, cache_key],
                );

                let output: serde_json::Value = serde_json::from_str(&output_json)
                    .map_err(|e| RunnerError::Cache(format!("Invalid cached JSON: {e}")))?;
                Ok(Some(output))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(RunnerError::Cache(format!("Cache lookup failed: {e}"))),
        }
    }

    /// Store a result in the cache with optional TTL.
    pub fn store(
        &self,
        cache_key: &str,
        output: &serde_json::Value,
        ttl_secs: Option<u64>,
    ) -> Result<(), RunnerError> {
        let conn = self.conn.lock().map_err(|_| RunnerError::Cache("Lock poisoned".into()))?;

        let output_json = serde_json::to_string(output)
            .map_err(|e| RunnerError::Cache(format!("Failed to serialize output: {e}")))?;

        let expires_at = ttl_secs.map(|ttl| {
            chrono::Utc::now()
                .checked_add_signed(chrono::Duration::seconds(ttl as i64))
                .map(|t| t.to_rfc3339())
        }).flatten();

        conn.execute(
            "INSERT OR REPLACE INTO execution_cache (cache_key, output_json, expires_at, hit_count)
             VALUES (?1, ?2, ?3, 0)",
            params![cache_key, output_json, expires_at],
        )
        .map_err(|e| RunnerError::Cache(format!("Failed to store cache: {e}")))?;

        Ok(())
    }

    /// Clean up expired entries.
    pub fn cleanup(&self) -> Result<usize, RunnerError> {
        let conn = self.conn.lock().map_err(|_| RunnerError::Cache("Lock poisoned".into()))?;

        let deleted = conn
            .execute(
                "DELETE FROM execution_cache WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')",
                [],
            )
            .map_err(|e| RunnerError::Cache(format!("Cleanup failed: {e}")))?;

        Ok(deleted)
    }

    /// Clear all cache entries.
    pub fn clear(&self) -> Result<(), RunnerError> {
        let conn = self.conn.lock().map_err(|_| RunnerError::Cache("Lock poisoned".into()))?;
        conn.execute("DELETE FROM execution_cache", [])
            .map_err(|e| RunnerError::Cache(format!("Clear failed: {e}")))?;
        Ok(())
    }
}

/// Compute a cache key from tool reference, inputs, and config.
pub fn compute_cache_key(
    tool_ref: &str,
    inputs: &serde_json::Value,
    config: &serde_json::Value,
    data_version: Option<&str>,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(tool_ref.as_bytes());
    hasher.update(inputs.to_string().as_bytes());
    hasher.update(config.to_string().as_bytes());
    if let Some(dv) = data_version {
        hasher.update(dv.as_bytes());
    }
    hex::encode(hasher.finalize())
}

/// Look up a cached result. Phase 0 stub: always returns None (cache miss).
pub fn lookup(_cache_key: &str) -> Result<Option<serde_json::Value>, RunnerError> {
    Ok(None)
}

/// Store a result in the cache. Phase 0 stub: no-op.
pub fn store(_cache_key: &str, _output: &serde_json::Value) -> Result<(), RunnerError> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_key_deterministic() {
        let k1 = compute_cache_key(
            "core/echo@1.0",
            &serde_json::json!({"msg": "hi"}),
            &serde_json::json!({}),
            None,
        );
        let k2 = compute_cache_key(
            "core/echo@1.0",
            &serde_json::json!({"msg": "hi"}),
            &serde_json::json!({}),
            None,
        );
        assert_eq!(k1, k2);
    }

    #[test]
    fn cache_key_differs_on_input_change() {
        let k1 = compute_cache_key(
            "core/echo@1.0",
            &serde_json::json!({"msg": "hi"}),
            &serde_json::json!({}),
            None,
        );
        let k2 = compute_cache_key(
            "core/echo@1.0",
            &serde_json::json!({"msg": "bye"}),
            &serde_json::json!({}),
            None,
        );
        assert_ne!(k1, k2);
    }

    #[test]
    fn in_memory_cache_roundtrip() {
        let cache = ExecutionCache::in_memory().unwrap();
        let key = "test-key-123";
        let output = serde_json::json!({"result": 42});

        // Initially empty
        assert!(cache.lookup(key).unwrap().is_none());

        // Store and retrieve
        cache.store(key, &output, None).unwrap();
        let retrieved = cache.lookup(key).unwrap();
        assert_eq!(retrieved, Some(output));
    }

    #[test]
    fn cache_with_ttl() {
        let cache = ExecutionCache::in_memory().unwrap();
        let key = "ttl-test";
        let output = serde_json::json!({"data": "test"});

        // Store with long TTL
        cache.store(key, &output, Some(3600)).unwrap();
        assert!(cache.lookup(key).unwrap().is_some());
    }
}
