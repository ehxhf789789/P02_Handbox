// 범용 문서 파서 — 모든 확장자 지원
// 네이티브(Rust) → 외부도구(pandoc) → 이미지(OCR) → 폴백(메타데이터)

use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use std::process::Command;

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

#[derive(Debug)]
pub struct DocParseOptions {
    pub max_chars: Option<usize>,
    pub sheet_index: Option<usize>,
    pub ocr: Option<bool>,
}

impl Default for DocParseOptions {
    fn default() -> Self {
        Self {
            max_chars: None,
            sheet_index: None,
            ocr: Some(false),
        }
    }
}

/// 확장자 기반 문서 파싱 라우터
pub fn parse_document(path: &str, options: &DocParseOptions) -> Result<Value, String> {
    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", path));
    }

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let file_size = fs::metadata(file_path)
        .map(|m| m.len())
        .unwrap_or(0);

    let result = match ext.as_str() {
        // === Tier: 네이티브 (Rust 직접 파싱) ===
        "pdf" => parse_pdf(path),
        "xlsx" | "xls" | "ods" => parse_spreadsheet(path, options),
        "csv" | "tsv" => parse_csv_file(path, &ext),
        "json" => parse_json_file(path),
        "xml" => parse_xml_file(path),
        "html" | "htm" => parse_html(path),
        "txt" | "md" | "log" | "ini" | "cfg" | "yaml" | "yml" | "toml" | "rs" | "py"
        | "js" | "ts" | "tsx" | "jsx" | "java" | "c" | "cpp" | "h" | "hpp" | "go"
        | "rb" | "php" | "swift" | "kt" | "scala" | "r" | "sql" | "sh" | "bat"
        | "ps1" | "makefile" | "dockerfile" | "gitignore" | "env" => parse_text_file(path),

        // === Tier: 외부 도구 (pandoc/시스템 명령) ===
        "docx" | "pptx" | "epub" | "rtf" | "odt" | "odp" | "tex" | "latex" | "rst"
        | "textile" | "mediawiki" | "org" => parse_via_pandoc(path, &ext),
        "hwp" => parse_hwp(path),

        // === Tier: 이미지 OCR ===
        "png" | "jpg" | "jpeg" | "tiff" | "tif" | "bmp" | "gif" | "webp" => {
            if options.ocr.unwrap_or(false) {
                parse_image_ocr(path)
            } else {
                Ok(json!({
                    "text": "",
                    "metadata": {
                        "format": ext,
                        "size": file_size,
                        "type": "image",
                        "note": "OCR 비활성화 상태. ocr=true로 설정하면 텍스트를 추출합니다."
                    }
                }))
            }
        }

        // === Tier: 폴백 (메타데이터만) ===
        _ => parse_binary_fallback(path, &ext, file_size),
    }?;

    // max_chars 적용
    if let Some(max) = options.max_chars {
        if let Some(text) = result.get("text").and_then(|t| t.as_str()) {
            if text.len() > max {
                let mut result = result.clone();
                result["text"] = Value::String(text[..max].to_string());
                result["metadata"]["truncated"] = Value::Bool(true);
                result["metadata"]["total_chars"] = json!(text.len());
                return Ok(result);
            }
        }
    }

    Ok(result)
}

// ─────────────────────────────────────────────
// 네이티브 파서
// ─────────────────────────────────────────────

fn parse_pdf(path: &str) -> Result<Value, String> {
    let bytes = fs::read(path).map_err(|e| format!("PDF 읽기 실패: {}", e))?;
    let text = pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| format!("PDF 텍스트 추출 실패: {}", e))?;

    let pages = text.matches('\u{c}').count().max(1);

    Ok(json!({
        "text": text,
        "metadata": {
            "format": "pdf",
            "pages": pages,
            "chars": text.len(),
            "size": bytes.len(),
        }
    }))
}

