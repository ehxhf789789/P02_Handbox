// vector_store.rs - 로컬 벡터 저장소 (SQLite 기반)
//
// Phase 3: 로컬 RAG 파이프라인용 벡터 검색

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::fs;

// ============================================================
// 응답 타입 정의
// ============================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct VectorIndexInfo {
    pub name: String,
    pub dimension: usize,
    pub vector_count: i64,
    pub db_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VectorSearchResult {
    pub id: i64,
    pub score: f64,
    pub metadata: Value,
    pub text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VectorAddResult {
    pub success: bool,
    pub ids: Vec<i64>,
    pub message: String,
}

// ============================================================
// 벡터 인덱스 관리
// ============================================================

/// 벡터 인덱스 생성 (SQLite 테이블)
#[tauri::command]
pub fn vector_create_index(
    db_path: String,
    index_name: String,
    dimension: usize,
) -> Result<VectorIndexInfo, String> {
    let path = Path::new(&db_path);

    // 디렉토리가 없으면 생성
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("디렉토리 생성 오류: {}", e))?;
    }

    let conn = Connection::open(&path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    // 벡터 저장 테이블 생성
    let table_name = format!("vectors_{}", index_name);
    conn.execute(
        &format!(
            "CREATE TABLE IF NOT EXISTS {} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vector_data TEXT NOT NULL,
                text_content TEXT,
                metadata TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            table_name
        ),
        [],
    )
    .map_err(|e| format!("테이블 생성 오류: {}", e))?;

    // 인덱스 메타데이터 저장
    conn.execute(
        "CREATE TABLE IF NOT EXISTS _vector_indices (
            name TEXT PRIMARY KEY,
            dimension INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| format!("메타 테이블 생성 오류: {}", e))?;

    conn.execute(
        "INSERT OR REPLACE INTO _vector_indices (name, dimension) VALUES (?1, ?2)",
        params![index_name, dimension as i64],
    )
    .map_err(|e| format!("메타데이터 저장 오류: {}", e))?;

    Ok(VectorIndexInfo {
        name: index_name,
        dimension,
        vector_count: 0,
        db_path,
    })
}

/// 벡터 인덱스 목록 조회
#[tauri::command]
pub fn vector_list_indices(db_path: String) -> Result<Vec<VectorIndexInfo>, String> {
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    // 인덱스 테이블 존재 확인
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_vector_indices'",
            [],
            |row| row.get::<_, i32>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false);

    if !table_exists {
        return Ok(Vec::new());
    }

    let mut stmt = conn
        .prepare("SELECT name, dimension FROM _vector_indices")
        .map_err(|e| format!("쿼리 준비 오류: {}", e))?;

    let indices: Vec<VectorIndexInfo> = stmt
        .query_map([], |row| {
            let name: String = row.get(0)?;
            let dimension: i64 = row.get(1)?;
            Ok((name, dimension as usize))
        })
        .map_err(|e| format!("쿼리 실행 오류: {}", e))?
        .filter_map(|r| r.ok())
        .map(|(name, dimension)| {
            let table_name = format!("vectors_{}", name);
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {}", table_name), [], |row| {
                    row.get(0)
                })
                .unwrap_or(0);

            VectorIndexInfo {
                name,
                dimension,
                vector_count: count,
                db_path: db_path.clone(),
            }
        })
        .collect();

    Ok(indices)
}

// ============================================================
// 벡터 추가/검색
// ============================================================

/// 벡터 추가
#[tauri::command]
pub fn vector_add(
    db_path: String,
    index_name: String,
    vectors: Vec<Vec<f64>>,
    texts: Option<Vec<String>>,
    metadata: Option<Vec<Value>>,
) -> Result<VectorAddResult, String> {
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    let table_name = format!("vectors_{}", index_name);

    // 테이블 존재 확인
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            params![&table_name],
            |row| row.get::<_, i32>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false);

    if !table_exists {
        return Err(format!("인덱스 '{}'가 존재하지 않습니다", index_name));
    }

    let mut ids: Vec<i64> = Vec::new();

    for (i, vec) in vectors.iter().enumerate() {
        let vec_json = serde_json::to_string(vec)
            .map_err(|e| format!("벡터 직렬화 오류: {}", e))?;

        let text = texts.as_ref().and_then(|t| t.get(i)).cloned();
        let meta = metadata
            .as_ref()
            .and_then(|m| m.get(i))
            .map(|v| serde_json::to_string(v).unwrap_or_default());

        conn.execute(
            &format!(
                "INSERT INTO {} (vector_data, text_content, metadata) VALUES (?1, ?2, ?3)",
                table_name
            ),
            params![vec_json, text, meta],
        )
        .map_err(|e| format!("벡터 저장 오류: {}", e))?;

        ids.push(conn.last_insert_rowid());
    }

    Ok(VectorAddResult {
        success: true,
        ids,
        message: format!("{}개 벡터 추가 완료", vectors.len()),
    })
}

