// local_storage.rs - 로컬 저장소 명령어 (SQLite, JSON)
//
// Phase 3: 로컬 데이터 파이프라인용 Rust 백엔드

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

// ============================================================
// 응답 타입 정의
// ============================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct SqliteResult {
    pub success: bool,
    pub rows_affected: usize,
    pub last_insert_id: Option<i64>,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Value>>,
    pub row_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub columns: Vec<ColumnInfo>,
    pub row_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub primary_key: bool,
}

// ============================================================
// SQLite 초기화 및 관리
// ============================================================

/// SQLite 데이터베이스 초기화
#[tauri::command]
pub fn sqlite_init(db_path: String) -> Result<String, String> {
    let path = Path::new(&db_path);

    // 디렉토리가 없으면 생성
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("디렉토리 생성 오류: {}", e))?;
    }

    let conn = Connection::open(&path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    // 메타데이터 테이블 생성
    conn.execute(
        "CREATE TABLE IF NOT EXISTS _handbox_meta (
            key TEXT PRIMARY KEY,
            value TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| format!("메타 테이블 생성 오류: {}", e))?;

    // 버전 정보 저장
    conn.execute(
        "INSERT OR REPLACE INTO _handbox_meta (key, value, updated_at)
         VALUES ('version', '1.0.0', CURRENT_TIMESTAMP)",
        [],
    )
    .map_err(|e| format!("버전 저장 오류: {}", e))?;

    Ok(format!("SQLite 초기화 완료: {}", db_path))
}

/// 테이블 생성 (컬럼 정의 기반)
#[tauri::command]
pub fn sqlite_create_table(
    db_path: String,
    table_name: String,
    columns: Vec<Value>,
) -> Result<SqliteResult, String> {
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    // 컬럼 정의 파싱
    let mut col_defs: Vec<String> = vec!["id INTEGER PRIMARY KEY AUTOINCREMENT".to_string()];

    for col in columns {
        if let Some(obj) = col.as_object() {
            let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("col");
            let dtype = obj.get("type").and_then(|v| v.as_str()).unwrap_or("TEXT");
            let nullable = obj.get("nullable").and_then(|v| v.as_bool()).unwrap_or(true);

            let null_str = if nullable { "" } else { " NOT NULL" };
            col_defs.push(format!("{} {}{}", name, dtype, null_str));
        }
    }

    // 타임스탬프 컬럼 추가
    col_defs.push("created_at TEXT DEFAULT CURRENT_TIMESTAMP".to_string());
    col_defs.push("updated_at TEXT DEFAULT CURRENT_TIMESTAMP".to_string());

    let sql = format!(
        "CREATE TABLE IF NOT EXISTS {} ({})",
        table_name,
        col_defs.join(", ")
    );

    conn.execute(&sql, [])
        .map_err(|e| format!("테이블 생성 오류: {}", e))?;

    Ok(SqliteResult {
        success: true,
        rows_affected: 0,
        last_insert_id: None,
        message: format!("테이블 '{}' 생성 완료", table_name),
    })
}

/// 데이터 저장 (INSERT)
#[tauri::command]
pub fn sqlite_save(
    db_path: String,
    table_name: String,
    data: Value,
) -> Result<SqliteResult, String> {
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    let obj = data.as_object()
        .ok_or("데이터는 JSON 객체여야 합니다")?;

    let keys: Vec<&String> = obj.keys().collect();
    let placeholders: Vec<String> = (0..keys.len()).map(|_| "?".to_string()).collect();

    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        table_name,
        keys.iter().map(|k| k.as_str()).collect::<Vec<_>>().join(", "),
        placeholders.join(", ")
    );

    let values: Vec<String> = keys
        .iter()
        .map(|k| value_to_sqlite_string(obj.get(*k).unwrap_or(&Value::Null)))
        .collect();

    let params_vec: Vec<&dyn rusqlite::ToSql> = values
        .iter()
        .map(|s| s as &dyn rusqlite::ToSql)
        .collect();

    conn.execute(&sql, params_vec.as_slice())
        .map_err(|e| format!("INSERT 오류: {}", e))?;

    let last_id = conn.last_insert_rowid();

    Ok(SqliteResult {
        success: true,
        rows_affected: 1,
        last_insert_id: Some(last_id),
        message: format!("데이터 저장 완료 (ID: {})", last_id),
    })
}

