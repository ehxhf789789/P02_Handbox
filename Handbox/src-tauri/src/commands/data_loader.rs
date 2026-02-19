// data_loader.rs - 데이터 로드 명령어 (Excel, CSV, 파일 타입 감지)
//
// Phase 3: 로컬 데이터 파이프라인용 Rust 백엔드

use calamine::{Reader, open_workbook_auto, Data};
use csv::ReaderBuilder;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

// ============================================================
// 응답 타입 정의
// ============================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct ExcelData {
    pub sheets: Vec<SheetData>,
    pub total_rows: usize,
    pub file_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SheetData {
    pub name: String,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<Value>>,
    pub row_count: usize,
    pub column_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CsvData {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<Value>>,
    pub row_count: usize,
    pub column_count: usize,
    pub file_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileTypeInfo {
    pub file_type: String,
    pub extension: String,
    pub mime_type: String,
    pub can_parse: bool,
}

// ============================================================
// Excel 파싱
// ============================================================

/// Excel 파일 파싱 (xlsx, xls, ods 지원)
#[tauri::command]
pub fn parse_excel(
    file_path: String,
    sheet_index: Option<usize>,
    max_rows: Option<usize>,
) -> Result<ExcelData, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("파일을 찾을 수 없습니다: {}", file_path));
    }

    let mut workbook = open_workbook_auto(&path)
        .map_err(|e| format!("Excel 파일 열기 오류: {}", e))?;

    let sheet_names = workbook.sheet_names().to_vec();
    let mut sheets: Vec<SheetData> = Vec::new();
    let mut total_rows = 0;

    let indices: Vec<usize> = match sheet_index {
        Some(idx) => {
            if idx < sheet_names.len() {
                vec![idx]
            } else {
                return Err(format!("시트 인덱스가 범위를 벗어났습니다: {}", idx));
            }
        }
        None => (0..sheet_names.len()).collect(),
    };

    for idx in indices {
        let sheet_name = &sheet_names[idx];
        if let Ok(range) = workbook.worksheet_range(sheet_name) {
            let max = max_rows.unwrap_or(10000);
            let (rows, headers) = parse_sheet_range(&range, max);

            let row_count = rows.len();
            let column_count = headers.len();
            total_rows += row_count;

            sheets.push(SheetData {
                name: sheet_name.clone(),
                headers,
                rows,
                row_count,
                column_count,
            });
        }
    }

    Ok(ExcelData {
        sheets,
        total_rows,
        file_path,
    })
}

fn parse_sheet_range(
    range: &calamine::Range<Data>,
    max_rows: usize,
) -> (Vec<Vec<Value>>, Vec<String>) {
    let mut rows: Vec<Vec<Value>> = Vec::new();
    let mut headers: Vec<String> = Vec::new();

    for (row_idx, row) in range.rows().enumerate() {
        if row_idx == 0 {
            // 첫 번째 행을 헤더로 처리
            headers = row
                .iter()
                .enumerate()
                .map(|(i, cell)| {
                    let val = cell_to_string(cell);
                    if val.is_empty() {
                        format!("Column_{}", i + 1)
                    } else {
                        val
                    }
                })
                .collect();
        } else if row_idx <= max_rows {
            let values: Vec<Value> = row.iter().map(cell_to_value).collect();
            rows.push(values);
        }
    }

    (rows, headers)
}

fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        Data::String(s) => s.clone(),
        Data::Float(f) => f.to_string(),
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::Error(e) => format!("#ERR: {:?}", e),
        Data::DateTime(dt) => format!("{}", dt),
        Data::DateTimeIso(s) => s.clone(),
        Data::DurationIso(s) => s.clone(),
    }
}

fn cell_to_value(cell: &Data) -> Value {
    match cell {
        Data::Empty => Value::Null,
        Data::String(s) => json!(s),
        Data::Float(f) => json!(f),
        Data::Int(i) => json!(i),
        Data::Bool(b) => json!(b),
        Data::Error(_) => Value::Null,
        Data::DateTime(dt) => json!(format!("{}", dt)),
        Data::DateTimeIso(s) => json!(s),
        Data::DurationIso(s) => json!(s),
    }
}

// ============================================================
// CSV 파싱
// ============================================================

