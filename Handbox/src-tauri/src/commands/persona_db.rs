// persona_db.rs - 페르소나 데이터베이스 관리
//
// SQLite 기반 페르소나 CRUD 및 평가 이력 관리
// 전문가 에이전트의 지식/경력/평가성향을 저장하고 조회

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

// ============================================================
// 타입 정의
// ============================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PersonaDefinition {
    pub id: String,
    pub name: String,
    pub title: String,
    pub domain: String,
    pub expertise: Value,         // JSON: { primary, secondary, keywords }
    pub experience: Value,        // JSON: { years, level, credentials, affiliations }
    pub evaluation_behavior: Value, // JSON: { stance, evaluationFocus, scoreBias, strictness }
    pub xai_config: Value,        // JSON: XAI 설정
    pub knowledge_bases: Value,   // JSON Array: 지식 베이스 목록
    pub evaluation_history: Value, // JSON Array: 평가 이력
    pub evaluation_stats: Value,  // JSON: 평가 통계
    pub system_prompt: String,
    pub category: String,
    pub is_builtin: bool,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PersonaSummary {
    pub id: String,
    pub name: String,
    pub title: String,
    pub domain: String,
    pub category: String,
    pub is_builtin: bool,
    pub is_active: bool,
    pub experience_level: String,
    pub total_evaluations: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EvaluationRecord {
    pub id: String,
    pub persona_id: String,
    pub target_name: String,
    pub target_id: String,
    pub evaluated_at: String,
    pub result: String,           // approve, conditional, reject, abstain
    pub scores: Value,            // JSON: 항목별 점수
    pub total_score: f64,
    pub opinion: String,
    pub reasoning: String,
    pub key_insights: Value,      // JSON Array
    pub workflow_id: Option<String>,
    pub session_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbResult {
    pub success: bool,
    pub message: String,
    pub id: Option<String>,
}

// ============================================================
// 데이터베이스 경로 및 초기화
// ============================================================

fn get_persona_db_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("앱 데이터 디렉토리를 찾을 수 없습니다")?;

    let db_dir = app_data_dir.join("persona");
    fs::create_dir_all(&db_dir)
        .map_err(|e| format!("디렉토리 생성 오류: {}", e))?;

    Ok(db_dir.join("personas.db"))
}

fn init_persona_tables(conn: &Connection) -> Result<(), String> {
    // 페르소나 테이블
    conn.execute(
        "CREATE TABLE IF NOT EXISTS personas (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            title TEXT NOT NULL,
            domain TEXT NOT NULL,
            expertise TEXT NOT NULL,
            experience TEXT NOT NULL,
            evaluation_behavior TEXT NOT NULL,
            xai_config TEXT NOT NULL,
            knowledge_bases TEXT DEFAULT '[]',
            evaluation_history TEXT DEFAULT '[]',
            evaluation_stats TEXT DEFAULT '{}',
            system_prompt TEXT NOT NULL,
            category TEXT NOT NULL,
            is_builtin INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )
    .map_err(|e| format!("페르소나 테이블 생성 오류: {}", e))?;

    // 평가 이력 테이블 (빠른 조회를 위해 별도 테이블)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS evaluation_records (
            id TEXT PRIMARY KEY,
            persona_id TEXT NOT NULL,
            target_name TEXT NOT NULL,
            target_id TEXT NOT NULL,
            evaluated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            result TEXT NOT NULL,
            scores TEXT NOT NULL,
            total_score REAL NOT NULL,
            opinion TEXT NOT NULL,
            reasoning TEXT NOT NULL,
            key_insights TEXT DEFAULT '[]',
            workflow_id TEXT,
            session_id TEXT,
            FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| format!("평가 이력 테이블 생성 오류: {}", e))?;

    // 인덱스 생성
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_evaluation_persona
         ON evaluation_records(persona_id)",
        [],
    )
    .map_err(|e| format!("인덱스 생성 오류: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_evaluation_date
         ON evaluation_records(evaluated_at DESC)",
        [],
    )
    .map_err(|e| format!("인덱스 생성 오류: {}", e))?;

    Ok(())
}

