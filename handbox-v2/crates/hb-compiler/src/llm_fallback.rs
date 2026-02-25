//! LLM Fallback — generate a WorkflowSpec using an LLM when no template matches.
//!
//! This module provides the core intelligence of Handbox v2: using an LLM to
//! plan and generate workflow graphs from natural language prompts.

use crate::CompilerError;
use chrono::Utc;
use hmac::{Hmac, Mac};
use hb_core::graph::{
    EdgeKind, EdgeSpec, NodeEntry, NodeSpec, Position, WorkflowMeta, WorkflowSpec,
};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

// ============================================================
// LLM Provider Trait
// ============================================================

/// Configuration for LLM-based workflow generation.
#[derive(Debug, Clone)]
pub struct LLMGeneratorConfig {
    pub provider: LLMProvider,
    pub model_id: String,
    pub temperature: f32,
    pub max_tokens: i32,
}

impl Default for LLMGeneratorConfig {
    fn default() -> Self {
        Self {
            provider: LLMProvider::Local {
                endpoint: "http://localhost:11434".into(),
            },
            model_id: "llama3.2".into(),
            temperature: 0.3,
            max_tokens: 8192,
        }
    }
}

#[derive(Debug, Clone)]
pub enum LLMProvider {
    Bedrock {
        access_key: String,
        secret_key: String,
        region: String,
    },
    BedrockApiKey {
        api_key: String,
        region: String,
    },
    OpenAI {
        api_key: String,
    },
    Local {
        endpoint: String,
    },
}

impl LLMProvider {
    /// Create from environment variables.
    pub fn from_env() -> Option<Self> {
        // Try Bedrock API Key first
        if let Ok(api_key) = std::env::var("AWS_BEARER_TOKEN_BEDROCK") {
            let region = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".into());
            return Some(Self::BedrockApiKey { api_key, region });
        }

        // Try Bedrock IAM credentials
        if let (Ok(access_key), Ok(secret_key)) = (
            std::env::var("AWS_ACCESS_KEY_ID"),
            std::env::var("AWS_SECRET_ACCESS_KEY"),
        ) {
            let region = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".into());
            return Some(Self::Bedrock {
                access_key,
                secret_key,
                region,
            });
        }

        // Try OpenAI
        if let Ok(api_key) = std::env::var("OPENAI_API_KEY") {
            return Some(Self::OpenAI { api_key });
        }

        // Try Local
        if let Ok(endpoint) = std::env::var("LOCAL_LLM_ENDPOINT") {
            return Some(Self::Local { endpoint });
        }

        // Default to local Ollama
        Some(Self::Local {
            endpoint: "http://localhost:11434".into(),
        })
    }
}

// ============================================================
// System Prompt for Workflow Generation
// ============================================================

const SYSTEM_PROMPT: &str = r#"You are Handbox, an AI workflow generator. Your task is to convert natural language instructions into executable workflow graphs.

## Available Tools (tool_ref format: "category/tool-id")

### Input/Output (io/)
- io/file-read: Read text from a file. Inputs: path. Outputs: content.
- io/file-write: Write text to a file. Inputs: path, content. Outputs: success.
- io/user-input: Get input from user. Outputs: text.
- io/display-output: Display result to user. Inputs: data.

### AI/LLM (ai/)
- ai/llm-chat: Send prompt to LLM. Inputs: prompt, context. Outputs: response.
- ai/llm-summarize: Summarize text. Inputs: text. Outputs: summary.
- ai/embedding: Generate embeddings. Inputs: text. Outputs: vector.

### Text Processing (text/)
- text/text-split: Split text into chunks. Inputs: text. Outputs: chunks.
- text/text-merge: Merge texts. Inputs: texts. Outputs: merged.
- text/text-template: Apply template. Inputs: variables. Outputs: result.
- text/regex-extract: Extract with regex. Inputs: text. Outputs: matches.

### Data (data/)
- data/json-parse: Parse JSON. Inputs: json_string. Outputs: data.
- data/json-path: Query JSON with path. Inputs: data. Outputs: result.
- data/csv-read: Read CSV. Inputs: path. Outputs: rows.
- data/data-filter: Filter array. Inputs: items. Outputs: filtered.

### Control Flow (control/)
- control/condition: Branch on condition. Inputs: value. Outputs: true, false.
- control/loop: Iterate over items. Inputs: items. Outputs: results.
- control/merge: Merge inputs. Inputs: input_a, input_b. Outputs: merged.
- control/delay: Wait for duration. Inputs: trigger. Outputs: trigger.

