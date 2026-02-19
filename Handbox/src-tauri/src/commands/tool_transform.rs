// Tier 1 Transform 도구 — 데이터 변환
// json.parse, json.query, json.stringify, csv.parse, csv.stringify,
// text.split, text.regex, text.template, xml.parse, xml.stringify

use serde_json::{json, Value};
use std::collections::HashMap;

use crate::tools::{json_query, text_chunker, template_engine};

// ─────────────────────────────────────────────
// json.query — 플랫폼 핵심 도구 #1
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_json_query(data: Value, query: String) -> Result<Value, String> {
    json_query::execute_query(&data, &query)
}

// ─────────────────────────────────────────────
// json.parse
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_json_parse(text: String, strict: Option<bool>) -> Result<Value, String> {
    let strict = strict.unwrap_or(true);

    if strict {
        serde_json::from_str(&text).map_err(|e| format!("JSON 파싱 실패: {}", e))
    } else {
        // 느슨한 모드: 주석 제거, trailing comma 제거 후 파싱
        let cleaned = text
            .lines()
            .map(|line| {
                // // 주석 제거
                if let Some(idx) = line.find("//") {
                    // 문자열 내부의 //는 유지해야 하지만 간소화
                    &line[..idx]
                } else {
                    line
                }
            })
            .collect::<Vec<_>>()
            .join("\n");

        // trailing comma 제거
        let cleaned = regex::Regex::new(r",\s*([}\]])")
            .unwrap()
            .replace_all(&cleaned, "$1")
            .to_string();

        serde_json::from_str(&cleaned).map_err(|e| format!("JSON 파싱 실패 (느슨 모드): {}", e))
    }
}

// ─────────────────────────────────────────────
// json.stringify
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_json_stringify(
    data: Value,
    pretty: Option<bool>,
    indent: Option<usize>,
) -> Result<String, String> {
    if pretty.unwrap_or(true) {
        let _indent = indent.unwrap_or(2);
        serde_json::to_string_pretty(&data).map_err(|e| format!("JSON 직렬화 실패: {}", e))
    } else {
        serde_json::to_string(&data).map_err(|e| format!("JSON 직렬화 실패: {}", e))
    }
}

// ─────────────────────────────────────────────
// csv.parse
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_csv_parse(
    text: String,
    delimiter: Option<String>,
    has_header: Option<bool>,
    type_inference: Option<bool>,
    max_rows: Option<usize>,
) -> Result<Value, String> {
    let delim = match delimiter.as_deref() {
        Some("tab") | Some("\\t") | Some("\t") => b'\t',
        Some("pipe") | Some("|") => b'|',
        Some("semicolon") | Some(";") => b';',
        Some("auto") | None => detect_delimiter(&text),
        Some(d) => d.as_bytes().first().copied().unwrap_or(b','),
    };

    let has_hdr = has_header.unwrap_or(true);
    let infer_types = type_inference.unwrap_or(true);

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delim)
        .has_headers(has_hdr)
        .flexible(true)
        .from_reader(text.as_bytes());

    let headers: Vec<String> = if has_hdr {
        reader
            .headers()
            .map_err(|e| format!("헤더 읽기 실패: {}", e))?
            .iter()
            .enumerate()
            .map(|(i, h)| {
                if h.trim().is_empty() {
                    format!("col_{}", i)
                } else {
                    h.trim().to_string()
                }
            })
            .collect()
    } else {
        Vec::new()
    };

    let mut rows: Vec<Value> = Vec::new();
    let mut types_detected: HashMap<String, String> = HashMap::new();

    for record in reader.records() {
        if let Some(max) = max_rows {
            if rows.len() >= max {
                break;
            }
        }

        if let Ok(rec) = record {
            let mut row = serde_json::Map::new();
            for (j, field) in rec.iter().enumerate() {
                let key = if j < headers.len() {
                    headers[j].clone()
                } else {
                    format!("col_{}", j)
                };

                let val = if infer_types {
                    if field.trim().is_empty() {
                        types_detected.entry(key.clone()).or_insert_with(|| "null".to_string());
                        Value::Null
                    } else if let Ok(n) = field.parse::<i64>() {
                        types_detected.insert(key.clone(), "integer".to_string());
                        json!(n)
                    } else if let Ok(n) = field.parse::<f64>() {
                        types_detected.insert(key.clone(), "float".to_string());
                        json!(n)
                    } else if field == "true" || field == "false" {
                        types_detected.insert(key.clone(), "boolean".to_string());
                        json!(field == "true")
                    } else {
                        types_detected.insert(key.clone(), "string".to_string());
                        json!(field)
                    }
                } else {
                    json!(field)
                };

                row.insert(key, val);
            }
            rows.push(Value::Object(row));
        }
    }

    let col_count = if headers.is_empty() {
        rows.first()
            .and_then(|r| r.as_object())
            .map(|o| o.len())
            .unwrap_or(0)
    } else {
        headers.len()
    };

    Ok(json!({
        "headers": headers,
        "rows": rows,
        "row_count": rows.len(),
        "column_count": col_count,
        "types_detected": types_detected,
    }))
}

