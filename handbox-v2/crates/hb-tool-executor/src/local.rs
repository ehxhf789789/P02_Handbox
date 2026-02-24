//! Local executor — native in-process tool implementations and child process spawning.

use crate::{ExecutorError, ToolInput, ToolOutput};
use std::time::Instant;

/// Execute a tool natively in-process.
pub async fn execute_native(input: &ToolInput) -> Result<ToolOutput, ExecutorError> {
    let start = Instant::now();

    // Dispatch based on tool_ref
    let tool_name = input
        .tool_ref
        .split('/')
        .last()
        .unwrap_or(&input.tool_ref)
        .split('@')
        .next()
        .unwrap_or(&input.tool_ref);

    let outputs = match tool_name {
        "file-read" => execute_file_read(input)?,
        "file-write" => execute_file_write(input)?,
        "text-split" => execute_text_split(input)?,
        "text-merge" => execute_text_merge(input)?,
        "text-template" => execute_text_template(input)?,
        "json-parse" => execute_json_parse(input)?,
        "json-path" => execute_json_path(input)?,
        "csv-read" => execute_csv_read(input)?,
        "data-filter" => execute_data_filter(input)?,
        "regex-extract" => execute_regex_extract(input)?,
        "merge" => execute_merge(input)?,
        "delay" => execute_delay(input).await?,
        "display-output" => {
            serde_json::json!({ "displayed": true })
        }
        "user-input" => {
            serde_json::json!({ "text": "" })
        }
        "condition" => execute_condition(input)?,
        _ => {
            // Unknown native tools return a stub
            serde_json::json!({
                "stub": true,
                "tool": tool_name,
                "message": format!("Tool '{tool_name}' execution stub — connect an LLM/API provider for real execution")
            })
        }
    };

    let duration_ms = start.elapsed().as_millis() as u64;
    Ok(ToolOutput {
        outputs,
        duration_ms,
    })
}

/// Execute a tool by spawning a child process.
pub async fn execute_process(
    command: &str,
    input: &ToolInput,
) -> Result<ToolOutput, ExecutorError> {
    let start = Instant::now();

    let input_json =
        serde_json::to_string(&input).map_err(|e| ExecutorError::ExecutionFailed(e.to_string()))?;

    let mut child = tokio::process::Command::new(command)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| ExecutorError::Process(e.to_string()))?;

    if let Some(stdin) = child.stdin.as_mut() {
        use tokio::io::AsyncWriteExt;
        stdin
            .write_all(input_json.as_bytes())
            .await
            .map_err(|e| ExecutorError::Process(e.to_string()))?;
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| ExecutorError::Process(e.to_string()))?;

    let duration_ms = start.elapsed().as_millis() as u64;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ExecutorError::ExecutionFailed(format!(
            "Process exited with {}: {stderr}",
            output.status
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let outputs: serde_json::Value =
        serde_json::from_str(&stdout).unwrap_or(serde_json::json!({ "raw": stdout.to_string() }));

    Ok(ToolOutput {
        outputs,
        duration_ms,
    })
}

// ---- Native tool implementations ----

fn execute_file_read(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let path = input
        .inputs
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecutorError::ExecutionFailed("Missing 'path' input".into()))?;

    let content = std::fs::read_to_string(path)
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Failed to read {path}: {e}")))?;
    let size = content.len();

    Ok(serde_json::json!({ "content": content, "size": size }))
}

fn execute_file_write(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let path = input
        .inputs
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecutorError::ExecutionFailed("Missing 'path' input".into()))?;
    let content = input
        .inputs
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecutorError::ExecutionFailed("Missing 'content' input".into()))?;

    std::fs::write(path, content)
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Failed to write {path}: {e}")))?;

    Ok(serde_json::json!({ "path": path, "size": content.len() }))
}

fn execute_text_split(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let text = input
        .inputs
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let chunk_size = input
        .config
        .get("chunk_size")
        .and_then(|v| v.as_u64())
        .unwrap_or(1000) as usize;

    let overlap = input
        .config
        .get("overlap")
        .and_then(|v| v.as_u64())
        .unwrap_or(100) as usize;

    let mut chunks = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut start = 0;

    while start < chars.len() {
        let end = (start + chunk_size).min(chars.len());
        let chunk: String = chars[start..end].iter().collect();
        chunks.push(chunk);
        if end >= chars.len() {
            break;
        }
        start = end.saturating_sub(overlap);
    }

    let count = chunks.len();
    Ok(serde_json::json!({ "chunks": chunks, "count": count }))
}

fn execute_text_merge(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let texts = input
        .inputs
        .get("texts")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let separator = input
        .config
        .get("separator")
        .and_then(|v| v.as_str())
        .unwrap_or("\n\n");

    let merged: String = texts
        .iter()
        .filter_map(|v| v.as_str())
        .collect::<Vec<_>>()
        .join(separator);

    Ok(serde_json::json!({ "merged": merged }))
}