fn parse_spreadsheet(path: &str, options: &DocParseOptions) -> Result<Value, String> {
    use calamine::{open_workbook_auto, Reader};

    let mut workbook = open_workbook_auto(path)
        .map_err(|e| format!("스프레드시트 열기 실패: {}", e))?;

    let sheet_names: Vec<String> = workbook.sheet_names().to_vec();
    let sheet_idx = options.sheet_index.unwrap_or(0);
    let sheet_name = sheet_names
        .get(sheet_idx)
        .ok_or_else(|| format!("시트 인덱스 {}가 범위를 벗어남 (총 {}개)", sheet_idx, sheet_names.len()))?
        .clone();

    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| format!("시트 읽기 실패: {}", e))?;

    let mut headers: Vec<String> = Vec::new();
    let mut rows: Vec<Value> = Vec::new();
    let mut text_parts: Vec<String> = Vec::new();

    for (i, row) in range.rows().enumerate() {
        if i == 0 {
            // 첫 행 = 헤더
            headers = row
                .iter()
                .enumerate()
                .map(|(j, cell)| {
                    let val = cell_to_string(cell);
                    if val.is_empty() {
                        format!("col_{}", j)
                    } else {
                        val
                    }
                })
                .collect();
            text_parts.push(headers.join("\t"));
        } else {
            let mut row_obj = serde_json::Map::new();
            let mut row_text = Vec::new();
            for (j, cell) in row.iter().enumerate() {
                let key = headers.get(j).cloned().unwrap_or_else(|| format!("col_{}", j));
                let val = cell_to_value(cell);
                let val_str = cell_to_string(cell);
                row_text.push(val_str);
                row_obj.insert(key, val);
            }
            rows.push(Value::Object(row_obj));
            text_parts.push(row_text.join("\t"));
        }
    }

    Ok(json!({
        "text": text_parts.join("\n"),
        "structured_data": {
            "headers": headers,
            "rows": rows,
            "row_count": rows.len(),
            "column_count": headers.len(),
        },
        "metadata": {
            "format": "spreadsheet",
            "sheets": sheet_names,
            "active_sheet": sheet_name,
        }
    }))
}

fn cell_to_string(cell: &calamine::Data) -> String {
    match cell {
        calamine::Data::Int(i) => i.to_string(),
        calamine::Data::Float(f) => format!("{}", f),
        calamine::Data::String(s) => s.clone(),
        calamine::Data::Bool(b) => b.to_string(),
        calamine::Data::DateTime(dt) => format!("{}", dt),
        calamine::Data::DateTimeIso(s) => s.clone(),
        calamine::Data::DurationIso(s) => s.clone(),
        calamine::Data::Error(e) => format!("ERR:{:?}", e),
        calamine::Data::Empty => String::new(),
    }
}

fn cell_to_value(cell: &calamine::Data) -> Value {
    match cell {
        calamine::Data::Int(i) => json!(i),
        calamine::Data::Float(f) => json!(f),
        calamine::Data::String(s) => json!(s),
        calamine::Data::Bool(b) => json!(b),
        calamine::Data::DateTime(dt) => json!(format!("{}", dt)),
        calamine::Data::DateTimeIso(s) => json!(s),
        calamine::Data::DurationIso(s) => json!(s),
        calamine::Data::Error(e) => json!(format!("ERR:{:?}", e)),
        calamine::Data::Empty => Value::Null,
    }
}

fn parse_csv_file(path: &str, ext: &str) -> Result<Value, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("CSV 읽기 실패: {}", e))?;
    let delimiter = if ext == "tsv" { b'\t' } else { b',' };

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(true)
        .flexible(true)
        .from_reader(content.as_bytes());

    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| format!("헤더 읽기 실패: {}", e))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    let mut rows: Vec<Value> = Vec::new();
    for record in reader.records() {
        if let Ok(rec) = record {
            let mut row = serde_json::Map::new();
            for (j, field) in rec.iter().enumerate() {
                let key = headers.get(j).cloned().unwrap_or_else(|| format!("col_{}", j));
                // 타입 추론
                let val = if let Ok(n) = field.parse::<f64>() {
                    json!(n)
                } else if field == "true" || field == "false" {
                    json!(field == "true")
                } else {
                    json!(field)
                };
                row.insert(key, val);
            }
            rows.push(Value::Object(row));
        }
    }

    Ok(json!({
        "text": content,
        "structured_data": {
            "headers": headers,
            "rows": rows,
            "row_count": rows.len(),
            "column_count": headers.len(),
        },
        "metadata": {
            "format": "csv",
        }
    }))
}

fn parse_json_file(path: &str) -> Result<Value, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("JSON 읽기 실패: {}", e))?;
    let parsed: Value = serde_json::from_str(&content)
        .map_err(|e| format!("JSON 파싱 실패: {}", e))?;

    Ok(json!({
        "text": content,
        "structured_data": parsed,
        "metadata": {
            "format": "json",
            "chars": content.len(),
        }
    }))
}

fn parse_xml_file(path: &str) -> Result<Value, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("XML 읽기 실패: {}", e))?;

    // quick-xml로 텍스트 추출
    let mut text_content = String::new();
    let mut reader = quick_xml::Reader::from_str(&content);
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Text(e)) => {
                if let Ok(t) = e.unescape() {
                    let trimmed = t.trim();
                    if !trimmed.is_empty() {
                        text_content.push_str(trimmed);
                        text_content.push('\n');
                    }
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(e) => return Err(format!("XML 파싱 오류: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    Ok(json!({
        "text": text_content.trim(),
        "raw": content,
        "metadata": {
            "format": "xml",
            "chars": content.len(),
        }
    }))
}

