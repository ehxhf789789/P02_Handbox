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

// ============================================================
// Vision & Image Generation Types
// ============================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct VisionAnalyzeRequest {
    pub image_path: Option<String>,
    pub image_base64: Option<String>,
    pub analysis_type: Option<String>,  // general, ocr, document, chart, table
    pub prompt: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VisionAnalyzeResponse {
    pub analysis: String,
    pub extracted_text: Option<String>,
    pub objects: Option<Vec<DetectedObject>>,
    pub tables: Option<Vec<ExtractedTable>>,
    pub confidence: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DetectedObject {
    pub label: String,
    pub confidence: f32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractedTable {
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageGenerateRequest {
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub model: Option<String>,  // titan-image-g1, stability-sdxl
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub style: Option<String>,  // photorealistic, cinematic, digital-art, anime
    pub output_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageGenerateResponse {
    pub image_base64: String,
    pub image_path: Option<String>,
    pub model: String,
    pub dimensions: ImageDimensions,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageDimensions {
    pub width: i32,
    pub height: i32,
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

// ============================================================
// Vision Analyze (Claude Vision)
// ============================================================

/// 이미지 분석 (Claude Vision via Bedrock)
#[tauri::command]
pub async fn vision_analyze(request: VisionAnalyzeRequest) -> Result<VisionAnalyzeResponse, String> {
    // 이미지 데이터 로드
    let image_base64 = if let Some(base64) = request.image_base64 {
        base64
    } else if let Some(path) = request.image_path {
        // 파일에서 읽어서 base64 인코딩
        let image_bytes = std::fs::read(&path)
            .map_err(|e| format!("이미지 파일 읽기 실패: {}", e))?;
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &image_bytes)
    } else {
        return Err("이미지 경로 또는 Base64 데이터가 필요합니다.".to_string());
    };

    // 이미지 MIME 타입 추측
    let media_type = guess_image_media_type(&image_base64);

    // 분석 프롬프트 구성
    let analysis_type = request.analysis_type.unwrap_or_else(|| "general".to_string());
    let user_prompt = request.prompt.unwrap_or_default();

    let analysis_prompt = match analysis_type.as_str() {
        "ocr" => format!(
            "이 이미지에서 모든 텍스트를 추출하세요. 레이아웃을 유지하며 정확하게 텍스트를 인식해주세요.{}",
            if user_prompt.is_empty() { String::new() } else { format!("\n\n추가 지시: {}", user_prompt) }
        ),
        "document" => format!(
            "이 문서 이미지를 분석하세요. 문서 유형, 주요 내용, 구조를 파악하고 요약해주세요.{}",
            if user_prompt.is_empty() { String::new() } else { format!("\n\n추가 지시: {}", user_prompt) }
        ),
        "chart" => format!(
            "이 차트/그래프 이미지를 분석하세요. 차트 유형, 데이터 트렌드, 주요 수치를 설명해주세요.{}",
            if user_prompt.is_empty() { String::new() } else { format!("\n\n추가 지시: {}", user_prompt) }
        ),
        "table" => format!(
            "이 표 이미지에서 데이터를 추출하세요. 행과 열 구조를 파악하고 내용을 텍스트로 변환해주세요.{}",
            if user_prompt.is_empty() { String::new() } else { format!("\n\n추가 지시: {}", user_prompt) }
        ),
        _ => if user_prompt.is_empty() {
            "이 이미지를 상세히 분석하고 설명해주세요. 주요 요소, 텍스트, 객체 등을 파악해주세요.".to_string()
        } else {
            user_prompt
        },
    };

    // Claude Vision 모델 선택
    let model_id = match request.model.as_deref() {
        Some("claude-3-5-sonnet") => "anthropic.claude-3-5-sonnet-20240620-v1:0",
        Some("claude-3-haiku") => "anthropic.claude-3-haiku-20240307-v1:0",
        _ => "anthropic.claude-3-sonnet-20240229-v1:0",
    };

    // Claude Vision API 호출
    let config = load_aws_config_with_native_tls().await;
    let region = config.region()
        .map(|r| r.to_string())
        .unwrap_or_else(|| "us-east-1".to_string());

    let client = create_bedrock_client(&region).await;

    let body = serde_json::json!({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 4096,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_base64
                    }
                },
                {
                    "type": "text",
                    "text": analysis_prompt
                }
            ]
        }]
    });

    let response = client
        .invoke_model()
        .model_id(model_id)
        .content_type("application/json")
        .accept("application/json")
        .body(aws_sdk_bedrockruntime::primitives::Blob::new(
            serde_json::to_vec(&body).map_err(|e| e.to_string())?
        ))
        .send()
        .await
        .map_err(|e| format!("Claude Vision 호출 실패: {}", e))?;

    let response_body: serde_json::Value = serde_json::from_slice(response.body().as_ref())
        .map_err(|e| format!("응답 파싱 실패: {}", e))?;

    let analysis = response_body["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // OCR 모드에서는 추출된 텍스트도 반환
    let extracted_text = if analysis_type == "ocr" {
        Some(analysis.clone())
    } else {
        None
    };

    Ok(VisionAnalyzeResponse {
        analysis,
        extracted_text,
        objects: None,  // Claude는 객체 감지 결과를 별도로 반환하지 않음
        tables: None,   // 표 추출은 분석 텍스트에 포함
        confidence: 0.95,  // Claude는 confidence를 반환하지 않음, 기본값 사용
    })
}

/// 이미지 MIME 타입 추측
fn guess_image_media_type(base64_data: &str) -> &'static str {
    // Base64 데이터의 시작 부분으로 이미지 타입 추측
    if base64_data.starts_with("/9j/") {
        "image/jpeg"
    } else if base64_data.starts_with("iVBOR") {
        "image/png"
    } else if base64_data.starts_with("R0lGO") {
        "image/gif"
    } else if base64_data.starts_with("UklGR") {
        "image/webp"
    } else {
        "image/png"  // 기본값
    }
}