fn execute_text_template(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let template = input
        .inputs
        .get("template")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let variables = input
        .inputs
        .get("variables")
        .cloned()
        .unwrap_or(serde_json::json!({}));

    let mut result = template.to_string();
    if let Some(obj) = variables.as_object() {
        for (key, val) in obj {
            let placeholder = format!("{{{{{key}}}}}");
            let replacement = match val {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            result = result.replace(&placeholder, &replacement);
        }
    }

    Ok(serde_json::json!({ "result": result }))
}

fn execute_json_parse(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let json_string = input
        .inputs
        .get("json_string")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecutorError::ExecutionFailed("Missing 'json_string' input".into()))?;

    let data: serde_json::Value = serde_json::from_str(json_string)
        .map_err(|e| ExecutorError::ExecutionFailed(format!("JSON parse error: {e}")))?;

    Ok(serde_json::json!({ "data": data }))
}

fn execute_json_path(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let data = input
        .inputs
        .get("data")
        .cloned()
        .unwrap_or(serde_json::json!(null));

    let expression = input
        .inputs
        .get("expression")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // Simple dot-path extraction (Phase 2 will use JMESPath)
    let result = expression
        .split('.')
        .fold(Some(&data), |acc, key| acc.and_then(|v| v.get(key)))
        .cloned()
        .unwrap_or(serde_json::json!(null));

    Ok(serde_json::json!({ "result": result }))
}

fn execute_csv_read(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let path = input
        .inputs
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ExecutorError::ExecutionFailed("Missing 'path' input".into()))?;

    let content = std::fs::read_to_string(path)
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Failed to read {path}: {e}")))?;

    let delimiter = input
        .config
        .get("delimiter")
        .and_then(|v| v.as_str())
        .unwrap_or(",");

    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return Ok(serde_json::json!({ "rows": [], "headers": [], "count": 0 }));
    }

    let headers: Vec<String> = lines[0].split(delimiter).map(|s| s.trim().to_string()).collect();

    let rows: Vec<serde_json::Value> = lines[1..]
        .iter()
        .map(|line| {
            let values: Vec<&str> = line.split(delimiter).collect();
            let mut row = serde_json::Map::new();
            for (i, header) in headers.iter().enumerate() {
                let val = values.get(i).unwrap_or(&"").trim();
                row.insert(header.clone(), serde_json::json!(val));
            }
            serde_json::Value::Object(row)
        })
        .collect();

    let count = rows.len();
    Ok(serde_json::json!({ "rows": rows, "headers": headers, "count": count }))
}

fn execute_data_filter(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let items = input
        .inputs
        .get("items")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // Phase 2: implement proper JMESPath filter expressions
    // For now, pass through all items
    let count = items.len();
    Ok(serde_json::json!({ "filtered": items, "count": count }))
}

fn execute_regex_extract(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let text = input
        .inputs
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let pattern = input
        .config
        .get("pattern")
        .and_then(|v| v.as_str())
        .unwrap_or(".*");

    // Simple regex matching
    let matches: Vec<String> = text
        .lines()
        .filter(|line| line.contains(pattern))
        .map(|s| s.to_string())
        .collect();

    let count = matches.len();
    Ok(serde_json::json!({ "matches": matches, "count": count }))
}

fn execute_merge(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let a = input.inputs.get("input_a").cloned().unwrap_or(serde_json::json!(null));
    let b = input.inputs.get("input_b").cloned().unwrap_or(serde_json::json!(null));
    let c = input.inputs.get("input_c").cloned();

    let strategy = input
        .config
        .get("strategy")
        .and_then(|v| v.as_str())
        .unwrap_or("concat");

    let merged = match strategy {
        "array" => {
            let mut arr = vec![a, b];
            if let Some(c_val) = c {
                arr.push(c_val);
            }
            serde_json::json!(arr)
        }
        "object_merge" => {
            let mut obj = serde_json::Map::new();
            if let Some(a_obj) = a.as_object() {
                obj.extend(a_obj.clone());
            }
            if let Some(b_obj) = b.as_object() {
                obj.extend(b_obj.clone());
            }
            if let Some(c_val) = c {
                if let Some(c_obj) = c_val.as_object() {
                    obj.extend(c_obj.clone());
                }
            }
            serde_json::Value::Object(obj)
        }
        _ => {
            // concat
            let a_str = match &a { serde_json::Value::String(s) => s.clone(), v => v.to_string() };
            let b_str = match &b { serde_json::Value::String(s) => s.clone(), v => v.to_string() };
            let mut result = format!("{a_str}\n{b_str}");
            if let Some(c_val) = c {
                let c_str = match &c_val { serde_json::Value::String(s) => s.clone(), v => v.to_string() };
                result.push('\n');
                result.push_str(&c_str);
            }
            serde_json::json!(result)
        }
    };

    Ok(serde_json::json!({ "merged": merged }))
}

fn execute_condition(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let value = input.inputs.get("value").cloned().unwrap_or(serde_json::json!(false));

    let truthy = match &value {
        serde_json::Value::Bool(b) => *b,
        serde_json::Value::Null => false,
        serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0) != 0.0,
        serde_json::Value::String(s) => !s.is_empty(),
        _ => true,
    };

    if truthy {
        Ok(serde_json::json!({ "true_out": value, "false_out": null }))
    } else {
        Ok(serde_json::json!({ "true_out": null, "false_out": value }))
    }
}

async fn execute_delay(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let delay_ms = input
        .config
        .get("delay_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(1000);

    tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;

    let pass_through = input.inputs.get("input").cloned().unwrap_or(serde_json::json!(null));
    Ok(serde_json::json!({ "output": pass_through }))
}
