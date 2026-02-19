// 벡터 인덱스 — 플랫폼 핵심 도구 #3
// SQLite 기반 벡터 저장 + 코사인 유사도 검색
// Phase 4에서 HNSW 인덱스로 업그레이드 예정

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Mutex;

lazy_static::lazy_static! {
    static ref VECTOR_DB: Mutex<Option<Connection>> = Mutex::new(None);
}

fn get_db_path() -> PathBuf {
    let mut path = dirs_next()
        .unwrap_or_else(|| PathBuf::from("."));
    path.push("handbox_vectors.db");
    path
}

fn dirs_next() -> Option<PathBuf> {
    // Windows: %APPDATA%/handbox, macOS: ~/Library/Application Support/handbox
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA").ok().map(|p| PathBuf::from(p).join("handbox"))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var("HOME").ok().map(|p| PathBuf::from(p).join("Library/Application Support/handbox"))
    }
    #[cfg(target_os = "linux")]
    {
        std::env::var("HOME").ok().map(|p| PathBuf::from(p).join(".handbox"))
    }
}

fn ensure_db() -> Result<(), String> {
    let mut db_guard = VECTOR_DB.lock().map_err(|e| e.to_string())?;
    if db_guard.is_none() {
        let db_path = get_db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("벡터 DB 열기 실패: {}", e))?;

        // WAL 모드 활성화 (동시 읽기 성능 향상)
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .map_err(|e| format!("PRAGMA 설정 실패: {}", e))?;

        *db_guard = Some(conn);
    }
    Ok(())
}