fn parse_html(path: &str) -> Result<Value, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("HTML 읽기 실패: {}", e))?;

    // scraper로 텍스트 추출
    let document = scraper::Html::parse_document(&content);
    let mut text_parts = Vec::new();

    // title 추출
    let title_selector = scraper::Selector::parse("title").unwrap();
    let title = document
        .select(&title_selector)
        .next()
        .map(|el| el.text().collect::<String>())
        .unwrap_or_default();

    // body 텍스트 추출
    let body_selector = scraper::Selector::parse("body").unwrap();
    if let Some(body) = document.select(&body_selector).next() {
        for text in body.text() {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                text_parts.push(trimmed.to_string());
            }
        }
    }

    let text = text_parts.join("\n");

    Ok(json!({
        "text": text,
        "metadata": {
            "format": "html",
            "title": title,
            "chars": text.len(),
        }
    }))
}

fn parse_text_file(path: &str) -> Result<Value, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("텍스트 읽기 실패: {}", e))?;
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt");

    Ok(json!({
        "text": content,
        "metadata": {
            "format": ext,
            "chars": content.len(),
            "lines": content.lines().count(),
        }
    }))
}

// ─────────────────────────────────────────────
// 외부 도구 기반 파서
// ─────────────────────────────────────────────

fn parse_via_pandoc(path: &str, ext: &str) -> Result<Value, String> {
    // pandoc이 설치되어 있는지 확인
    let pandoc_check = Command::new("pandoc").arg("--version").output();

    if pandoc_check.is_err() {
        return Err(format!(
            ".{} 파일을 처리하려면 pandoc이 필요합니다. https://pandoc.org/installing.html 에서 설치하세요.",
            ext
        ));
    }

    let output = Command::new("pandoc")
        .args([path, "-t", "plain", "--wrap=none"])
        .output()
        .map_err(|e| format!("pandoc 실행 실패: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pandoc 변환 실패: {}", stderr));
    }

    let text = String::from_utf8_lossy(&output.stdout).to_string();

    Ok(json!({
        "text": text,
        "metadata": {
            "format": ext,
            "parser": "pandoc",
            "chars": text.len(),
        }
    }))
}

fn parse_hwp(path: &str) -> Result<Value, String> {
    // hwp5txt (pyhwp 패키지) 시도
    let hwp5_check = Command::new("hwp5txt").arg("--help").output();

    if hwp5_check.is_ok() {
        let output = Command::new("hwp5txt")
            .arg(path)
            .output()
            .map_err(|e| format!("hwp5txt 실행 실패: {}", e))?;

        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout).to_string();
            return Ok(json!({
                "text": text,
                "metadata": {
                    "format": "hwp",
                    "parser": "hwp5txt",
                    "chars": text.len(),
                }
            }));
        }
    }

    // pandoc으로 폴백 (pandoc-hwp 플러그인 필요)
    let pandoc_result = parse_via_pandoc(path, "hwp");
    if pandoc_result.is_ok() {
        return pandoc_result;
    }

    Err(
        "HWP 파일을 처리하려면 pyhwp(pip install pyhwp) 또는 pandoc + pandoc-hwp 플러그인이 필요합니다."
            .to_string(),
    )
}

fn parse_image_ocr(path: &str) -> Result<Value, String> {
    // tesseract OCR 시도
    let output = Command::new("tesseract")
        .args([path, "stdout", "-l", "kor+eng"])
        .output()
        .map_err(|e| format!("tesseract 실행 실패 (설치 필요: https://github.com/tesseract-ocr/tesseract): {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("OCR 실패: {}", stderr));
    }

    let text = String::from_utf8_lossy(&output.stdout).to_string();

    Ok(json!({
        "text": text,
        "metadata": {
            "format": "image",
            "parser": "tesseract-ocr",
            "chars": text.len(),
        }
    }))
}

fn parse_binary_fallback(path: &str, ext: &str, file_size: u64) -> Result<Value, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("파일 열기 실패: {}", e))?;
    let mut header = vec![0u8; 256.min(file_size as usize)];
    use std::io::Read;
    let n = file.read(&mut header).unwrap_or(0);
    header.truncate(n);

    // 매직 바이트로 타입 추측
    let detected_type = infer::get(&header)
        .map(|k| k.mime_type().to_string())
        .unwrap_or_else(|| "application/octet-stream".to_string());

    // 16진수 덤프 (첫 128 바이트)
    let hex_dump: String = header[..128.min(header.len())]
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<Vec<_>>()
        .join(" ");

    Ok(json!({
        "text": format!("[바이너리 파일: .{} / {} / {}]", ext, detected_type, format_size(file_size)),
        "metadata": {
            "format": ext,
            "mime_type": detected_type,
            "size": file_size,
            "hex_header": hex_dump,
            "type": "binary",
            "note": format!("이 파일 형식(.{})은 네이티브 파서가 없습니다. 플러그인을 설치하거나, pandoc/LibreOffice로 변환하세요.", ext),
        }
    }))
}
