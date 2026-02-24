//! Trace export — export traces to JSON or other formats.

use crate::TraceError;
use hb_core::trace::NodeSpan;

/// Export spans to a JSON string.
pub fn export_json(spans: &[NodeSpan]) -> Result<String, TraceError> {
    serde_json::to_string_pretty(spans).map_err(|e| TraceError::Export(e.to_string()))
}