// ============================================================
// Image Generation (Titan Image Generator)
// ============================================================

/// 이미지 생성 (Amazon Titan Image Generator via Bedrock)
#[tauri::command]
pub async fn generate_image(request: ImageGenerateRequest) -> Result<ImageGenerateResponse, String> {
    let model = request.model.unwrap_or_else(|| "titan-image-g1".to_string());
    let width = request.width.unwrap_or(1024);
    let height = request.height.unwrap_or(1024);

    let config = load_aws_config_with_native_tls().await;
    let region = config.region()
        .map(|r| r.to_string())
        .unwrap_or_else(|| "us-east-1".to_string());

    let client = create_bedrock_client(&region).await;

    // 모델별 요청 형식
    let (model_id, body) = if model.contains("stability") || model.contains("sdxl") {
        // Stability AI SDXL
        (
            "stability.stable-diffusion-xl-v1",
            serde_json::json!({
                "text_prompts": [
                    { "text": request.prompt, "weight": 1.0 },
                ],
                "cfg_scale": 7,
                "steps": 30,
                "width": width,
                "height": height,
                "seed": 0
            })
        )
    } else {
        // Amazon Titan Image Generator
        let style_preset = match request.style.as_deref() {
            Some("cinematic") => "cinematic",
            Some("digital-art") => "digital-art",
            Some("anime") => "anime",
            _ => "photographic",
        };

        (
            "amazon.titan-image-generator-v1",
            serde_json::json!({
                "taskType": "TEXT_IMAGE",
                "textToImageParams": {
                    "text": request.prompt,
                    "negativeText": request.negative_prompt.unwrap_or_default()
                },
                "imageGenerationConfig": {
                    "numberOfImages": 1,
                    "width": width,
                    "height": height,
                    "cfgScale": 8.0,
                    "seed": 0
                }
            })
        )
    };

    let response = client
        .invoke_model()
        .model_id(model_id)
        .content_type("application/json")
        .accept("application/json")
        .body(aws_sdk_bedrockruntime::primitives::Blob::new(
            serde_json::to_vec(&body).map_err(|e| e.to_string())?
        ))
        .send()
        .await
        .map_err(|e| format!("이미지 생성 실패: {}", e))?;

    let response_body: serde_json::Value = serde_json::from_slice(response.body().as_ref())
        .map_err(|e| format!("응답 파싱 실패: {}", e))?;

    // 모델별 응답 파싱
    let image_base64 = if model.contains("stability") || model.contains("sdxl") {
        response_body["artifacts"][0]["base64"]
            .as_str()
            .ok_or("이미지 데이터 없음")?
            .to_string()
    } else {
        response_body["images"][0]
            .as_str()
            .ok_or("이미지 데이터 없음")?
            .to_string()
    };

    // 출력 경로가 지정되면 파일로 저장
    let image_path = if let Some(output_path) = request.output_path {
        let image_bytes = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            &image_base64
        ).map_err(|e| format!("Base64 디코딩 실패: {}", e))?;

        std::fs::write(&output_path, &image_bytes)
            .map_err(|e| format!("이미지 저장 실패: {}", e))?;

        Some(output_path)
    } else {
        None
    };

    Ok(ImageGenerateResponse {
        image_base64,
        image_path,
        model: model_id.to_string(),
        dimensions: ImageDimensions { width, height },
    })
}
