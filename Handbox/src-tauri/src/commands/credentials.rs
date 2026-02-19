// Credential Vault - OS 키체인 기반 보안 자격증명 저장소
// Windows: Credential Manager
// macOS: Keychain
// Linux: Secret Service (libsecret)

use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const SERVICE_NAME: &str = "handbox";

/// 자격증명 타입
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CredentialType {
    ApiKey,           // 단일 API 키
    AccessKey,        // Access Key + Secret Key (AWS 등)
    OAuthToken,       // OAuth 토큰
    ServiceAccount,   // 서비스 계정 JSON (GCP)
    UsernamePassword, // 사용자명/비밀번호
    Custom,           // 커스텀 키-값 쌍
}

/// 자격증명 메타데이터 (암호화 불필요한 정보)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialMetadata {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub credential_type: CredentialType,
    pub provider: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub expires_at: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
}

/// 자격증명 저장 요청
#[derive(Debug, Deserialize)]
pub struct CredentialSaveRequest {
    pub id: Option<String>,
    pub name: String,
    #[serde(rename = "type")]
    pub credential_type: CredentialType,
    pub provider: String,
    pub description: Option<String>,
    pub values: HashMap<String, String>,
    pub metadata: Option<HashMap<String, String>>,
    pub expires_at: Option<String>,
}

/// 자격증명 저장 결과
#[derive(Debug, Serialize)]
pub struct CredentialSaveResult {
    pub success: bool,
    pub id: String,
    pub error: Option<String>,
}

/// 자격증명 조회 결과
#[derive(Debug, Serialize)]
pub struct CredentialRetrieveResult {
    pub success: bool,
    pub values: HashMap<String, String>,
    pub error: Option<String>,
}

/// 자격증명 목록 항목
#[derive(Debug, Serialize)]
pub struct CredentialListItem {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub credential_type: String,
    pub provider: String,
    pub description: Option<String>,
    pub has_value: bool,
    pub created_at: String,
    pub updated_at: String,
    pub expires_at: Option<String>,
}

/// 키링 항목 키 생성
fn make_entry_key(provider: &str, key: &str) -> String {
    format!("{}:{}", provider, key)
}

/// 메타데이터 저장 키
fn make_metadata_key(id: &str) -> String {
    format!("_meta:{}", id)
}

/// 자격증명 저장 (보안 저장소)
#[tauri::command]
pub async fn credential_store(request: CredentialSaveRequest) -> Result<CredentialSaveResult, String> {
    let id = request.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();

    // 각 키-값 쌍을 OS 키체인에 저장
    for (key, value) in &request.values {
        let entry_key = make_entry_key(&request.provider, key);
        let full_key = format!("{}:{}", id, entry_key);

        let entry = Entry::new(SERVICE_NAME, &full_key)
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

        entry.set_password(&value)
            .map_err(|e| format!("Failed to store credential: {}", e))?;
    }

    // 메타데이터 저장 (키 목록 포함)
    let metadata = CredentialMetadata {
        id: id.clone(),
        name: request.name,
        credential_type: request.credential_type,
        provider: request.provider.clone(),
        description: request.description,
        created_at: now.clone(),
        updated_at: now,
        expires_at: request.expires_at,
        metadata: request.metadata,
    };

    // 메타데이터는 JSON으로 직렬화하여 저장
    let metadata_json = serde_json::to_string(&metadata)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

    let meta_key = make_metadata_key(&id);
    let meta_entry = Entry::new(SERVICE_NAME, &meta_key)
        .map_err(|e| format!("Failed to create metadata entry: {}", e))?;

    meta_entry.set_password(&metadata_json)
        .map_err(|e| format!("Failed to store metadata: {}", e))?;

    // 키 목록도 저장 (나중에 조회할 때 필요)
    let keys_list: Vec<String> = request.values.keys().cloned().collect();
    let keys_json = serde_json::to_string(&keys_list)
        .map_err(|e| format!("Failed to serialize keys: {}", e))?;

    let keys_key = format!("_keys:{}", id);
    let keys_entry = Entry::new(SERVICE_NAME, &keys_key)
        .map_err(|e| format!("Failed to create keys entry: {}", e))?;

    keys_entry.set_password(&keys_json)
        .map_err(|e| format!("Failed to store keys: {}", e))?;

    Ok(CredentialSaveResult {
        success: true,
        id,
        error: None,
    })
}

