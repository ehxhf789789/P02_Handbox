//! Trace query API — look up spans by execution, node, status, etc.

use crate::store::TraceStore;
use crate::TraceError;
use uuid::Uuid;

/// Query parameters for trace lookup.
#[derive(Debug, Default)]
pub struct TraceQuery {
    pub execution_id: Option<Uuid>,
    pub node_id: Option<String>,
    pub status: Option<String>,
    pub limit: Option<u32>,
}

/// Execute a trace query against a TraceStore.
pub fn query_spans(
    store: &TraceStore,
    query: &TraceQuery,
) -> Result<Vec<hb_core::trace::NodeSpan>, TraceError> {
    // If execution_id is provided, use the optimized store method
    if let Some(exec_id) = query.execution_id {
        let mut spans = store.query_spans_by_execution(exec_id)?;

        // Filter by node_id if specified
        if let Some(ref node_id) = query.node_id {
            spans.retain(|s| s.node_id == *node_id);
        }

        // Filter by status if specified
        if let Some(ref status) = query.status {
            spans.retain(|s| {
                let status_str = serde_json::to_string(&s.status).unwrap_or_default();
                status_str.trim_matches('"') == *status
            });
        }

        // Apply limit
        if let Some(limit) = query.limit {
            spans.truncate(limit as usize);
        }

        return Ok(spans);
    }

    // Without execution_id, return empty (full table scan would need a dedicated store method)
    Ok(vec![])
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use hb_core::trace::{ExecutionEnvironment, ExecutionStatus, NodeSpan};

    fn sample_span(exec_id: Uuid, node_id: &str, status: ExecutionStatus) -> NodeSpan {
        NodeSpan {
            span_id: Uuid::new_v4(),
            execution_id: exec_id,
            node_id: node_id.into(),
            tool_ref: "test/tool@1.0".into(),
            input_json: serde_json::json!({}),
            output_json: Some(serde_json::json!({"ok": true})),
            config_json: serde_json::json!({}),
            started_at: Utc::now(),
            completed_at: Some(Utc::now()),
            duration_ms: Some(10),
            status,
            error: None,
            cache_hit: false,
            environment: ExecutionEnvironment {
                platform_version: "0.1.0".into(),
                os: "test".into(),
                tool_version: "1.0.0".into(),
                extra: Default::default(),
            },
        }
    }

    #[test]
    fn query_by_execution_id() {
        let store = TraceStore::in_memory().unwrap();
        let exec_id = Uuid::new_v4();

        store.insert_span(&sample_span(exec_id, "n1", ExecutionStatus::Completed)).unwrap();
        store.insert_span(&sample_span(exec_id, "n2", ExecutionStatus::Failed)).unwrap();
        store.insert_span(&sample_span(Uuid::new_v4(), "n3", ExecutionStatus::Completed)).unwrap();

        let results = query_spans(&store, &TraceQuery {
            execution_id: Some(exec_id),
            ..Default::default()
        }).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn query_filter_by_node_id() {
        let store = TraceStore::in_memory().unwrap();
        let exec_id = Uuid::new_v4();

        store.insert_span(&sample_span(exec_id, "n1", ExecutionStatus::Completed)).unwrap();
        store.insert_span(&sample_span(exec_id, "n2", ExecutionStatus::Completed)).unwrap();

        let results = query_spans(&store, &TraceQuery {
            execution_id: Some(exec_id),
            node_id: Some("n1".into()),
            ..Default::default()
        }).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].node_id, "n1");
    }

    #[test]
    fn query_with_limit() {
        let store = TraceStore::in_memory().unwrap();
        let exec_id = Uuid::new_v4();

        for i in 0..5 {
            store.insert_span(&sample_span(exec_id, &format!("n{i}"), ExecutionStatus::Completed)).unwrap();
        }

        let results = query_spans(&store, &TraceQuery {
            execution_id: Some(exec_id),
            limit: Some(2),
            ..Default::default()
        }).unwrap();
        assert_eq!(results.len(), 2);
    }
}