fn with_db<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&Connection) -> Result<R, String>,
{
    ensure_db()?;
    let db_guard = VECTOR_DB.lock().map_err(|e| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("DB 연결 없음")?;
    f(conn)
}

/// 컬렉션 테이블 생성
pub fn create_collection(collection: &str) -> Result<(), String> {
    with_db(|conn| {
        let table = sanitize_table_name(collection);
        conn.execute_batch(&format!(
            "CREATE TABLE IF NOT EXISTS \"{}\" (
                id TEXT PRIMARY KEY,
                text_content TEXT NOT NULL,
                embedding TEXT NOT NULL,
                metadata TEXT DEFAULT '{{}}',
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS \"idx_{}_text\" ON \"{}\" (text_content);",
            table, table, table
        ))
        .map_err(|e| format!("컬렉션 생성 실패: {}", e))
    })
}

/// 벡터 문서 저장
pub fn store_documents(
    collection: &str,
    documents: &[VectorDocument],
) -> Result<Vec<String>, String> {
    create_collection(collection)?;

    with_db(|conn| {
        let table = sanitize_table_name(collection);
        let mut ids = Vec::new();

        for doc in documents {
            let id = doc.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let embedding_json = serde_json::to_string(&doc.embedding)
                .map_err(|e| format!("임베딩 직렬화 실패: {}", e))?;
            let metadata_json = doc
                .metadata
                .as_ref()
                .map(|m| m.to_string())
                .unwrap_or_else(|| "{}".to_string());

            conn.execute(
                &format!(
                    "INSERT OR REPLACE INTO \"{}\" (id, text_content, embedding, metadata) VALUES (?1, ?2, ?3, ?4)",
                    table
                ),
                params![id, doc.text, embedding_json, metadata_json],
            )
            .map_err(|e| format!("문서 저장 실패: {}", e))?;

            ids.push(id);
        }

        Ok(ids)
    })
}

/// 코사인 유사도 벡터 검색
pub fn search(
    collection: &str,
    query_embedding: &[f32],
    top_k: usize,
    threshold: Option<f32>,
    filter: Option<&str>,
) -> Result<Vec<SearchResult>, String> {
    with_db(|conn| {
        let table = sanitize_table_name(collection);

        // 필터 조건 구성
        let where_clause = if let Some(f) = filter {
            format!(" WHERE {}", parse_metadata_filter(f))
        } else {
            String::new()
        };

        let sql = format!(
            "SELECT id, text_content, embedding, metadata FROM \"{}\"{}",
            table, where_clause
        );

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("쿼리 준비 실패: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| format!("쿼리 실행 실패: {}", e))?;

        let mut results: Vec<SearchResult> = Vec::new();

        for row in rows {
            let (id, text, embedding_json, metadata_json) =
                row.map_err(|e| format!("행 읽기 실패: {}", e))?;

            let embedding: Vec<f32> = serde_json::from_str(&embedding_json)
                .map_err(|e| format!("임베딩 파싱 실패: {}", e))?;

            let score = cosine_similarity(query_embedding, &embedding);

            if let Some(thresh) = threshold {
                if score < thresh {
                    continue;
                }
            }

            let metadata: Value =
                serde_json::from_str(&metadata_json).unwrap_or(json!({}));

            results.push(SearchResult {
                id,
                text,
                score,
                metadata,
            });
        }

        // 점수 기준 내림차순 정렬
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(top_k);

        Ok(results)
    })
}

/// 하이브리드 검색 (벡터 + 키워드)
pub fn hybrid_search(
    collection: &str,
    query_embedding: &[f32],
    query_text: &str,
    top_k: usize,
    vector_weight: f32,
    text_weight: f32,
    filter: Option<&str>,
) -> Result<Vec<SearchResult>, String> {
    with_db(|conn| {
        let table = sanitize_table_name(collection);

        let where_clause = if let Some(f) = filter {
            format!(" WHERE {}", parse_metadata_filter(f))
        } else {
            String::new()
        };

        let sql = format!(
            "SELECT id, text_content, embedding, metadata FROM \"{}\"{}",
            table, where_clause
        );

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("쿼리 준비 실패: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| format!("쿼리 실행 실패: {}", e))?;

        let query_terms: Vec<&str> = query_text.split_whitespace().collect();
        let mut results: Vec<SearchResult> = Vec::new();

        for row in rows {
            let (id, text, embedding_json, metadata_json) =
                row.map_err(|e| format!("행 읽기 실패: {}", e))?;

            let embedding: Vec<f32> = serde_json::from_str(&embedding_json)
                .map_err(|e| format!("임베딩 파싱 실패: {}", e))?;

            // 벡터 유사도 점수
            let vector_score = cosine_similarity(query_embedding, &embedding);

            // 키워드 매칭 점수 (BM25 근사)
            let text_lower = text.to_lowercase();
            let keyword_score = if query_terms.is_empty() {
                0.0
            } else {
                let matched = query_terms
                    .iter()
                    .filter(|term| text_lower.contains(&term.to_lowercase()))
                    .count();
                matched as f32 / query_terms.len() as f32
            };

            // 가중 합산
            let combined_score = vector_score * vector_weight + keyword_score * text_weight;

            let metadata: Value =
                serde_json::from_str(&metadata_json).unwrap_or(json!({}));

            results.push(SearchResult {
                id,
                text,
                score: combined_score,
                metadata,
            });
        }

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(top_k);

        Ok(results)
    })
}

/// 컬렉션 삭제
pub fn delete_collection(collection: &str) -> Result<(), String> {
    with_db(|conn| {
        let table = sanitize_table_name(collection);
        conn.execute_batch(&format!("DROP TABLE IF EXISTS \"{}\"", table))
            .map_err(|e| format!("컬렉션 삭제 실패: {}", e))
    })
}

/// 컬렉션 목록
pub fn list_collections() -> Result<Vec<String>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            .map_err(|e| format!("테이블 목록 조회 실패: {}", e))?;

        let names = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| format!("쿼리 실행 실패: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(names)
    })
}

// ─────────────────────────────────────────────
// 타입 및 유틸리티
// ─────────────────────────────────────────────

pub struct VectorDocument {
    pub id: Option<String>,
    pub text: String,
    pub embedding: Vec<f32>,
    pub metadata: Option<Value>,
}

pub struct SearchResult {
    pub id: String,
    pub text: String,
    pub score: f32,
    pub metadata: Value,
}

/// 코사인 유사도 계산
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;

    for i in 0..a.len() {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
}

/// 테이블명 새니타이징 (SQL 인젝션 방지)
fn sanitize_table_name(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect()
}

/// 메타데이터 필터 파싱
/// "category = 'legal' AND year > 2020" → SQLite WHERE 절
fn parse_metadata_filter(filter: &str) -> String {
    // 간단한 파서: 필드명을 json_extract로 변환
    let mut result = filter.to_string();

    // 간단한 패턴: field op value → json_extract(metadata, '$.field') op value
    let re = regex::Regex::new(r"(\w+)\s*(=|!=|>|>=|<|<=)\s*(.+?)(?:\s+AND|\s+OR|\s*$)").unwrap();

    for cap in re.captures_iter(filter) {
        let field = &cap[1];
        let old = format!("{}", field);
        let new = format!("json_extract(metadata, '$.{}')", field);
        result = result.replace(&old, &new);
    }

    result
}