// ============================================================
// 페르소나 CRUD
// ============================================================

/// 페르소나 DB 초기화
#[tauri::command]
pub fn persona_init_db(app_handle: AppHandle) -> Result<String, String> {
    let db_path = get_persona_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    init_persona_tables(&conn)?;

    Ok(format!("페르소나 DB 초기화 완료: {:?}", db_path))
}

/// 페르소나 저장 (INSERT or UPDATE)
#[tauri::command]
pub fn persona_save(
    app_handle: AppHandle,
    persona: PersonaDefinition,
) -> Result<DbResult, String> {
    let db_path = get_persona_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    init_persona_tables(&conn)?;

    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO personas
         (id, name, title, domain, expertise, experience, evaluation_behavior,
          xai_config, knowledge_bases, evaluation_history, evaluation_stats,
          system_prompt, category, is_builtin, is_active, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
                 COALESCE((SELECT created_at FROM personas WHERE id = ?1), ?16), ?16)",
        params![
            persona.id,
            persona.name,
            persona.title,
            persona.domain,
            serde_json::to_string(&persona.expertise).unwrap_or_default(),
            serde_json::to_string(&persona.experience).unwrap_or_default(),
            serde_json::to_string(&persona.evaluation_behavior).unwrap_or_default(),
            serde_json::to_string(&persona.xai_config).unwrap_or_default(),
            serde_json::to_string(&persona.knowledge_bases).unwrap_or_default(),
            serde_json::to_string(&persona.evaluation_history).unwrap_or_default(),
            serde_json::to_string(&persona.evaluation_stats).unwrap_or_default(),
            persona.system_prompt,
            persona.category,
            if persona.is_builtin { 1 } else { 0 },
            if persona.is_active { 1 } else { 0 },
            now.clone(),
        ],
    )
    .map_err(|e| format!("페르소나 저장 오류: {}", e))?;

    Ok(DbResult {
        success: true,
        message: format!("페르소나 '{}' 저장 완료", persona.name),
        id: Some(persona.id),
    })
}

/// 페르소나 조회 (단일)
#[tauri::command]
pub fn persona_load(
    app_handle: AppHandle,
    persona_id: String,
) -> Result<PersonaDefinition, String> {
    let db_path = get_persona_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, title, domain, expertise, experience, evaluation_behavior,
                    xai_config, knowledge_bases, evaluation_history, evaluation_stats,
                    system_prompt, category, is_builtin, is_active, created_at, updated_at
             FROM personas WHERE id = ?1",
        )
        .map_err(|e| format!("쿼리 준비 오류: {}", e))?;

    let persona = stmt
        .query_row(params![persona_id], |row| {
            Ok(PersonaDefinition {
                id: row.get(0)?,
                name: row.get(1)?,
                title: row.get(2)?,
                domain: row.get(3)?,
                expertise: serde_json::from_str(&row.get::<_, String>(4)?).unwrap_or(json!({})),
                experience: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or(json!({})),
                evaluation_behavior: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or(json!({})),
                xai_config: serde_json::from_str(&row.get::<_, String>(7)?).unwrap_or(json!({})),
                knowledge_bases: serde_json::from_str(&row.get::<_, String>(8)?).unwrap_or(json!([])),
                evaluation_history: serde_json::from_str(&row.get::<_, String>(9)?).unwrap_or(json!([])),
                evaluation_stats: serde_json::from_str(&row.get::<_, String>(10)?).unwrap_or(json!({})),
                system_prompt: row.get(11)?,
                category: row.get(12)?,
                is_builtin: row.get::<_, i32>(13)? == 1,
                is_active: row.get::<_, i32>(14)? == 1,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
            })
        })
        .map_err(|e| format!("페르소나 조회 오류: {}", e))?;

    Ok(persona)
}

