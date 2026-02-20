// Tier 1 IO 도구 — 파일 입출력 및 HTTP 요청
// file.read, file.write, file.list, file.info, http.request

use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::time::SystemTime;

// ─────────────────────────────────────────────
// 유틸리티 함수
// ─────────────────────────────────────────────

fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

fn system_time_to_string(time: SystemTime) -> String {
    let duration = time
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // ISO 8601 근사 변환
    let dt = chrono::DateTime::from_timestamp(secs as i64, 0)
        .unwrap_or_default();
    dt.format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

fn detect_mime(path: &Path) -> String {
    // infer 크레이트로 매직 바이트 기반 감지
    if let Ok(bytes) = fs::read(path) {
        if let Some(kind) = infer::get(&bytes) {
            return kind.mime_type().to_string();
        }
    }
    // 확장자 기반 폴백
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "txt" | "log" | "md" => "text/plain".to_string(),
        "json" => "application/json".to_string(),
        "csv" => "text/csv".to_string(),
        "xml" => "application/xml".to_string(),
        "html" | "htm" => "text/html".to_string(),
        "yaml" | "yml" => "text/yaml".to_string(),
        "toml" => "text/toml".to_string(),
        "ini" | "cfg" => "text/plain".to_string(),
        "pdf" => "application/pdf".to_string(),
        "xlsx" | "xls" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string(),
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string(),
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation".to_string(),
        "hwp" => "application/x-hwp".to_string(),
        "png" => "image/png".to_string(),
        "jpg" | "jpeg" => "image/jpeg".to_string(),
        "gif" => "image/gif".to_string(),
        "svg" => "image/svg+xml".to_string(),
        "zip" => "application/zip".to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

/// 텍스트 파일 여부 판별: 첫 8KB에서 NULL 바이트 비율 확인
fn is_text_file(path: &Path) -> bool {
    let mut file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut buf = vec![0u8; 8192];
    let n = match file.read(&mut buf) {
        Ok(n) => n,
        Err(_) => return false,
    };
    if n == 0 {
        return true; // 빈 파일은 텍스트로 취급
    }
    let null_count = buf[..n].iter().filter(|&&b| b == 0).count();
    // NULL 바이트가 1% 미만이면 텍스트
    (null_count as f64 / n as f64) < 0.01
}

/// 인코딩 감지 및 디코딩
fn read_with_encoding(bytes: &[u8], encoding_hint: Option<&str>) -> (String, String) {
    // 명시적 인코딩 지정 시
    if let Some(enc_name) = encoding_hint {
        if let Some(encoding) = encoding_rs::Encoding::for_label(enc_name.as_bytes()) {
            let (decoded, _, _) = encoding.decode(bytes);
            return (decoded.into_owned(), enc_name.to_string());
        }
    }

    // BOM 감지
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        // UTF-8 BOM
        return (
            String::from_utf8_lossy(&bytes[3..]).into_owned(),
            "utf-8-bom".to_string(),
        );
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (decoded, _, _) = encoding_rs::UTF_16LE.decode(bytes);
        return (decoded.into_owned(), "utf-16le".to_string());
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (decoded, _, _) = encoding_rs::UTF_16BE.decode(bytes);
        return (decoded.into_owned(), "utf-16be".to_string());
    }

    // UTF-8 시도
    if let Ok(s) = std::str::from_utf8(bytes) {
        return (s.to_string(), "utf-8".to_string());
    }

    // EUC-KR (한국어 폴백)
    let (decoded, _, had_errors) = encoding_rs::EUC_KR.decode(bytes);
    if !had_errors {
        return (decoded.into_owned(), "euc-kr".to_string());
    }

    // Shift-JIS (일본어 폴백)
    let (decoded, _, had_errors) = encoding_rs::SHIFT_JIS.decode(bytes);
    if !had_errors {
        return (decoded.into_owned(), "shift-jis".to_string());
    }

    // 최종 폴백: UTF-8 lossy
    (
        String::from_utf8_lossy(bytes).into_owned(),
        "utf-8-lossy".to_string(),
    )
}

// ─────────────────────────────────────────────
// file.read — 파일 읽기
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_file_read(
    path: String,
    encoding: Option<String>,
    offset: Option<u64>,
    limit: Option<u64>,
    as_binary: Option<bool>,
) -> Result<Value, String> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", path));
    }
    if file_path.is_dir() {
        return Err(format!("디렉토리입니다. file.list를 사용하세요: {}", path));
    }

    let metadata = fs::metadata(file_path).map_err(|e| format!("메타데이터 읽기 실패: {}", e))?;
    let file_size = metadata.len();
    let mime = detect_mime(file_path);
    let modified = metadata
        .modified()
        .map(|t| system_time_to_string(t))
        .unwrap_or_default();
    let created = metadata
        .created()
        .map(|t| system_time_to_string(t))
        .unwrap_or_default();

    // 바이너리 모드
    if as_binary.unwrap_or(false) {
        let bytes = fs::read(file_path).map_err(|e| format!("파일 읽기 실패: {}", e))?;
        let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
        return Ok(json!({
            "data": encoded,
            "encoding_detected": "binary/base64",
            "size": file_size,
            "size_human": format_size(file_size),
            "mime_type": mime,
            "truncated": false,
            "metadata": {
                "modified": modified,
                "created": created,
            }
        }));
    }

    // 텍스트 모드
    let raw_bytes = if offset.is_some() || limit.is_some() {
        // 부분 읽기
        let mut file =
            fs::File::open(file_path).map_err(|e| format!("파일 열기 실패: {}", e))?;
        if let Some(off) = offset {
            use std::io::Seek;
            file.seek(std::io::SeekFrom::Start(off))
                .map_err(|e| format!("시크 실패: {}", e))?;
        }
        let read_limit = limit.unwrap_or(file_size) as usize;
        let mut buf = vec![0u8; read_limit.min(50 * 1024 * 1024)]; // 최대 50MB
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("읽기 실패: {}", e))?;
        buf.truncate(n);
        buf
    } else {
        fs::read(file_path).map_err(|e| format!("파일 읽기 실패: {}", e))?
    };

    let truncated = limit.map_or(false, |l| file_size > l);
    let (text, detected_encoding) =
        read_with_encoding(&raw_bytes, encoding.as_deref());

    Ok(json!({
        "data": text,
        "encoding_detected": detected_encoding,
        "size": file_size,
        "size_human": format_size(file_size),
        "mime_type": mime,
        "truncated": truncated,
        "metadata": {
            "modified": modified,
            "created": created,
        }
    }))
}

