//! Index/Store — document-to-vector indexing for tool and resource discovery.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// An index store provides document indexing and similarity search.
pub trait IndexStore: Send + Sync {
    /// Unique store identifier.
    fn id(&self) -> &str;

    /// Index a document with the given key and metadata.
    fn index(&mut self, key: &str, content: &str, metadata: Option<serde_json::Value>);

    /// Search for documents matching the query. Returns (key, score) pairs.
    fn search(&self, query: &str, limit: usize) -> Vec<(String, f64)>;

    /// Remove a document by key.
    fn remove(&mut self, key: &str) -> bool;

    /// Number of indexed documents.
    fn len(&self) -> usize;

    /// Whether the store is empty.
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// A simple in-memory index using keyword matching (TF-IDF-like scoring).
pub struct InMemoryIndex {
    store_id: String,
    documents: HashMap<String, IndexedDocument>,
}

#[derive(Clone, Serialize, Deserialize)]
struct IndexedDocument {
    content: String,
    tokens: Vec<String>,
    metadata: Option<serde_json::Value>,
}

impl InMemoryIndex {
    pub fn new(id: &str) -> Self {
        Self {
            store_id: id.to_string(),
            documents: HashMap::new(),
        }
    }

    fn tokenize(text: &str) -> Vec<String> {
        text.to_lowercase()
            .split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
            .filter(|s| s.len() > 1)
            .map(|s| s.to_string())
            .collect()
    }
}

impl IndexStore for InMemoryIndex {
    fn id(&self) -> &str {
        &self.store_id
    }

    fn index(&mut self, key: &str, content: &str, metadata: Option<serde_json::Value>) {
        let tokens = Self::tokenize(content);
        self.documents.insert(
            key.to_string(),
            IndexedDocument {
                content: content.to_string(),
                tokens,
                metadata,
            },
        );
    }

    fn search(&self, query: &str, limit: usize) -> Vec<(String, f64)> {
        let query_tokens = Self::tokenize(query);
        if query_tokens.is_empty() {
            return vec![];
        }

        let mut scores: Vec<(String, f64)> = self
            .documents
            .iter()
            .map(|(key, doc)| {
                let mut score = 0.0;
                for qt in &query_tokens {
                    let matches = doc.tokens.iter().filter(|t| t.contains(qt.as_str())).count();
                    if matches > 0 {
                        // TF-like score: matches / total tokens
                        score += matches as f64 / doc.tokens.len().max(1) as f64;
                    }
                }
                (key.clone(), score)
            })
            .filter(|(_, score)| *score > 0.0)
            .collect();

        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scores.truncate(limit);
        scores
    }

    fn remove(&mut self, key: &str) -> bool {
        self.documents.remove(key).is_some()
    }

    fn len(&self) -> usize {
        self.documents.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn index_and_search() {
        let mut idx = InMemoryIndex::new("test");
        idx.index("tool-1", "File reader for reading text files from disk", None);
        idx.index("tool-2", "HTTP client for making API requests", None);
        idx.index("tool-3", "Text file writer for saving output", None);

        let results = idx.search("file reader", 10);
        assert!(!results.is_empty());
        assert_eq!(results[0].0, "tool-1");
    }

    #[test]
    fn remove_document() {
        let mut idx = InMemoryIndex::new("test");
        idx.index("a", "hello world", None);
        assert_eq!(idx.len(), 1);
        assert!(idx.remove("a"));
        assert_eq!(idx.len(), 0);
        assert!(!idx.remove("a"));
    }

    #[test]
    fn search_empty_returns_empty() {
        let idx = InMemoryIndex::new("test");
        assert!(idx.search("anything", 5).is_empty());
    }

    #[test]
    fn search_no_match_returns_empty() {
        let mut idx = InMemoryIndex::new("test");
        idx.index("a", "hello world", None);
        assert!(idx.search("xyzzy", 5).is_empty());
    }
}
