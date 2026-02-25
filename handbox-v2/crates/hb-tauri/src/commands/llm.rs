//! LLM Provider commands for Handbox v2
//! Supports AWS Bedrock (Signature V4), OpenAI, Anthropic, and local LLM endpoints.

use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

// ============================================================
// Types
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMRequest {
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub model_id: Option<String>,
    pub max_tokens: Option<i32>,
    pub temperature: Option<f32>,
    pub provider: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMResponse {
    pub text: String,
    pub model: String,
    pub usage: TokenUsage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: i32,
    pub output_tokens: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingRequest {
    pub text: String,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingResponse {
    pub embedding: Vec<f32>,
    pub dimension: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub max_tokens: i32,
    pub supports_vision: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionResult {
    pub connected: bool,
    pub provider: String,
    pub region: Option<String>,
    pub error: Option<String>,
}

// ============================================================
// AWS Signature V4 Implementation
// ============================================================

type HmacSha256 = Hmac<Sha256>;

fn sha256_hash(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn get_signature_key(secret_key: &str, date_stamp: &str, region: &str, service: &str) -> Vec<u8> {
    let k_date = hmac_sha256(format!("AWS4{}", secret_key).as_bytes(), date_stamp.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    hmac_sha256(&k_service, b"aws4_request")
}

/// Sign a request using AWS Signature V4
fn sign_aws_request(
    access_key: &str,
    secret_key: &str,
    region: &str,
    service: &str,
    method: &str,
    host: &str,
    uri: &str,
    payload: &[u8],
) -> (String, String, String, String) {
    let now = chrono::Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();

    // Create canonical request
    let payload_hash = sha256_hash(payload);
    let canonical_headers = format!(
        "host:{}\nx-amz-date:{}\n",
        host, amz_date
    );
    let signed_headers = "host;x-amz-date";

    let canonical_request = format!(
        "{}\n{}\n\n{}\n{}\n{}",
        method,
        uri,
        canonical_headers,
        signed_headers,
        payload_hash
    );

    // Create string to sign
    let algorithm = "AWS4-HMAC-SHA256";
    let credential_scope = format!("{}/{}/{}/aws4_request", date_stamp, region, service);
    let canonical_request_hash = sha256_hash(canonical_request.as_bytes());
    let string_to_sign = format!(
        "{}\n{}\n{}\n{}",
        algorithm, amz_date, credential_scope, canonical_request_hash
    );

    // Calculate signature
    let signing_key = get_signature_key(secret_key, &date_stamp, region, service);
    let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes()));

    // Create authorization header
    let authorization = format!(
        "{} Credential={}/{}, SignedHeaders={}, Signature={}",
        algorithm, access_key, credential_scope, signed_headers, signature
    );

    // Return debug info as 4th element
    let debug_info = format!(
        "OUR_CANONICAL:\n{}\n\nOUR_HASH: {}\nOUR_URI: {}",
        canonical_request.replace("\n", "\\n"),
        canonical_request_hash,
        uri
    );

    (authorization, amz_date, payload_hash, debug_info)
}

/// Normalize model ID to Bedrock format
fn normalize_model_id(raw_id: &str) -> String {
    let stripped = if raw_id.starts_with("us.") || raw_id.starts_with("eu.") || raw_id.starts_with("apac.") {
        raw_id.split_once('.').map(|(_, rest)| rest).unwrap_or(raw_id)
    } else {
        raw_id
    };

    if stripped.contains("claude-3-5-sonnet") || stripped.contains("claude-sonnet-4") {
        "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string()
    } else if stripped.contains("claude-3-opus") || stripped.contains("claude-opus-4") {
        "anthropic.claude-3-opus-20240229-v1:0".to_string()
    } else if stripped.contains("claude-3-haiku") || stripped.contains("claude-haiku") {
        "anthropic.claude-3-haiku-20240307-v1:0".to_string()
    } else if stripped.starts_with("anthropic.") {
        stripped.to_string()
    } else {
        "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string()
    }
}

/// Call Bedrock with AWS Signature V4 authentication
async fn call_bedrock(
    access_key: &str,
    secret_key: &str,
    model_id: &str,
    region: &str,
    body: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let service = "bedrock";
    let host = format!("bedrock-runtime.{}.amazonaws.com", region);

    // Manually encode the model_id for canonical URI (: -> %3A)
    let encoded_model_id = model_id.replace(":", "%3A");
    let uri = format!("/model/{}/invoke", encoded_model_id);

    // Build URL for the request using url crate
    let mut parsed_url = url::Url::parse(&format!("https://{}/", host))
        .map_err(|e| format!("Invalid base URL: {}", e))?;
    parsed_url
        .path_segments_mut()
        .map_err(|_| "Cannot set path segments")?
        .push("model")
        .push(model_id)  // url crate handles encoding (: -> %3A)
        .push("invoke");

    let payload = serde_json::to_vec(body).map_err(|e| format!("JSON serialize failed: {}", e))?;

    let (authorization, amz_date, payload_hash, debug_info) = sign_aws_request(
        access_key,
        secret_key,
        region,
        service,
        "POST",
        &host,
        &uri,
        &payload,
    );

    let client = reqwest::Client::new();
    let response = client
        .post(parsed_url)
        .header("Host", &host)
        .header("X-Amz-Date", &amz_date)
        .header("X-Amz-Content-Sha256", &payload_hash)
        .header("Authorization", &authorization)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body(payload)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(format!("Bedrock API error (HTTP {}): {}\n\n{}", status, error_body, debug_info));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Response parse failed: {}", e))
}

// ============================================================
// Anthropic API (Direct)
// ============================================================

async fn call_anthropic(
    api_key: &str,
    model: &str,
    prompt: &str,
    system_prompt: Option<&str>,
    max_tokens: i32,
    temperature: f32,
) -> Result<LLMResponse, String> {
    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [{"role": "user", "content": prompt}]
    });

    if let Some(sys) = system_prompt {
        if !sys.is_empty() {
            body["system"] = serde_json::Value::String(sys.to_string());
        }
    }

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error (HTTP {}): {}", status, error_body));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Response parse failed: {}", e))?;

    let text = result["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let input_tokens = result["usage"]["input_tokens"].as_i64().unwrap_or(0) as i32;
    let output_tokens = result["usage"]["output_tokens"].as_i64().unwrap_or(0) as i32;

    Ok(LLMResponse {
        text,
        model: model.to_string(),
        usage: TokenUsage {
            input_tokens,
            output_tokens,
        },
    })
}

// ============================================================
// OpenAI API
// ============================================================

async fn call_openai(
    api_key: &str,
    model: &str,
    prompt: &str,
    system_prompt: Option<&str>,
    max_tokens: i32,
    temperature: f32,
) -> Result<LLMResponse, String> {
    let mut messages = Vec::new();

    if let Some(sys) = system_prompt {
        if !sys.is_empty() {
            messages.push(serde_json::json!({
                "role": "system",
                "content": sys
            }));
        }
    }

    messages.push(serde_json::json!({
        "role": "user",
        "content": prompt
    }));

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
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

    let text = result["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let input_tokens = result["usage"]["prompt_tokens"].as_i64().unwrap_or(0) as i32;
    let output_tokens = result["usage"]["completion_tokens"].as_i64().unwrap_or(0) as i32;

    Ok(LLMResponse {
        text,
        model: model.to_string(),
        usage: TokenUsage {
            input_tokens,
            output_tokens,
        },
    })
}

// ============================================================
// Local LLM (Ollama compatible)
// ============================================================

async fn call_local_llm(
    endpoint: &str,
    model: &str,
    prompt: &str,
    system_prompt: Option<&str>,
    max_tokens: i32,
    temperature: f32,
) -> Result<LLMResponse, String> {
    let url = format!("{}/api/generate", endpoint.trim_end_matches('/'));

    let mut body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": {
            "num_predict": max_tokens,
            "temperature": temperature
        }
    });

    if let Some(sys) = system_prompt {
        if !sys.is_empty() {
            body["system"] = serde_json::Value::String(sys.to_string());
        }
    }

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

    let text = result["response"].as_str().unwrap_or("").to_string();
    let eval_count = result["eval_count"].as_i64().unwrap_or(0) as i32;
    let prompt_eval_count = result["prompt_eval_count"].as_i64().unwrap_or(0) as i32;

    Ok(LLMResponse {
        text,
        model: model.to_string(),
        usage: TokenUsage {
            input_tokens: prompt_eval_count,
            output_tokens: eval_count,
        },
    })
}

