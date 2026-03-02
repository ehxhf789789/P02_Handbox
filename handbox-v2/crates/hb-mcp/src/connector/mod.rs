//! Data connectors — adapters for external data sources.
//!
//! Connectors provide a uniform interface for reading data from various sources
//! (files, databases, REST APIs) and converting them into tool-compatible formats.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A data connector provides access to an external data source.
pub trait DataConnector: Send + Sync {
    /// Unique connector ID (e.g., "file", "postgres", "rest-api").
    fn id(&self) -> &str;

    /// Human-readable name.
    fn name(&self) -> &str;

    /// Connect to the data source. Returns Ok(()) on success.
    fn connect(&mut self) -> Result<(), ConnectorError>;

    /// Disconnect from the data source.
    fn disconnect(&mut self) -> Result<(), ConnectorError>;

    /// Check if the connector is currently connected.
    fn is_connected(&self) -> bool;

    /// Read data from the source. Returns rows as JSON values.
    fn read(&self, query: &DataQuery) -> Result<DataResult, ConnectorError>;

    /// Get the schema/structure of the data source.
    fn schema(&self) -> Result<DataSchema, ConnectorError>;
}

/// Error type for connector operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for ConnectorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for ConnectorError {}

impl ConnectorError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

/// A query against a data source.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataQuery {
    /// Resource path (e.g., table name, file path, API endpoint).
    pub resource: String,
    /// Optional filter expression.
    #[serde(default)]
    pub filter: Option<String>,
    /// Maximum number of results.
    #[serde(default)]
    pub limit: Option<usize>,
    /// Offset for pagination.
    #[serde(default)]
    pub offset: Option<usize>,
    /// Additional query-specific parameters.
    #[serde(default)]
    pub params: HashMap<String, serde_json::Value>,
}

/// Result of a data query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataResult {
    /// Rows of data.
    pub rows: Vec<serde_json::Value>,
    /// Total count (if available).
    pub total_count: Option<usize>,
    /// Whether more results are available.
    pub has_more: bool,
}

/// Schema description of a data source.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSchema {
    /// Available resources (tables, endpoints, etc.)
    pub resources: Vec<ResourceSchema>,
}

/// Schema of a single resource.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceSchema {
    pub name: String,
    pub description: Option<String>,
    pub fields: Vec<FieldSchema>,
}

/// Schema of a single field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldSchema {
    pub name: String,
    pub field_type: String,
    pub nullable: bool,
    pub description: Option<String>,
}

// ============================================================================
// Built-in connectors
// ============================================================================

/// File system connector — reads JSON, CSV, and text files.
pub struct FileConnector {
    base_path: String,
    connected: bool,
}

impl FileConnector {
    pub fn new(base_path: &str) -> Self {
        Self {
            base_path: base_path.to_string(),
            connected: false,
        }
    }
}

impl DataConnector for FileConnector {
    fn id(&self) -> &str {
        "file"
    }

    fn name(&self) -> &str {
        "File System"
    }

    fn connect(&mut self) -> Result<(), ConnectorError> {
        if std::path::Path::new(&self.base_path).exists() {
            self.connected = true;
            Ok(())
        } else {
            Err(ConnectorError::new(
                "PATH_NOT_FOUND",
                format!("Base path does not exist: {}", self.base_path),
            ))
        }
    }

    fn disconnect(&mut self) -> Result<(), ConnectorError> {
        self.connected = false;
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected
    }

    fn read(&self, query: &DataQuery) -> Result<DataResult, ConnectorError> {
        if !self.connected {
            return Err(ConnectorError::new("NOT_CONNECTED", "Connector not connected"));
        }

        let path = std::path::Path::new(&self.base_path).join(&query.resource);
        let content = std::fs::read_to_string(&path).map_err(|e| {
            ConnectorError::new("READ_ERROR", format!("Failed to read {}: {e}", path.display()))
        })?;

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        let rows = match ext {
            "json" => {
                let value: serde_json::Value = serde_json::from_str(&content).map_err(|e| {
                    ConnectorError::new("PARSE_ERROR", format!("Invalid JSON: {e}"))
                })?;
                match value {
                    serde_json::Value::Array(arr) => arr,
                    other => vec![other],
                }
            }
            "csv" => {
                let mut rows = Vec::new();
                let mut lines = content.lines();
                let headers: Vec<&str> = lines
                    .next()
                    .map(|h| h.split(',').map(|s| s.trim()).collect())
                    .unwrap_or_default();

                for line in lines {
                    let values: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
                    let mut row = serde_json::Map::new();
                    for (i, header) in headers.iter().enumerate() {
                        let val = values.get(i).copied().unwrap_or("");
                        row.insert(header.to_string(), serde_json::Value::String(val.to_string()));
                    }
                    rows.push(serde_json::Value::Object(row));
                }
                rows
            }
            _ => {
                // Plain text — return as single row
                vec![serde_json::json!({ "content": content, "path": query.resource })]
            }
        };

        let total = rows.len();
        let offset = query.offset.unwrap_or(0);
        let limit = query.limit.unwrap_or(rows.len());
        let sliced: Vec<_> = rows.into_iter().skip(offset).take(limit).collect();
        let has_more = offset + sliced.len() < total;

        Ok(DataResult {
            rows: sliced,
            total_count: Some(total),
            has_more,
        })
    }