/// 페르소나 목록 조회
#[tauri::command]
pub fn persona_list(
    app_handle: AppHandle,
    category: Option<String>,
    active_only: Option<bool>,
) -> Result<Vec<PersonaSummary>, String> {
    let db_path = get_persona_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    init_persona_tables(&conn)?;

    let mut sql = String::from(
        "SELECT p.id, p.name, p.title, p.domain, p.category, p.is_builtin, p.is_active, p.experience,
                (SELECT COUNT(*) FROM evaluation_records WHERE persona_id = p.id) as eval_count
         FROM personas p WHERE 1=1"
    );

    if category.is_some() {
        sql.push_str(" AND category = ?1");
    }

    if active_only.unwrap_or(false) {
        sql.push_str(" AND is_active = 1");
    }

    sql.push_str(" ORDER BY is_builtin DESC, name ASC");

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("쿼리 준비 오류: {}", e))?;

    // 헬퍼 함수로 행을 PersonaSummary로 변환
    fn row_to_summary(row: &rusqlite::Row) -> rusqlite::Result<PersonaSummary> {
        let exp_json: String = row.get(7)?;
        let exp: Value = serde_json::from_str(&exp_json).unwrap_or(json!({}));
        let level = exp.get("level").and_then(|v| v.as_str()).unwrap_or("senior").to_string();

        Ok(PersonaSummary {
            id: row.get(0)?,
            name: row.get(1)?,
            title: row.get(2)?,
            domain: row.get(3)?,
            category: row.get(4)?,
            is_builtin: row.get::<_, i32>(5)? == 1,
            is_active: row.get::<_, i32>(6)? == 1,
            experience_level: level,
            total_evaluations: row.get(8)?,
        })
    }

    let personas: Vec<PersonaSummary> = if let Some(cat) = &category {
        stmt.query_map(params![cat], row_to_summary)
            .map_err(|e| format!("쿼리 실행 오류: {}", e))?
            .filter_map(|r| r.ok())
            .collect()
    } else {
        stmt.query_map([], row_to_summary)
            .map_err(|e| format!("쿼리 실행 오류: {}", e))?
            .filter_map(|r| r.ok())
            .collect()
    };

    Ok(personas)
}

