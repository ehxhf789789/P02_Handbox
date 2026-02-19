// CLI 명령어 실행 모듈
// 로컬 시스템의 CLI 도구를 실행하고 결과를 반환
// Universal CLI Adapter - 다양한 클라우드/로컬 CLI 통합

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;
use std::time::Instant;

#[derive(Debug, Serialize, Deserialize)]
pub struct CliResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
    pub command: String,
}

// ========================================
// CLI Provider 타입 정의
// ========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CLIProviderType {
    Aws,
    Azure,
    Gcloud,
    Ollama,
    Docker,
    Kubectl,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CLIProviderInfo {
    pub provider_type: CLIProviderType,
    pub name: String,
    pub installed: bool,
    pub version: Option<String>,
    pub executable_path: Option<String>,
    pub profiles: Vec<String>,
    pub current_profile: Option<String>,
    pub region: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CLIDetectionResult {
    pub providers: Vec<CLIProviderInfo>,
    pub total_installed: usize,
}

/// CLI 명령어 실행
/// Windows에서는 cmd /c, Unix에서는 sh -c를 사용
#[tauri::command]
pub fn execute_cli(
    program: String,
    args: Vec<String>,
    working_dir: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<CliResult, String> {
    let start = Instant::now();
    let full_command = format!("{} {}", program, args.join(" "));

    let mut cmd = Command::new(&program);
    cmd.args(&args);

    if let Some(dir) = &working_dir {
        cmd.current_dir(dir);
    }

    // 보안: 허용된 프로그램 목록 확인
    let allowed_programs = [
        "aws", "gcloud", "az",           // 클라우드 CLI
        "python", "python3", "node",      // 스크립트 런타임
        "pip", "npm", "npx",              // 패키지 매니저
        "git", "docker",                  // 개발 도구
        "curl", "wget",                   // HTTP 클라이언트
        "cmd", "powershell",              // 시스템 쉘 (Windows)
        "sh", "bash",                     // 시스템 쉘 (Unix)
    ];

    let program_name = program.split(['/', '\\']).last().unwrap_or(&program);
    let program_base = program_name.split('.').next().unwrap_or(program_name).to_lowercase();

    if !allowed_programs.contains(&program_base.as_str()) {
        return Err(format!(
            "보안: '{}' 프로그램은 허용되지 않습니다. 허용 목록: {:?}",
            program, allowed_programs
        ));
    }

    let output = cmd.output().map_err(|e| {
        format!("명령어 실행 실패: {} ({})", e, full_command)
    })?;

    let duration = start.elapsed().as_millis() as u64;

    // 타임아웃 확인 (실행 후 체크)
    if let Some(timeout) = timeout_secs {
        if duration > timeout * 1000 {
            return Err(format!("타임아웃: {}초 초과 (실행 시간: {}ms)", timeout, duration));
        }
    }

    Ok(CliResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
        duration_ms: duration,
        command: full_command,
    })
}

/// Python 스크립트 실행
#[tauri::command]
pub fn execute_python_script(
    script_path: String,
    args: Vec<String>,
    working_dir: Option<String>,
) -> Result<CliResult, String> {
    let start = Instant::now();
    let full_command = format!("python {}", script_path);

    // Python 실행파일 찾기 (python3 우선)
    let python = if cfg!(target_os = "windows") {
        "python"
    } else {
        "python3"
    };

    let mut cmd_args = vec![script_path.clone()];
    cmd_args.extend(args);

    let mut cmd = Command::new(python);
    cmd.args(&cmd_args);

    if let Some(dir) = &working_dir {
        cmd.current_dir(dir);
    }

    let output = cmd.output().map_err(|e| {
        format!("Python 스크립트 실행 실패: {} ({})", e, full_command)
    })?;

    Ok(CliResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
        duration_ms: start.elapsed().as_millis() as u64,
        command: full_command,
    })
}

// ========================================
// CLI Provider Detection
// ========================================

/// 설치된 CLI 프로바이더 감지
#[tauri::command]
pub async fn detect_cli_providers() -> Result<CLIDetectionResult, String> {
    let mut providers = Vec::new();

    // AWS CLI
    providers.push(detect_aws_cli().await);

    // Azure CLI
    providers.push(detect_azure_cli().await);

    // Google Cloud CLI
    providers.push(detect_gcloud_cli().await);

    // Ollama
    providers.push(detect_ollama_cli().await);

    // Docker
    providers.push(detect_docker_cli().await);

    // kubectl
    providers.push(detect_kubectl_cli().await);

    let total_installed = providers.iter().filter(|p| p.installed).count();

    Ok(CLIDetectionResult {
        providers,
        total_installed,
    })
}

