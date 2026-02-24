//! Cache — input-hash-based caching backed by SQLite.
//!
//! cache_key = hash(tool_ref + tool_version, sorted(input_values), config, data_source_version?)

use crate::RunnerError;
use sha2::{Digest, Sha256};

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
}
