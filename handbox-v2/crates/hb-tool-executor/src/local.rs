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

    tracing::info!("[Executor] tool_ref='{}' -> tool_name='{}'", input.tool_ref, tool_name);

    let outputs = match tool_name {
        "file-read" => execute_file_read(input)?,
        "pdf-read" => execute_pdf_read(input)?,
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
            // Pass through any data input
            let data = input.inputs.get("data").cloned().unwrap_or(serde_json::json!(null));
            serde_json::json!({ "displayed": true, "data": data })
        }
        "user-input" => {
            // In automated execution, use config value or empty
            let text = input.config.get("default_value")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            serde_json::json!({ "text": text })
        }
        "condition" => execute_condition(input)?,
        // LLM tools
        "llm-chat" => execute_llm_chat(input).await?,
        "llm-summarize" => execute_llm_summarize(input).await?,
        "embedding" => execute_embedding(input).await?,
        "vector-store" => execute_vector_store(input)?,
        "vector-search" => execute_vector_search(input)?,
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
    // Get path from inputs first, then fall back to config file_path
    let path = input
        .inputs
        .get("path")
        .and_then(|v| v.as_str())
        .or_else(|| input.config.get("file_path").and_then(|v| v.as_str()))
        .ok_or_else(|| ExecutorError::ExecutionFailed("Missing 'path' input or 'file_path' config".into()))?;

    // Skip if path is empty
    if path.trim().is_empty() {
        return Err(ExecutorError::ExecutionFailed("File path is empty. Please configure the file path.".into()));
    }

    // Auto-detect PDF files and use PDF extractor
    if path.to_lowercase().ends_with(".pdf") {
        return execute_pdf_read(input);
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Failed to read {path}: {e}")))?;
    let size = content.len();

    Ok(serde_json::json!({ "content": content, "size": size }))
}

fn execute_pdf_read(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    use std::panic;

    // Get path from inputs first, then fall back to config file_path
    let path = input
        .inputs
        .get("path")
        .and_then(|v| v.as_str())
        .or_else(|| input.config.get("file_path").and_then(|v| v.as_str()))
        .ok_or_else(|| ExecutorError::ExecutionFailed("Missing 'path' input or 'file_path' config".into()))?;

    // Skip if path is empty
    if path.trim().is_empty() {
        return Err(ExecutorError::ExecutionFailed("PDF file path is empty. Please configure the file path.".into()));
    }

    // Check file exists
    if !std::path::Path::new(path).exists() {
        return Err(ExecutorError::ExecutionFailed(format!("PDF file not found: {path}")));
    }

    // Read PDF bytes
    let bytes = std::fs::read(path)
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Failed to read PDF file {path}: {e}")))?;

    // Extract text from PDF with panic catching (pdf-extract can panic on some fonts)
    let bytes_clone = bytes.clone();
    let extraction_result = panic::catch_unwind(|| {
        pdf_extract::extract_text_from_mem(&bytes_clone)
    });

    let content = match extraction_result {
        Ok(Ok(text)) => text,
        Ok(Err(e)) => {
            return Err(ExecutorError::ExecutionFailed(format!(
                "Failed to extract text from PDF: {e}"
            )));
        }
        Err(_) => {
            // Panic occurred - try lopdf as fallback for basic text extraction
            tracing::warn!("pdf-extract panicked, falling back to basic extraction");
            extract_pdf_text_basic(&bytes)?
        }
    };

    // Count pages (rough estimate based on page breaks or form feeds)
    let pages = content.matches('\x0c').count().max(1);

    Ok(serde_json::json!({
        "content": content,
        "pages": pages,
        "size": bytes.len()
    }))
}