// ─────────────────────────────────────────────
// 경로 검증 및 정규화 (Windows 호환)
// ─────────────────────────────────────────────

/// Windows 파일명에서 허용되지 않는 문자를 제거하거나 교체
fn sanitize_filename(name: &str) -> String {
    // Windows에서 허용되지 않는 문자: \ / : * ? " < > |
    let invalid_chars = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    let mut result = String::new();

    for ch in name.chars() {
        if invalid_chars.contains(&ch) {
            result.push('_'); // 유효하지 않은 문자를 _로 교체
        } else if ch.is_control() {
            // 제어 문자 제거
            continue;
        } else {
            result.push(ch);
        }
    }

    // 빈 문자열 방지
    if result.trim().is_empty() {
        return "output".to_string();
    }

    // Windows 예약어 체크 (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
    let upper = result.to_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL",
                    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
                    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];

    let base_name = result.split('.').next().unwrap_or(&result);
    if reserved.contains(&base_name.to_uppercase().as_str()) {
        return format!("_{}", result);
    }

    result
}

/// 전체 경로 검증 및 정규화
fn validate_and_sanitize_path(path: &str) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("파일 경로가 비어 있습니다".to_string());
    }

    let path = path.trim();

    // 줄바꿈이나 탭이 포함된 경우 제거
    let path = path.replace(['\n', '\r', '\t'], "");

    // Windows 절대 경로 패턴 체크 (C:\ 또는 \\)
    #[cfg(windows)]
    {
        let path_obj = Path::new(&path);

        // 파일명만 sanitize (디렉토리 경로는 유지)
        if let Some(file_name) = path_obj.file_name() {
            let sanitized_name = sanitize_filename(&file_name.to_string_lossy());

            if let Some(parent) = path_obj.parent() {
                let new_path = parent.join(&sanitized_name);
                return Ok(new_path.to_string_lossy().to_string());
            }
        }
    }

    Ok(path)
}