fn detect_delimiter(text: &str) -> u8 {
    // 첫 5줄에서 구분자 빈도 분석
    let sample: String = text.lines().take(5).collect::<Vec<_>>().join("\n");
    let comma = sample.matches(',').count();
    let tab = sample.matches('\t').count();
    let pipe = sample.matches('|').count();
    let semi = sample.matches(';').count();

    let max = comma.max(tab).max(pipe).max(semi);
    if max == 0 {
        return b',';
    }
    if max == tab { b'\t' }
    else if max == pipe { b'|' }
    else if max == semi { b';' }
    else { b',' }
}

// ─────────────────────────────────────────────
// csv.stringify
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_csv_stringify(
    data: Value,
    delimiter: Option<String>,
    include_header: Option<bool>,
) -> Result<String, String> {
    let delim = match delimiter.as_deref() {
        Some("tab") | Some("\\t") => b'\t',
        Some("|") => b'|',
        Some(";") => b';',
        _ => b',',
    };

    let arr = data
        .as_array()
        .ok_or("데이터는 객체 배열이어야 합니다")?;

    if arr.is_empty() {
        return Ok(String::new());
    }

    // 헤더 추출 (첫 행의 키)
    let headers: Vec<String> = arr[0]
        .as_object()
        .map(|o| o.keys().cloned().collect())
        .unwrap_or_default();

    let mut wtr = csv::WriterBuilder::new()
        .delimiter(delim)
        .from_writer(Vec::new());

    if include_header.unwrap_or(true) {
        wtr.write_record(&headers)
            .map_err(|e| format!("헤더 쓰기 실패: {}", e))?;
    }

    for row in arr {
        let record: Vec<String> = headers
            .iter()
            .map(|h| {
                row.get(h)
                    .map(|v| match v {
                        Value::String(s) => s.clone(),
                        Value::Null => String::new(),
                        _ => v.to_string(),
                    })
                    .unwrap_or_default()
            })
            .collect();
        wtr.write_record(&record)
            .map_err(|e| format!("행 쓰기 실패: {}", e))?;
    }

    let bytes = wtr.into_inner().map_err(|e| format!("CSV 완료 실패: {}", e))?;
    String::from_utf8(bytes).map_err(|e| format!("UTF-8 변환 실패: {}", e))
}

