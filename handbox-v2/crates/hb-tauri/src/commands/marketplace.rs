//! Marketplace commands — Workflow marketplace backend.
//!
//! Provides workflow sharing, discovery, and community features.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

// ========== Types ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkflowCategory {
    AiAssistant,
    DataProcessing,
    Document,
    Automation,
    Integration,
    Analysis,
    Creative,
    Developer,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowAuthor {
    pub id: String,
    pub name: String,
    pub is_verified: bool,
    pub published_count: usize,
    pub total_downloads: usize,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceWorkflow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: WorkflowAuthor,
    pub version: String,
    pub category: WorkflowCategory,
    pub tags: Vec<String>,
    pub downloads: usize,
    pub likes: usize,
    pub rating: f64,
    pub rating_count: usize,
    pub node_count: usize,
    pub estimated_runtime: String,
    pub required_tools: Vec<String>,
    pub required_providers: Vec<String>,
    pub published_at: String,
    pub updated_at: String,
    pub workflow_data: String,
    pub is_verified: bool,
    pub is_featured: bool,
    pub is_official: bool,
    pub license: String,
    pub preview_images: Vec<String>,
    pub readme: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowReview {
    pub id: String,
    pub workflow_id: String,
    pub author: WorkflowAuthor,
    pub rating: u8,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
    pub helpful_count: usize,
    pub is_verified_purchase: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowCollection {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: String,
    pub workflow_ids: Vec<String>,
    pub is_public: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortBy {
    Popular,
    Downloads,
    Rating,
    Recent,
    Trending,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceFilters {
    pub query: Option<String>,
    pub category: Option<WorkflowCategory>,
    pub tags: Option<Vec<String>>,
    pub author_id: Option<String>,
    pub min_rating: Option<f64>,
    pub is_verified: Option<bool>,
    pub is_official: Option<bool>,
    pub sort_by: SortBy,
    pub sort_order: SortOrder,
    pub page: usize,
    pub page_size: usize,
}

impl Default for MarketplaceFilters {
    fn default() -> Self {
        Self {
            query: None,
            category: None,
            tags: None,
            author_id: None,
            min_rating: None,
            is_verified: None,
            is_official: None,
            sort_by: SortBy::Popular,
            sort_order: SortOrder::Desc,
            page: 1,
            page_size: 20,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub workflows: Vec<MarketplaceWorkflow>,
    pub total: usize,
    pub page: usize,
    pub page_size: usize,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryInfo {
    pub id: WorkflowCategory,
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishRequest {
    pub name: String,
    pub description: String,
    pub category: WorkflowCategory,
    pub tags: Vec<String>,
    pub workflow_data: String,
    pub license: String,
    pub readme: Option<String>,
    pub preview_images: Vec<String>,
}

// ========== State ==========

pub struct MarketplaceState {
    workflows: RwLock<HashMap<String, MarketplaceWorkflow>>,
    reviews: RwLock<HashMap<String, Vec<WorkflowReview>>>,
    collections: RwLock<HashMap<String, WorkflowCollection>>,
    user_downloads: RwLock<HashMap<String, Vec<String>>>,
    user_likes: RwLock<HashMap<String, Vec<String>>>,
}

impl Default for MarketplaceState {
    fn default() -> Self {
        let mut workflows = HashMap::new();

        // Add featured workflows (demo data)
        let featured = vec![
            MarketplaceWorkflow {
                id: "wf-001".to_string(),
                name: "AI Document Summarizer".to_string(),
                description: "Automatically summarize long documents using GPT-4. Supports PDF, DOCX, and TXT files.".to_string(),
                author: WorkflowAuthor {
                    id: "user-001".to_string(),
                    name: "Handbox Team".to_string(),
                    is_verified: true,
                    published_count: 15,
                    total_downloads: 50000,
                    avatar_url: None,
                },
                version: "2.1.0".to_string(),
                category: WorkflowCategory::Document,
                tags: vec!["ai".to_string(), "summarization".to_string(), "document".to_string(), "gpt-4".to_string()],
                downloads: 12500,
                likes: 890,
                rating: 4.8,
                rating_count: 234,
                node_count: 8,
                estimated_runtime: "30s".to_string(),
                required_tools: vec!["llm_completion".to_string(), "file_read".to_string(), "text_split".to_string()],
                required_providers: vec!["openai".to_string()],
                published_at: "2024-01-15T10:00:00Z".to_string(),
                updated_at: "2024-02-20T15:30:00Z".to_string(),
                workflow_data: "{}".to_string(),
                is_verified: true,
                is_featured: true,
                is_official: true,
                license: "mit".to_string(),
                preview_images: vec![],
                readme: Some("# AI Document Summarizer\n\nAutomatically summarize documents.".to_string()),
            },
            MarketplaceWorkflow {
                id: "wf-002".to_string(),
                name: "Data Pipeline Builder".to_string(),
                description: "ETL workflow for processing and transforming CSV data with validation and error handling.".to_string(),
                author: WorkflowAuthor {
                    id: "user-002".to_string(),
                    name: "DataFlow Pro".to_string(),
                    is_verified: true,
                    published_count: 8,
                    total_downloads: 25000,
                    avatar_url: None,
                },
                version: "1.5.0".to_string(),
                category: WorkflowCategory::DataProcessing,
                tags: vec!["etl".to_string(), "csv".to_string(), "data".to_string(), "pipeline".to_string()],
                downloads: 8900,
                likes: 456,
                rating: 4.6,
                rating_count: 156,
                node_count: 12,
                estimated_runtime: "1m".to_string(),
                required_tools: vec!["file_read".to_string(), "json_parse".to_string(), "text_split".to_string()],
                required_providers: vec![],
                published_at: "2024-02-01T08:00:00Z".to_string(),
                updated_at: "2024-03-10T12:00:00Z".to_string(),
                workflow_data: "{}".to_string(),
                is_verified: true,
                is_featured: true,
                is_official: false,
                license: "apache-2.0".to_string(),
                preview_images: vec![],
                readme: None,
            },
            MarketplaceWorkflow {
                id: "wf-003".to_string(),
                name: "Multi-Modal Content Generator".to_string(),
                description: "Generate blog posts with AI-created images and SEO optimization.".to_string(),
                author: WorkflowAuthor {
                    id: "user-003".to_string(),
                    name: "ContentAI".to_string(),
                    is_verified: true,
                    published_count: 5,
                    total_downloads: 18000,
                    avatar_url: None,
                },
                version: "3.0.0".to_string(),
                category: WorkflowCategory::Creative,
                tags: vec!["content".to_string(), "ai".to_string(), "images".to_string(), "seo".to_string(), "blog".to_string()],
                downloads: 6700,
                likes: 789,
                rating: 4.9,
                rating_count: 312,
                node_count: 15,
                estimated_runtime: "2m".to_string(),
                required_tools: vec!["llm_completion".to_string(), "image_generate".to_string(), "web_search".to_string()],
                required_providers: vec!["openai".to_string(), "stability".to_string()],
                published_at: "2024-01-20T14:00:00Z".to_string(),
                updated_at: "2024-03-15T09:00:00Z".to_string(),
                workflow_data: "{}".to_string(),
                is_verified: true,
                is_featured: true,
                is_official: false,
                license: "cc-by-4.0".to_string(),
                preview_images: vec![],
                readme: None,
            },
        ];

        for wf in featured {
            workflows.insert(wf.id.clone(), wf);
        }

        Self {
            workflows: RwLock::new(workflows),
            reviews: RwLock::new(HashMap::new()),
            collections: RwLock::new(HashMap::new()),
            user_downloads: RwLock::new(HashMap::new()),
            user_likes: RwLock::new(HashMap::new()),
        }
    }
}

// ========== Commands ==========

/// Search workflows
#[tauri::command]
pub async fn marketplace_search(
    filters: MarketplaceFilters,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<SearchResult, String> {
    let workflows = state.workflows.read().await;
    let mut results: Vec<MarketplaceWorkflow> = workflows.values().cloned().collect();

    // Apply filters
    if let Some(ref query) = filters.query {
        let query_lower = query.to_lowercase();
        results.retain(|w| {
            w.name.to_lowercase().contains(&query_lower)
                || w.description.to_lowercase().contains(&query_lower)
                || w.tags.iter().any(|t| t.to_lowercase().contains(&query_lower))
        });
    }

    if let Some(ref category) = filters.category {
        results.retain(|w| std::mem::discriminant(&w.category) == std::mem::discriminant(category));
    }

    if let Some(ref tags) = filters.tags {
        results.retain(|w| tags.iter().any(|t| w.tags.contains(t)));
    }

    if let Some(ref author_id) = filters.author_id {
        results.retain(|w| &w.author.id == author_id);
    }

    if let Some(min_rating) = filters.min_rating {
        results.retain(|w| w.rating >= min_rating);
    }

    if let Some(is_verified) = filters.is_verified {
        results.retain(|w| w.is_verified == is_verified);
    }

    if let Some(is_official) = filters.is_official {
        results.retain(|w| w.is_official == is_official);
    }

    // Sort
    let desc = matches!(filters.sort_order, SortOrder::Desc);
    match filters.sort_by {
        SortBy::Popular | SortBy::Trending => {
            results.sort_by(|a, b| {
                let cmp = b.likes.cmp(&a.likes);
                if desc { cmp } else { cmp.reverse() }
            });
        }
        SortBy::Downloads => {
            results.sort_by(|a, b| {
                let cmp = b.downloads.cmp(&a.downloads);
                if desc { cmp } else { cmp.reverse() }
            });
        }
        SortBy::Rating => {
            results.sort_by(|a, b| {
                let cmp = b.rating.partial_cmp(&a.rating).unwrap_or(std::cmp::Ordering::Equal);
                if desc { cmp } else { cmp.reverse() }
            });
        }
        SortBy::Recent => {
            results.sort_by(|a, b| {
                let cmp = b.published_at.cmp(&a.published_at);
                if desc { cmp } else { cmp.reverse() }
            });
        }
    }

    // Paginate
    let total = results.len();
    let start = (filters.page - 1) * filters.page_size;
    let end = (start + filters.page_size).min(total);
    let page_results = if start < total {
        results[start..end].to_vec()
    } else {
        vec![]
    };

    Ok(SearchResult {
        workflows: page_results,
        total,
        page: filters.page,
        page_size: filters.page_size,
        has_more: end < total,
    })
}

/// Get workflow by ID
#[tauri::command]
pub async fn marketplace_get_workflow(
    id: String,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<Option<MarketplaceWorkflow>, String> {
    let workflows = state.workflows.read().await;
    Ok(workflows.get(&id).cloned())
}

/// Get featured workflows
#[tauri::command]
pub async fn marketplace_get_featured(
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<Vec<MarketplaceWorkflow>, String> {
    let workflows = state.workflows.read().await;
    Ok(workflows.values().filter(|w| w.is_featured).cloned().collect())
}

/// Get popular workflows
#[tauri::command]
pub async fn marketplace_get_popular(
    limit: Option<usize>,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<Vec<MarketplaceWorkflow>, String> {
    let workflows = state.workflows.read().await;
    let mut results: Vec<MarketplaceWorkflow> = workflows.values().cloned().collect();
    results.sort_by(|a, b| b.downloads.cmp(&a.downloads));
    let limit = limit.unwrap_or(10);
    results.truncate(limit);
    Ok(results)
}

/// Get categories with counts
#[tauri::command]
pub async fn marketplace_get_categories(
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<Vec<CategoryInfo>, String> {
    let workflows = state.workflows.read().await;

    let categories = vec![
        (WorkflowCategory::AiAssistant, "AI Assistant"),
        (WorkflowCategory::DataProcessing, "Data Processing"),
        (WorkflowCategory::Document, "Document"),
        (WorkflowCategory::Automation, "Automation"),
        (WorkflowCategory::Integration, "Integration"),
        (WorkflowCategory::Analysis, "Analysis"),
        (WorkflowCategory::Creative, "Creative"),
        (WorkflowCategory::Developer, "Developer"),
        (WorkflowCategory::Other, "Other"),
    ];

    let result: Vec<CategoryInfo> = categories
        .into_iter()
        .map(|(cat, name)| {
            let count = workflows
                .values()
                .filter(|w| std::mem::discriminant(&w.category) == std::mem::discriminant(&cat))
                .count();
            CategoryInfo {
                id: cat,
                name: name.to_string(),
                count,
            }
        })
        .collect();

    Ok(result)
}

/// Download workflow
#[tauri::command]
pub async fn marketplace_download(
    workflow_id: String,
    user_id: String,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<MarketplaceWorkflow, String> {
    // Get workflow
    let mut workflows = state.workflows.write().await;
    let workflow = workflows.get_mut(&workflow_id).ok_or("Workflow not found")?;

    // Increment download count
    workflow.downloads += 1;

    // Track user download
    let mut downloads = state.user_downloads.write().await;
    let user_downloads = downloads.entry(user_id).or_insert_with(Vec::new);
    if !user_downloads.contains(&workflow_id) {
        user_downloads.push(workflow_id);
    }

    Ok(workflow.clone())
}

/// Like workflow
#[tauri::command]
pub async fn marketplace_like(
    workflow_id: String,
    user_id: String,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<bool, String> {
    let mut likes = state.user_likes.write().await;
    let user_likes = likes.entry(user_id).or_insert_with(Vec::new);

    if user_likes.contains(&workflow_id) {
        return Ok(false);
    }

    user_likes.push(workflow_id.clone());

    // Increment like count
    let mut workflows = state.workflows.write().await;
    if let Some(workflow) = workflows.get_mut(&workflow_id) {
        workflow.likes += 1;
    }

    Ok(true)
}

/// Unlike workflow
#[tauri::command]
pub async fn marketplace_unlike(
    workflow_id: String,
    user_id: String,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<bool, String> {
    let mut likes = state.user_likes.write().await;
    let user_likes = likes.entry(user_id).or_insert_with(Vec::new);

    if !user_likes.contains(&workflow_id) {
        return Ok(false);
    }

    user_likes.retain(|id| id != &workflow_id);

    // Decrement like count
    let mut workflows = state.workflows.write().await;
    if let Some(workflow) = workflows.get_mut(&workflow_id) {
        workflow.likes = workflow.likes.saturating_sub(1);
    }

    Ok(true)
}

/// Check if user liked a workflow
#[tauri::command]
pub async fn marketplace_is_liked(
    workflow_id: String,
    user_id: String,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<bool, String> {
    let likes = state.user_likes.read().await;
    Ok(likes.get(&user_id).map_or(false, |l| l.contains(&workflow_id)))
}

/// Get workflow reviews
#[tauri::command]
pub async fn marketplace_get_reviews(
    workflow_id: String,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<Vec<WorkflowReview>, String> {
    let reviews = state.reviews.read().await;
    Ok(reviews.get(&workflow_id).cloned().unwrap_or_default())
}

/// Submit review
#[tauri::command]
pub async fn marketplace_submit_review(
    workflow_id: String,
    user_id: String,
    user_name: String,
    rating: u8,
    title: String,
    content: String,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<WorkflowReview, String> {
    if rating < 1 || rating > 5 {
        return Err("Rating must be between 1 and 5".to_string());
    }

    let now = chrono::Utc::now().to_rfc3339();

    let review = WorkflowReview {
        id: uuid::Uuid::new_v4().to_string(),
        workflow_id: workflow_id.clone(),
        author: WorkflowAuthor {
            id: user_id,
            name: user_name,
            is_verified: false,
            published_count: 0,
            total_downloads: 0,
            avatar_url: None,
        },
        rating,
        title,
        content,
        created_at: now.clone(),
        updated_at: now,
        helpful_count: 0,
        is_verified_purchase: true,
    };

    let mut reviews = state.reviews.write().await;
    let workflow_reviews = reviews.entry(workflow_id.clone()).or_insert_with(Vec::new);
    workflow_reviews.push(review.clone());

    // Update workflow rating
    let mut workflows = state.workflows.write().await;
    if let Some(workflow) = workflows.get_mut(&workflow_id) {
        let total_rating: usize = workflow_reviews.iter().map(|r| r.rating as usize).sum();
        workflow.rating_count = workflow_reviews.len();
        workflow.rating = total_rating as f64 / workflow.rating_count as f64;
    }

    Ok(review)
}

/// Create collection
#[tauri::command]
pub async fn marketplace_create_collection(
    user_id: String,
    name: String,
    description: String,
    is_public: bool,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<WorkflowCollection, String> {
    let now = chrono::Utc::now().to_rfc3339();

    let collection = WorkflowCollection {
        id: uuid::Uuid::new_v4().to_string(),
        user_id,
        name,
        description,
        workflow_ids: vec![],
        is_public,
        created_at: now.clone(),
        updated_at: now,
    };

    let mut collections = state.collections.write().await;
    collections.insert(collection.id.clone(), collection.clone());

    Ok(collection)
}

/// Add to collection
#[tauri::command]
pub async fn marketplace_add_to_collection(
    collection_id: String,
    workflow_id: String,
    user_id: String,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<bool, String> {
    let mut collections = state.collections.write().await;
    let collection = collections.get_mut(&collection_id).ok_or("Collection not found")?;

    if collection.user_id != user_id {
        return Err("Not your collection".to_string());
    }

    if collection.workflow_ids.contains(&workflow_id) {
        return Ok(false);
    }

    collection.workflow_ids.push(workflow_id);
    collection.updated_at = chrono::Utc::now().to_rfc3339();

    Ok(true)
}

/// Remove from collection
#[tauri::command]
pub async fn marketplace_remove_from_collection(
    collection_id: String,
    workflow_id: String,
    user_id: String,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<bool, String> {
    let mut collections = state.collections.write().await;
    let collection = collections.get_mut(&collection_id).ok_or("Collection not found")?;

    if collection.user_id != user_id {
        return Err("Not your collection".to_string());
    }

    let len_before = collection.workflow_ids.len();
    collection.workflow_ids.retain(|id| id != &workflow_id);

    if collection.workflow_ids.len() != len_before {
        collection.updated_at = chrono::Utc::now().to_rfc3339();
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Get user collections
#[tauri::command]
pub async fn marketplace_get_collections(
    user_id: String,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<Vec<WorkflowCollection>, String> {
    let collections = state.collections.read().await;
    Ok(collections.values().filter(|c| c.user_id == user_id).cloned().collect())
}

/// Get user downloads
#[tauri::command]
pub async fn marketplace_get_downloads(
    user_id: String,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<Vec<String>, String> {
    let downloads = state.user_downloads.read().await;
    Ok(downloads.get(&user_id).cloned().unwrap_or_default())
}

/// Get user likes
#[tauri::command]
pub async fn marketplace_get_likes(
    user_id: String,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<Vec<String>, String> {
    let likes = state.user_likes.read().await;
    Ok(likes.get(&user_id).cloned().unwrap_or_default())
}

/// Publish workflow
#[tauri::command]
pub async fn marketplace_publish(
    request: PublishRequest,
    user_id: String,
    user_name: String,
    state: State<'_, Arc<MarketplaceState>>,
) -> Result<MarketplaceWorkflow, String> {
    let now = chrono::Utc::now().to_rfc3339();

    let workflow = MarketplaceWorkflow {
        id: uuid::Uuid::new_v4().to_string(),
        name: request.name,
        description: request.description,
        author: WorkflowAuthor {
            id: user_id,
            name: user_name,
            is_verified: false,
            published_count: 1,
            total_downloads: 0,
            avatar_url: None,
        },
        version: "1.0.0".to_string(),
        category: request.category,
        tags: request.tags,
        downloads: 0,
        likes: 0,
        rating: 0.0,
        rating_count: 0,
        node_count: 0,
        estimated_runtime: "unknown".to_string(),
        required_tools: vec![],
        required_providers: vec![],
        published_at: now.clone(),
        updated_at: now,
        workflow_data: request.workflow_data,
        is_verified: false,
        is_featured: false,
        is_official: false,
        license: request.license,
        preview_images: request.preview_images,
        readme: request.readme,
    };

    let mut workflows = state.workflows.write().await;
    workflows.insert(workflow.id.clone(), workflow.clone());

    Ok(workflow)
}
