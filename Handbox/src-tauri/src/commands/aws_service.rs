// AWS 서비스 연동 커맨드

use serde::{Deserialize, Serialize};
use aws_config::BehaviorVersion;

/// native-tls를 사용하는 HTTP 클라이언트 생성 (Windows 시스템 인증서 사용)
fn create_native_tls_http_client() -> aws_smithy_runtime::client::http::hyper_014::HyperClientBuilder {
    let https = hyper_tls::HttpsConnector::new();
    aws_smithy_runtime::client::http::hyper_014::HyperClientBuilder::new()
}

/// native-tls 기반 AWS 설정 로드
async fn load_aws_config_with_native_tls() -> aws_config::SdkConfig {
    let https_connector = hyper_tls::HttpsConnector::new();
    let hyper_client = aws_smithy_runtime::client::http::hyper_014::HyperClientBuilder::new()
        .build(https_connector);

    aws_config::defaults(BehaviorVersion::latest())
        .http_client(hyper_client)
        .load()
        .await
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AWSConnectionResult {
    pub connected: bool,
    pub region: String,
    pub services: Vec<ServiceStatus>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServiceStatus {
    pub name: String,
    pub available: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BedrockRequest {
    pub model_id: String,
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub max_tokens: Option<i32>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BedrockResponse {
    pub response: String,
    pub usage: TokenUsage,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: i32,
    pub output_tokens: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EmbeddingRequest {
    pub text: String,
    pub model_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EmbeddingResponse {
    pub embedding: Vec<f32>,
    pub dimension: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KnowledgeBaseQuery {
    pub query: String,
    pub index_name: String,
    pub top_k: Option<i32>,
    pub filter: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KnowledgeBaseResult {
    pub results: Vec<SearchResult>,
    pub total: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub content: String,
    pub score: f32,
    pub metadata: serde_json::Value,
}

/// AWS 자격 증명 설정
#[tauri::command]
pub async fn set_aws_credentials(
    access_key_id: String,
    secret_access_key: String,
    region: String,
) -> Result<bool, String> {
    // 환경 변수로 자격 증명 설정
    std::env::set_var("AWS_ACCESS_KEY_ID", &access_key_id);
    std::env::set_var("AWS_SECRET_ACCESS_KEY", &secret_access_key);
    std::env::set_var("AWS_DEFAULT_REGION", &region);
    std::env::set_var("AWS_REGION", &region);

    Ok(true)
}

/// AWS 로그아웃 (자격 증명 제거)
#[tauri::command]
pub async fn clear_aws_credentials() -> Result<bool, String> {
    std::env::remove_var("AWS_ACCESS_KEY_ID");
    std::env::remove_var("AWS_SECRET_ACCESS_KEY");
    std::env::remove_var("AWS_DEFAULT_REGION");
    std::env::remove_var("AWS_REGION");
    std::env::remove_var("AWS_BEARER_TOKEN_BEDROCK");

    Ok(true)
}

/// Bedrock API Key (Bearer Token) 설정
#[tauri::command]
pub async fn set_bedrock_api_key(api_key: String) -> Result<bool, String> {
    std::env::set_var("AWS_BEARER_TOKEN_BEDROCK", &api_key);
    Ok(true)
}

/// Bedrock API Key 제거
#[tauri::command]
pub async fn clear_bedrock_api_key() -> Result<bool, String> {
    std::env::remove_var("AWS_BEARER_TOKEN_BEDROCK");
    Ok(true)
}

/// Bedrock API Key가 설정되어 있는지 확인
#[tauri::command]
pub async fn has_bedrock_api_key() -> Result<bool, String> {
    Ok(std::env::var("AWS_BEARER_TOKEN_BEDROCK").is_ok())
}

/// AWS 연결 테스트
#[tauri::command]
pub async fn test_aws_connection() -> Result<AWSConnectionResult, String> {
    // 자격 증명이 설정되어 있는지 확인
    let has_credentials = std::env::var("AWS_ACCESS_KEY_ID").is_ok()
        && std::env::var("AWS_SECRET_ACCESS_KEY").is_ok();

    if !has_credentials {
        return Ok(AWSConnectionResult {
            connected: false,
            region: "not-configured".to_string(),
            services: vec![
                ServiceStatus {
                    name: "S3".to_string(),
                    available: false,
                    error: Some("AWS 자격 증명이 설정되지 않았습니다".to_string()),
                },
                ServiceStatus {
                    name: "Bedrock".to_string(),
                    available: false,
                    error: Some("AWS 자격 증명이 설정되지 않았습니다".to_string()),
                },
                ServiceStatus {
                    name: "OpenSearch Serverless".to_string(),
                    available: false,
                    error: Some("AWS 자격 증명이 설정되지 않았습니다".to_string()),
                },
            ],
        });
    }

    // native-tls를 사용하여 Windows 시스템 인증서 사용
    let config = load_aws_config_with_native_tls().await;

    let region = config.region()
        .map(|r| r.to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let mut services = Vec::new();

    // S3 테스트
    let s3_client = aws_sdk_s3::Client::new(&config);
    let s3_status = match s3_client.list_buckets().send().await {
        Ok(_) => ServiceStatus {
            name: "S3".to_string(),
            available: true,
            error: None,
        },
        Err(e) => ServiceStatus {
            name: "S3".to_string(),
            available: false,
            error: Some(e.to_string()),
        },
    };
    let s3_available = s3_status.available;
    services.push(s3_status);

    // Bedrock 테스트 - S3가 성공하면 Bedrock도 가능하다고 가정
    services.push(ServiceStatus {
        name: "Bedrock".to_string(),
        available: s3_available,
        error: if s3_available { None } else { Some("S3 연결 실패".to_string()) },
    });

    // OpenSearch 테스트 - S3가 성공하면 OpenSearch도 가능하다고 가정
    services.push(ServiceStatus {
        name: "OpenSearch Serverless".to_string(),
        available: s3_available,
        error: if s3_available { None } else { Some("S3 연결 실패".to_string()) },
    });

    let connected = s3_available;

    Ok(AWSConnectionResult {
        connected,
        region,
        services,
    })
}

/// 모델 ID를 정규화 (base model ID 추출)
fn normalize_model_id(raw_id: &str) -> String {
    // us. / eu. / apac. 접두사 제거
    let stripped = if raw_id.starts_with("us.") || raw_id.starts_with("eu.") || raw_id.starts_with("apac.") {
        raw_id.split_once('.').map(|(_, rest)| rest).unwrap_or(raw_id)
    } else {
        raw_id
    };

    // 모델명 매핑 (프론트엔드에서 오는 다양한 형식 지원)
    if stripped.contains("claude-3-5-sonnet") {
        "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string()
    } else if stripped.contains("claude-3-opus") {
        "anthropic.claude-3-opus-20240229-v1:0".to_string()
    } else if stripped.contains("claude-3-sonnet") {
        "anthropic.claude-3-sonnet-20240229-v1:0".to_string()
    } else if stripped.contains("claude-3-haiku") {
        "anthropic.claude-3-haiku-20240307-v1:0".to_string()
    } else if stripped.starts_with("anthropic.") {
        stripped.to_string()
    } else {
        // 기본값: Claude 3.5 Sonnet v1
        "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string()
    }
}

/// Cross-region inference profile ID 생성 (서울 등 비-US 리전용)
fn get_cross_region_model_id(base_model_id: &str, region: &str) -> String {
    // US 리전은 직접 모델 ID 사용
    if region.starts_with("us-") {
        return base_model_id.to_string();
    }
    // 비-US 리전: cross-region inference profile 사용 (us. 접두사)
    format!("us.{}", base_model_id)
}

/// Bedrock 클라이언트 생성 (특정 리전용)
async fn create_bedrock_client(region: &str) -> aws_sdk_bedrockruntime::Client {
    let https_connector = hyper_tls::HttpsConnector::new();
    let hyper_client = aws_smithy_runtime::client::http::hyper_014::HyperClientBuilder::new()
        .build(https_connector);

    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(aws_config::Region::new(region.to_string()))
        .http_client(hyper_client)
        .load()
        .await;

    aws_sdk_bedrockruntime::Client::new(&config)
}

/// Bearer Token으로 Bedrock 직접 HTTP 호출
async fn call_bedrock_with_bearer_token(
    api_key: &str,
    model_id: &str,
    region: &str,
    body: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let url = format!(
        "https://bedrock-runtime.{}.amazonaws.com/model/{}/invoke",
        region, model_id
    );

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("HTTP 요청 실패: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(format!("Bedrock API 오류 (HTTP {}): {}", status, error_body));
    }

    response.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("응답 파싱 실패: {}", e))
}

/// Bedrock InvokeModel 실행
async fn call_bedrock(
    client: &aws_sdk_bedrockruntime::Client,
    model_id: &str,
    body: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let response = client
        .invoke_model()
        .model_id(model_id)
        .content_type("application/json")
        .accept("application/json")
        .body(aws_sdk_bedrockruntime::primitives::Blob::new(
            serde_json::to_vec(body).map_err(|e| e.to_string())?
        ))
        .send()
        .await
        .map_err(|e| {
            // AWS SDK 에러에서 상세 정보 추출
            let raw = format!("{:?}", e);
            let display = format!("{}", e);

            // SdkError의 source chain에서 상세 메시지 추출
            let mut detail = display.clone();
            let mut source: Option<&dyn std::error::Error> = std::error::Error::source(&e);
            while let Some(cause) = source {
                detail = format!("{} → {}", detail, cause);
                source = std::error::Error::source(cause);
            }

            // 디버그 출력에서 핵심 정보 추출
            if raw.contains("AccessDeniedException") || detail.contains("AccessDenied") {
                format!("접근 거부: IAM 정책에 bedrock:InvokeModel 권한이 필요합니다. ({})", detail)
            } else if raw.contains("ResourceNotFoundException") || detail.contains("not found") {
                format!("모델을 찾을 수 없음: AWS 콘솔 > Bedrock > Model access에서 모델을 활성화하세요. ({})", detail)
            } else if raw.contains("ValidationException") || detail.contains("Validation") {
                format!("요청 검증 실패: ({})", detail)
            } else if raw.contains("ThrottlingException") {
                format!("요청 제한됨 (Throttling): 잠시 후 다시 시도하세요. ({})", detail)
            } else {
                format!("{} [디버그: {}]", detail, if raw.len() > 500 { &raw[..500] } else { &raw })
            }
        })?;

    serde_json::from_slice(response.body().as_ref())
        .map_err(|e| format!("응답 파싱 실패: {}", e))
}

/// Bedrock Claude 호출
#[tauri::command]
pub async fn invoke_bedrock(request: BedrockRequest) -> Result<BedrockResponse, String> {
    let base_model_id = normalize_model_id(&request.model_id);

    // AWS 기본 설정에서 리전 확인
    let base_config = load_aws_config_with_native_tls().await;
    let user_region = base_config.region()
        .map(|r| r.to_string())
        .unwrap_or_else(|| "us-east-1".to_string());

    // Claude 메시지 형식
    let system_prompt = request.system_prompt.unwrap_or_default();
    let body = if system_prompt.is_empty() {
        serde_json::json!({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": request.max_tokens.unwrap_or(4096),
            "temperature": request.temperature.unwrap_or(0.1),
            "messages": [{ "role": "user", "content": request.prompt }]
        })
    } else {
        serde_json::json!({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": request.max_tokens.unwrap_or(4096),
            "temperature": request.temperature.unwrap_or(0.1),
            "system": system_prompt,
            "messages": [{ "role": "user", "content": request.prompt }]
        })
    };

    // === 응답 파싱 헬퍼 ===
    let parse_response = |response_body: &serde_json::Value| -> BedrockResponse {
        let text = response_body["content"][0]["text"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let input_tokens = response_body["usage"]["input_tokens"]
            .as_i64()
            .unwrap_or(0) as i32;
        let output_tokens = response_body["usage"]["output_tokens"]
            .as_i64()
            .unwrap_or(0) as i32;
        BedrockResponse {
            response: text,
            usage: TokenUsage { input_tokens, output_tokens },
        }
    };

    // === 1단계: Bearer Token (Bedrock API Key) 시도 ===
    if let Ok(api_key) = std::env::var("AWS_BEARER_TOKEN_BEDROCK") {
        // Bearer Token이 있으면 직접 HTTP 호출 시도
        let bearer_regions = [user_region.as_str(), "us-east-1", "us-west-2"];
        for region in bearer_regions {
            match call_bedrock_with_bearer_token(&api_key, &base_model_id, region, &body).await {
                Ok(response_body) => {
                    return Ok(parse_response(&response_body));
                }
                Err(_) => continue,
            }
        }
    }

    // === 2단계: AWS SDK (IAM 자격 증명) 시도 ===
    // 시도 순서:
    // a) 사용자 리전 + cross-region inference profile (비-US)
    // b) 사용자 리전 + 직접 모델 ID
    // c) us-west-2 리전 + 직접 모델 ID (ultimate fallback)
    let mut attempts: Vec<(String, String)> = Vec::new();

    let cross_region_id = get_cross_region_model_id(&base_model_id, &user_region);
    if cross_region_id != base_model_id {
        attempts.push((user_region.clone(), cross_region_id));
        attempts.push((user_region.clone(), base_model_id.clone()));
    } else {
        attempts.push((user_region.clone(), base_model_id.clone()));
    }
    if user_region != "us-west-2" {
        attempts.push(("us-west-2".to_string(), base_model_id.clone()));
    }

    let mut last_error = String::new();
    for (region, model_id) in &attempts {
        let client = create_bedrock_client(region).await;
        match call_bedrock(&client, model_id, &body).await {
            Ok(response_body) => {
                return Ok(parse_response(&response_body));
            }
            Err(e) => {
                last_error = format!("리전: {}, 모델: {} → {}", region, model_id, e);
            }
        }
    }

    // 모든 시도 실패
    let attempt_details: Vec<String> = attempts.iter()
        .map(|(r, m)| format!("{}({})", r, m))
        .collect();
    Err(format!(
        "Bedrock 호출 실패. 시도: [{}]. 마지막 오류: {}. AWS 콘솔에서 Bedrock 모델 액세스를 확인하세요.",
        attempt_details.join(", "), last_error
    ))
}

/// 임베딩 생성 (Titan Embeddings)
#[tauri::command]
pub async fn create_embedding(request: EmbeddingRequest) -> Result<EmbeddingResponse, String> {
    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(aws_config::Region::new("us-east-1"))
        .load()
        .await;

    let client = aws_sdk_bedrockruntime::Client::new(&config);

    let model_id = request.model_id
        .unwrap_or_else(|| "amazon.titan-embed-text-v1".to_string());

    let body = serde_json::json!({
        "inputText": request.text
    });

    let response = client
        .invoke_model()
        .model_id(&model_id)
        .content_type("application/json")
        .accept("application/json")
        .body(aws_sdk_bedrockruntime::primitives::Blob::new(
            serde_json::to_vec(&body).map_err(|e| e.to_string())?
        ))
        .send()
        .await
        .map_err(|e| format!("Embedding creation failed: {}", e))?;

    let response_body: serde_json::Value = serde_json::from_slice(
        response.body().as_ref()
    ).map_err(|e| format!("Failed to parse response: {}", e))?;

    let embedding: Vec<f32> = response_body["embedding"]
        .as_array()
        .ok_or("No embedding in response")?
        .iter()
        .filter_map(|v| v.as_f64().map(|f| f as f32))
        .collect();

    let dimension = embedding.len();

    Ok(EmbeddingResponse {
        embedding,
        dimension,
    })
}

/// 지식베이스 검색
#[tauri::command]
pub async fn search_knowledge_base(query: KnowledgeBaseQuery) -> Result<KnowledgeBaseResult, String> {
    // OpenSearch Serverless 검색 구현
    // 실제 구현에서는 opensearch-py와 유사하게 HTTP 요청

    // 플레이스홀더 응답
    Ok(KnowledgeBaseResult {
        results: vec![],
        total: 0,
    })
}

/// S3 업로드
#[tauri::command]
pub async fn upload_to_s3(
    bucket: String,
    key: String,
    content: String,
) -> Result<String, String> {
    let config = aws_config::defaults(BehaviorVersion::latest())
        .load()
        .await;

    let client = aws_sdk_s3::Client::new(&config);

    client
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .body(aws_sdk_s3::primitives::ByteStream::from(content.into_bytes()))
        .send()
        .await
        .map_err(|e| format!("S3 upload failed: {}", e))?;

    Ok(format!("s3://{}/{}", bucket, key))
}