/// 기본 출력 경로 생성 (경로가 비어있거나 유효하지 않을 때)
fn get_default_output_path(extension: &str) -> String {
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let home = dirs::document_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let output_dir = home.join("Handbox_Output");
    let _ = std::fs::create_dir_all(&output_dir);

    output_dir
        .join(format!("output_{}.{}", timestamp, extension))
        .to_string_lossy()
        .to_string()
}

// ─────────────────────────────────────────────
// file.write — 파일 쓰기
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_file_write(
    path: String,
    content: String,
    encoding: Option<String>,
    mode: Option<String>,
    create_dirs: Option<bool>,
    backup: Option<bool>,
) -> Result<Value, String> {
    // 경로 검증 및 정규화
    let sanitized_path = if path.trim().is_empty() {
        get_default_output_path("txt")
    } else {
        validate_and_sanitize_path(&path)?
    };

    let file_path = Path::new(&sanitized_path);

    // 상위 디렉토리 생성
    if create_dirs.unwrap_or(true) {
        if let Some(parent) = file_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("디렉토리 생성 실패: {}", e))?;
            }
        }
    }

    // 백업
    let mut backup_path_str = None;
    if backup.unwrap_or(false) && file_path.exists() {
        let bak = format!("{}.bak", sanitized_path);
        fs::copy(file_path, &bak).map_err(|e| format!("백업 실패: {}", e))?;
        backup_path_str = Some(bak);
    }

    // 인코딩 변환
    let bytes = if let Some(ref enc_name) = encoding {
        if let Some(enc) = encoding_rs::Encoding::for_label(enc_name.as_bytes()) {
            let (encoded, _, _) = enc.encode(&content);
            encoded.into_owned()
        } else {
            content.as_bytes().to_vec()
        }
    } else {
        content.as_bytes().to_vec()
    };

    let write_mode = mode.as_deref().unwrap_or("overwrite");

    match write_mode {
        "append" => {
            let mut file = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(file_path)
                .map_err(|e| format!("파일 열기 실패: {}", e))?;
            file.write_all(&bytes)
                .map_err(|e| format!("쓰기 실패: {}", e))?;
        }
        "atomic" => {
            // 임시 파일에 쓴 후 rename (원자적 쓰기)
            let tmp_path = format!("{}.tmp.{}", sanitized_path, uuid::Uuid::new_v4());
            fs::write(&tmp_path, &bytes).map_err(|e| format!("임시 파일 쓰기 실패: {}", e))?;
            fs::rename(&tmp_path, file_path).map_err(|e| {
                // rename 실패 시 임시 파일 정리
                let _ = fs::remove_file(&tmp_path);
                format!("원자적 교체 실패: {}", e)
            })?;
        }
        _ => {
            // overwrite (기본)
            fs::write(file_path, &bytes).map_err(|e| format!("쓰기 실패: {}", e))?;
        }
    }

    let written_size = bytes.len() as u64;

    Ok(json!({
        "success": true,
        "path": sanitized_path,
        "size": written_size,
        "size_human": format_size(written_size),
        "backup_path": backup_path_str,
    }))
}