/// 자격증명 조회 (보안 저장소에서)
#[tauri::command]
pub async fn credential_retrieve(
    id: String,
    provider: String,
) -> Result<CredentialRetrieveResult, String> {
    // 먼저 키 목록 조회
    let keys_key = format!("_keys:{}", id);
    let keys_entry = Entry::new(SERVICE_NAME, &keys_key)
        .map_err(|e| format!("Failed to access keys entry: {}", e))?;

    let keys_json = keys_entry.get_password()
        .map_err(|e| format!("Failed to retrieve keys: {}", e))?;

    let keys: Vec<String> = serde_json::from_str(&keys_json)
        .map_err(|e| format!("Failed to parse keys: {}", e))?;

    // 각 키에 대해 값 조회
    let mut values = HashMap::new();
    for key in keys {
        let entry_key = make_entry_key(&provider, &key);
        let full_key = format!("{}:{}", id, entry_key);

        let entry = Entry::new(SERVICE_NAME, &full_key)
            .map_err(|e| format!("Failed to access entry: {}", e))?;

        match entry.get_password() {
            Ok(value) => {
                values.insert(key, value);
            }
            Err(e) => {
                // 개별 키 실패는 로그만 남기고 계속
                eprintln!("Warning: Failed to retrieve key {}: {}", key, e);
            }
        }
    }

    Ok(CredentialRetrieveResult {
        success: true,
        values,
        error: None,
    })
}

/// 자격증명 삭제
#[tauri::command]
pub async fn credential_delete(id: String, provider: String) -> Result<bool, String> {
    // 키 목록 조회
    let keys_key = format!("_keys:{}", id);
    let keys_entry = Entry::new(SERVICE_NAME, &keys_key)
        .map_err(|e| format!("Failed to access keys entry: {}", e))?;

    if let Ok(keys_json) = keys_entry.get_password() {
        if let Ok(keys) = serde_json::from_str::<Vec<String>>(&keys_json) {
            // 각 키 삭제
            for key in keys {
                let entry_key = make_entry_key(&provider, &key);
                let full_key = format!("{}:{}", id, entry_key);

                if let Ok(entry) = Entry::new(SERVICE_NAME, &full_key) {
                    let _ = entry.delete_password();
                }
            }
        }
    }

    // 키 목록 삭제
    let _ = keys_entry.delete_password();

    // 메타데이터 삭제
    let meta_key = make_metadata_key(&id);
    if let Ok(meta_entry) = Entry::new(SERVICE_NAME, &meta_key) {
        let _ = meta_entry.delete_password();
    }

    Ok(true)
}

/// 자격증명 메타데이터 조회
#[tauri::command]
pub async fn credential_get_metadata(id: String) -> Result<Option<CredentialMetadata>, String> {
    let meta_key = make_metadata_key(&id);
    let meta_entry = Entry::new(SERVICE_NAME, &meta_key)
        .map_err(|e| format!("Failed to access metadata entry: {}", e))?;

    match meta_entry.get_password() {
        Ok(metadata_json) => {
            let metadata: CredentialMetadata = serde_json::from_str(&metadata_json)
                .map_err(|e| format!("Failed to parse metadata: {}", e))?;
            Ok(Some(metadata))
        }
        Err(_) => Ok(None),
    }
}

/// 특정 프로바이더의 자격증명 존재 여부 확인
#[tauri::command]
pub async fn credential_has_provider(provider: String) -> Result<bool, String> {
    // 프로바이더별 인덱스 조회
    let index_key = format!("_provider_index:{}", provider);
    let index_entry = Entry::new(SERVICE_NAME, &index_key)
        .map_err(|e| format!("Failed to access index: {}", e))?;

    match index_entry.get_password() {
        Ok(ids_json) => {
            let ids: Vec<String> = serde_json::from_str(&ids_json).unwrap_or_default();
            Ok(!ids.is_empty())
        }
        Err(_) => Ok(false),
    }
}

/// AWS 자격증명 빠른 저장 (기존 환경변수 기반에서 마이그레이션용)
#[tauri::command]
pub async fn credential_store_aws(
    access_key_id: String,
    secret_access_key: String,
    region: String,
    profile_name: Option<String>,
) -> Result<CredentialSaveResult, String> {
    let profile = profile_name.unwrap_or_else(|| "default".to_string());
    let id = format!("aws-{}", profile);

    let mut values = HashMap::new();
    values.insert("access_key_id".to_string(), access_key_id);
    values.insert("secret_access_key".to_string(), secret_access_key);
    values.insert("region".to_string(), region);

    let mut metadata = HashMap::new();
    metadata.insert("profile".to_string(), profile.clone());

    let request = CredentialSaveRequest {
        id: Some(id),
        name: format!("AWS - {}", profile),
        credential_type: CredentialType::AccessKey,
        provider: "aws".to_string(),
        description: Some(format!("AWS credentials for profile: {}", profile)),
        values,
        metadata: Some(metadata),
        expires_at: None,
    };

    credential_store(request).await
}

/// AWS 자격증명 빠른 조회
#[tauri::command]
pub async fn credential_retrieve_aws(
    profile_name: Option<String>,
) -> Result<CredentialRetrieveResult, String> {
    let profile = profile_name.unwrap_or_else(|| "default".to_string());
    let id = format!("aws-{}", profile);

    credential_retrieve(id, "aws".to_string()).await
}

/// 테스트용: 모든 자격증명 삭제
#[cfg(debug_assertions)]
#[tauri::command]
pub async fn credential_clear_all() -> Result<bool, String> {
    // 개발 환경에서만 사용 가능
    // 실제 구현은 인덱스 기반으로 모든 항목 삭제
    Ok(true)
}
