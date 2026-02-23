/**
 * Memory Database Commands
 *
 * MemoryAgent를 위한 SQLite 기반 메모리 데이터베이스.
 * 사용자 학습 데이터, 활동 로그, 프로필 저장.
 */

use rusqlite::Connection;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;
use lazy_static::lazy_static;

// ============================================================
// Global Database Connection
// ============================================================

lazy_static! {
    static ref MEMORY_DB: Mutex<Option<Connection>> = Mutex::new(None);
}

fn get_db_path(app: &AppHandle) -> PathBuf {
    let app_data = app.path_resolver().app_data_dir().expect("Failed to get app data dir");
    app_data.join("memory.db")
}

fn ensure_db(app: &AppHandle) -> Result<(), String> {
    let mut db_guard = MEMORY_DB.lock().map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    if db_guard.is_none() {
        let db_path = get_db_path(app);

        // 디렉토리 생성
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

        // WAL 모드 활성화 (성능 향상)
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .map_err(|e| e.to_string())?;

        *db_guard = Some(conn);
    }

    Ok(())
}

// ============================================================
// Commands
// ============================================================

/// SQL 실행 (INSERT, UPDATE, DELETE, CREATE TABLE 등)
#[tauri::command]
pub async fn memory_db_execute(
    app: AppHandle,
    sql: String,
    params: Option<Vec<Value>>,
) -> Result<u64, String> {
    ensure_db(&app)?;

    let db_guard = MEMORY_DB.lock().map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    let params_vec: Vec<Box<dyn rusqlite::ToSql>> = match params {
        Some(p) => p.iter().map(|v| value_to_sql(v)).collect(),
        None => vec![],
    };

    // params를 참조 슬라이스로 변환
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter()
        .map(|p| p.as_ref())
        .collect();

    let affected = conn.execute(&sql, params_refs.as_slice())
        .map_err(|e: rusqlite::Error| e.to_string())?;

    Ok(affected as u64)
}

/// SQL 쿼리 (SELECT)
#[tauri::command]
pub async fn memory_db_query(
    app: AppHandle,
    sql: String,
    params: Option<Vec<Value>>,
) -> Result<Vec<Value>, String> {
    ensure_db(&app)?;

    let db_guard = MEMORY_DB.lock().map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    let params_vec: Vec<Box<dyn rusqlite::ToSql>> = match params {
        Some(p) => p.iter().map(|v| value_to_sql(v)).collect(),
        None => vec![],
    };

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter()
        .map(|p| p.as_ref())
        .collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let column_count = stmt.column_count();
    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let rows = stmt.query_map(params_refs.as_slice(), |row| {
        let mut obj = serde_json::Map::new();

        for i in 0..column_count {
            let col_name = &column_names[i];
            let value: Value = match row.get_ref(i) {
                Ok(rusqlite::types::ValueRef::Null) => Value::Null,
                Ok(rusqlite::types::ValueRef::Integer(i)) => Value::Number(i.into()),
                Ok(rusqlite::types::ValueRef::Real(f)) => {
                    serde_json::Number::from_f64(f)
                        .map(Value::Number)
                        .unwrap_or(Value::Null)
                }
                Ok(rusqlite::types::ValueRef::Text(s)) => {
                    Value::String(String::from_utf8_lossy(s).to_string())
                }
                Ok(rusqlite::types::ValueRef::Blob(b)) => {
                    // BLOB을 Base64로 인코딩
                    use base64::{Engine as _, engine::general_purpose};
                    Value::String(general_purpose::STANDARD.encode(b))
                }
                Err(_) => Value::Null,
            };
            obj.insert(col_name.clone(), value);
        }

        Ok(Value::Object(obj))
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }

    Ok(results)
}

/// 텍스트 파일 읽기
#[tauri::command]
pub async fn read_text_file(
    path: String,
    encoding: Option<String>,
) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// 텍스트 파일 쓰기
#[tauri::command]
pub async fn write_text_file(
    path: String,
    content: String,
) -> Result<(), String> {
    // 디렉토리 생성
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    std::fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

/// 디렉토리 목록
#[tauri::command]
pub async fn list_directory(
    path: String,
    recursive: Option<bool>,
) -> Result<Vec<Value>, String> {
    let recursive = recursive.unwrap_or(false);
    let mut entries = Vec::new();

    list_directory_impl(&path, recursive, &mut entries)?;

    Ok(entries)
}

fn list_directory_impl(path: &str, recursive: bool, entries: &mut Vec<Value>) -> Result<(), String> {
    let read_dir = std::fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        let file_path = entry.path().to_string_lossy().to_string();

        let entry_obj = serde_json::json!({
            "name": file_name,
            "path": file_path,
            "isDirectory": metadata.is_dir(),
            "isFile": metadata.is_file(),
            "size": metadata.len(),
            "modified": metadata.modified()
                .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs())
                .unwrap_or(0),
        });

        entries.push(entry_obj);

        if recursive && metadata.is_dir() {
            list_directory_impl(&file_path, true, entries)?;
        }
    }

    Ok(())
}

/// Python 스크립트 실행 (Memory Agent용)
#[tauri::command]
pub async fn memory_execute_python(
    code: String,
    input_json: String,
) -> Result<Value, String> {
    use std::process::Command;

    // Python 코드를 임시 파일에 저장
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join(format!("handbox_script_{}.py", std::process::id()));

    let python_code = format!(
        r#"
import sys
import json

input_data = json.loads(r'''{}''')

{}

# 결과를 JSON으로 출력
if 'result' in dir():
    print(json.dumps(result))
else:
    print(json.dumps(None))
"#,
        input_json.replace("'''", "\\'\\'\\'"),
        code
    );

    std::fs::write(&script_path, &python_code).map_err(|e| e.to_string())?;

    // Python 실행
    let output = Command::new("python")
        .arg(&script_path)
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;

    // 임시 파일 삭제
    let _ = std::fs::remove_file(&script_path);

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse Python output: {}", e))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Python error: {}", stderr))
    }
}

/// Shell 스크립트 실행 (Memory Agent용)
#[tauri::command]
pub async fn memory_execute_shell(
    code: String,
    input_json: String,
) -> Result<Value, String> {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    let (shell, flag) = ("cmd", "/C");

    #[cfg(not(target_os = "windows"))]
    let (shell, flag) = ("sh", "-c");

    let output = Command::new(shell)
        .arg(flag)
        .arg(&code)
        .env("INPUT_JSON", &input_json)
        .output()
        .map_err(|e| format!("Failed to execute shell: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(serde_json::json!({
        "stdout": stdout,
        "stderr": stderr,
        "exitCode": output.status.code().unwrap_or(-1),
    }))
}

// ============================================================
// Helpers
// ============================================================

fn value_to_sql(v: &Value) -> Box<dyn rusqlite::ToSql> {
    match v {
        Value::Null => Box::new(rusqlite::types::Value::Null),
        Value::Bool(b) => Box::new(*b as i32),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else if let Some(f) = n.as_f64() {
                Box::new(f)
            } else {
                Box::new(rusqlite::types::Value::Null)
            }
        }
        Value::String(s) => Box::new(s.clone()),
        Value::Array(_) | Value::Object(_) => Box::new(v.to_string()),
    }
}
