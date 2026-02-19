// Tier 1 Storage 도구 — 키-값 저장소, 벡터 검색, SQLite
// kv.get, kv.set, kv.delete, kv.list
// vector.store, vector.search, vector.hybrid
// sqlite.query, sqlite.schema

use serde::Deserialize;
use serde_json::{json, Value};
use rusqlite::{params, Connection};
use std::sync::Mutex;
use std::path::PathBuf;

use crate::tools::vector_index;

// ─────────────────────────────────────────────
// KV Store 글로벌 DB
// ─────────────────────────────────────────────

lazy_static::lazy_static! {
    static ref KV_DB: Mutex<Option<Connection>> = Mutex::new(None);
}

fn kv_db_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    #[cfg(not(target_os = "windows"))]
    let base = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());

    PathBuf::from(base).join("handbox").join("kv_store.db")
}

fn ensure_kv_db() -> Result<(), String> {
    let mut guard = KV_DB.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        let path = kv_db_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Connection::open(&path)
            .map_err(|e| format!("KV DB 열기 실패: {}", e))?;

        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             CREATE TABLE IF NOT EXISTS kv (
                 namespace TEXT NOT NULL DEFAULT 'default',
                 key TEXT NOT NULL,
                 value_json TEXT NOT NULL,
                 created_at TEXT DEFAULT (datetime('now')),
                 updated_at TEXT DEFAULT (datetime('now')),
                 expires_at TEXT,
                 PRIMARY KEY (namespace, key)
             );"
        ).map_err(|e| format!("KV 테이블 생성 실패: {}", e))?;

        *guard = Some(conn);
    }
    Ok(())
}

fn with_kv<F, R>(f: F) -> Result<R, String>
where F: FnOnce(&Connection) -> Result<R, String>
{
    ensure_kv_db()?;
    let guard = KV_DB.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("KV DB 연결 없음")?;
    f(conn)
}

// ─────────────────────────────────────────────
// kv.set
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_kv_set(
    namespace: Option<String>,
    key: String,
    value: Value,
    ttl_seconds: Option<u64>,
) -> Result<Value, String> {
    let ns = namespace.unwrap_or_else(|| "default".to_string());
    let value_json = serde_json::to_string(&value)
        .map_err(|e| format!("값 직렬화 실패: {}", e))?;

    let expires = ttl_seconds.map(|ttl| {
        let now = chrono::Utc::now();
        let exp = now + chrono::Duration::seconds(ttl as i64);
        exp.format("%Y-%m-%dT%H:%M:%SZ").to_string()
    });

    with_kv(|conn| {
        conn.execute(
            "INSERT OR REPLACE INTO kv (namespace, key, value_json, updated_at, expires_at) VALUES (?1, ?2, ?3, datetime('now'), ?4)",
            params![ns, key, value_json, expires],
        ).map_err(|e| format!("KV 저장 실패: {}", e))?;

        Ok(json!({
            "success": true,
            "namespace": ns,
            "key": key,
        }))
    })
}

// ─────────────────────────────────────────────
// kv.get
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_kv_get(
    namespace: Option<String>,
    key: String,
) -> Result<Value, String> {
    let ns = namespace.unwrap_or_else(|| "default".to_string());

    with_kv(|conn| {
        let result = conn.query_row(
            "SELECT value_json, created_at, updated_at, expires_at FROM kv WHERE namespace = ?1 AND key = ?2",
            params![ns, key],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            },
        );

        match result {
            Ok((value_json, created, updated, expires)) => {
                // 만료 체크
                if let Some(ref exp) = expires {
                    if let Ok(exp_time) = chrono::DateTime::parse_from_rfc3339(exp) {
                        if exp_time < chrono::Utc::now() {
                            // 만료됨 — 삭제
                            let _ = conn.execute(
                                "DELETE FROM kv WHERE namespace = ?1 AND key = ?2",
                                params![ns, key],
                            );
                            return Ok(json!({ "value": null, "exists": false }));
                        }
                    }
                }

                let value: Value = serde_json::from_str(&value_json).unwrap_or(Value::Null);
                Ok(json!({
                    "value": value,
                    "exists": true,
                    "created_at": created,
                    "updated_at": updated,
                    "expires_at": expires,
                }))
            }
            Err(_) => Ok(json!({ "value": null, "exists": false })),
        }
    })
}