// ─────────────────────────────────────────────
// file.list — 디렉토리 파일 목록
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_file_list(
    path: String,
    pattern: Option<String>,
    recursive: Option<bool>,
    include_hidden: Option<bool>,
    sort_by: Option<String>,
    limit: Option<usize>,
) -> Result<Value, String> {
    let dir_path = Path::new(&path);
    if !dir_path.exists() {
        return Err(format!("경로가 존재하지 않습니다: {}", path));
    }
    if !dir_path.is_dir() {
        return Err(format!("디렉토리가 아닙니다: {}", path));
    }

    let show_hidden = include_hidden.unwrap_or(false);
    let is_recursive = recursive.unwrap_or(false);

    // glob 패턴이 있으면 glob으로 탐색
    let mut files: Vec<Value> = Vec::new();

    if let Some(ref pat) = pattern {
        let full_pattern = if is_recursive {
            format!("{}/{}", path.trim_end_matches('/').trim_end_matches('\\'), pat)
        } else {
            format!("{}/{}", path.trim_end_matches('/').trim_end_matches('\\'), pat)
        };

        let entries = glob::glob(&full_pattern).map_err(|e| format!("글로브 패턴 오류: {}", e))?;

        for entry in entries {
            if let Ok(p) = entry {
                if !show_hidden {
                    if let Some(name) = p.file_name() {
                        if name.to_string_lossy().starts_with('.') {
                            continue;
                        }
                    }
                }
                if let Ok(meta) = fs::metadata(&p) {
                    files.push(json!({
                        "name": p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
                        "path": p.to_string_lossy().to_string(),
                        "size": meta.len(),
                        "size_human": format_size(meta.len()),
                        "is_dir": meta.is_dir(),
                        "extension": p.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default(),
                        "modified": meta.modified().map(|t| system_time_to_string(t)).unwrap_or_default(),
                    }));
                }
            }
        }
    } else if is_recursive {
        // walkdir로 재귀 탐색
        for entry in walkdir::WalkDir::new(&path)
            .min_depth(1)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let p = entry.path();
            if !show_hidden {
                if let Some(name) = p.file_name() {
                    if name.to_string_lossy().starts_with('.') {
                        continue;
                    }
                }
            }
            if let Ok(meta) = entry.metadata() {
                files.push(json!({
                    "name": p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
                    "path": p.to_string_lossy().to_string(),
                    "size": meta.len(),
                    "size_human": format_size(meta.len()),
                    "is_dir": meta.is_dir(),
                    "extension": p.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default(),
                    "modified": meta.modified().map(|t| system_time_to_string(t)).unwrap_or_default(),
                }));
            }
        }
    } else {
        // 단일 디렉토리 읽기
        let entries = fs::read_dir(&path).map_err(|e| format!("디렉토리 읽기 실패: {}", e))?;
        for entry in entries {
            if let Ok(entry) = entry {
                let p = entry.path();
                if !show_hidden {
                    if let Some(name) = p.file_name() {
                        if name.to_string_lossy().starts_with('.') {
                            continue;
                        }
                    }
                }
                if let Ok(meta) = entry.metadata() {
                    files.push(json!({
                        "name": p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
                        "path": p.to_string_lossy().to_string(),
                        "size": meta.len(),
                        "size_human": format_size(meta.len()),
                        "is_dir": meta.is_dir(),
                        "extension": p.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default(),
                        "modified": meta.modified().map(|t| system_time_to_string(t)).unwrap_or_default(),
                    }));
                }
            }
        }
    }

    // 정렬
    let sort_key = sort_by.as_deref().unwrap_or("name");
    files.sort_by(|a, b| {
        match sort_key {
            "size" => {
                let sa = a["size"].as_u64().unwrap_or(0);
                let sb = b["size"].as_u64().unwrap_or(0);
                sb.cmp(&sa) // 큰 파일 먼저
            }
            "modified" => {
                let ma = a["modified"].as_str().unwrap_or("");
                let mb = b["modified"].as_str().unwrap_or("");
                mb.cmp(ma) // 최신 먼저
            }
            "type" => {
                let ea = a["extension"].as_str().unwrap_or("");
                let eb = b["extension"].as_str().unwrap_or("");
                ea.cmp(eb)
            }
            _ => {
                // name (기본)
                let na = a["name"].as_str().unwrap_or("");
                let nb = b["name"].as_str().unwrap_or("");
                na.to_lowercase().cmp(&nb.to_lowercase())
            }
        }
    });

    let total = files.len();

    // limit 적용
    if let Some(lim) = limit {
        files.truncate(lim);
    }

    Ok(json!({
        "files": files,
        "total_count": total,
        "path": path,
    }))
}