/// AWS CLI 감지
async fn detect_aws_cli() -> CLIProviderInfo {
    let mut info = CLIProviderInfo {
        provider_type: CLIProviderType::Aws,
        name: "AWS CLI".to_string(),
        installed: false,
        version: None,
        executable_path: None,
        profiles: Vec::new(),
        current_profile: None,
        region: None,
        error: None,
    };

    // 버전 확인
    match Command::new("aws").args(["--version"]).output() {
        Ok(output) => {
            if output.status.success() {
                info.installed = true;
                let version_str = String::from_utf8_lossy(&output.stdout);
                // "aws-cli/2.x.x Python/3.x.x ..."
                if let Some(ver) = version_str.split_whitespace().next() {
                    info.version = Some(ver.replace("aws-cli/", ""));
                }
            }
        }
        Err(e) => {
            info.error = Some(format!("Not found: {}", e));
            return info;
        }
    }

    // 프로파일 목록 조회
    match Command::new("aws").args(["configure", "list-profiles"]).output() {
        Ok(output) => {
            if output.status.success() {
                let profiles: Vec<String> = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                info.profiles = profiles;
            }
        }
        Err(_) => {}
    }

    // 현재 설정 조회
    match Command::new("aws").args(["configure", "list"]).output() {
        Ok(output) => {
            let config_str = String::from_utf8_lossy(&output.stdout);
            for line in config_str.lines() {
                if line.contains("profile") {
                    if let Some(profile) = line.split_whitespace().last() {
                        if profile != "<not" {
                            info.current_profile = Some(profile.to_string());
                        }
                    }
                }
                if line.contains("region") {
                    if let Some(region) = line.split_whitespace().nth(1) {
                        if region != "<not" {
                            info.region = Some(region.to_string());
                        }
                    }
                }
            }
        }
        Err(_) => {}
    }

    info
}

