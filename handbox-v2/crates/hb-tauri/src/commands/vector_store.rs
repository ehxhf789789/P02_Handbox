//! Vector Store — Persistent vector database for RAG pipelines.
//!
//! Provides collection-based vector storage with cosine similarity search.
//! Collections are persisted to JSON files in the app data directory.
//! Designed for the agent tool pipeline: embed → store → search → rerank.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{command, State};
use tokio::sync::RwLock;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorEntry {
    pub id: String,
    pub vector: Vec<f32>,
    pub metadata: Value,
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorCollection {
    pub name: String,
    pub dimension: usize,
    pub entries: Vec<VectorEntry>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub score: f64,
    pub metadata: Value,
    pub text: Option<String>,
}

// ============================================================================
// State
// ============================================================================

pub struct VectorStoreState {
    pub collections: RwLock<HashMap<String, VectorCollection>>,
    /// Directory for persisting collections as JSON files.
    pub persist_dir: RwLock<Option<PathBuf>>,
}

impl Default for VectorStoreState {
    fn default() -> Self {
        Self {
            collections: RwLock::new(HashMap::new()),
            persist_dir: RwLock::new(None),
        }
    }
}

impl VectorStoreState {
    /// Create a VectorStoreState with persistence directory.
    /// Automatically loads existing collections from disk.
    pub fn with_persist_dir(dir: PathBuf) -> Self {
        let mut collections = HashMap::new();

        // Load existing collections from disk
        if dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "json").unwrap_or(false) {
                        match std::fs::read_to_string(&path) {
                            Ok(content) => {
                                match serde_json::from_str::<VectorCollection>(&content) {
                                    Ok(coll) => {
                                        tracing::info!(
                                            "Loaded vector collection '{}' ({} entries)",
                                            coll.name, coll.entries.len()
                                        );
                                        collections.insert(coll.name.clone(), coll);
                                    }
                                    Err(e) => {
                                        tracing::warn!("Failed to parse {:?}: {}", path, e);
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::warn!("Failed to read {:?}: {}", path, e);
                            }
                        }
                    }
                }
            }
        }

        Self {
            collections: RwLock::new(collections),
            persist_dir: RwLock::new(Some(dir)),
        }
    }

    /// Persist a single collection to disk.
    pub async fn persist_collection(&self, name: &str) -> Result<(), String> {
        let dir = self.persist_dir.read().await;
        let dir = match dir.as_ref() {
            Some(d) => d.clone(),
            None => return Ok(()), // No persistence configured
        };
        drop(dir); // Release read lock

        let dir = self.persist_dir.read().await;
        let dir = dir.as_ref().unwrap().clone();

        let collections = self.collections.read().await;
        let coll = collections.get(name)
            .ok_or_else(|| format!("Collection '{}' not found", name))?;

        // Ensure directory exists
        std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {e}"))?;

        let path = dir.join(format!("{}.json", sanitize_filename(name)));
        let content = serde_json::to_string(coll)
            .map_err(|e| format!("Failed to serialize: {e}"))?;
        std::fs::write(&path, content)
            .map_err(|e| format!("Failed to write: {e}"))?;

        Ok(())
    }

    /// Remove a collection's persistent file.
    pub async fn remove_persisted_collection(&self, name: &str) {
        let dir = self.persist_dir.read().await;
        if let Some(dir) = dir.as_ref() {
            let path = dir.join(format!("{}.json", sanitize_filename(name)));
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Sanitize collection name for use as a filename.
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

// ============================================================================
// Similarity Functions
// ============================================================================

fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let mut dot = 0.0f64;
    let mut norm_a = 0.0f64;
    let mut norm_b = 0.0f64;

    for i in 0..a.len() {
        let ai = a[i] as f64;
        let bi = b[i] as f64;
        dot += ai * bi;
        norm_a += ai * ai;
        norm_b += bi * bi;
    }

    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom < 1e-12 {
        0.0
    } else {
        dot / denom
    }
}

fn euclidean_distance(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() {
        return f64::MAX;
    }

    let mut sum = 0.0f64;
    for i in 0..a.len() {
        let diff = (a[i] as f64) - (b[i] as f64);
        sum += diff * diff;
    }
    sum.sqrt()
}

// ============================================================================
// Commands — Collection Management
// ============================================================================

/// Create a new vector collection
#[command]
pub async fn vector_create_collection(
    name: String,
    dimension: usize,
    state: State<'_, Arc<VectorStoreState>>,
) -> Result<Value, String> {
    let mut collections = state.collections.write().await;

    if collections.contains_key(&name) {
        return Err(format!("Collection '{}' already exists", name));
    }

    collections.insert(name.clone(), VectorCollection {
        name: name.clone(),
        dimension,
        entries: Vec::new(),
        created_at: chrono::Utc::now().to_rfc3339(),
    });
    drop(collections);

    // Persist to disk
    let _ = state.persist_collection(&name).await;

    Ok(json!({
        "success": true,
        "collection": name,
        "dimension": dimension,
        "text": format!("Created collection '{}' with dimension {}", name, dimension)
    }))
}

/// List all collections
#[command]
pub async fn vector_list_collections(
    state: State<'_, Arc<VectorStoreState>>,
) -> Result<Value, String> {
    let collections = state.collections.read().await;

    let list: Vec<Value> = collections.values().map(|c| json!({
        "name": c.name,
        "dimension": c.dimension,
        "count": c.entries.len(),
        "created_at": c.created_at,
    })).collect();

    Ok(json!({
        "collections": list,
        "total": list.len(),
        "text": format!("{} collections", list.len())
    }))
}

/// Delete a collection
#[command]
pub async fn vector_delete_collection(
    name: String,
    state: State<'_, Arc<VectorStoreState>>,
) -> Result<Value, String> {
    let mut collections = state.collections.write().await;
    let removed = collections.remove(&name).is_some();
    drop(collections);

    if removed {
        state.remove_persisted_collection(&name).await;
    }

    Ok(json!({
        "success": removed,
        "text": if removed {
            format!("Deleted collection '{}'", name)
        } else {
            format!("Collection '{}' not found", name)
        }
    }))
}

// ============================================================================
// Commands — Vector Operations
// ============================================================================

/// Store vectors in a collection (upsert by id)
#[command]
pub async fn vector_store(
    collection: String,
    entries: Vec<VectorEntry>,
    state: State<'_, Arc<VectorStoreState>>,
) -> Result<Value, String> {
    let (inserted, updated, total) = {
        let mut collections = state.collections.write().await;

        let coll = collections.get_mut(&collection)
            .ok_or_else(|| format!("Collection '{}' not found", collection))?;

        let mut inserted = 0usize;
        let mut updated = 0usize;

        for entry in entries {
            // Validate dimension
            if entry.vector.len() != coll.dimension {
                return Err(format!(
                    "Vector dimension mismatch: expected {}, got {} for entry '{}'",
                    coll.dimension, entry.vector.len(), entry.id
                ));
            }

            // Upsert: update if exists, insert if not
            if let Some(existing) = coll.entries.iter_mut().find(|e| e.id == entry.id) {
                existing.vector = entry.vector;
                existing.metadata = entry.metadata;
                existing.text = entry.text;
                updated += 1;
            } else {
                coll.entries.push(entry);
                inserted += 1;
            }
        }

        (inserted, updated, coll.entries.len())
    };

    // Persist to disk
    let _ = state.persist_collection(&collection).await;

    Ok(json!({
        "success": true,
        "collection": collection,
        "inserted": inserted,
        "updated": updated,
        "total_entries": total,
        "text": format!("Stored {} vectors ({} new, {} updated) in '{}'. Total: {}",
            inserted + updated, inserted, updated, collection, total)
    }))
}

/// Search vectors by cosine similarity
#[command]
pub async fn vector_search(
    collection: String,
    query_vector: Vec<f32>,
    top_k: Option<usize>,
    min_score: Option<f64>,
    filter: Option<HashMap<String, Value>>,
    metric: Option<String>,
    state: State<'_, Arc<VectorStoreState>>,
) -> Result<Value, String> {
    let collections = state.collections.read().await;

    let coll = collections.get(&collection)
        .ok_or_else(|| format!("Collection '{}' not found", collection))?;

    if query_vector.len() != coll.dimension {
        return Err(format!(
            "Query vector dimension mismatch: expected {}, got {}",
            coll.dimension, query_vector.len()
        ));
    }

    let k = top_k.unwrap_or(5).min(100);
    let threshold = min_score.unwrap_or(0.0);
    let use_euclidean = metric.as_deref() == Some("euclidean");

    // Score all entries
    let mut scored: Vec<(usize, f64)> = coll.entries.iter().enumerate()
        .filter(|(_, entry)| {
            // Apply metadata filter if provided
            if let Some(ref filter_map) = filter {
                for (key, expected) in filter_map {
                    let actual = entry.metadata.get(key);
                    if actual != Some(expected) {
                        return false;
                    }
                }
            }
            true
        })
        .map(|(idx, entry)| {
            let score = if use_euclidean {
                // Convert distance to similarity score (1 / (1 + distance))
                1.0 / (1.0 + euclidean_distance(&query_vector, &entry.vector))
            } else {
                cosine_similarity(&query_vector, &entry.vector)
            };
            (idx, score)
        })
        .filter(|(_, score)| *score >= threshold)
        .collect();

    // Sort by score descending
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(k);

    let results: Vec<SearchResult> = scored.iter().map(|(idx, score)| {
        let entry = &coll.entries[*idx];
        SearchResult {
            id: entry.id.clone(),
            score: *score,
            metadata: entry.metadata.clone(),
            text: entry.text.clone(),
        }
    }).collect();

    let result_texts: Vec<String> = results.iter().map(|r| {
        format!("- [{}] score={:.4} | {}", r.id,  r.score,
            r.text.as_deref().unwrap_or("(no text)").chars().take(100).collect::<String>())
    }).collect();

    Ok(json!({
        "results": results,
        "total_searched": coll.entries.len(),
        "returned": results.len(),
        "text": format!("Found {} results from {} vectors in '{}':\n{}",
            results.len(), coll.entries.len(), collection, result_texts.join("\n"))
    }))
}

/// Get collection info
#[command]
pub async fn vector_collection_info(
    name: String,
    state: State<'_, Arc<VectorStoreState>>,
) -> Result<Value, String> {
    let collections = state.collections.read().await;

    let coll = collections.get(&name)
        .ok_or_else(|| format!("Collection '{}' not found", name))?;

    Ok(json!({
        "name": coll.name,
        "dimension": coll.dimension,
        "count": coll.entries.len(),
        "created_at": coll.created_at,
        "text": format!("Collection '{}': {} vectors, dim={}", coll.name, coll.entries.len(), coll.dimension)
    }))
}

/// Delete specific vectors from a collection
#[command]
pub async fn vector_delete(
    collection: String,
    ids: Vec<String>,
    state: State<'_, Arc<VectorStoreState>>,
) -> Result<Value, String> {
    let (deleted, remaining) = {
        let mut collections = state.collections.write().await;

        let coll = collections.get_mut(&collection)
            .ok_or_else(|| format!("Collection '{}' not found", collection))?;

        let before = coll.entries.len();
        coll.entries.retain(|e| !ids.contains(&e.id));
        (before - coll.entries.len(), coll.entries.len())
    };

    // Persist to disk
    let _ = state.persist_collection(&collection).await;

    Ok(json!({
        "success": true,
        "deleted": deleted,
        "remaining": remaining,
        "text": format!("Deleted {} vectors from '{}'. Remaining: {}", deleted, collection, remaining)
    }))
}

// ============================================================================
// Non-Tauri helper — for dispatch_tool usage (no State parameter)
// ============================================================================

/// Store vectors — callable from dispatch_tool
pub async fn vector_store_raw(
    collection: &str,
    entries: Vec<VectorEntry>,
    store: &Arc<VectorStoreState>,
) -> Result<Value, String> {
    let (inserted, updated, total) = {
        let mut collections = store.collections.write().await;

        // Auto-create collection if it doesn't exist
        let dim = entries.first().map(|e| e.vector.len()).unwrap_or(0);
        let coll = collections.entry(collection.to_string()).or_insert_with(|| {
            VectorCollection {
                name: collection.to_string(),
                dimension: dim,
                entries: Vec::new(),
                created_at: chrono::Utc::now().to_rfc3339(),
            }
        });

        let mut inserted = 0usize;
        let mut updated = 0usize;

        for entry in entries {
            if !entry.vector.is_empty() && entry.vector.len() != coll.dimension {
                if coll.entries.is_empty() {
                    coll.dimension = entry.vector.len();
                } else {
                    return Err(format!(
                        "Dimension mismatch: collection '{}' has dim={}, entry '{}' has dim={}",
                        collection, coll.dimension, entry.id, entry.vector.len()
                    ));
                }
            }

            if let Some(existing) = coll.entries.iter_mut().find(|e| e.id == entry.id) {
                existing.vector = entry.vector;
                existing.metadata = entry.metadata;
                existing.text = entry.text;
                updated += 1;
            } else {
                coll.entries.push(entry);
                inserted += 1;
            }
        }

        (inserted, updated, coll.entries.len())
    };

    // Persist to disk
    let _ = store.persist_collection(collection).await;

    Ok(json!({
        "success": true,
        "collection": collection,
        "inserted": inserted,
        "updated": updated,
        "total": total,
        "text": format!("Stored {} vectors in '{}' (total: {})", inserted + updated, collection, total)
    }))
}

/// Search vectors — callable from dispatch_tool
pub async fn vector_search_raw(
    collection: &str,
    query_vector: &[f32],
    top_k: usize,
    min_score: f64,
    store: &Arc<VectorStoreState>,
) -> Result<Value, String> {
    let collections = store.collections.read().await;

    let coll = collections.get(collection)
        .ok_or_else(|| format!("Collection '{}' not found", collection))?;

    if query_vector.len() != coll.dimension {
        return Err(format!(
            "Query dimension mismatch: expected {}, got {}",
            coll.dimension, query_vector.len()
        ));
    }

    let mut scored: Vec<(usize, f64)> = coll.entries.iter().enumerate()
        .map(|(idx, entry)| {
            let score = cosine_similarity(query_vector, &entry.vector);
            (idx, score)
        })
        .filter(|(_, score)| *score >= min_score)
        .collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);

    let results: Vec<SearchResult> = scored.iter().map(|(idx, score)| {
        let entry = &coll.entries[*idx];
        SearchResult {
            id: entry.id.clone(),
            score: *score,
            metadata: entry.metadata.clone(),
            text: entry.text.clone(),
        }
    }).collect();

    let result_texts: Vec<String> = results.iter().map(|r| {
        format!("[{}] score={:.4}: {}", r.id, r.score,
            r.text.as_deref().unwrap_or("").chars().take(200).collect::<String>())
    }).collect();

    Ok(json!({
        "results": results,
        "count": results.len(),
        "text": format!("Top {} results from '{}':\n{}", results.len(), collection, result_texts.join("\n"))
    }))
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        let sim = cosine_similarity(&a, &b);
        assert!(sim.abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_opposite() {
        let a = vec![1.0, 0.0];
        let b = vec![-1.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim - (-1.0)).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_empty() {
        let a: Vec<f32> = vec![];
        let b: Vec<f32> = vec![];
        assert_eq!(cosine_similarity(&a, &b), 0.0);
    }

    #[test]
    fn test_euclidean_distance() {
        let a = vec![0.0, 0.0];
        let b = vec![3.0, 4.0];
        let dist = euclidean_distance(&a, &b);
        assert!((dist - 5.0).abs() < 1e-6);
    }

    #[tokio::test]
    async fn test_vector_store_and_search() {
        let store = Arc::new(VectorStoreState::default());

        // Store vectors
        let entries = vec![
            VectorEntry {
                id: "doc1".to_string(),
                vector: vec![1.0, 0.0, 0.0],
                metadata: json!({"source": "file1.txt"}),
                text: Some("Hello world".to_string()),
            },
            VectorEntry {
                id: "doc2".to_string(),
                vector: vec![0.0, 1.0, 0.0],
                metadata: json!({"source": "file2.txt"}),
                text: Some("Goodbye world".to_string()),
            },
            VectorEntry {
                id: "doc3".to_string(),
                vector: vec![0.9, 0.1, 0.0],
                metadata: json!({"source": "file3.txt"}),
                text: Some("Hi there".to_string()),
            },
        ];

        let result = vector_store_raw("test", entries, &store).await.unwrap();
        assert_eq!(result["inserted"].as_u64(), Some(3));

        // Search — query close to doc1 and doc3
        let query = vec![1.0, 0.0, 0.0];
        let result = vector_search_raw("test", &query, 2, 0.0, &store).await.unwrap();
        let results = result["results"].as_array().unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0]["id"].as_str(), Some("doc1"));
        assert_eq!(results[1]["id"].as_str(), Some("doc3"));
    }

    #[tokio::test]
    async fn test_vector_upsert() {
        let store = Arc::new(VectorStoreState::default());

        // Initial insert
        let entries = vec![VectorEntry {
            id: "doc1".to_string(),
            vector: vec![1.0, 0.0],
            metadata: json!({"v": 1}),
            text: Some("version 1".to_string()),
        }];
        vector_store_raw("test", entries, &store).await.unwrap();

        // Update
        let entries = vec![VectorEntry {
            id: "doc1".to_string(),
            vector: vec![0.0, 1.0],
            metadata: json!({"v": 2}),
            text: Some("version 2".to_string()),
        }];
        let result = vector_store_raw("test", entries, &store).await.unwrap();
        assert_eq!(result["updated"].as_u64(), Some(1));
        assert_eq!(result["total"].as_u64(), Some(1));
    }
}
