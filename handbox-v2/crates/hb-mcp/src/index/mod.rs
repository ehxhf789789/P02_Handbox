//! Index/Store — document-to-vector indexing.

/// Phase 0 stub: index store trait.
pub trait IndexStore: Send + Sync {
    fn id(&self) -> &str;
}
