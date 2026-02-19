// Tier 1 문서 도구 — 범용 문서 파서 및 변환기
// doc.parse, doc.convert

use serde_json::{json, Value};
use std::process::Command;

use crate::tools::doc_parsers::{self, DocParseOptions};

// ─────────────────────────────────────────────
// doc.parse — 범용 문서 파서
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_doc_parse(
    path: String,
    max_chars: Option<usize>,
    sheet_index: Option<usize>,
    ocr: Option<bool>,
) -> Result<Value, String> {
    let options = DocParseOptions {
        max_chars,
        sheet_index,
        ocr,
    };

    let result = doc_parsers::parse_document(&path, &options)?;

    Ok(result)
}

// ─────────────────────────────────────────────
// doc.convert — 문서 형식 변환
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_doc_convert(
    input_path: String,
    output_format: String,
    output_path: Option<String>,
) -> Result<Value, String> {
    let input = std::path::Path::new(&input_path);
    if !input.exists() {
        return Err(format!("입력 파일이 존재하지 않습니다: {}", input_path));
    }

    let input_ext = input
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // 출력 경로 결정
    let out_path = output_path.unwrap_or_else(|| {
        let stem = input
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("output");
        let parent = input
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| ".".to_string());
        format!("{}/{}.{}", parent, stem, output_format)
    });

    let out_fmt = output_format.to_lowercase();

    // 변환 전략 선택
    match out_fmt.as_str() {
        // pandoc 기반 변환
        "pdf" | "docx" | "html" | "md" | "txt" | "rst" | "epub" | "rtf" | "latex" | "tex" => {
            convert_via_pandoc(&input_path, &out_path, &out_fmt)?;
        }
        // CSV/JSON 변환 (스프레드시트 → CSV/JSON)
        "csv" => {
            convert_to_csv(&input_path, &input_ext, &out_path)?;
        }
        "json" => {
            convert_to_json(&input_path, &input_ext, &out_path)?;
        }
        // LibreOffice 기반 변환 (xlsx, odt, odp 등)
        "xlsx" | "xls" | "ods" | "odt" | "odp" | "pptx" => {
            convert_via_libreoffice(&input_path, &out_path, &out_fmt)?;
        }
        _ => {
            return Err(format!(
                "지원되지 않는 출력 형식: {}. 지원: pdf, docx, html, md, txt, csv, json, xlsx, epub, rtf, latex",
                out_fmt
            ));
        }
    }

    // 결과 파일 정보
    let out_meta = std::fs::metadata(&out_path)
        .map_err(|e| format!("변환 결과 파일을 찾을 수 없습니다: {}", e))?;

    Ok(json!({
        "output_path": out_path,
        "format": out_fmt,
        "size": out_meta.len(),
        "success": true,
    }))
}

// ─────────────────────────────────────────────
// 변환 헬퍼 함수
// ─────────────────────────────────────────────

fn convert_via_pandoc(input: &str, output: &str, _format: &str) -> Result<(), String> {
    // pandoc 존재 확인
    let check = Command::new("pandoc").arg("--version").output();
    if check.is_err() {
        return Err(
            "pandoc이 설치되지 않았습니다. https://pandoc.org/installing.html 에서 설치하세요."
                .to_string(),
        );
    }

    let result = Command::new("pandoc")
        .args([input, "-o", output, "--wrap=none"])
        .output()
        .map_err(|e| format!("pandoc 실행 실패: {}", e))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("pandoc 변환 실패: {}", stderr));
    }

    Ok(())
}