/// 배치 데이터 저장 (INSERT 여러 행)
#[tauri::command]
pub fn sqlite_save_batch(
    db_path: String,
    table_name: String,
    rows: Vec<Value>,
) -> Result<SqliteResult, String> {
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    if rows.is_empty() {
        return Ok(SqliteResult {
            success: true,
            rows_affected: 0,
            last_insert_id: None,
            message: "저장할 데이터가 없습니다".to_string(),
        });
    }

    let first_obj = rows[0].as_object()
        .ok_or("각 행은 JSON 객체여야 합니다")?;

    let keys: Vec<&String> = first_obj.keys().collect();
    let placeholders: Vec<String> = (0..keys.len()).map(|_| "?".to_string()).collect();

    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        table_name,
        keys.iter().map(|k| k.as_str()).collect::<Vec<_>>().join(", "),
        placeholders.join(", ")
    );

    let mut stmt = conn.prepare(&sql)
        .map_err(|e| format!("SQL 준비 오류: {}", e))?;

    let mut total_affected = 0;

    for row in &rows {
        if let Some(obj) = row.as_object() {
            let values: Vec<String> = keys
                .iter()
                .map(|k| value_to_sqlite_string(obj.get(*k).unwrap_or(&Value::Null)))
                .collect();

            let params_vec: Vec<&dyn rusqlite::ToSql> = values
                .iter()
                .map(|s| s as &dyn rusqlite::ToSql)
                .collect();

            if stmt.execute(params_vec.as_slice()).is_ok() {
                total_affected += 1;
            }
        }
    }

    Ok(SqliteResult {
        success: true,
        rows_affected: total_affected,
        last_insert_id: Some(conn.last_insert_rowid()),
        message: format!("{}개 행 저장 완료", total_affected),
    })
}

/// 데이터 조회 (SELECT)
#[tauri::command]
pub fn sqlite_query(
    db_path: String,
    sql: String,
    params_json: Option<Vec<Value>>,
) -> Result<QueryResult, String> {
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    let mut stmt = conn.prepare(&sql)
        .map_err(|e| format!("SQL 준비 오류: {}", e))?;

    // 컬럼 이름 추출
    let columns: Vec<String> = stmt
        .column_names()
        .iter()
        .map(|s| s.to_string())
        .collect();

    // 파라미터 변환
    let param_values: Vec<String> = params_json
        .unwrap_or_default()
        .iter()
        .map(|v| value_to_sqlite_string(v))
        .collect();

    let params_ref: Vec<&dyn rusqlite::ToSql> = param_values
        .iter()
        .map(|s| s as &dyn rusqlite::ToSql)
        .collect();

    let mut rows_result: Vec<Vec<Value>> = Vec::new();

    let mut query_rows = stmt.query(params_ref.as_slice())
        .map_err(|e| format!("쿼리 실행 오류: {}", e))?;

    while let Some(row) = query_rows.next().map_err(|e| e.to_string())? {
        let mut row_values: Vec<Value> = Vec::new();
        for i in 0..columns.len() {
            let value = sqlite_value_to_json(row, i);
            row_values.push(value);
        }
        rows_result.push(row_values);
    }

    Ok(QueryResult {
        columns,
        row_count: rows_result.len(),
        rows: rows_result,
    })
}