/// Basic PDF text extraction fallback using lopdf directly
fn extract_pdf_text_basic(bytes: &[u8]) -> Result<String, ExecutorError> {
    use std::io::Cursor;

    let doc = lopdf::Document::load_from(Cursor::new(bytes))
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Failed to parse PDF: {e}")))?;

    let mut text = String::new();
    let pages = doc.get_pages();

    for (page_num, _) in pages.iter() {
        if let Ok(page_text) = doc.extract_text(&[*page_num]) {
            text.push_str(&page_text);
            text.push('\x0c'); // page break
        }
    }

    if text.is_empty() {
        return Err(ExecutorError::ExecutionFailed(
            "Could not extract text from PDF. The PDF may contain images or unsupported fonts.".into()
        ));
    }

    Ok(text)
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
    // Handle both array and single string inputs
    let texts: Vec<serde_json::Value> = match input.inputs.get("texts") {
        Some(serde_json::Value::Array(arr)) => arr.clone(),
        Some(serde_json::Value::String(s)) => vec![serde_json::Value::String(s.clone())],
        Some(other) => vec![other.clone()],
        None => vec![],
    };

    // Also check for "text" input (singular) as fallback
    let texts = if texts.is_empty() {
        match input.inputs.get("text") {
            Some(serde_json::Value::Array(arr)) => arr.clone(),
            Some(serde_json::Value::String(s)) => vec![serde_json::Value::String(s.clone())],
            Some(other) => vec![other.clone()],
            None => vec![],
        }
    } else {
        texts
    };

    let separator = input
        .config
        .get("separator")
        .and_then(|v| v.as_str())
        .unwrap_or("\n\n");

    let merged: String = texts
        .iter()
        .map(|v| match v {
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        })
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
    // Get path from inputs first, then fall back to config file_path
    let path = input
        .inputs
        .get("path")
        .and_then(|v| v.as_str())
        .or_else(|| input.config.get("file_path").and_then(|v| v.as_str()))
        .ok_or_else(|| ExecutorError::ExecutionFailed("Missing 'path' input or 'file_path' config".into()))?;

    if path.trim().is_empty() {
        return Err(ExecutorError::ExecutionFailed("File path is empty. Please configure the file path.".into()));
    }

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

// ---- LLM Tool Implementations ----

async fn execute_llm_chat(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    tracing::info!("[LLM Chat] Starting with inputs: {}", input.inputs);
    let prompt = input
        .inputs
        .get("prompt")
        .and_then(|v| v.as_str())
        .or_else(|| input.inputs.get("text").and_then(|v| v.as_str()))
        .unwrap_or("");

    let context = input
        .inputs
        .get("context")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let language = input
        .config
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("auto");

    let language_instruction = match language {
        "korean" | "ko" => " You MUST respond in Korean (한국어).",
        "english" | "en" => " You MUST respond in English.",
        "japanese" | "ja" => " You MUST respond in Japanese (日本語).",
        "chinese" | "zh" => " You MUST respond in Chinese (中文).",
        _ => "",
    };

    let base_system_prompt = input
        .config
        .get("system_prompt")
        .and_then(|v| v.as_str())
        .unwrap_or("You are a helpful assistant.");

    let system_prompt = format!("{}{}", base_system_prompt, language_instruction);

    let model = input
        .config
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("claude-3-haiku-20240307");

    let max_tokens = input
        .config
        .get("max_tokens")
        .and_then(|v| v.as_i64())
        .unwrap_or(4096) as i32;

    let temperature = input
        .config
        .get("temperature")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.7) as f32;

    // Build the full prompt with context if available
    let full_prompt = if context.is_empty() {
        prompt.to_string()
    } else {
        format!("Context:\n{context}\n\nQuestion/Task:\n{prompt}")
    };

    // Try providers in order: Anthropic, OpenAI, Bedrock (IAM), Bedrock (Bearer), Local
    if let Ok(api_key) = std::env::var("ANTHROPIC_API_KEY") {
        return call_anthropic_api(&api_key, model, &full_prompt, &system_prompt, max_tokens, temperature).await;
    }

    if let Ok(api_key) = std::env::var("OPENAI_API_KEY") {
        let openai_model = if model.contains("claude") { "gpt-4o" } else { model };
        return call_openai_api(&api_key, openai_model, &full_prompt, &system_prompt, max_tokens, temperature).await;
    }

    // Try AWS Bedrock with IAM credentials (Signature V4)
    if let (Ok(access_key), Ok(secret_key)) = (
        std::env::var("AWS_ACCESS_KEY_ID"),
        std::env::var("AWS_SECRET_ACCESS_KEY"),
    ) {
        let region = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());
        return call_bedrock_iam_api(&access_key, &secret_key, &region, model, &full_prompt, &system_prompt, max_tokens, temperature).await;
    }

    // Try Bedrock with Bearer token
    if let Ok(api_key) = std::env::var("BEDROCK_API_KEY") {
        let region = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());
        return call_bedrock_api(&api_key, &region, model, &full_prompt, &system_prompt, max_tokens, temperature).await;
    }

    if let Ok(endpoint) = std::env::var("LOCAL_LLM_ENDPOINT") {
        return call_local_llm_api(&endpoint, model, &full_prompt, &system_prompt, max_tokens, temperature).await;
    }

    Err(ExecutorError::ExecutionFailed(
        "No LLM API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, AWS_ACCESS_KEY_ID+AWS_SECRET_ACCESS_KEY, or LOCAL_LLM_ENDPOINT.".into()
    ))
}