// ─────────────────────────────────────────────
// kv.delete
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_kv_delete(
    namespace: Option<String>,
    key: String,
) -> Result<Value, String> {
    let ns = namespace.unwrap_or_else(|| "default".to_string());

    with_kv(|conn| {
        let affected = conn
            .execute(
                "DELETE FROM kv WHERE namespace = ?1 AND key = ?2",
                params![ns, key],
            )
            .map_err(|e| format!("KV 삭제 실패: {}", e))?;

        Ok(json!({ "deleted": affected > 0 }))
    })
}

// ─────────────────────────────────────────────
// kv.list
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_kv_list(
    namespace: Option<String>,
    prefix: Option<String>,
    limit: Option<usize>,
) -> Result<Value, String> {
    let ns = namespace.unwrap_or_else(|| "default".to_string());
    let lim = limit.unwrap_or(1000);

    with_kv(|conn| {
        let mut keys: Vec<Value> = Vec::new();

        if let Some(ref pfx) = prefix {
            let like_pattern = format!("{}%", pfx);
            let mut stmt = conn.prepare(
                "SELECT key, typeof(json(value_json)), length(value_json), updated_at FROM kv WHERE namespace = ?1 AND key LIKE ?2 ORDER BY key LIMIT ?3"
            ).map_err(|e| format!("쿼리 준비 실패: {}", e))?;

            let rows = stmt.query_map(params![ns, like_pattern, lim as i64], |row| {
                Ok(json!({
                    "key": row.get::<_, String>(0)?,
                    "value_type": row.get::<_, String>(1).unwrap_or_default(),
                    "size": row.get::<_, i64>(2).unwrap_or(0),
                    "updated_at": row.get::<_, String>(3).unwrap_or_default(),
                }))
            }).map_err(|e| format!("쿼리 실행 실패: {}", e))?;

            for row in rows {
                if let Ok(v) = row {
                    keys.push(v);
                }
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT key, typeof(json(value_json)), length(value_json), updated_at FROM kv WHERE namespace = ?1 ORDER BY key LIMIT ?2"
            ).map_err(|e| format!("쿼리 준비 실패: {}", e))?;

            let rows = stmt.query_map(params![ns, lim as i64], |row| {
                Ok(json!({
                    "key": row.get::<_, String>(0)?,
                    "value_type": row.get::<_, String>(1).unwrap_or_default(),
                    "size": row.get::<_, i64>(2).unwrap_or(0),
                    "updated_at": row.get::<_, String>(3).unwrap_or_default(),
                }))
            }).map_err(|e| format!("쿼리 실행 실패: {}", e))?;

            for row in rows {
                if let Ok(v) = row {
                    keys.push(v);
                }
            }
        }

        Ok(json!({
            "keys": keys,
            "count": keys.len(),
            "namespace": ns,
        }))
    })
}

// ─────────────────────────────────────────────
// vector.store
// ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct VectorDocInput {
    pub id: Option<String>,
    pub text: String,
    pub embedding: Vec<f32>,
    pub metadata: Option<Value>,
}

#[tauri::command]
pub async fn tool_vector_store(
    collection: String,
    documents: Vec<VectorDocInput>,
) -> Result<Value, String> {
    let docs: Vec<vector_index::VectorDocument> = documents
        .into_iter()
        .map(|d| vector_index::VectorDocument {
            id: d.id,
            text: d.text,
            embedding: d.embedding,
            metadata: d.metadata,
        })
        .collect();

    let ids = vector_index::store_documents(&collection, &docs)?;

    Ok(json!({
        "stored_count": ids.len(),
        "collection": collection,
        "ids": ids,
    }))
}

