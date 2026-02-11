// 지식베이스 관리 커맨드

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KnowledgeBase {
    pub id: String,
    pub name: String,
    pub description: String,
    pub embedding_model: String,
    pub vector_store: VectorStoreConfig,
    pub document_count: usize,
    pub chunk_count: usize,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VectorStoreConfig {
    pub store_type: VectorStoreType,
    pub endpoint: String,
    pub index_name: String,
    pub dimension: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum VectorStoreType {
    OpenSearchServerless,
    Pinecone,
    Chroma,
    Local,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddDocumentsRequest {
    pub knowledge_base_id: String,
    pub documents: Vec<DocumentInput>,
    pub chunking_config: Option<ChunkingConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentInput {
    pub id: Option<String>,
    pub content: String,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChunkingConfig {
    pub chunk_size: usize,
    pub chunk_overlap: usize,
    pub separator: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryRequest {
    pub knowledge_base_id: String,
    pub query: String,
    pub top_k: Option<usize>,
    pub filter: Option<serde_json::Value>,
    pub include_metadata: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryResult {
    pub results: Vec<SearchHit>,
    pub query_embedding_time_ms: u64,
    pub search_time_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchHit {
    pub id: String,
    pub content: String,
    pub score: f32,
    pub metadata: serde_json::Value,
}

/// 지식베이스 생성
#[tauri::command]
pub async fn create_knowledge_base(
    name: String,
    description: String,
    embedding_model: Option<String>,
    vector_store_type: Option<String>,
) -> Result<KnowledgeBase, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let store_type = match vector_store_type.as_deref() {
        Some("opensearch") => VectorStoreType::OpenSearchServerless,
        Some("pinecone") => VectorStoreType::Pinecone,
        Some("chroma") => VectorStoreType::Chroma,
        _ => VectorStoreType::Local,
    };

    let kb = KnowledgeBase {
        id: id.clone(),
        name,
        description,
        embedding_model: embedding_model.unwrap_or_else(|| "amazon.titan-embed-text-v1".to_string()),
        vector_store: VectorStoreConfig {
            store_type,
            endpoint: String::new(),
            index_name: format!("kb-{}", id),
            dimension: 1536,  // Titan Embeddings v1
        },
        document_count: 0,
        chunk_count: 0,
        created_at: now.clone(),
        updated_at: now,
    };

    // 실제 벡터 스토어 인덱스 생성
    // ...

    Ok(kb)
}

/// 문서 추가
#[tauri::command]
pub async fn add_documents(
    request: AddDocumentsRequest,
) -> Result<AddDocumentsResult, String> {
    let chunking_config = request.chunking_config.unwrap_or(ChunkingConfig {
        chunk_size: 1000,
        chunk_overlap: 200,
        separator: None,
    });

    let mut total_chunks = 0;
    let mut processed_docs = 0;

    for doc in &request.documents {
        // 청킹
        let chunks = chunk_text(&doc.content, &chunking_config);

        // 각 청크에 대해 임베딩 생성 및 저장
        for (_i, chunk) in chunks.iter().enumerate() {
            // 임베딩 생성 (실제로는 create_embedding 호출)
            // 벡터 스토어에 저장
            total_chunks += 1;
        }

        processed_docs += 1;
    }

    Ok(AddDocumentsResult {
        processed_documents: processed_docs,
        total_chunks,
        success: true,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddDocumentsResult {
    pub processed_documents: usize,
    pub total_chunks: usize,
    pub success: bool,
}

/// 지식베이스 쿼리
#[tauri::command]
pub async fn query_knowledge_base(
    request: QueryRequest,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();

    // 쿼리 임베딩 생성
    let query_embedding_start = std::time::Instant::now();
    // let query_embedding = create_embedding(request.query).await?;
    let query_embedding_time = query_embedding_start.elapsed().as_millis() as u64;

    // 벡터 검색
    let search_start = std::time::Instant::now();
    let top_k = request.top_k.unwrap_or(10);

    // 실제 검색 로직
    let results = vec![];  // 플레이스홀더

    let search_time = search_start.elapsed().as_millis() as u64;

    Ok(QueryResult {
        results,
        query_embedding_time_ms: query_embedding_time,
        search_time_ms: search_time,
    })
}

/// 지식베이스를 로컬 JSON 파일로 저장
#[derive(Debug, Serialize, Deserialize)]
pub struct LocalKnowledgeBase {
    pub id: String,
    pub name: String,
    pub description: String,
    pub documents: Vec<LocalDocument>,
    pub embeddings: Vec<LocalEmbedding>,
    pub created_at: String,
    pub updated_at: String,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalDocument {
    pub id: String,
    pub content: String,
    pub source: String,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalEmbedding {
    pub document_id: String,
    pub chunk_index: usize,
    pub chunk_text: String,
    pub vector: Vec<f32>,
}

/// 지식베이스를 로컬 파일로 저장
#[tauri::command]
pub async fn save_knowledge_base_local(
    file_path: String,
    kb_data: LocalKnowledgeBase,
) -> Result<String, String> {
    let json = serde_json::to_string_pretty(&kb_data)
        .map_err(|e| format!("JSON 직렬화 실패: {}", e))?;

    std::fs::write(&file_path, json)
        .map_err(|e| format!("파일 저장 실패: {}", e))?;

    Ok(format!("지식베이스 저장 완료: {}", file_path))
}

/// 로컬 파일에서 지식베이스 로드
#[tauri::command]
pub async fn load_knowledge_base_local(
    file_path: String,
) -> Result<LocalKnowledgeBase, String> {
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("파일 읽기 실패: {}", e))?;

    let kb: LocalKnowledgeBase = serde_json::from_str(&content)
        .map_err(|e| format!("JSON 파싱 실패: {}", e))?;

    Ok(kb)
}

/// 지식베이스 목록 가져오기 (특정 폴더에서)
#[tauri::command]
pub async fn list_local_knowledge_bases(
    folder_path: String,
) -> Result<Vec<LocalKnowledgeBase>, String> {
    use std::fs;

    let path = std::path::Path::new(&folder_path);
    if !path.exists() {
        return Ok(vec![]);
    }

    let mut kbs = Vec::new();

    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_path = entry.path();

        if file_path.extension().map_or(false, |ext| ext == "json") {
            if let Ok(content) = fs::read_to_string(&file_path) {
                if let Ok(kb) = serde_json::from_str::<LocalKnowledgeBase>(&content) {
                    kbs.push(kb);
                }
            }
        }
    }

    Ok(kbs)
}

/// 텍스트 청킹 함수
fn chunk_text(text: &str, config: &ChunkingConfig) -> Vec<String> {
    let separator = config.separator.as_deref().unwrap_or("\n\n");
    let mut chunks = Vec::new();

    // 먼저 구분자로 분할
    let sections: Vec<&str> = text.split(separator).collect();

    let mut current_chunk = String::new();

    for section in sections {
        if current_chunk.len() + section.len() > config.chunk_size {
            if !current_chunk.is_empty() {
                chunks.push(current_chunk.clone());

                // 오버랩 처리
                if config.chunk_overlap > 0 && current_chunk.len() > config.chunk_overlap {
                    let overlap_start = current_chunk.len() - config.chunk_overlap;
                    current_chunk = current_chunk[overlap_start..].to_string();
                } else {
                    current_chunk.clear();
                }
            }
        }

        if !current_chunk.is_empty() {
            current_chunk.push_str(separator);
        }
        current_chunk.push_str(section);
    }

    // 마지막 청크
    if !current_chunk.is_empty() {
        chunks.push(current_chunk);
    }

    // 너무 큰 청크는 추가 분할
    let mut final_chunks = Vec::new();
    for chunk in chunks {
        if chunk.len() > config.chunk_size * 2 {
            // 슬라이딩 윈도우로 분할
            let mut i = 0;
            while i < chunk.len() {
                let end = std::cmp::min(i + config.chunk_size, chunk.len());
                final_chunks.push(chunk[i..end].to_string());
                i += config.chunk_size - config.chunk_overlap;
            }
        } else {
            final_chunks.push(chunk);
        }
    }

    final_chunks
}