/// CSV 파일 파싱
#[tauri::command]
pub fn parse_csv(
    file_path: String,
    delimiter: Option<char>,
    has_headers: Option<bool>,
    max_rows: Option<usize>,
) -> Result<CsvData, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("파일을 찾을 수 없습니다: {}", file_path));
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("CSV 파일 읽기 오류: {}", e))?;

    let delim = delimiter.unwrap_or(',') as u8;
    let has_hdrs = has_headers.unwrap_or(true);
    let max = max_rows.unwrap_or(10000);

    let mut rdr = ReaderBuilder::new()
        .delimiter(delim)
        .has_headers(has_hdrs)
        .flexible(true)
        .from_reader(content.as_bytes());

    let headers: Vec<String> = if has_hdrs {
        rdr.headers()
            .map_err(|e| format!("헤더 읽기 오류: {}", e))?
            .iter()
            .map(|s| s.to_string())
            .collect()
    } else {
        Vec::new()
    };

    let mut rows: Vec<Vec<Value>> = Vec::new();
    let mut column_count = headers.len();

    for (idx, result) in rdr.records().enumerate() {
        if idx >= max {
            break;
        }

        match result {
            Ok(record) => {
                let values: Vec<Value> = record
                    .iter()
                    .map(|s| {
                        // 숫자로 파싱 시도
                        if let Ok(f) = s.parse::<f64>() {
                            json!(f)
                        } else if let Ok(b) = s.parse::<bool>() {
                            json!(b)
                        } else {
                            json!(s)
                        }
                    })
                    .collect();

                if column_count == 0 {
                    column_count = values.len();
                }
                rows.push(values);
            }
            Err(e) => {
                eprintln!("CSV 행 읽기 오류 (행 {}): {}", idx, e);
            }
        }
    }

    // 헤더가 없으면 자동 생성
    let final_headers = if headers.is_empty() && column_count > 0 {
        (0..column_count)
            .map(|i| format!("Column_{}", i + 1))
            .collect()
    } else {
        headers
    };

    Ok(CsvData {
        headers: final_headers,
        row_count: rows.len(),
        column_count,
        rows,
        file_path,
    })
}

// ============================================================
// 파일 타입 감지
// ============================================================

/// 파일 타입 자동 감지
#[tauri::command]
pub fn detect_file_type(file_path: String) -> Result<FileTypeInfo, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("파일을 찾을 수 없습니다: {}", file_path));
    }

    let extension = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let (file_type, mime_type, can_parse) = match extension.as_str() {
        "xlsx" | "xlsm" => ("excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", true),
        "xls" => ("excel", "application/vnd.ms-excel", true),
        "ods" => ("excel", "application/vnd.oasis.opendocument.spreadsheet", true),
        "csv" => ("csv", "text/csv", true),
        "tsv" => ("csv", "text/tab-separated-values", true),
        "pdf" => ("pdf", "application/pdf", true),
        "txt" | "text" => ("text", "text/plain", true),
        "json" => ("json", "application/json", true),
        "xml" => ("xml", "application/xml", true),
        "md" | "markdown" => ("markdown", "text/markdown", true),
        "html" | "htm" => ("html", "text/html", true),
        "doc" => ("word", "application/msword", false),
        "docx" => ("word", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", false),
        "ppt" => ("powerpoint", "application/vnd.ms-powerpoint", false),
        "pptx" => ("powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", false),
        "hwp" => ("hwp", "application/x-hwp", false),
        "jpg" | "jpeg" => ("image", "image/jpeg", false),
        "png" => ("image", "image/png", false),
        "gif" => ("image", "image/gif", false),
        "svg" => ("image", "image/svg+xml", false),
        _ => ("unknown", "application/octet-stream", false),
    };

    Ok(FileTypeInfo {
        file_type: file_type.to_string(),
        extension,
        mime_type: mime_type.to_string(),
        can_parse,
    })
}

/// 텍스트 파일 로드 (txt, json, md 등)
#[tauri::command]
pub fn load_text_file(file_path: String, max_chars: Option<usize>) -> Result<Value, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("파일을 찾을 수 없습니다: {}", file_path));
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("파일 읽기 오류: {}", e))?;

    let total_len = content.len();
    let max = max_chars.unwrap_or(usize::MAX);
    let truncated = total_len > max;
    let text = if truncated {
        content[..max].to_string()
    } else {
        content
    };

    let extension = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    // JSON 파일이면 파싱 시도
    if extension == "json" {
        if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
            return Ok(json!({
                "type": "json",
                "data": parsed,
                "truncated": truncated,
                "total_chars": total_len
            }));
        }
    }

    let line_count = text.lines().count();
    Ok(json!({
        "type": "text",
        "text": text,
        "truncated": truncated,
        "total_chars": total_len,
        "line_count": line_count
    }))
}