// ─────────────────────────────────────────────
// vector.search
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_vector_search(
    collection: String,
    query_embedding: Vec<f32>,
    top_k: Option<usize>,
    threshold: Option<f32>,
    filter: Option<String>,
) -> Result<Value, String> {
    let start = std::time::Instant::now();

    let results = vector_index::search(
        &collection,
        &query_embedding,
        top_k.unwrap_or(5),
        threshold,
        filter.as_deref(),
    )?;

    let elapsed = start.elapsed().as_millis();

    let result_values: Vec<Value> = results
        .iter()
        .map(|r| {
            json!({
                "id": r.id,
                "text": r.text,
                "score": r.score,
                "metadata": r.metadata,
            })
        })
        .collect();

    Ok(json!({
        "results": result_values,
        "count": result_values.len(),
        "search_time_ms": elapsed,
    }))
}

// ─────────────────────────────────────────────
// vector.hybrid
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_vector_hybrid_search(
    collection: String,
    query_embedding: Vec<f32>,
    query_text: String,
    top_k: Option<usize>,
    vector_weight: Option<f32>,
    text_weight: Option<f32>,
    filter: Option<String>,
) -> Result<Value, String> {
    let start = std::time::Instant::now();

    let results = vector_index::hybrid_search(
        &collection,
        &query_embedding,
        &query_text,
        top_k.unwrap_or(5),
        vector_weight.unwrap_or(0.7),
        text_weight.unwrap_or(0.3),
        filter.as_deref(),
    )?;

    let elapsed = start.elapsed().as_millis();

    let result_values: Vec<Value> = results
        .iter()
        .map(|r| {
            json!({
                "id": r.id,
                "text": r.text,
                "score": r.score,
                "metadata": r.metadata,
            })
        })
        .collect();

    Ok(json!({
        "results": result_values,
        "count": result_values.len(),
        "search_time_ms": elapsed,
    }))
}

// ─────────────────────────────────────────────
// sqlite.query
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_sqlite_query(
    db_path: Option<String>,
    sql: String,
    params_list: Option<Vec<Value>>,
) -> Result<Value, String> {
    let path = db_path.unwrap_or_else(|| {
        kv_db_path()
            .parent()
            .unwrap()
            .join("handbox_data.db")
            .to_string_lossy()
            .to_string()
    });

    // 경로에 디렉토리 생성
    if let Some(parent) = PathBuf::from(&path).parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(&path)
        .map_err(|e| format!("SQLite 열기 실패: {}", e))?;

    let sql_trimmed = sql.trim().to_uppercase();
    let is_select = sql_trimmed.starts_with("SELECT") || sql_trimmed.starts_with("PRAGMA");

    if is_select {
        let mut stmt = conn.prepare(&sql)
            .map_err(|e| format!("SQL 준비 실패: {}", e))?;

        let column_names: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|n| n.to_string())
            .collect();

        let rows: Vec<Value> = stmt
            .query_map([], |row| {
                let mut obj = serde_json::Map::new();
                for (i, col) in column_names.iter().enumerate() {
                    let val: Value = match row.get_ref(i) {
                        Ok(rusqlite::types::ValueRef::Integer(n)) => json!(n),
                        Ok(rusqlite::types::ValueRef::Real(f)) => json!(f),
                        Ok(rusqlite::types::ValueRef::Text(t)) => {
                            json!(String::from_utf8_lossy(t).to_string())
                        }
                        Ok(rusqlite::types::ValueRef::Blob(b)) => {
                            json!(format!("[blob:{}bytes]", b.len()))
                        }
                        Ok(rusqlite::types::ValueRef::Null) | Err(_) => Value::Null,
                    };
                    obj.insert(col.clone(), val);
                }
                Ok(Value::Object(obj))
            })
            .map_err(|e| format!("쿼리 실행 실패: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(json!({
            "rows": rows,
            "columns": column_names,
            "row_count": rows.len(),
        }))
    } else {
        let affected = conn
            .execute(&sql, [])
            .map_err(|e| format!("SQL 실행 실패: {}", e))?;

        Ok(json!({
            "affected_rows": affected,
            "success": true,
        }))
    }
}