// ─────────────────────────────────────────────
// text.split — 스마트 텍스트 청킹 (핵심 도구 #4)
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_text_split(
    text: String,
    method: String,
    chunk_size: Option<usize>,
    chunk_overlap: Option<usize>,
    separator: Option<String>,
    preserve_sentences: Option<bool>,
) -> Result<Value, String> {
    let size = chunk_size.unwrap_or(1000);
    let overlap = chunk_overlap.unwrap_or(200);
    let preserve = preserve_sentences.unwrap_or(true);

    let chunks = match method.as_str() {
        "separator" => {
            let sep = separator.as_deref().unwrap_or("\n\n");
            text_chunker::chunk_by_separator(&text, sep, size, overlap, preserve)
        }
        "tokens" => text_chunker::chunk_by_tokens(&text, size, overlap, preserve),
        "sentences" => text_chunker::chunk_by_sentences(&text, size, overlap),
        "sliding_window" => text_chunker::chunk_by_sliding_window(&text, size, overlap),
        "recursive" => text_chunker::chunk_recursive(&text, size, overlap),
        _ => return Err(format!("알 수 없는 분할 방법: {}. 지원: separator, tokens, sentences, sliding_window, recursive", method)),
    };

    let chunk_values: Vec<Value> = chunks
        .iter()
        .map(|c| {
            json!({
                "text": c.text,
                "index": c.index,
                "start_char": c.start_char,
                "end_char": c.end_char,
                "token_count_approx": c.token_count_approx,
            })
        })
        .collect();

    Ok(json!({
        "chunks": chunk_values,
        "total_chunks": chunks.len(),
        "method": method,
        "chunk_size": size,
        "chunk_overlap": overlap,
    }))
}

