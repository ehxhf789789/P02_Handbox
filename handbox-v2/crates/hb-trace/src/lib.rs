//! hb-trace: Evidence/Trace storage backed by SQLite.

pub mod export;
pub mod query;
pub mod store;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum TraceError {
    #[error("database error: {0}")]
    Database(String),
    #[error("span not found: {0}")]
    SpanNotFound(String),
    #[error("export error: {0}")]
    Export(String),
}
