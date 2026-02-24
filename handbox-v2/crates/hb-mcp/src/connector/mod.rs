//! Data connectors — adapters for various data sources.

/// Phase 0 stub: data connector trait.
pub trait DataConnector: Send + Sync {
    fn id(&self) -> &str;
    fn connect(&self) -> Result<(), String>;
}