// ─────────────────────────────────────────────
// file.info — 파일 메타데이터
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_file_info(path: String) -> Result<Value, String> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", path));
    }

    let metadata = fs::metadata(file_path).map_err(|e| format!("메타데이터 읽기 실패: {}", e))?;
    let size = metadata.len();
    let is_text = if metadata.is_file() {
        is_text_file(file_path)
    } else {
        false
    };

    Ok(json!({
        "name": file_path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        "extension": file_path.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default(),
        "size": size,
        "size_human": format_size(size),
        "mime_type": detect_mime(file_path),
        "is_text": is_text,
        "is_binary": !is_text && metadata.is_file(),
        "is_dir": metadata.is_dir(),
        "created": metadata.created().map(|t| system_time_to_string(t)).unwrap_or_default(),
        "modified": metadata.modified().map(|t| system_time_to_string(t)).unwrap_or_default(),
        "accessed": metadata.accessed().map(|t| system_time_to_string(t)).unwrap_or_default(),
        "readonly": metadata.permissions().readonly(),
        "parent_dir": file_path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
    }))
}

// ─────────────────────────────────────────────
// http.request — HTTP 요청
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_http_request(
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    timeout_ms: Option<u64>,
    follow_redirects: Option<bool>,
    response_type: Option<String>,
) -> Result<Value, String> {
    let client = {
        let mut builder = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(
                timeout_ms.unwrap_or(30000),
            ));

        if let Some(false) = follow_redirects {
            builder = builder.redirect(reqwest::redirect::Policy::none());
        }

        builder.build().map_err(|e| format!("HTTP 클라이언트 생성 실패: {}", e))?
    };

    let http_method = match method.as_deref().unwrap_or("GET").to_uppercase().as_str() {
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        "HEAD" => reqwest::Method::HEAD,
        "OPTIONS" => reqwest::Method::OPTIONS,
        _ => reqwest::Method::GET,
    };

    let mut request = client.request(http_method, &url);

    // 헤더 추가
    if let Some(hdrs) = headers {
        for (key, value) in hdrs {
            request = request.header(&key, &value);
        }
    }

    // 바디 추가
    if let Some(b) = body {
        request = request.body(b);
    }

    let start = std::time::Instant::now();
    let response = request
        .send()
        .await
        .map_err(|e| format!("HTTP 요청 실패: {}", e))?;

    let elapsed_ms = start.elapsed().as_millis() as u64;
    let status = response.status().as_u16();
    let status_text = response.status().canonical_reason().unwrap_or("").to_string();
    let content_type = response
        .headers()
        .get("content-type")
        .map(|v| v.to_str().unwrap_or("").to_string())
        .unwrap_or_default();

    // 응답 헤더 수집
    let resp_headers: HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let resp_type = response_type.as_deref().unwrap_or("text");

    let body_value = match resp_type {
        "json" => {
            let text = response
                .text()
                .await
                .map_err(|e| format!("응답 본문 읽기 실패: {}", e))?;
            match serde_json::from_str::<Value>(&text) {
                Ok(v) => v,
                Err(_) => Value::String(text),
            }
        }
        "binary" => {
            let bytes = response
                .bytes()
                .await
                .map_err(|e| format!("응답 바이너리 읽기 실패: {}", e))?;
            let encoded =
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
            Value::String(encoded)
        }
        _ => {
            let text = response
                .text()
                .await
                .map_err(|e| format!("응답 본문 읽기 실패: {}", e))?;
            Value::String(text)
        }
    };

    Ok(json!({
        "status": status,
        "status_text": status_text,
        "headers": resp_headers,
        "body": body_value,
        "elapsed_ms": elapsed_ms,
        "content_type": content_type,
    }))
}