/// 벡터 유사도 검색 (코사인 유사도)
#[tauri::command]
pub fn vector_search(
    db_path: String,
    index_name: String,
    query_vector: Vec<f64>,
    top_k: Option<usize>,
    threshold: Option<f64>,
) -> Result<Vec<VectorSearchResult>, String> {
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    let table_name = format!("vectors_{}", index_name);
    let k = top_k.unwrap_or(5);
    let min_score = threshold.unwrap_or(0.0);

    // 모든 벡터 로드
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, vector_data, text_content, metadata FROM {}",
            table_name
        ))
        .map_err(|e| format!("쿼리 준비 오류: {}", e))?;

    let mut results: Vec<VectorSearchResult> = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let vec_json: String = row.get(1)?;
            let text: Option<String> = row.get(2)?;
            let meta_str: Option<String> = row.get(3)?;
            Ok((id, vec_json, text, meta_str))
        })
        .map_err(|e| format!("쿼리 실행 오류: {}", e))?
        .filter_map(|r| r.ok())
        .filter_map(|(id, vec_json, text, meta_str)| {
            let stored_vec: Vec<f64> = serde_json::from_str(&vec_json).ok()?;
            let score = cosine_similarity(&query_vector, &stored_vec);

            if score < min_score {
                return None;
            }

            let metadata = meta_str
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(json!({}));

            Some(VectorSearchResult {
                id,
                score,
                metadata,
                text,
            })
        })
        .collect();

    // 점수 내림차순 정렬
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    // top_k 만큼 반환
    results.truncate(k);

    Ok(results)
}

/// 키워드 검색 (텍스트 기반)
#[tauri::command]
pub fn vector_text_search(
    db_path: String,
    index_name: String,
    query: String,
    top_k: Option<usize>,
) -> Result<Vec<VectorSearchResult>, String> {
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    let table_name = format!("vectors_{}", index_name);
    let k = top_k.unwrap_or(10);

    // LIKE 검색 (간단한 키워드 매칭)
    let pattern = format!("%{}%", query);

    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, text_content, metadata FROM {} WHERE text_content LIKE ?1 LIMIT ?2",
            table_name
        ))
        .map_err(|e| format!("쿼리 준비 오류: {}", e))?;

    let results: Vec<VectorSearchResult> = stmt
        .query_map(params![pattern, k as i64], |row| {
            let id: i64 = row.get(0)?;
            let text: Option<String> = row.get(1)?;
            let meta_str: Option<String> = row.get(2)?;
            Ok((id, text, meta_str))
        })
        .map_err(|e| format!("쿼리 실행 오류: {}", e))?
        .filter_map(|r| r.ok())
        .enumerate()
        .map(|(i, (id, text, meta_str))| {
            let metadata = meta_str
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(json!({}));

            VectorSearchResult {
                id,
                score: 1.0 - (i as f64 * 0.1), // 순서 기반 점수
                metadata,
                text,
            }
        })
        .collect();

    Ok(results)
}

/// 하이브리드 검색 (벡터 + 키워드)
#[tauri::command]
pub fn vector_hybrid_search(
    db_path: String,
    index_name: String,
    query_vector: Vec<f64>,
    query_text: String,
    top_k: Option<usize>,
    vector_weight: Option<f64>,
) -> Result<Vec<VectorSearchResult>, String> {
    let k = top_k.unwrap_or(5);
    let v_weight = vector_weight.unwrap_or(0.7);
    let t_weight = 1.0 - v_weight;

    // 벡터 검색 결과
    let vector_results = vector_search(
        db_path.clone(),
        index_name.clone(),
        query_vector,
        Some(k * 2),
        Some(0.0),
    )?;

    // 텍스트 검색 결과
    let text_results = vector_text_search(
        db_path,
        index_name,
        query_text,
        Some(k * 2),
    )?;

    // 점수 병합
    let mut score_map: HashMap<i64, (f64, f64, Option<String>, Value)> = HashMap::new();

    for r in vector_results {
        score_map.insert(r.id, (r.score, 0.0, r.text, r.metadata));
    }

    for r in text_results {
        if let Some(entry) = score_map.get_mut(&r.id) {
            entry.1 = r.score;
        } else {
            score_map.insert(r.id, (0.0, r.score, r.text, r.metadata));
        }
    }

    // 하이브리드 점수 계산
    let mut results: Vec<VectorSearchResult> = score_map
        .into_iter()
        .map(|(id, (v_score, t_score, text, metadata))| {
            let combined_score = v_score * v_weight + t_score * t_weight;
            VectorSearchResult {
                id,
                score: combined_score,
                metadata,
                text,
            }
        })
        .collect();

    // 점수 내림차순 정렬
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(k);

    Ok(results)
}

/// 인덱스 삭제
#[tauri::command]
pub fn vector_delete_index(
    db_path: String,
    index_name: String,
) -> Result<String, String> {
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    let table_name = format!("vectors_{}", index_name);

    conn.execute(&format!("DROP TABLE IF EXISTS {}", table_name), [])
        .map_err(|e| format!("테이블 삭제 오류: {}", e))?;

    conn.execute(
        "DELETE FROM _vector_indices WHERE name = ?1",
        params![index_name],
    )
    .map_err(|e| format!("메타데이터 삭제 오류: {}", e))?;

    Ok(format!("인덱스 '{}' 삭제 완료", index_name))
}

// ============================================================
// 헬퍼 함수
// ============================================================

/// 코사인 유사도 계산
fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let dot: f64 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f64 = a.iter().map(|x| x * x).sum::<f64>().sqrt();
    let norm_b: f64 = b.iter().map(|x| x * x).sum::<f64>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot / (norm_a * norm_b)
}