// ─────────────────────────────────────────────
// text.regex
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_text_regex(
    text: String,
    pattern: String,
    operation: String,
    replacement: Option<String>,
    flags: Option<String>,
) -> Result<Value, String> {
    let flag_str = flags.unwrap_or_default();
    let case_insensitive = flag_str.contains('i');
    let multiline = flag_str.contains('m');
    let dotall = flag_str.contains('s');

    let mut pattern_prefix = String::from("(?");
    if case_insensitive {
        pattern_prefix.push('i');
    }
    if multiline {
        pattern_prefix.push('m');
    }
    if dotall {
        pattern_prefix.push('s');
    }
    pattern_prefix.push(')');

    let full_pattern = if pattern_prefix.len() > 3 {
        format!("{}{}", pattern_prefix, pattern)
    } else {
        pattern.clone()
    };

    let re = regex::Regex::new(&full_pattern)
        .map_err(|e| format!("정규식 오류: {}", e))?;

    match operation.as_str() {
        "test" => {
            Ok(json!({ "result": re.is_match(&text) }))
        }
        "match" => {
            if let Some(m) = re.find(&text) {
                let groups: Vec<Value> = re
                    .captures(&text)
                    .map(|caps| {
                        (0..caps.len())
                            .map(|i| {
                                caps.get(i)
                                    .map(|c| json!(c.as_str()))
                                    .unwrap_or(Value::Null)
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                Ok(json!({
                    "matched": true,
                    "text": m.as_str(),
                    "index": m.start(),
                    "groups": groups,
                }))
            } else {
                Ok(json!({ "matched": false }))
            }
        }
        "match_all" => {
            let matches: Vec<Value> = re
                .captures_iter(&text)
                .map(|caps| {
                    let full = caps.get(0).map(|m| m.as_str()).unwrap_or("");
                    let index = caps.get(0).map(|m| m.start()).unwrap_or(0);
                    let groups: Vec<Value> = (1..caps.len())
                        .map(|i| {
                            caps.get(i)
                                .map(|c| json!(c.as_str()))
                                .unwrap_or(Value::Null)
                        })
                        .collect();

                    json!({
                        "text": full,
                        "index": index,
                        "groups": groups,
                    })
                })
                .collect();

            Ok(json!({
                "matches": matches,
                "count": matches.len(),
            }))
        }
        "extract" => {
            // 명명 그룹 추출
            let mut captures: Vec<Value> = Vec::new();
            for caps in re.captures_iter(&text) {
                let mut groups = serde_json::Map::new();
                for name in re.capture_names().flatten() {
                    if let Some(m) = caps.name(name) {
                        groups.insert(name.to_string(), json!(m.as_str()));
                    }
                }
                if !groups.is_empty() {
                    captures.push(Value::Object(groups));
                }
            }

            Ok(json!({ "captures": captures, "count": captures.len() }))
        }
        "replace" => {
            let rep = replacement.unwrap_or_default();
            let result = re.replace_all(&text, rep.as_str()).to_string();
            let count = re.find_iter(&text).count();

            Ok(json!({
                "result": result,
                "replacements_count": count,
            }))
        }
        "split" => {
            let parts: Vec<&str> = re.split(&text).collect();
            Ok(json!({
                "parts": parts,
                "count": parts.len(),
            }))
        }
        _ => Err(format!(
            "알 수 없는 연산: {}. 지원: test, match, match_all, extract, replace, split",
            operation
        )),
    }
}

// ─────────────────────────────────────────────
// text.template — 핵심 도구 #2
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_text_template(
    template: String,
    variables: Value,
) -> Result<String, String> {
    Ok(template_engine::render(&template, &variables))
}

// ─────────────────────────────────────────────
// xml.parse
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_xml_parse(text: String) -> Result<Value, String> {
    // XML → JSON 변환 (간소화된 변환)
    let mut reader = quick_xml::Reader::from_str(&text);
    let mut buf = Vec::new();
    let mut stack: Vec<(String, serde_json::Map<String, Value>, Vec<Value>)> = Vec::new();

    // 루트 생성
    stack.push(("root".to_string(), serde_json::Map::new(), Vec::new()));

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let mut attrs = serde_json::Map::new();
                for attr in e.attributes().filter_map(|a| a.ok()) {
                    let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                    let val = String::from_utf8_lossy(&attr.value).to_string();
                    attrs.insert(format!("@{}", key), json!(val));
                }
                stack.push((name, attrs, Vec::new()));
            }
            Ok(quick_xml::events::Event::Text(e)) => {
                if let Ok(t) = e.unescape() {
                    let trimmed = t.trim().to_string();
                    if !trimmed.is_empty() {
                        if let Some(last) = stack.last_mut() {
                            last.2.push(json!(trimmed));
                        }
                    }
                }
            }
            Ok(quick_xml::events::Event::End(_)) => {
                if let Some((name, attrs, children)) = stack.pop() {
                    let mut obj = attrs;

                    if children.len() == 1 && children[0].is_string() && obj.is_empty() {
                        // 단순 텍스트 노드
                        if let Some(parent) = stack.last_mut() {
                            parent.1.insert(name, children[0].clone());
                        }
                    } else {
                        for child in children {
                            if child.is_string() {
                                obj.insert("#text".to_string(), child);
                            }
                        }
                        if let Some(parent) = stack.last_mut() {
                            // 같은 이름의 자식이 이미 있으면 배열로 변환
                            if let Some(existing) = parent.1.get_mut(&name) {
                                if let Value::Array(arr) = existing {
                                    arr.push(Value::Object(obj));
                                } else {
                                    let prev = existing.clone();
                                    parent.1.insert(
                                        name,
                                        json!([prev, Value::Object(obj)]),
                                    );
                                }
                            } else {
                                parent.1.insert(name, Value::Object(obj));
                            }
                        }
                    }
                }
            }
            Ok(quick_xml::events::Event::Empty(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let mut attrs = serde_json::Map::new();
                for attr in e.attributes().filter_map(|a| a.ok()) {
                    let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                    let val = String::from_utf8_lossy(&attr.value).to_string();
                    attrs.insert(format!("@{}", key), json!(val));
                }
                if let Some(parent) = stack.last_mut() {
                    if attrs.is_empty() {
                        parent.1.insert(name, Value::Null);
                    } else {
                        parent.1.insert(name, Value::Object(attrs));
                    }
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(e) => return Err(format!("XML 파싱 오류: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    // 루트에서 결과 추출
    if let Some((_, attrs, _)) = stack.pop() {
        Ok(Value::Object(attrs))
    } else {
        Ok(json!({}))
    }
}