/// 페르소나 삭제
#[tauri::command]
pub fn persona_delete(
    app_handle: AppHandle,
    persona_id: String,
) -> Result<DbResult, String> {
    let db_path = get_persona_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    // 내장 페르소나는 삭제 불가
    let is_builtin: i32 = conn
        .query_row(
            "SELECT is_builtin FROM personas WHERE id = ?1",
            params![&persona_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if is_builtin == 1 {
        return Err("내장 페르소나는 삭제할 수 없습니다".to_string());
    }

    conn.execute(
        "DELETE FROM personas WHERE id = ?1",
        params![persona_id],
    )
    .map_err(|e| format!("페르소나 삭제 오류: {}", e))?;

    // 관련 평가 이력도 삭제
    conn.execute(
        "DELETE FROM evaluation_records WHERE persona_id = ?1",
        params![persona_id],
    )
    .map_err(|e| format!("평가 이력 삭제 오류: {}", e))?;

    Ok(DbResult {
        success: true,
        message: format!("페르소나 '{}' 삭제 완료", persona_id),
        id: None,
    })
}

/// 페르소나 활성화/비활성화 토글
#[tauri::command]
pub fn persona_toggle_active(
    app_handle: AppHandle,
    persona_id: String,
    is_active: bool,
) -> Result<DbResult, String> {
    let db_path = get_persona_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    conn.execute(
        "UPDATE personas SET is_active = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![if is_active { 1 } else { 0 }, persona_id],
    )
    .map_err(|e| format!("상태 업데이트 오류: {}", e))?;

    Ok(DbResult {
        success: true,
        message: format!("페르소나 활성 상태 변경: {}", is_active),
        id: Some(persona_id),
    })
}

// ============================================================
// 평가 이력 관리
// ============================================================

/// 평가 이력 저장
#[tauri::command]
pub fn evaluation_record_save(
    app_handle: AppHandle,
    record: EvaluationRecord,
) -> Result<DbResult, String> {
    let db_path = get_persona_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    init_persona_tables(&conn)?;

    conn.execute(
        "INSERT INTO evaluation_records
         (id, persona_id, target_name, target_id, evaluated_at, result, scores,
          total_score, opinion, reasoning, key_insights, workflow_id, session_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            record.id,
            record.persona_id,
            record.target_name,
            record.target_id,
            record.evaluated_at,
            record.result,
            serde_json::to_string(&record.scores).unwrap_or_default(),
            record.total_score,
            record.opinion,
            record.reasoning,
            serde_json::to_string(&record.key_insights).unwrap_or_default(),
            record.workflow_id,
            record.session_id,
        ],
    )
    .map_err(|e| format!("평가 이력 저장 오류: {}", e))?;

    // 페르소나 통계 업데이트
    update_persona_stats(&conn, &record.persona_id)?;

    Ok(DbResult {
        success: true,
        message: "평가 이력 저장 완료".to_string(),
        id: Some(record.id),
    })
}

/// 평가 이력 조회 (페르소나별)
#[tauri::command]
pub fn evaluation_record_list(
    app_handle: AppHandle,
    persona_id: String,
    limit: Option<i32>,
) -> Result<Vec<EvaluationRecord>, String> {
    let db_path = get_persona_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    let limit_val = limit.unwrap_or(100);

    let mut stmt = conn
        .prepare(
            "SELECT id, persona_id, target_name, target_id, evaluated_at, result,
                    scores, total_score, opinion, reasoning, key_insights,
                    workflow_id, session_id
             FROM evaluation_records
             WHERE persona_id = ?1
             ORDER BY evaluated_at DESC
             LIMIT ?2",
        )
        .map_err(|e| format!("쿼리 준비 오류: {}", e))?;

    let rows = stmt
        .query_map(params![persona_id, limit_val], |row| {
            Ok(EvaluationRecord {
                id: row.get(0)?,
                persona_id: row.get(1)?,
                target_name: row.get(2)?,
                target_id: row.get(3)?,
                evaluated_at: row.get(4)?,
                result: row.get(5)?,
                scores: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or(json!({})),
                total_score: row.get(7)?,
                opinion: row.get(8)?,
                reasoning: row.get(9)?,
                key_insights: serde_json::from_str(&row.get::<_, String>(10)?).unwrap_or(json!([])),
                workflow_id: row.get(11)?,
                session_id: row.get(12)?,
            })
        })
        .map_err(|e| format!("쿼리 실행 오류: {}", e))?;

    let records: Vec<EvaluationRecord> = rows.filter_map(|r| r.ok()).collect();
    Ok(records)
}

/// 페르소나 통계 업데이트
fn update_persona_stats(conn: &Connection, persona_id: &str) -> Result<(), String> {
    let stats: Value = conn
        .query_row(
            "SELECT
                COUNT(*) as total,
                SUM(CASE WHEN result = 'approve' THEN 1 ELSE 0 END) as approve_count,
                SUM(CASE WHEN result = 'conditional' THEN 1 ELSE 0 END) as conditional_count,
                SUM(CASE WHEN result = 'reject' THEN 1 ELSE 0 END) as reject_count,
                AVG(total_score) as avg_score,
                MAX(evaluated_at) as last_eval,
                MIN(evaluated_at) as first_eval
             FROM evaluation_records
             WHERE persona_id = ?1",
            params![persona_id],
            |row| {
                Ok(json!({
                    "totalEvaluations": row.get::<_, i64>(0)?,
                    "approveCount": row.get::<_, i64>(1)?,
                    "conditionalCount": row.get::<_, i64>(2)?,
                    "rejectCount": row.get::<_, i64>(3)?,
                    "averageScore": row.get::<_, f64>(4).unwrap_or(0.0),
                    "lastEvaluationAt": row.get::<_, Option<String>>(5)?,
                    "firstEvaluationAt": row.get::<_, Option<String>>(6)?,
                    "primaryDomains": []
                }))
            },
        )
        .unwrap_or(json!({}));

    conn.execute(
        "UPDATE personas SET evaluation_stats = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![serde_json::to_string(&stats).unwrap_or_default(), persona_id],
    )
    .map_err(|e| format!("통계 업데이트 오류: {}", e))?;

    Ok(())
}

// ============================================================
// 내장 페르소나 시드 (앱 초기화 시 호출)
// ============================================================

/// 내장 페르소나 시드 데이터 삽입
#[tauri::command]
pub fn persona_seed_builtins(app_handle: AppHandle) -> Result<DbResult, String> {
    let db_path = get_persona_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    init_persona_tables(&conn)?;

    // 이미 시드가 완료되었는지 확인
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM personas WHERE is_builtin = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if count > 0 {
        return Ok(DbResult {
            success: true,
            message: format!("이미 {}개의 내장 페르소나가 있습니다", count),
            id: None,
        });
    }

    // 내장 페르소나는 프론트엔드의 builtinPersonas.ts에서 관리
    // 이 함수는 DB 테이블만 준비하고, 실제 시드는 프론트엔드에서 수행

    Ok(DbResult {
        success: true,
        message: "페르소나 DB 준비 완료 (시드 대기 중)".to_string(),
        id: None,
    })
}

/// 도메인별 페르소나 검색
#[tauri::command]
pub fn persona_search(
    app_handle: AppHandle,
    query: String,
    domains: Option<Vec<String>>,
    limit: Option<i32>,
) -> Result<Vec<PersonaSummary>, String> {
    let db_path = get_persona_db_path(&app_handle)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("SQLite 연결 오류: {}", e))?;

    let search_pattern = format!("%{}%", query);
    let limit_val = limit.unwrap_or(20);

    let mut sql = String::from(
        "SELECT p.id, p.name, p.title, p.domain, p.category, p.is_builtin, p.is_active, p.experience,
                (SELECT COUNT(*) FROM evaluation_records WHERE persona_id = p.id) as eval_count
         FROM personas p
         WHERE (p.name LIKE ?1 OR p.title LIKE ?1 OR p.domain LIKE ?1)
         AND p.is_active = 1"
    );

    if let Some(ref doms) = domains {
        if !doms.is_empty() {
            let placeholders: Vec<String> = doms.iter().enumerate().map(|(i, _)| format!("?{}", i + 3)).collect();
            sql.push_str(&format!(" AND p.domain IN ({})", placeholders.join(", ")));
        }
    }

    sql.push_str(&format!(" ORDER BY p.is_builtin DESC, eval_count DESC LIMIT ?2"));

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("쿼리 준비 오류: {}", e))?;

    let rows = stmt
        .query_map(params![search_pattern, limit_val], |row| {
            let exp_json: String = row.get(7)?;
            let exp: Value = serde_json::from_str(&exp_json).unwrap_or(json!({}));
            let level = exp.get("level").and_then(|v| v.as_str()).unwrap_or("senior").to_string();

            Ok(PersonaSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                title: row.get(2)?,
                domain: row.get(3)?,
                category: row.get(4)?,
                is_builtin: row.get::<_, i32>(5)? == 1,
                is_active: row.get::<_, i32>(6)? == 1,
                experience_level: level,
                total_evaluations: row.get(8)?,
            })
        })
        .map_err(|e| format!("쿼리 실행 오류: {}", e))?;

    let personas: Vec<PersonaSummary> = rows.filter_map(|r| r.ok()).collect();
    Ok(personas)
}