fn convert_to_csv(input: &str, input_ext: &str, output: &str) -> Result<(), String> {
    // 스프레드시트/JSON → CSV 변환
    match input_ext {
        "xlsx" | "xls" | "ods" => {
            use calamine::{open_workbook_auto, Reader};

            let mut workbook = open_workbook_auto(input)
                .map_err(|e| format!("스프레드시트 열기 실패: {}", e))?;

            let sheet_names: Vec<String> = workbook.sheet_names().to_vec();
            let sheet_name = sheet_names
                .first()
                .ok_or("시트가 없습니다")?
                .clone();

            let range = workbook
                .worksheet_range(&sheet_name)
                .map_err(|e| format!("시트 읽기 실패: {}", e))?;

            let mut wtr = csv::Writer::from_path(output)
                .map_err(|e| format!("CSV 파일 생성 실패: {}", e))?;

            for row in range.rows() {
                let record: Vec<String> = row
                    .iter()
                    .map(|cell| match cell {
                        calamine::Data::Int(i) => i.to_string(),
                        calamine::Data::Float(f) => format!("{}", f),
                        calamine::Data::String(s) => s.clone(),
                        calamine::Data::Bool(b) => b.to_string(),
                        calamine::Data::DateTime(dt) => format!("{}", dt),
                        calamine::Data::DateTimeIso(s) => s.clone(),
                        calamine::Data::DurationIso(s) => s.clone(),
                        calamine::Data::Error(e) => format!("{:?}", e),
                        calamine::Data::Empty => String::new(),
                    })
                    .collect();

                wtr.write_record(&record)
                    .map_err(|e| format!("CSV 행 쓰기 실패: {}", e))?;
            }

            wtr.flush().map_err(|e| format!("CSV 플러시 실패: {}", e))?;
            Ok(())
        }
        "json" => {
            let content = std::fs::read_to_string(input)
                .map_err(|e| format!("JSON 읽기 실패: {}", e))?;
            let data: Value = serde_json::from_str(&content)
                .map_err(|e| format!("JSON 파싱 실패: {}", e))?;

            let mut wtr = csv::Writer::from_path(output)
                .map_err(|e| format!("CSV 파일 생성 실패: {}", e))?;

            if let Some(arr) = data.as_array() {
                // 첫 행에서 헤더 추출
                if let Some(first) = arr.first().and_then(|v| v.as_object()) {
                    let headers: Vec<String> = first.keys().cloned().collect();
                    wtr.write_record(&headers)
                        .map_err(|e| format!("헤더 쓰기 실패: {}", e))?;

                    for item in arr {
                        if let Some(obj) = item.as_object() {
                            let row: Vec<String> = headers
                                .iter()
                                .map(|h| {
                                    obj.get(h)
                                        .map(|v| match v {
                                            Value::String(s) => s.clone(),
                                            other => other.to_string(),
                                        })
                                        .unwrap_or_default()
                                })
                                .collect();
                            wtr.write_record(&row)
                                .map_err(|e| format!("행 쓰기 실패: {}", e))?;
                        }
                    }
                }
            }

            wtr.flush().map_err(|e| format!("CSV 플러시 실패: {}", e))?;
            Ok(())
        }
        _ => Err(format!(
            ".{} → CSV 변환은 지원되지 않습니다. pandoc을 사용하세요.",
            input_ext
        )),
    }
}

fn convert_to_json(input: &str, input_ext: &str, output: &str) -> Result<(), String> {
    match input_ext {
        "csv" | "tsv" => {
            let delimiter = if input_ext == "tsv" { b'\t' } else { b',' };
            let mut reader = csv::ReaderBuilder::new()
                .delimiter(delimiter)
                .has_headers(true)
                .flexible(true)
                .from_path(input)
                .map_err(|e| format!("CSV 읽기 실패: {}", e))?;

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

            let json_str = serde_json::to_string_pretty(&rows)
                .map_err(|e| format!("JSON 직렬화 실패: {}", e))?;
            std::fs::write(output, json_str).map_err(|e| format!("파일 쓰기 실패: {}", e))?;
            Ok(())
        }
        "xlsx" | "xls" | "ods" => {
            // 스프레드시트를 먼저 파싱한 후 JSON으로 저장
            let opts = DocParseOptions {
                max_chars: None,
                sheet_index: None,
                ocr: None,
            };
            let result = doc_parsers::parse_document(input, &opts)?;
            let json_str = serde_json::to_string_pretty(&result)
                .map_err(|e| format!("JSON 직렬화 실패: {}", e))?;
            std::fs::write(output, json_str).map_err(|e| format!("파일 쓰기 실패: {}", e))?;
            Ok(())
        }
        _ => Err(format!(
            ".{} → JSON 변환은 지원되지 않습니다.",
            input_ext
        )),
    }
}

fn convert_via_libreoffice(input: &str, output: &str, format: &str) -> Result<(), String> {
    // LibreOffice 존재 확인
    let soffice_cmd = if cfg!(target_os = "windows") {
        // Windows에서 일반적인 설치 경로
        let paths = [
            r"C:\Program Files\LibreOffice\program\soffice.exe",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        ];
        paths
            .iter()
            .find(|p| std::path::Path::new(p).exists())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "soffice".to_string())
    } else {
        "soffice".to_string()
    };

    let output_dir = std::path::Path::new(output)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());

    let lo_format = match format {
        "xlsx" => "xlsx",
        "xls" => "xls",
        "ods" => "ods",
        "odt" => "odt",
        "odp" => "odp",
        "pptx" => "pptx",
        "pdf" => "pdf",
        _ => format,
    };

    let result = Command::new(&soffice_cmd)
        .args([
            "--headless",
            "--convert-to",
            lo_format,
            "--outdir",
            &output_dir,
            input,
        ])
        .output()
        .map_err(|e| {
            format!(
                "LibreOffice 실행 실패 (설치 필요: https://www.libreoffice.org): {}",
                e
            )
        })?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("LibreOffice 변환 실패: {}", stderr));
    }

    // LibreOffice는 output_dir에 변환된 파일을 생성하므로, 원하는 이름으로 리네임
    let input_stem = std::path::Path::new(input)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let lo_output = format!("{}/{}.{}", output_dir, input_stem, lo_format);

    if lo_output != output {
        std::fs::rename(&lo_output, output)
            .map_err(|e| format!("파일 이름 변경 실패: {}", e))?;
    }

    Ok(())
}