### RAG (rag/)
- rag/vector-store: Store embeddings. Inputs: chunks, vectors. Outputs: index_id.
- rag/vector-search: Search vectors. Inputs: query_vector. Outputs: results.
- rag/reranker: Rerank results. Inputs: query, documents. Outputs: ranked.

### Export (export/)
- export/to-pdf: Export to PDF. Inputs: content. Outputs: path.
- export/to-excel: Export to Excel. Inputs: data. Outputs: path.

## Output Format

Respond with a JSON object following this schema:
```json
{
  "version": "0.1.0",
  "meta": {
    "name": "workflow name",
    "description": "brief description"
  },
  "nodes": [
    {
      "kind": "primitive",
      "id": "unique_node_id",
      "tool_ref": "category/tool-id",
      "config": {},
      "position": {"x": 0, "y": 0},
      "label": "Display Name"
    }
  ],
  "edges": [
    {
      "source_node": "node_id_1",
      "source_port": "output_name",
      "target_node": "node_id_2",
      "target_port": "input_name",
      "kind": "data"
    }
  ]
}
```

## Rules

1. Position nodes in a left-to-right flow: input nodes on left (x=0-200), processing in middle (x=200-600), output on right (x=600+).
2. Space nodes vertically (y) with 150px between them.
3. Edge ports must match the tool's defined inputs/outputs.
4. Use descriptive node IDs (e.g., "read_input", "summarize_text", "save_output").
5. Return ONLY the JSON object, no markdown code blocks or explanations.
"#;

// ============================================================
// AWS SigV4 Signing (for Bedrock)
// ============================================================

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

fn sign_aws_request(
    method: &str,
    url: &str,
    model_id: &str,
    headers: &BTreeMap<String, String>,
    payload: &[u8],
    access_key: &str,
    secret_key: &str,
    region: &str,
    service: &str,
) -> BTreeMap<String, String> {
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();

    let parsed = url::Url::parse(url).expect("Invalid URL");
    let host = parsed.host_str().unwrap_or("");
    // Manually encode the model_id for canonical URI (: -> %3A)
    // url::Url::path() returns decoded path, but AWS SigV4 requires encoded path
    let encoded_model_id = model_id.replace(":", "%3A");
    let canonical_uri = format!("/model/{}/invoke", encoded_model_id);
    let canonical_querystring = parsed.query().unwrap_or("");

    let mut signed_headers_map = headers.clone();
    signed_headers_map.insert("host".to_string(), host.to_string());
    signed_headers_map.insert("x-amz-date".to_string(), amz_date.clone());

    let signed_headers: Vec<String> = signed_headers_map.keys().cloned().collect();
    let signed_headers_str = signed_headers.join(";");

    let canonical_headers: String = signed_headers_map
        .iter()
        .map(|(k, v)| format!("{}:{}\n", k.to_lowercase(), v.trim()))
        .collect();

    let payload_hash = sha256_hash(payload);

    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method, canonical_uri, canonical_querystring, canonical_headers, signed_headers_str, payload_hash
    );

    let algorithm = "AWS4-HMAC-SHA256";
    let credential_scope = format!("{}/{}/{}/aws4_request", date_stamp, region, service);
    let string_to_sign = format!(
        "{}\n{}\n{}\n{}",
        algorithm,
        amz_date,
        credential_scope,
        sha256_hash(canonical_request.as_bytes())
    );

    let signing_key = get_signature_key(secret_key, &date_stamp, region, service);
    let signature = hex::encode(sign(&signing_key, string_to_sign.as_bytes()));

    let authorization_header = format!(
        "{} Credential={}/{}, SignedHeaders={}, Signature={}",
        algorithm, access_key, credential_scope, signed_headers_str, signature
    );

    let mut result = BTreeMap::new();
    result.insert("Authorization".to_string(), authorization_header);
    result.insert("x-amz-date".to_string(), amz_date);
    result.insert("x-amz-content-sha256".to_string(), payload_hash);
    result
}

// ============================================================
// LLM Call Functions
// ============================================================