// ============================================================
// Tauri Commands
// ============================================================

/// Set AWS Bedrock credentials (Access Key ID + Secret Access Key)
#[tauri::command]
pub async fn set_bedrock_credentials(
    access_key_id: String,
    secret_access_key: String,
    region: Option<String>,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<bool, String> {
    // Set environment variables
    std::env::set_var("AWS_ACCESS_KEY_ID", &access_key_id);
    std::env::set_var("AWS_SECRET_ACCESS_KEY", &secret_access_key);
    if let Some(ref r) = region {
        std::env::set_var("AWS_REGION", r);
    }

    // Save to persistent storage
    let mut creds = state.llm_credentials.write().await;
    creds.aws_access_key_id = Some(access_key_id);
    creds.aws_secret_access_key = Some(secret_access_key);
    if region.is_some() {
        creds.bedrock_region = region;
    }
    creds.save(&state.credentials_path())?;

    Ok(true)
}

/// Set AWS Bedrock region only (persistent)
#[tauri::command]
pub async fn set_bedrock_region(
    region: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<bool, String> {
    std::env::set_var("AWS_REGION", &region);

    let mut creds = state.llm_credentials.write().await;
    creds.bedrock_region = Some(region);
    creds.save(&state.credentials_path())?;

    Ok(true)
}

/// Set OpenAI API key (persistent)
#[tauri::command]
pub async fn set_openai_api_key(
    api_key: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<bool, String> {
    std::env::set_var("OPENAI_API_KEY", &api_key);

    let mut creds = state.llm_credentials.write().await;
    creds.openai_api_key = Some(api_key);
    creds.save(&state.credentials_path())?;

    Ok(true)
}

/// Set Anthropic API key (persistent)
#[tauri::command]
pub async fn set_anthropic_api_key(
    api_key: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<bool, String> {
    std::env::set_var("ANTHROPIC_API_KEY", &api_key);

    let mut creds = state.llm_credentials.write().await;
    creds.anthropic_api_key = Some(api_key);
    creds.save(&state.credentials_path())?;

    Ok(true)
}

/// Set local LLM endpoint (persistent)
#[tauri::command]
pub async fn set_local_llm_endpoint(
    endpoint: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<bool, String> {
    std::env::set_var("LOCAL_LLM_ENDPOINT", &endpoint);

    let mut creds = state.llm_credentials.write().await;
    creds.local_endpoint = Some(endpoint);
    creds.save(&state.credentials_path())?;

    Ok(true)
}

/// Clear all credentials (persistent)
#[tauri::command]
pub async fn clear_llm_credentials(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<bool, String> {
    std::env::remove_var("AWS_ACCESS_KEY_ID");
    std::env::remove_var("AWS_SECRET_ACCESS_KEY");
    std::env::remove_var("AWS_REGION");
    std::env::remove_var("OPENAI_API_KEY");
    std::env::remove_var("ANTHROPIC_API_KEY");
    std::env::remove_var("LOCAL_LLM_ENDPOINT");

    let mut creds = state.llm_credentials.write().await;
    *creds = crate::state::LLMCredentials::default();
    creds.save(&state.credentials_path())?;

    Ok(true)
}

/// Credential status (without exposing actual keys)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialStatus {
    pub has_bedrock: bool,
    pub bedrock_region: Option<String>,
    pub has_openai: bool,
    pub has_anthropic: bool,
    pub local_endpoint: Option<String>,
}

/// Get saved credential status
#[tauri::command]
pub async fn get_credential_status(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<CredentialStatus, String> {
    let creds = state.llm_credentials.read().await;
    Ok(CredentialStatus {
        has_bedrock: creds.aws_access_key_id.is_some() && creds.aws_secret_access_key.is_some(),
        bedrock_region: creds.bedrock_region.clone(),
        has_openai: creds.openai_api_key.is_some(),
        has_anthropic: creds.anthropic_api_key.is_some(),
        local_endpoint: creds.local_endpoint.clone(),
    })
}

/// Test LLM connection
#[tauri::command]
pub async fn test_llm_connection(provider: String) -> Result<ConnectionResult, String> {
    match provider.as_str() {
        "bedrock" => {
            let access_key = match std::env::var("AWS_ACCESS_KEY_ID") {
                Ok(k) => k,
                Err(_) => {
                    return Ok(ConnectionResult {
                        connected: false,
                        provider: "bedrock".to_string(),
                        region: None,
                        error: Some("No AWS Access Key ID configured".to_string()),
                    });
                }
            };

            let secret_key = match std::env::var("AWS_SECRET_ACCESS_KEY") {
                Ok(k) => k,
                Err(_) => {
                    return Ok(ConnectionResult {
                        connected: false,
                        provider: "bedrock".to_string(),
                        region: None,
                        error: Some("No AWS Secret Access Key configured".to_string()),
                    });
                }
            };

            let region = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());

            let test_body = serde_json::json!({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 10,
                "messages": [{"role": "user", "content": "Hi"}]
            });

            let model_id = "anthropic.claude-3-haiku-20240307-v1:0";
            let result = call_bedrock(&access_key, &secret_key, model_id, &region, &test_body).await;

            match result {
                Ok(_) => Ok(ConnectionResult {
                    connected: true,
                    provider: "bedrock".to_string(),
                    region: Some(region),
                    error: None,
                }),
                Err(e) => Ok(ConnectionResult {
                    connected: false,
                    provider: "bedrock".to_string(),
                    region: Some(region),
                    error: Some(e),
                }),
            }
        }
        "openai" => {
            let api_key = match std::env::var("OPENAI_API_KEY") {
                Ok(k) => k,
                Err(_) => {
                    return Ok(ConnectionResult {
                        connected: false,
                        provider: "openai".to_string(),
                        region: None,
                        error: Some("No OpenAI API key configured".to_string()),
                    });
                }
            };

            let result = call_openai(&api_key, "gpt-3.5-turbo", "Hi", None, 10, 0.0).await;

            match result {
                Ok(_) => Ok(ConnectionResult {
                    connected: true,
                    provider: "openai".to_string(),
                    region: None,
                    error: None,
                }),
                Err(e) => Ok(ConnectionResult {
                    connected: false,
                    provider: "openai".to_string(),
                    region: None,
                    error: Some(e),
                }),
            }
        }
        "anthropic" => {
            let api_key = match std::env::var("ANTHROPIC_API_KEY") {
                Ok(k) => k,
                Err(_) => {
                    return Ok(ConnectionResult {
                        connected: false,
                        provider: "anthropic".to_string(),
                        region: None,
                        error: Some("No Anthropic API key configured".to_string()),
                    });
                }
            };

            let result = call_anthropic(&api_key, "claude-3-haiku-20240307", "Hi", None, 10, 0.0).await;

            match result {
                Ok(_) => Ok(ConnectionResult {
                    connected: true,
                    provider: "anthropic".to_string(),
                    region: None,
                    error: None,
                }),
                Err(e) => Ok(ConnectionResult {
                    connected: false,
                    provider: "anthropic".to_string(),
                    region: None,
                    error: Some(e),
                }),
            }
        }
        "local" => {
            let endpoint = std::env::var("LOCAL_LLM_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:11434".to_string());

            let client = reqwest::Client::new();
            let result = client
                .get(format!("{}/api/tags", endpoint.trim_end_matches('/')))
                .send()
                .await;

            match result {
                Ok(resp) if resp.status().is_success() => Ok(ConnectionResult {
                    connected: true,
                    provider: "local".to_string(),
                    region: None,
                    error: None,
                }),
                Ok(resp) => Ok(ConnectionResult {
                    connected: false,
                    provider: "local".to_string(),
                    region: None,
                    error: Some(format!("HTTP {}", resp.status())),
                }),
                Err(e) => Ok(ConnectionResult {
                    connected: false,
                    provider: "local".to_string(),
                    region: None,
                    error: Some(e.to_string()),
                }),
            }
        }
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

/// List available models
#[tauri::command]
pub async fn list_llm_models(provider: String) -> Result<Vec<ModelInfo>, String> {
    match provider.as_str() {
        "bedrock" => Ok(vec![
            ModelInfo {
                id: "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string(),
                name: "Claude 3.5 Sonnet".to_string(),
                provider: "bedrock".to_string(),
                max_tokens: 200000,
                supports_vision: true,
            },
            ModelInfo {
                id: "anthropic.claude-3-opus-20240229-v1:0".to_string(),
                name: "Claude 3 Opus".to_string(),
                provider: "bedrock".to_string(),
                max_tokens: 200000,
                supports_vision: true,
            },
            ModelInfo {
                id: "anthropic.claude-3-haiku-20240307-v1:0".to_string(),
                name: "Claude 3 Haiku".to_string(),
                provider: "bedrock".to_string(),
                max_tokens: 200000,
                supports_vision: true,
            },
            ModelInfo {
                id: "anthropic.claude-3-5-haiku-20241022-v1:0".to_string(),
                name: "Claude 3.5 Haiku".to_string(),
                provider: "bedrock".to_string(),
                max_tokens: 200000,
                supports_vision: true,
            },
        ]),
        "openai" => Ok(vec![
            ModelInfo {
                id: "gpt-4o".to_string(),
                name: "GPT-4o".to_string(),
                provider: "openai".to_string(),
                max_tokens: 128000,
                supports_vision: true,
            },
            ModelInfo {
                id: "gpt-4-turbo".to_string(),
                name: "GPT-4 Turbo".to_string(),
                provider: "openai".to_string(),
                max_tokens: 128000,
                supports_vision: true,
            },
            ModelInfo {
                id: "gpt-3.5-turbo".to_string(),
                name: "GPT-3.5 Turbo".to_string(),
                provider: "openai".to_string(),
                max_tokens: 16384,
                supports_vision: false,
            },
        ]),
        "anthropic" => Ok(vec![
            ModelInfo {
                id: "claude-sonnet-4-20250514".to_string(),
                name: "Claude Sonnet 4".to_string(),
                provider: "anthropic".to_string(),
                max_tokens: 200000,
                supports_vision: true,
            },
            ModelInfo {
                id: "claude-3-5-sonnet-20241022".to_string(),
                name: "Claude 3.5 Sonnet".to_string(),
                provider: "anthropic".to_string(),
                max_tokens: 200000,
                supports_vision: true,
            },
            ModelInfo {
                id: "claude-3-opus-20240229".to_string(),
                name: "Claude 3 Opus".to_string(),
                provider: "anthropic".to_string(),
                max_tokens: 200000,
                supports_vision: true,
            },
            ModelInfo {
                id: "claude-3-haiku-20240307".to_string(),
                name: "Claude 3 Haiku".to_string(),
                provider: "anthropic".to_string(),
                max_tokens: 200000,
                supports_vision: true,
            },
        ]),
        "local" => {
            let endpoint = std::env::var("LOCAL_LLM_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:11434".to_string());

            let client = reqwest::Client::new();
            let result = client
                .get(format!("{}/api/tags", endpoint.trim_end_matches('/')))
                .send()
                .await;

            match result {
                Ok(resp) if resp.status().is_success() => {
                    let data: serde_json::Value = resp.json().await.unwrap_or_default();
                    let models: Vec<ModelInfo> = data["models"]
                        .as_array()
                        .unwrap_or(&vec![])
                        .iter()
                        .map(|m| ModelInfo {
                            id: m["name"].as_str().unwrap_or("").to_string(),
                            name: m["name"].as_str().unwrap_or("").to_string(),
                            provider: "local".to_string(),
                            max_tokens: 4096,
                            supports_vision: m["name"]
                                .as_str()
                                .map(|n| n.contains("llava") || n.contains("vision"))
                                .unwrap_or(false),
                        })
                        .collect();
                    Ok(models)
                }
                _ => Ok(vec![]),
            }
        }
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

/// Invoke LLM
#[tauri::command]
pub async fn invoke_llm(request: LLMRequest) -> Result<LLMResponse, String> {
    let provider = request.provider.as_deref().unwrap_or("bedrock");
    let model_id = request.model_id.clone().unwrap_or_else(|| {
        match provider {
            "openai" => "gpt-4o".to_string(),
            "local" => "llama3.2".to_string(),
            "anthropic" => "claude-3-5-sonnet-20241022".to_string(),
            _ => "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string(),
        }
    });
    let max_tokens = request.max_tokens.unwrap_or(4096);
    let temperature = request.temperature.unwrap_or(0.7);

    match provider {
        "bedrock" => {
            let access_key = std::env::var("AWS_ACCESS_KEY_ID")
                .map_err(|_| "No AWS Access Key ID configured. Please set your credentials in Settings.")?;
            let secret_key = std::env::var("AWS_SECRET_ACCESS_KEY")
                .map_err(|_| "No AWS Secret Access Key configured. Please set your credentials in Settings.")?;
            let region = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());
            let base_model_id = normalize_model_id(&model_id);

            let body = if let Some(ref sys) = request.system_prompt {
                if sys.is_empty() {
                    serde_json::json!({
                        "anthropic_version": "bedrock-2023-05-31",
                        "max_tokens": max_tokens,
                        "temperature": temperature,
                        "messages": [{"role": "user", "content": request.prompt}]
                    })
                } else {
                    serde_json::json!({
                        "anthropic_version": "bedrock-2023-05-31",
                        "max_tokens": max_tokens,
                        "temperature": temperature,
                        "system": sys,
                        "messages": [{"role": "user", "content": request.prompt}]
                    })
                }
            } else {
                serde_json::json!({
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "messages": [{"role": "user", "content": request.prompt}]
                })
            };

            // Try multiple regions
            let regions = [region.as_str(), "us-east-1", "us-west-2"];
            let mut last_error = String::new();

            for r in regions {
                match call_bedrock(&access_key, &secret_key, &base_model_id, r, &body).await {
                    Ok(resp) => {
                        let text = resp["content"][0]["text"].as_str().unwrap_or("").to_string();
                        let input_tokens = resp["usage"]["input_tokens"].as_i64().unwrap_or(0) as i32;
                        let output_tokens = resp["usage"]["output_tokens"].as_i64().unwrap_or(0) as i32;
                        return Ok(LLMResponse {
                            text,
                            model: base_model_id,
                            usage: TokenUsage { input_tokens, output_tokens },
                        });
                    }
                    Err(e) => last_error = e,
                }
            }

            Err(format!("Bedrock call failed: {}", last_error))
        }
        "openai" => {
            let api_key = std::env::var("OPENAI_API_KEY")
                .map_err(|_| "No OpenAI API key configured")?;
            call_openai(
                &api_key,
                &model_id,
                &request.prompt,
                request.system_prompt.as_deref(),
                max_tokens,
                temperature,
            )
            .await
        }
        "anthropic" => {
            let api_key = std::env::var("ANTHROPIC_API_KEY")
                .map_err(|_| "No Anthropic API key configured")?;
            call_anthropic(
                &api_key,
                &model_id,
                &request.prompt,
                request.system_prompt.as_deref(),
                max_tokens,
                temperature,
            )
            .await
        }
        "local" => {
            let endpoint = std::env::var("LOCAL_LLM_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:11434".to_string());
            call_local_llm(
                &endpoint,
                &model_id,
                &request.prompt,
                request.system_prompt.as_deref(),
                max_tokens,
                temperature,
            )
            .await
        }
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

/// Create embedding
#[tauri::command]
pub async fn create_embedding(request: EmbeddingRequest) -> Result<EmbeddingResponse, String> {
    let access_key = std::env::var("AWS_ACCESS_KEY_ID")
        .map_err(|_| "No AWS Access Key ID configured")?;
    let secret_key = std::env::var("AWS_SECRET_ACCESS_KEY")
        .map_err(|_| "No AWS Secret Access Key configured")?;
    let model_id = request.model_id.unwrap_or_else(|| "amazon.titan-embed-text-v1".to_string());
    let region = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());

    let body = serde_json::json!({
        "inputText": request.text
    });

    let response = call_bedrock(&access_key, &secret_key, &model_id, &region, &body).await?;

    let embedding: Vec<f32> = response["embedding"]
        .as_array()
        .ok_or("No embedding in response")?
        .iter()
        .filter_map(|v| v.as_f64().map(|f| f as f32))
        .collect();

    let dimension = embedding.len();

    Ok(EmbeddingResponse { embedding, dimension })
}