// ─────────────────────────────────────────────
// sqlite.schema
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_sqlite_schema(
    db_path: Option<String>,
    operation: String,
    table_name: Option<String>,
    columns: Option<Vec<ColumnDef>>,
) -> Result<Value, String> {
    let path = db_path.unwrap_or_else(|| {
        kv_db_path()
            .parent()
            .unwrap()
            .join("handbox_data.db")
            .to_string_lossy()
            .to_string()
    });

    if let Some(parent) = PathBuf::from(&path).parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(&path)
        .map_err(|e| format!("SQLite 열기 실패: {}", e))?;

    match operation.as_str() {
        "create_table" => {
            let name = table_name.ok_or("테이블 이름이 필요합니다")?;
            let cols = columns.ok_or("컬럼 정의가 필요합니다")?;

            let col_defs: Vec<String> = cols
                .iter()
                .map(|c| {
                    let mut def = format!("{} {}", c.name, c.col_type);
                    if c.primary_key.unwrap_or(false) {
                        def.push_str(" PRIMARY KEY");
                    }
                    if c.not_null.unwrap_or(false) {
                        def.push_str(" NOT NULL");
                    }
                    if let Some(ref d) = c.default {
                        def.push_str(&format!(" DEFAULT {}", d));
                    }
                    def
                })
                .collect();

            let sql = format!("CREATE TABLE IF NOT EXISTS \"{}\" ({})", name, col_defs.join(", "));
            conn.execute_batch(&sql)
                .map_err(|e| format!("테이블 생성 실패: {}", e))?;

            Ok(json!({ "success": true, "table": name, "sql": sql }))
        }
        "list_tables" => {
            let mut stmt = conn
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
                .map_err(|e| format!("쿼리 실패: {}", e))?;

            let tables: Vec<String> = stmt
                .query_map([], |row| row.get(0))
                .map_err(|e| format!("쿼리 실행 실패: {}", e))?
                .filter_map(|r| r.ok())
                .collect();

            Ok(json!({ "tables": tables, "count": tables.len() }))
        }
        "describe_table" => {
            let name = table_name.ok_or("테이블 이름이 필요합니다")?;
            let mut stmt = conn
                .prepare(&format!("PRAGMA table_info(\"{}\")", name))
                .map_err(|e| format!("테이블 정보 조회 실패: {}", e))?;

            let columns: Vec<Value> = stmt
                .query_map([], |row| {
                    Ok(json!({
                        "cid": row.get::<_, i64>(0)?,
                        "name": row.get::<_, String>(1)?,
                        "type": row.get::<_, String>(2)?,
                        "not_null": row.get::<_, bool>(3)?,
                        "default": row.get::<_, Option<String>>(4)?,
                        "primary_key": row.get::<_, bool>(5)?,
                    }))
                })
                .map_err(|e| format!("쿼리 실행 실패: {}", e))?
                .filter_map(|r| r.ok())
                .collect();

            Ok(json!({ "table": name, "columns": columns }))
        }
        "drop_table" => {
            let name = table_name.ok_or("테이블 이름이 필요합니다")?;
            conn.execute_batch(&format!("DROP TABLE IF EXISTS \"{}\"", name))
                .map_err(|e| format!("테이블 삭제 실패: {}", e))?;

            Ok(json!({ "success": true, "dropped": name }))
        }
        _ => Err(format!(
            "알 수 없는 연산: {}. 지원: create_table, list_tables, describe_table, drop_table",
            operation
        )),
    }
}

#[derive(Debug, Deserialize)]
pub struct ColumnDef {
    pub name: String,
    pub col_type: String,        // TEXT, INTEGER, REAL, BLOB
    pub primary_key: Option<bool>,
    pub not_null: Option<bool>,
    pub default: Option<String>,
}