/// Azure CLI 감지
async fn detect_azure_cli() -> CLIProviderInfo {
    let mut info = CLIProviderInfo {
        provider_type: CLIProviderType::Azure,
        name: "Azure CLI".to_string(),
        installed: false,
        version: None,
        executable_path: None,
        profiles: Vec::new(),
        current_profile: None,
        region: None,
        error: None,
    };

    match Command::new("az").args(["--version"]).output() {
        Ok(output) => {
            if output.status.success() {
                info.installed = true;
                let version_str = String::from_utf8_lossy(&output.stdout);
                // "azure-cli                         2.x.x"
                for line in version_str.lines() {
                    if line.starts_with("azure-cli") {
                        if let Some(ver) = line.split_whitespace().last() {
                            info.version = Some(ver.to_string());
                            break;
                        }
                    }
                }
            }
        }
        Err(e) => {
            info.error = Some(format!("Not found: {}", e));
            return info;
        }
    }

    // 구독 목록 조회 (로그인된 경우)
    match Command::new("az").args(["account", "list", "--output", "json"]).output() {
        Ok(output) => {
            if output.status.success() {
                if let Ok(subscriptions) = serde_json::from_slice::<Vec<serde_json::Value>>(&output.stdout) {
                    for sub in &subscriptions {
                        if let Some(name) = sub.get("name").and_then(|n| n.as_str()) {
                            info.profiles.push(name.to_string());
                        }
                        if let Some(is_default) = sub.get("isDefault").and_then(|d| d.as_bool()) {
                            if is_default {
                                if let Some(name) = sub.get("name").and_then(|n| n.as_str()) {
                                    info.current_profile = Some(name.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
        Err(_) => {}
    }

    info
}

/// Google Cloud CLI 감지
async fn detect_gcloud_cli() -> CLIProviderInfo {
    let mut info = CLIProviderInfo {
        provider_type: CLIProviderType::Gcloud,
        name: "Google Cloud CLI".to_string(),
        installed: false,
        version: None,
        executable_path: None,
        profiles: Vec::new(),
        current_profile: None,
        region: None,
        error: None,
    };

    match Command::new("gcloud").args(["--version"]).output() {
        Ok(output) => {
            if output.status.success() {
                info.installed = true;
                let version_str = String::from_utf8_lossy(&output.stdout);
                // "Google Cloud SDK x.x.x"
                for line in version_str.lines() {
                    if line.starts_with("Google Cloud SDK") {
                        if let Some(ver) = line.split_whitespace().last() {
                            info.version = Some(ver.to_string());
                            break;
                        }
                    }
                }
            }
        }
        Err(e) => {
            info.error = Some(format!("Not found: {}", e));
            return info;
        }
    }

    // 설정 목록 조회
    match Command::new("gcloud").args(["config", "configurations", "list", "--format=json"]).output() {
        Ok(output) => {
            if output.status.success() {
                if let Ok(configs) = serde_json::from_slice::<Vec<serde_json::Value>>(&output.stdout) {
                    for config in &configs {
                        if let Some(name) = config.get("name").and_then(|n| n.as_str()) {
                            info.profiles.push(name.to_string());
                        }
                        if let Some(is_active) = config.get("is_active").and_then(|a| a.as_bool()) {
                            if is_active {
                                if let Some(name) = config.get("name").and_then(|n| n.as_str()) {
                                    info.current_profile = Some(name.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
        Err(_) => {}
    }

    // 현재 프로젝트/리전 조회
    match Command::new("gcloud").args(["config", "get-value", "compute/region"]).output() {
        Ok(output) => {
            if output.status.success() {
                let region = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !region.is_empty() && !region.contains("unset") {
                    info.region = Some(region);
                }
            }
        }
        Err(_) => {}
    }

    info
}

/// Ollama CLI 감지
async fn detect_ollama_cli() -> CLIProviderInfo {
    let mut info = CLIProviderInfo {
        provider_type: CLIProviderType::Ollama,
        name: "Ollama".to_string(),
        installed: false,
        version: None,
        executable_path: None,
        profiles: Vec::new(),  // Ollama에서는 모델 목록으로 사용
        current_profile: None,
        region: None,
        error: None,
    };

    match Command::new("ollama").args(["--version"]).output() {
        Ok(output) => {
            if output.status.success() {
                info.installed = true;
                let version_str = String::from_utf8_lossy(&output.stdout);
                // "ollama version x.x.x"
                if let Some(ver) = version_str.split_whitespace().last() {
                    info.version = Some(ver.to_string());
                }
            }
        }
        Err(e) => {
            info.error = Some(format!("Not found: {}", e));
            return info;
        }
    }

    // 모델 목록 조회
    match Command::new("ollama").args(["list"]).output() {
        Ok(output) => {
            if output.status.success() {
                let models: Vec<String> = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .skip(1)  // 헤더 스킵
                    .filter_map(|line| line.split_whitespace().next())
                    .map(|s| s.to_string())
                    .collect();
                info.profiles = models;
            }
        }
        Err(_) => {}
    }

    info
}

/// Docker CLI 감지
async fn detect_docker_cli() -> CLIProviderInfo {
    let mut info = CLIProviderInfo {
        provider_type: CLIProviderType::Docker,
        name: "Docker".to_string(),
        installed: false,
        version: None,
        executable_path: None,
        profiles: Vec::new(),  // Docker context 목록
        current_profile: None,
        region: None,
        error: None,
    };

    match Command::new("docker").args(["--version"]).output() {
        Ok(output) => {
            if output.status.success() {
                info.installed = true;
                let version_str = String::from_utf8_lossy(&output.stdout);
                // "Docker version x.x.x, build xxx"
                if let Some(ver_part) = version_str.split(',').next() {
                    if let Some(ver) = ver_part.split_whitespace().last() {
                        info.version = Some(ver.to_string());
                    }
                }
            }
        }
        Err(e) => {
            info.error = Some(format!("Not found: {}", e));
            return info;
        }
    }

    // Context 목록 조회
    match Command::new("docker").args(["context", "ls", "--format", "{{.Name}}"]).output() {
        Ok(output) => {
            if output.status.success() {
                let contexts: Vec<String> = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                info.profiles = contexts;
            }
        }
        Err(_) => {}
    }

    // 현재 Context 조회
    match Command::new("docker").args(["context", "show"]).output() {
        Ok(output) => {
            if output.status.success() {
                let context = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !context.is_empty() {
                    info.current_profile = Some(context);
                }
            }
        }
        Err(_) => {}
    }

    info
}

/// kubectl CLI 감지
async fn detect_kubectl_cli() -> CLIProviderInfo {
    let mut info = CLIProviderInfo {
        provider_type: CLIProviderType::Kubectl,
        name: "kubectl".to_string(),
        installed: false,
        version: None,
        executable_path: None,
        profiles: Vec::new(),  // Context 목록
        current_profile: None,
        region: None,
        error: None,
    };

    match Command::new("kubectl").args(["version", "--client", "--output=json"]).output() {
        Ok(output) => {
            if output.status.success() {
                info.installed = true;
                if let Ok(version_info) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
                    if let Some(ver) = version_info.get("clientVersion")
                        .and_then(|c| c.get("gitVersion"))
                        .and_then(|v| v.as_str()) {
                        info.version = Some(ver.to_string());
                    }
                }
            }
        }
        Err(e) => {
            info.error = Some(format!("Not found: {}", e));
            return info;
        }
    }

    // Context 목록 조회
    match Command::new("kubectl").args(["config", "get-contexts", "-o", "name"]).output() {
        Ok(output) => {
            if output.status.success() {
                let contexts: Vec<String> = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                info.profiles = contexts;
            }
        }
        Err(_) => {}
    }

    // 현재 Context 조회
    match Command::new("kubectl").args(["config", "current-context"]).output() {
        Ok(output) => {
            if output.status.success() {
                let context = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !context.is_empty() {
                    info.current_profile = Some(context);
                }
            }
        }
        Err(_) => {}
    }

    info
}

/// 특정 CLI 프로바이더 정보 조회
#[tauri::command]
pub async fn get_cli_provider_info(provider: String) -> Result<CLIProviderInfo, String> {
    match provider.to_lowercase().as_str() {
        "aws" => Ok(detect_aws_cli().await),
        "azure" | "az" => Ok(detect_azure_cli().await),
        "gcloud" | "gcp" => Ok(detect_gcloud_cli().await),
        "ollama" => Ok(detect_ollama_cli().await),
        "docker" => Ok(detect_docker_cli().await),
        "kubectl" | "k8s" => Ok(detect_kubectl_cli().await),
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

/// AWS CLI로 자격증명 테스트
#[tauri::command]
pub async fn test_aws_cli_credentials(profile: Option<String>) -> Result<serde_json::Value, String> {
    let mut args = vec!["sts", "get-caller-identity", "--output", "json"];

    let profile_arg: String;
    if let Some(p) = &profile {
        profile_arg = format!("--profile={}", p);
        args.push(&profile_arg);
    }

    match Command::new("aws").args(&args).output() {
        Ok(output) => {
            if output.status.success() {
                let result: serde_json::Value = serde_json::from_slice(&output.stdout)
                    .map_err(|e| format!("Failed to parse response: {}", e))?;
                Ok(result)
            } else {
                let error = String::from_utf8_lossy(&output.stderr);
                Err(format!("AWS credentials test failed: {}", error))
            }
        }
        Err(e) => Err(format!("Failed to execute AWS CLI: {}", e)),
    }
}

/// Ollama 모델 실행 (채팅)
#[tauri::command]
pub async fn ollama_chat(
    model: String,
    prompt: String,
    system_prompt: Option<String>,
) -> Result<String, String> {
    let mut args = vec!["run".to_string(), model.clone()];

    // 시스템 프롬프트가 있으면 먼저 추가
    let full_prompt = if let Some(sys) = system_prompt {
        format!("System: {}\n\nUser: {}", sys, prompt)
    } else {
        prompt
    };

    args.push(full_prompt);

    match Command::new("ollama").args(&args).output() {
        Ok(output) => {
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).to_string())
            } else {
                let error = String::from_utf8_lossy(&output.stderr);
                Err(format!("Ollama error: {}", error))
            }
        }
        Err(e) => Err(format!("Failed to execute Ollama: {}", e)),
    }
}

/// 범용 CLI 명령어 실행 (환경변수 포함)
#[tauri::command]
pub async fn execute_cli_with_env(
    program: String,
    args: Vec<String>,
    env: Option<HashMap<String, String>>,
    working_dir: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<CliResult, String> {
    let start = Instant::now();
    let full_command = format!("{} {}", program, args.join(" "));

    let mut cmd = Command::new(&program);
    cmd.args(&args);

    // 환경변수 설정
    if let Some(env_vars) = env {
        for (key, value) in env_vars {
            cmd.env(key, value);
        }
    }

    if let Some(dir) = &working_dir {
        cmd.current_dir(dir);
    }

    // 보안: 허용된 프로그램 목록 확인
    let allowed_programs = [
        "aws", "gcloud", "az",           // 클라우드 CLI
        "ollama",                         // 로컬 LLM
        "python", "python3", "node",      // 스크립트 런타임
        "pip", "npm", "npx",              // 패키지 매니저
        "git", "docker", "kubectl",       // 개발 도구
        "curl", "wget",                   // HTTP 클라이언트
        "cmd", "powershell",              // 시스템 쉘 (Windows)
        "sh", "bash",                     // 시스템 쉘 (Unix)
    ];

    let program_name = program.split(['/', '\\']).last().unwrap_or(&program);
    let program_base = program_name.split('.').next().unwrap_or(program_name).to_lowercase();

    if !allowed_programs.contains(&program_base.as_str()) {
        return Err(format!(
            "Security: '{}' is not in the allowed programs list",
            program
        ));
    }

    let output = cmd.output().map_err(|e| {
        format!("Command execution failed: {} ({})", e, full_command)
    })?;

    let duration = start.elapsed().as_millis() as u64;

    // 타임아웃 확인
    if let Some(timeout) = timeout_secs {
        if duration > timeout * 1000 {
            return Err(format!("Timeout: exceeded {}s (actual: {}ms)", timeout, duration));
        }
    }

    Ok(CliResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
        duration_ms: duration,
        command: full_command,
    })
}