/// 테이블 목록 조회
#[tauri::command]
pub fn sqlite_list_tables(db_path: String) -> Result<Vec<TableInfo>, String> {
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .map_err(|e| format!("쿼리 준비 오류: {}", e))?;

    let table_names: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("쿼리 실행 오류: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let mut tables: Vec<TableInfo> = Vec::new();

    for name in table_names {
        // 컬럼 정보 조회
        let mut col_stmt = conn
            .prepare(&format!("PRAGMA table_info({})", name))
            .map_err(|e| e.to_string())?;

        let columns: Vec<ColumnInfo> = col_stmt
            .query_map([], |row| {
                Ok(ColumnInfo {
                    name: row.get(1)?,
                    data_type: row.get(2)?,
                    nullable: row.get::<_, i32>(3)? == 0,
                    primary_key: row.get::<_, i32>(5)? == 1,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        // 행 수 조회
        let row_count: i64 = conn
            .query_row(&format!("SELECT COUNT(*) FROM {}", name), [], |row| row.get(0))
            .unwrap_or(0);

        tables.push(TableInfo {
            name,
            columns,
            row_count,
        });
    }

    Ok(tables)
}

// ============================================================
// JSON 파일 저장/로드
// ============================================================

/// JSON 파일 저장
#[tauri::command]
pub fn json_file_save(
    file_path: String,
    data: Value,
    pretty: Option<bool>,
) -> Result<String, String> {
    let path = Path::new(&file_path);

    // 디렉토리가 없으면 생성
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("디렉토리 생성 오류: {}", e))?;
    }

    let content = if pretty.unwrap_or(true) {
        serde_json::to_string_pretty(&data)
            .map_err(|e| format!("JSON 직렬화 오류: {}", e))?
    } else {
        serde_json::to_string(&data)
            .map_err(|e| format!("JSON 직렬화 오류: {}", e))?
    };

    fs::write(&path, &content)
        .map_err(|e| format!("파일 쓰기 오류: {}", e))?;

    Ok(format!("JSON 저장 완료: {} ({}bytes)", file_path, content.len()))
}

/// JSON 파일 로드
#[tauri::command]
pub fn json_file_load(file_path: String) -> Result<Value, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("파일을 찾을 수 없습니다: {}", file_path));
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("파일 읽기 오류: {}", e))?;

    let data: Value = serde_json::from_str(&content)
        .map_err(|e| format!("JSON 파싱 오류: {}", e))?;

    Ok(data)
}

/// JSON 파일에 데이터 추가 (배열이면 push, 객체면 merge)
#[tauri::command]
pub fn json_file_append(
    file_path: String,
    data: Value,
) -> Result<String, String> {
    let path = Path::new(&file_path);

    let mut existing: Value = if path.exists() {
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("파일 읽기 오류: {}", e))?;
        serde_json::from_str(&content).unwrap_or(json!([]))
    } else {
        json!([])
    };

    match &mut existing {
        Value::Array(arr) => {
            if data.is_array() {
                if let Some(new_arr) = data.as_array() {
                    arr.extend(new_arr.clone());
                }
            } else {
                arr.push(data);
            }
        }
        Value::Object(obj) => {
            if let Some(new_obj) = data.as_object() {
                for (k, v) in new_obj {
                    obj.insert(k.clone(), v.clone());
                }
            }
        }
        _ => {
            existing = json!([existing, data]);
        }
    }

    let content = serde_json::to_string_pretty(&existing)
        .map_err(|e| format!("JSON 직렬화 오류: {}", e))?;

    fs::write(&path, &content)
        .map_err(|e| format!("파일 쓰기 오류: {}", e))?;

    Ok(format!("JSON 추가 완료: {}", file_path))
}

// ============================================================
// 헬퍼 함수
// ============================================================

fn value_to_sqlite_string(value: &Value) -> String {
    match value {
        Value::Null => "NULL".to_string(),
        Value::Bool(b) => if *b { "1".to_string() } else { "0".to_string() },
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        Value::Array(_) | Value::Object(_) => serde_json::to_string(value).unwrap_or_default(),
    }
}

fn sqlite_value_to_json(row: &rusqlite::Row, idx: usize) -> Value {
    // SQLite는 동적 타입이므로 여러 타입 시도
    if let Ok(v) = row.get::<_, i64>(idx) {
        return json!(v);
    }
    if let Ok(v) = row.get::<_, f64>(idx) {
        return json!(v);
    }
    if let Ok(v) = row.get::<_, String>(idx) {
        // JSON 문자열인지 확인
        if let Ok(parsed) = serde_json::from_str::<Value>(&v) {
            if parsed.is_object() || parsed.is_array() {
                return parsed;
            }
        }
        return json!(v);
    }
    if let Ok(v) = row.get::<_, Vec<u8>>(idx) {
        return json!(format!("<blob: {} bytes>", v.len()));
    }

    Value::Null
}