async fn execute_llm_summarize(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    // Handle both string and array inputs (from text-split chunks)
    let text = match input.inputs.get("text") {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(arr)) => {
            // Join array elements into single string
            arr.iter()
                .filter_map(|v| match v {
                    serde_json::Value::String(s) => Some(s.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        }
        Some(other) => other.to_string(),
        None => String::new(),
    };

    // If text is empty, return early with error
    if text.trim().is_empty() {
        return Err(ExecutorError::ExecutionFailed(
            "No text provided for summarization. Check that the input connection is correct.".into()
        ));
    }

    tracing::info!("[LLM Summarize] Text length: {} chars", text.len());

    let style = input
        .config
        .get("style")
        .and_then(|v| v.as_str())
        .unwrap_or("concise");

    let language = input
        .config
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("auto");

    let language_instruction = match language {
        "korean" | "ko" => "You MUST respond in Korean (한국어).",
        "english" | "en" => "You MUST respond in English.",
        "japanese" | "ja" => "You MUST respond in Japanese (日本語).",
        "chinese" | "zh" => "You MUST respond in Chinese (中文).",
        _ => "Respond in the same language as the input text.",
    };

    let system_prompt = format!(
        "You are a summarization expert. Create a {} summary of the given text. \
        Focus on the key points and main ideas. {}",
        style, language_instruction
    );

    let summary_prompt = format!("Please summarize the following text:\n\n{text}");

    // Reuse llm-chat with summarization prompt
    let modified_input = ToolInput {
        tool_ref: input.tool_ref.clone(),
        inputs: serde_json::json!({ "prompt": summary_prompt }),
        config: serde_json::json!({
            "system_prompt": system_prompt,
            "model": input.config.get("model").cloned().unwrap_or(serde_json::json!("claude-3-haiku-20240307")),
            "max_tokens": input.config.get("max_tokens").cloned().unwrap_or(serde_json::json!(2048)),
            "temperature": 0.3
        }),
    };

    let result = execute_llm_chat(&modified_input).await?;
    let summary = result.get("response").and_then(|v| v.as_str()).unwrap_or("");

    Ok(serde_json::json!({ "summary": summary }))
}

async fn execute_embedding(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    let text = input
        .inputs
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // Try OpenAI embeddings first, then Bedrock
    if let Ok(api_key) = std::env::var("OPENAI_API_KEY") {
        return call_openai_embedding(&api_key, text).await;
    }

    if let Ok(api_key) = std::env::var("BEDROCK_API_KEY") {
        let region = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());
        return call_bedrock_embedding(&api_key, &region, text).await;
    }

    // Fallback: generate a simple hash-based "embedding" for testing
    let hash = simple_hash_embedding(text);
    Ok(serde_json::json!({
        "vector": hash,
        "dimension": hash.len(),
        "stub": true
    }))
}

fn execute_vector_store(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    // Simple in-memory vector storage simulation
    let vectors = input.inputs.get("vectors").cloned().unwrap_or(serde_json::json!([]));
    let chunks = input.inputs.get("chunks").cloned().unwrap_or(serde_json::json!([]));

    let count = vectors.as_array().map(|a| a.len()).unwrap_or(0);

    Ok(serde_json::json!({
        "index_id": format!("idx_{}", uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("0")),
        "stored_count": count,
        "vectors": vectors,
        "chunks": chunks
    }))
}

fn execute_vector_search(input: &ToolInput) -> Result<serde_json::Value, ExecutorError> {
    // Simple similarity search simulation
    let _query_vector = input.inputs.get("query_vector").cloned().unwrap_or(serde_json::json!([]));
    let top_k = input.config.get("top_k").and_then(|v| v.as_u64()).unwrap_or(5) as usize;

    // Return empty results for now - real implementation would use vector DB
    Ok(serde_json::json!({
        "results": [],
        "count": 0,
        "top_k": top_k
    }))
}

// ---- LLM API Helpers ----

async fn call_anthropic_api(
    api_key: &str,
    model: &str,
    prompt: &str,
    system_prompt: &str,
    max_tokens: i32,
    temperature: f32,
) -> Result<serde_json::Value, ExecutorError> {
    let body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system_prompt,
        "messages": [{"role": "user", "content": prompt}]
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Anthropic request failed: {e}")))?;

    if !response.status().is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(ExecutorError::ExecutionFailed(format!("Anthropic API error: {error_body}")));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Response parse failed: {e}")))?;

    let text = result["content"][0]["text"].as_str().unwrap_or("").to_string();

    Ok(serde_json::json!({
        "response": text,
        "model": model,
        "input_tokens": result["usage"]["input_tokens"].as_i64().unwrap_or(0),
        "output_tokens": result["usage"]["output_tokens"].as_i64().unwrap_or(0)
    }))
}

async fn call_openai_api(
    api_key: &str,
    model: &str,
    prompt: &str,
    system_prompt: &str,
    max_tokens: i32,
    temperature: f32,
) -> Result<serde_json::Value, ExecutorError> {
    let body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": max_tokens,
        "temperature": temperature
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("OpenAI request failed: {e}")))?;

    if !response.status().is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(ExecutorError::ExecutionFailed(format!("OpenAI API error: {error_body}")));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Response parse failed: {e}")))?;

    let text = result["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();

    Ok(serde_json::json!({
        "response": text,
        "model": model,
        "input_tokens": result["usage"]["prompt_tokens"].as_i64().unwrap_or(0),
        "output_tokens": result["usage"]["completion_tokens"].as_i64().unwrap_or(0)
    }))
}

