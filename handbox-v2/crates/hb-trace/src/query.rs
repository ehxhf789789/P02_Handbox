//! Trace query API — look up spans by execution, node, status, etc.

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

/// Execute a trace query. Phase 0 stub.
pub fn query_spans(_query: &TraceQuery) -> Result<Vec<hb_core::trace::NodeSpan>, TraceError> {
    // Phase 1 will implement full SQLite query.
    Ok(vec![])
}