async fn call_bedrock_bearer(
    api_key: &str,
    model_id: &str,
    region: &str,
    prompt: &str,
    system: &str,
    temperature: f32,
    max_tokens: i32,
) -> Result<String, String> {
    let url = format!(
        "https://bedrock-runtime.{}.amazonaws.com/model/{}/invoke",
        region,
        urlencoding::encode(model_id)
    );

    let body = serde_json::json!({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system,
        "messages": [{"role": "user", "content": prompt}]
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(format!("Bedrock API error (HTTP {}): {}", status, error_body));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Response parse failed: {}", e))?;

    Ok(result["content"][0]["text"].as_str().unwrap_or("").to_string())
}

async fn call_bedrock_iam(
    access_key: &str,
    secret_key: &str,
    model_id: &str,
    region: &str,
    prompt: &str,
    system: &str,
    temperature: f32,
    max_tokens: i32,
) -> Result<String, String> {
    let url = format!(
        "https://bedrock-runtime.{}.amazonaws.com/model/{}/invoke",
        region,
        urlencoding::encode(model_id)
    );

    let body = serde_json::json!({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system,
        "messages": [{"role": "user", "content": prompt}]
    });

    let payload = serde_json::to_vec(&body).map_err(|e| e.to_string())?;

    let mut base_headers = BTreeMap::new();
    base_headers.insert("content-type".to_string(), "application/json".to_string());
    base_headers.insert("accept".to_string(), "application/json".to_string());

    let auth_headers = sign_aws_request(
        "POST",
        &url,
        model_id,
        &base_headers,
        &payload,
        access_key,
        secret_key,
        region,
        "bedrock",
    );

    let client = reqwest::Client::new();
    let mut request = client.post(&url).body(payload);

    for (key, value) in base_headers.iter().chain(auth_headers.iter()) {
        request = request.header(key, value);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(format!("Bedrock API error (HTTP {}): {}", status, error_body));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Response parse failed: {}", e))?;

    Ok(result["content"][0]["text"].as_str().unwrap_or("").to_string())
}

async fn call_openai(
    api_key: &str,
    model: &str,
    prompt: &str,
    system: &str,
    temperature: f32,
    max_tokens: i32,
) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": max_tokens,
        "temperature": temperature
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error (HTTP {}): {}", status, error_body));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Response parse failed: {}", e))?;

    Ok(result["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string())
}

async fn call_local_llm(
    endpoint: &str,
    model: &str,
    prompt: &str,
    system: &str,
    temperature: f32,
    max_tokens: i32,
) -> Result<String, String> {
    let url = format!("{}/api/generate", endpoint.trim_end_matches('/'));

    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "system": system,
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
        .map_err(|e| format!("Local LLM request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(format!("Local LLM error (HTTP {}): {}", status, error_body));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Response parse failed: {}", e))?;

    Ok(result["response"].as_str().unwrap_or("").to_string())
}

// ============================================================
// Parse LLM Response to WorkflowSpec
// ============================================================

fn parse_llm_response(response: &str) -> Result<WorkflowSpec, CompilerError> {
    // Try to extract JSON from the response (handle markdown code blocks)
    let json_str = if response.contains("```json") {
        response
            .split("```json")
            .nth(1)
            .and_then(|s| s.split("```").next())
            .unwrap_or(response)
            .trim()
    } else if response.contains("```") {
        response
            .split("```")
            .nth(1)
            .unwrap_or(response)
            .trim()
    } else {
        response.trim()
    };

    // Parse the JSON
    let value: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| CompilerError::LlmFallback(format!("Failed to parse LLM response as JSON: {}. Response: {}", e, &json_str[..json_str.len().min(500)])))?;

    // Extract workflow components
    let meta = WorkflowMeta {
        name: value["meta"]["name"].as_str().unwrap_or("Generated Workflow").to_string(),
        description: value["meta"]["description"].as_str().unwrap_or("").to_string(),
        author: Some("Handbox LLM".to_string()),
        tags: vec!["generated".to_string()],
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    // Parse nodes
    let mut nodes = Vec::new();
    if let Some(node_array) = value["nodes"].as_array() {
        for (idx, node) in node_array.iter().enumerate() {
            let id = node["id"].as_str().unwrap_or(&format!("node_{}", idx)).to_string();
            let tool_ref = node["tool_ref"].as_str().unwrap_or("ai/llm-chat").to_string();
            let label = node["label"].as_str().map(|s| s.to_string());

            let position = if let Some(pos) = node["position"].as_object() {
                Some(Position {
                    x: pos["x"].as_f64().unwrap_or(idx as f64 * 200.0),
                    y: pos["y"].as_f64().unwrap_or(0.0),
                })
            } else {
                Some(Position {
                    x: idx as f64 * 200.0,
                    y: 0.0,
                })
            };

            let config = node["config"]
                .as_object()
                .cloned()
                .unwrap_or_default();

            nodes.push(NodeEntry::Primitive(NodeSpec {
                id,
                tool_ref,
                config,
                position,
                label,
                disabled: false,
                retry: None,
                cache: None,
            }));
        }
    }

    // Parse edges
    let mut edges = Vec::new();
    if let Some(edge_array) = value["edges"].as_array() {
        for edge in edge_array {
            let source_node = edge["source_node"].as_str().unwrap_or("").to_string();
            let source_port = edge["source_port"].as_str().unwrap_or("output").to_string();
            let target_node = edge["target_node"].as_str().unwrap_or("").to_string();
            let target_port = edge["target_port"].as_str().unwrap_or("input").to_string();

            if !source_node.is_empty() && !target_node.is_empty() {
                edges.push(EdgeSpec {
                    id: Uuid::new_v4().to_string(),
                    source_node,
                    source_port,
                    target_node,
                    target_port,
                    kind: EdgeKind::Data,
                    transform: None,
                });
            }
        }
    }

    Ok(WorkflowSpec {
        version: "0.1.0".into(),
        id: Uuid::new_v4(),
        meta,
        variables: vec![],
        nodes,
        edges,
        required_packs: vec![],
    })
}

// ============================================================
// Main Function
// ============================================================

/// Use an LLM to generate a WorkflowSpec from a natural-language prompt.
pub async fn generate_with_llm(prompt: &str) -> Result<WorkflowSpec, CompilerError> {
    let config = LLMGeneratorConfig::default();
    generate_with_llm_config(prompt, &config).await
}

/// Use an LLM to generate a WorkflowSpec with custom configuration.
pub async fn generate_with_llm_config(
    prompt: &str,
    config: &LLMGeneratorConfig,
) -> Result<WorkflowSpec, CompilerError> {
    let provider = LLMProvider::from_env()
        .ok_or_else(|| CompilerError::LlmFallback("No LLM provider configured".into()))?;

    let response = match provider {
        LLMProvider::BedrockApiKey { api_key, region } => {
            let model_id = if config.model_id.starts_with("anthropic.") {
                config.model_id.clone()
            } else {
                "anthropic.claude-3-5-sonnet-20240620-v1:0".into()
            };
            call_bedrock_bearer(
                &api_key,
                &model_id,
                &region,
                prompt,
                SYSTEM_PROMPT,
                config.temperature,
                config.max_tokens,
            )
            .await
            .map_err(|e| CompilerError::LlmFallback(e))?
        }
        LLMProvider::Bedrock {
            access_key,
            secret_key,
            region,
        } => {
            let model_id = if config.model_id.starts_with("anthropic.") {
                config.model_id.clone()
            } else {
                "anthropic.claude-3-5-sonnet-20240620-v1:0".into()
            };
            call_bedrock_iam(
                &access_key,
                &secret_key,
                &model_id,
                &region,
                prompt,
                SYSTEM_PROMPT,
                config.temperature,
                config.max_tokens,
            )
            .await
            .map_err(|e| CompilerError::LlmFallback(e))?
        }
        LLMProvider::OpenAI { api_key } => {
            let model = if config.model_id.starts_with("gpt-") {
                config.model_id.clone()
            } else {
                "gpt-4o".into()
            };
            call_openai(
                &api_key,
                &model,
                prompt,
                SYSTEM_PROMPT,
                config.temperature,
                config.max_tokens,
            )
            .await
            .map_err(|e| CompilerError::LlmFallback(e))?
        }
        LLMProvider::Local { endpoint } => {
            call_local_llm(
                &endpoint,
                &config.model_id,
                prompt,
                SYSTEM_PROMPT,
                config.temperature,
                config.max_tokens,
            )
            .await
            .map_err(|e| CompilerError::LlmFallback(e))?
        }
    };

    tracing::debug!("LLM response: {}", &response[..response.len().min(500)]);

    parse_llm_response(&response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_workflow() {
        let json = r#"{
            "version": "0.1.0",
            "meta": {"name": "Test", "description": "A test workflow"},
            "nodes": [
                {"kind": "primitive", "id": "read", "tool_ref": "io/file-read", "position": {"x": 0, "y": 0}},
                {"kind": "primitive", "id": "summarize", "tool_ref": "ai/llm-summarize", "position": {"x": 200, "y": 0}}
            ],
            "edges": [
                {"source_node": "read", "source_port": "content", "target_node": "summarize", "target_port": "text"}
            ]
        }"#;

        let spec = parse_llm_response(json).expect("Should parse");
        assert_eq!(spec.nodes.len(), 2);
        assert_eq!(spec.edges.len(), 1);
    }

    #[test]
    fn test_parse_with_markdown() {
        let response = r#"Here is the workflow:

```json
{
    "version": "0.1.0",
    "meta": {"name": "Test", "description": "desc"},
    "nodes": [{"kind": "primitive", "id": "n1", "tool_ref": "ai/llm-chat"}],
    "edges": []
}
```

This workflow does..."#;

        let spec = parse_llm_response(response).expect("Should parse");
        assert_eq!(spec.nodes.len(), 1);
    }
}