async fn call_bedrock_api(
    api_key: &str,
    region: &str,
    model: &str,
    prompt: &str,
    system_prompt: &str,
    max_tokens: i32,
    temperature: f32,
) -> Result<serde_json::Value, ExecutorError> {
    let model_id = if model.starts_with("anthropic.") {
        model.to_string()
    } else {
        format!("anthropic.{}", model.replace("claude-", "claude-"))
    };

    let body = serde_json::json!({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system_prompt,
        "messages": [{"role": "user", "content": prompt}]
    });

    let url = format!(
        "https://bedrock-runtime.{}.amazonaws.com/model/{}/invoke",
        region, model_id
    );

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Bedrock request failed: {e}")))?;

    if !response.status().is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(ExecutorError::ExecutionFailed(format!("Bedrock API error: {error_body}")));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Response parse failed: {e}")))?;

    let text = result["content"][0]["text"].as_str().unwrap_or("").to_string();

    Ok(serde_json::json!({
        "response": text,
        "model": model_id,
        "input_tokens": result["usage"]["input_tokens"].as_i64().unwrap_or(0),
        "output_tokens": result["usage"]["output_tokens"].as_i64().unwrap_or(0)
    }))
}

async fn call_bedrock_iam_api(
    access_key: &str,
    secret_key: &str,
    region: &str,
    model: &str,
    prompt: &str,
    system_prompt: &str,
    max_tokens: i32,
    temperature: f32,
) -> Result<serde_json::Value, ExecutorError> {
    use chrono::Utc;
    use hmac::{Hmac, Mac};
    use sha2::{Digest, Sha256};
    use std::collections::BTreeMap;

    type HmacSha256 = Hmac<Sha256>;

    fn sign(key: &[u8], msg: &[u8]) -> Vec<u8> {
        let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
        mac.update(msg);
        mac.finalize().into_bytes().to_vec()
    }

    fn get_signature_key(secret_key: &str, date_stamp: &str, region: &str, service: &str) -> Vec<u8> {
        let k_date = sign(format!("AWS4{}", secret_key).as_bytes(), date_stamp.as_bytes());
        let k_region = sign(&k_date, region.as_bytes());
        let k_service = sign(&k_region, service.as_bytes());
        sign(&k_service, b"aws4_request")
    }

    fn sha256_hash(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        hex::encode(hasher.finalize())
    }

    // Convert model name to Bedrock model ID format
    let model_id = if model.starts_with("anthropic.") {
        model.to_string()
    } else {
        // Map common model names to Bedrock model IDs
        match model {
            "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet" | "claude-sonnet-4-20250514" =>
                "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string(),
            "claude-3-5-sonnet-20241022" =>
                "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string(),
            "claude-3-haiku-20240307" | "claude-3-haiku" =>
                "anthropic.claude-3-haiku-20240307-v1:0".to_string(),
            "claude-3-sonnet-20240229" | "claude-3-sonnet" =>
                "anthropic.claude-3-sonnet-20240229-v1:0".to_string(),
            "claude-3-opus-20240229" | "claude-3-opus" =>
                "anthropic.claude-3-opus-20240229-v1:0".to_string(),
            _ if model.contains("claude") =>
                // Try to construct a valid ID
                format!("anthropic.{}-v1:0", model),
            _ =>
                // Default to Claude 3.5 Sonnet
                "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string(),
        }
    };

    let body = serde_json::json!({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system_prompt,
        "messages": [{"role": "user", "content": prompt}]
    });

    let payload = serde_json::to_vec(&body)
        .map_err(|e| ExecutorError::ExecutionFailed(format!("JSON serialization failed: {e}")))?;

    let host = format!("bedrock-runtime.{}.amazonaws.com", region);
    // Manually encode model_id for canonical URI (: -> %3A)
    let encoded_model_id = model_id.replace(":", "%3A");
    let canonical_uri = format!("/model/{}/invoke", encoded_model_id);
    let url = format!("https://{}{}", host, canonical_uri.replace("%3A", ":"));

    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();

    let payload_hash = sha256_hash(&payload);

    let mut signed_headers_map = BTreeMap::new();
    signed_headers_map.insert("content-type".to_string(), "application/json".to_string());
    signed_headers_map.insert("host".to_string(), host.clone());
    signed_headers_map.insert("x-amz-date".to_string(), amz_date.clone());

    let signed_headers: Vec<String> = signed_headers_map.keys().cloned().collect();
    let signed_headers_str = signed_headers.join(";");

    let canonical_headers: String = signed_headers_map
        .iter()
        .map(|(k, v)| format!("{}:{}\n", k.to_lowercase(), v.trim()))
        .collect();

    let canonical_request = format!(
        "POST\n{}\n\n{}\n{}\n{}",
        canonical_uri, canonical_headers, signed_headers_str, payload_hash
    );

    let algorithm = "AWS4-HMAC-SHA256";
    let credential_scope = format!("{}/{}/bedrock/aws4_request", date_stamp, region);
    let string_to_sign = format!(
        "{}\n{}\n{}\n{}",
        algorithm,
        amz_date,
        credential_scope,
        sha256_hash(canonical_request.as_bytes())
    );

    let signing_key = get_signature_key(secret_key, &date_stamp, region, "bedrock");
    let signature = hex::encode(sign(&signing_key, string_to_sign.as_bytes()));

    let authorization_header = format!(
        "{} Credential={}/{}, SignedHeaders={}, Signature={}",
        algorithm, access_key, credential_scope, signed_headers_str, signature
    );

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", &authorization_header)
        .header("Content-Type", "application/json")
        .header("x-amz-date", &amz_date)
        .header("x-amz-content-sha256", &payload_hash)
        .body(payload)
        .send()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Bedrock IAM request failed: {e}")))?;

    if !response.status().is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(ExecutorError::ExecutionFailed(format!("Bedrock API error: {error_body}")));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Response parse failed: {e}")))?;

    let text = result["content"][0]["text"].as_str().unwrap_or("").to_string();

    Ok(serde_json::json!({
        "response": text,
        "model": model_id,
        "input_tokens": result["usage"]["input_tokens"].as_i64().unwrap_or(0),
        "output_tokens": result["usage"]["output_tokens"].as_i64().unwrap_or(0)
    }))
}