    fn schema(&self) -> Result<DataSchema, ConnectorError> {
        if !self.connected {
            return Err(ConnectorError::new("NOT_CONNECTED", "Connector not connected"));
        }

        // List files in base_path as resources
        let entries = std::fs::read_dir(&self.base_path).map_err(|e| {
            ConnectorError::new("READ_ERROR", format!("Failed to read directory: {e}"))
        })?;

        let resources: Vec<ResourceSchema> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
            .map(|e| ResourceSchema {
                name: e.file_name().to_string_lossy().to_string(),
                description: Some(format!("{} bytes", e.metadata().map(|m| m.len()).unwrap_or(0))),
                fields: vec![],
            })
            .collect();

        Ok(DataSchema { resources })
    }
}

/// REST API connector — reads data from HTTP endpoints.
pub struct RestApiConnector {
    base_url: String,
    headers: HashMap<String, String>,
    connected: bool,
}

impl RestApiConnector {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.to_string(),
            headers: HashMap::new(),
            connected: false,
        }
    }

    pub fn with_header(mut self, key: &str, value: &str) -> Self {
        self.headers.insert(key.to_string(), value.to_string());
        self
    }
}

impl DataConnector for RestApiConnector {
    fn id(&self) -> &str {
        "rest-api"
    }

    fn name(&self) -> &str {
        "REST API"
    }

    fn connect(&mut self) -> Result<(), ConnectorError> {
        // REST APIs are stateless — just validate the URL
        if self.base_url.starts_with("http://") || self.base_url.starts_with("https://") {
            self.connected = true;
            Ok(())
        } else {
            Err(ConnectorError::new(
                "INVALID_URL",
                format!("Invalid URL: {}", self.base_url),
            ))
        }
    }

    fn disconnect(&mut self) -> Result<(), ConnectorError> {
        self.connected = false;
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected
    }

    fn read(&self, query: &DataQuery) -> Result<DataResult, ConnectorError> {
        if !self.connected {
            return Err(ConnectorError::new("NOT_CONNECTED", "Connector not connected"));
        }

        // Build URL
        let url = if query.resource.starts_with("http") {
            query.resource.clone()
        } else {
            format!("{}/{}", self.base_url.trim_end_matches('/'), query.resource.trim_start_matches('/'))
        };

        // Use async reqwest within sync trait via tokio block_in_place
        let headers = self.headers.clone();
        let body: serde_json::Value = tokio::task::block_in_place(|| {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(async {
                let client = reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(30))
                    .build()
                    .map_err(|e| ConnectorError::new("HTTP_ERROR", format!("Client error: {e}")))?;

                let mut req = client.get(&url);
                for (k, v) in &headers {
                    req = req.header(k, v);
                }

                let response = req.send().await.map_err(|e| {
                    ConnectorError::new("HTTP_ERROR", format!("Request failed: {e}"))
                })?;

                if !response.status().is_success() {
                    return Err(ConnectorError::new(
                        "HTTP_ERROR",
                        format!("HTTP {}: {}", response.status(), url),
                    ));
                }

                response.json::<serde_json::Value>().await.map_err(|e| {
                    ConnectorError::new("PARSE_ERROR", format!("Invalid JSON response: {e}"))
                })
            })
        })?;

        let rows = match body {
            serde_json::Value::Array(arr) => arr,
            other => vec![other],
        };

        let total = rows.len();
        let offset = query.offset.unwrap_or(0);
        let limit = query.limit.unwrap_or(rows.len());
        let sliced: Vec<_> = rows.into_iter().skip(offset).take(limit).collect();

        Ok(DataResult {
            rows: sliced,
            total_count: Some(total),
            has_more: offset + limit < total,
        })
    }

    fn schema(&self) -> Result<DataSchema, ConnectorError> {
        Ok(DataSchema { resources: vec![] })
    }
}

/// Registry of available connectors.
pub struct ConnectorRegistry {
    connectors: HashMap<String, Box<dyn DataConnector>>,
}

impl Default for ConnectorRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ConnectorRegistry {
    pub fn new() -> Self {
        Self {
            connectors: HashMap::new(),
        }
    }

    pub fn register(&mut self, connector: Box<dyn DataConnector>) {
        let id = connector.id().to_string();
        self.connectors.insert(id, connector);
    }

    pub fn get(&self, id: &str) -> Option<&dyn DataConnector> {
        self.connectors.get(id).map(|c| c.as_ref())
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut (dyn DataConnector + 'static)> {
        self.connectors.get_mut(id).map(|c| &mut **c)
    }

    pub fn list(&self) -> Vec<&str> {
        self.connectors.keys().map(|k| k.as_str()).collect()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_connector_connect_valid_path() {
        let mut conn = FileConnector::new(".");
        assert!(!conn.is_connected());
        assert!(conn.connect().is_ok());
        assert!(conn.is_connected());
        assert!(conn.disconnect().is_ok());
        assert!(!conn.is_connected());
    }

    #[test]
    fn file_connector_connect_invalid_path() {
        let mut conn = FileConnector::new("/nonexistent/path/12345");
        assert!(conn.connect().is_err());
    }

    #[test]
    fn rest_api_connector_valid_url() {
        let mut conn = RestApiConnector::new("https://api.example.com");
        assert!(conn.connect().is_ok());
        assert!(conn.is_connected());
    }

    #[test]
    fn rest_api_connector_invalid_url() {
        let mut conn = RestApiConnector::new("not-a-url");
        assert!(conn.connect().is_err());
    }

    #[test]
    fn connector_registry() {
        let mut registry = ConnectorRegistry::new();
        registry.register(Box::new(FileConnector::new(".")));
        registry.register(Box::new(RestApiConnector::new("https://example.com")));
        assert_eq!(registry.list().len(), 2);
        assert!(registry.get("file").is_some());
        assert!(registry.get("rest-api").is_some());
        assert!(registry.get("unknown").is_none());
    }
}