async fn call_local_llm_api(
    endpoint: &str,
    model: &str,
    prompt: &str,
    system_prompt: &str,
    max_tokens: i32,
    temperature: f32,
) -> Result<serde_json::Value, ExecutorError> {
    let url = format!("{}/api/generate", endpoint.trim_end_matches('/'));

    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "system": system_prompt,
        "stream": false,
        "options": {
            "num_predict": max_tokens,
            "temperature": temperature
        }
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Local LLM request failed: {e}")))?;

    if !response.status().is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(ExecutorError::ExecutionFailed(format!("Local LLM error: {error_body}")));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Response parse failed: {e}")))?;

    let text = result["response"].as_str().unwrap_or("").to_string();

    Ok(serde_json::json!({
        "response": text,
        "model": model,
        "input_tokens": result["prompt_eval_count"].as_i64().unwrap_or(0),
        "output_tokens": result["eval_count"].as_i64().unwrap_or(0)
    }))
}

async fn call_openai_embedding(api_key: &str, text: &str) -> Result<serde_json::Value, ExecutorError> {
    let body = serde_json::json!({
        "model": "text-embedding-3-small",
        "input": text
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/embeddings")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("OpenAI embedding request failed: {e}")))?;

    if !response.status().is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(ExecutorError::ExecutionFailed(format!("OpenAI embedding error: {error_body}")));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Response parse failed: {e}")))?;

    let embedding: Vec<f64> = result["data"][0]["embedding"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_f64()).collect())
        .unwrap_or_default();

    Ok(serde_json::json!({
        "vector": embedding,
        "dimension": embedding.len()
    }))
}

async fn call_bedrock_embedding(api_key: &str, region: &str, text: &str) -> Result<serde_json::Value, ExecutorError> {
    let model_id = "amazon.titan-embed-text-v1";
    let url = format!(
        "https://bedrock-runtime.{}.amazonaws.com/model/{}/invoke",
        region, model_id
    );

    let body = serde_json::json!({ "inputText": text });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Bedrock embedding request failed: {e}")))?;

    if !response.status().is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(ExecutorError::ExecutionFailed(format!("Bedrock embedding error: {error_body}")));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| ExecutorError::ExecutionFailed(format!("Response parse failed: {e}")))?;

    let embedding: Vec<f64> = result["embedding"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_f64()).collect())
        .unwrap_or_default();

    Ok(serde_json::json!({
        "vector": embedding,
        "dimension": embedding.len()
    }))
}

/// Simple hash-based embedding for testing (not a real embedding)
fn simple_hash_embedding(text: &str) -> Vec<f64> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut embeddings = Vec::with_capacity(128);
    for i in 0..128 {
        let mut hasher = DefaultHasher::new();
        text.hash(&mut hasher);
        i.hash(&mut hasher);
        let hash = hasher.finish();
        embeddings.push((hash as f64 / u64::MAX as f64) * 2.0 - 1.0);
    }
    embeddings
}
