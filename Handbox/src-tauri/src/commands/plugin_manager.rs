// Tier 2 플러그인 시스템 — GitHub MCP 서버 설치/제거/관리
// plugin_install, plugin_uninstall, plugin_list, plugin_list_available

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

lazy_static::lazy_static! {
    static ref PLUGIN_REGISTRY: Mutex<HashMap<String, PluginManifest>> = Mutex::new(HashMap::new());
}

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub category: String,
    pub source: PluginSource,
    pub runtime: String,        // node, python, rust, docker
    pub entry: String,          // 실행 파일/스크립트 경로
    pub args: Vec<String>,
    pub env: Option<HashMap<String, String>>,
    pub status: String,         // installed, running, stopped, error
    pub installed_at: String,
    pub install_path: String,
    pub tools_discovered: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSource {
    #[serde(rename = "type")]
    pub source_type: String,    // github, npm, local
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct PluginInstallRequest {
    pub source: String,             // GitHub URL 또는 로컬 경로
    pub name: Option<String>,       // 사용자 지정 이름
    pub runtime: Option<String>,    // 자동 감지 or 수동 지정
}

// ─────────────────────────────────────────────
// 경로 유틸리티
// ─────────────────────────────────────────────

fn plugins_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    #[cfg(not(target_os = "windows"))]
    let base = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());

    PathBuf::from(base).join("handbox").join("plugins")
}

fn manifests_path() -> PathBuf {
    plugins_dir().join("manifests.json")
}

fn load_manifests() -> HashMap<String, PluginManifest> {
    if let Ok(content) = fs::read_to_string(manifests_path()) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        HashMap::new()
    }
}

fn save_manifests(manifests: &HashMap<String, PluginManifest>) -> Result<(), String> {
    let dir = plugins_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("플러그인 디렉토리 생성 실패: {}", e))?;
    let json = serde_json::to_string_pretty(manifests)
        .map_err(|e| format!("매니페스트 직렬화 실패: {}", e))?;
    fs::write(manifests_path(), json).map_err(|e| format!("매니페스트 저장 실패: {}", e))
}

// ─────────────────────────────────────────────
// plugin.install — 플러그인 설치
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn plugin_install(request: PluginInstallRequest) -> Result<Value, String> {
    let source = &request.source;

    // 소스 타입 감지
    let (source_type, repo_url, plugin_name) = if source.contains("github.com") {
        let name = request.name.clone().unwrap_or_else(|| {
            source.split('/').last().unwrap_or("unknown").to_string()
        });
        ("github".to_string(), source.clone(), name)
    } else if source.starts_with("npm:") || source.starts_with("npx:") {
        let pkg = source.replace("npm:", "").replace("npx:", "");
        let name = request.name.clone().unwrap_or_else(|| pkg.clone());
        ("npm".to_string(), pkg, name)
    } else {
        let name = request.name.clone().unwrap_or_else(|| {
            std::path::Path::new(source)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "local-plugin".to_string())
        });
        ("local".to_string(), source.clone(), name)
    };

    let plugin_id = sanitize_id(&plugin_name);
    let install_path = plugins_dir().join(&plugin_id);

    // 이미 설치되어 있는지 확인
    let manifests = load_manifests();
    if manifests.contains_key(&plugin_id) {
        return Err(format!("플러그인 '{}'이(가) 이미 설치되어 있습니다. 먼저 제거하세요.", plugin_id));
    }

    // 설치 실행
    match source_type.as_str() {
        "github" => install_from_github(&repo_url, &install_path)?,
        "npm" => install_from_npm(&repo_url, &install_path)?,
        "local" => install_from_local(&repo_url, &install_path)?,
        _ => return Err("알 수 없는 소스 타입".to_string()),
    }

    // 런타임 자동 감지
    let runtime = request.runtime.unwrap_or_else(|| detect_runtime(&install_path));

    // entry point 감지
    let (entry, args) = detect_entry(&install_path, &runtime);

    // 빌드 (필요한 경우)
    build_plugin(&install_path, &runtime)?;

    // 매니페스트 생성 및 저장
    let manifest = PluginManifest {
        id: plugin_id.clone(),
        name: plugin_name.clone(),
        version: "0.0.0".to_string(),
        description: format!("{} MCP plugin", plugin_name),
        category: "plugin".to_string(),
        source: PluginSource {
            source_type: source_type.clone(),
            url: repo_url,
        },
        runtime,
        entry,
        args,
        env: None,
        status: "installed".to_string(),
        installed_at: chrono::Utc::now().to_rfc3339(),
        install_path: install_path.to_string_lossy().to_string(),
        tools_discovered: Vec::new(),
        error: None,
    };

    let mut manifests = load_manifests();
    manifests.insert(plugin_id.clone(), manifest.clone());
    save_manifests(&manifests)?;

    Ok(json!({
        "plugin_id": plugin_id,
        "name": plugin_name,
        "status": "installed",
        "install_path": install_path.to_string_lossy().to_string(),
        "source_type": source_type,
    }))
}

// ─────────────────────────────────────────────
// plugin.uninstall — 플러그인 제거
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn plugin_uninstall(plugin_id: String) -> Result<Value, String> {
    let mut manifests = load_manifests();

    let manifest = manifests
        .remove(&plugin_id)
        .ok_or_else(|| format!("플러그인 '{}'을(를) 찾을 수 없습니다", plugin_id))?;

    // 설치 디렉토리 삭제
    let install_path = PathBuf::from(&manifest.install_path);
    if install_path.exists() {
        fs::remove_dir_all(&install_path)
            .map_err(|e| format!("플러그인 디렉토리 삭제 실패: {}", e))?;
    }

    save_manifests(&manifests)?;

    Ok(json!({
        "success": true,
        "plugin_id": plugin_id,
    }))
}

// ─────────────────────────────────────────────
// plugin.list — 설치된 플러그인 목록
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn plugin_list() -> Result<Value, String> {
    let manifests = load_manifests();
    let plugins: Vec<Value> = manifests
        .values()
        .map(|m| serde_json::to_value(m).unwrap_or(Value::Null))
        .collect();

    Ok(json!({
        "plugins": plugins,
        "count": plugins.len(),
    }))
}

// ─────────────────────────────────────────────
// plugin.list_available — 추천 플러그인 목록
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn plugin_list_available() -> Result<Value, String> {
    let available = vec![
        json!({
            "name": "filesystem",
            "description": "고급 파일 시스템 작업 (파일 읽기/쓰기/검색/이동)",
            "source": "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
            "runtime": "node",
            "category": "io",
        }),
        json!({
            "name": "brave-search",
            "description": "Brave Search API를 통한 웹 검색",
            "source": "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
            "runtime": "node",
            "category": "search",
        }),
        json!({
            "name": "github",
            "description": "GitHub API 통합 (이슈, PR, 리포지토리)",
            "source": "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
            "runtime": "node",
            "category": "devtools",
        }),
        json!({
            "name": "sqlite",
            "description": "고급 SQLite 데이터베이스 작업",
            "source": "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite",
            "runtime": "node",
            "category": "storage",
        }),
        json!({
            "name": "puppeteer",
            "description": "웹 브라우저 자동화 (스크래핑, 스크린샷)",
            "source": "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
            "runtime": "node",
            "category": "web",
        }),
        json!({
            "name": "google-maps",
            "description": "Google Maps API (지오코딩, 경로 탐색)",
            "source": "https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps",
            "runtime": "node",
            "category": "location",
        }),
        json!({
            "name": "slack",
            "description": "Slack 메시징 통합",
            "source": "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
            "runtime": "node",
            "category": "messaging",
        }),
        json!({
            "name": "memory",
            "description": "지식 그래프 기반 장기 메모리",
            "source": "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
            "runtime": "node",
            "category": "storage",
        }),
    ];

    // 이미 설치된 플러그인 표시
    let manifests = load_manifests();
    let enriched: Vec<Value> = available
        .into_iter()
        .map(|mut p| {
            let name = p["name"].as_str().unwrap_or("");
            p["installed"] = json!(manifests.contains_key(name));
            p
        })
        .collect();

    Ok(json!({
        "plugins": enriched,
        "count": enriched.len(),
    }))
}

// ─────────────────────────────────────────────
// plugin.update_manifest — 도구 발견 결과 업데이트
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn plugin_update_manifest(
    plugin_id: String,
    tools: Vec<String>,
    status: Option<String>,
    error: Option<String>,
) -> Result<Value, String> {
    let mut manifests = load_manifests();

    if let Some(manifest) = manifests.get_mut(&plugin_id) {
        manifest.tools_discovered = tools;
        if let Some(s) = status {
            manifest.status = s;
        }
        manifest.error = error;
        save_manifests(&manifests)?;
        Ok(json!({ "success": true }))
    } else {
        Err(format!("플러그인 '{}'을(를) 찾을 수 없습니다", plugin_id))
    }
}

// ─────────────────────────────────────────────
// 설치 헬퍼 함수
// ─────────────────────────────────────────────

fn install_from_github(url: &str, install_path: &PathBuf) -> Result<(), String> {
    // git clone
    let result = Command::new("git")
        .args(["clone", "--depth", "1", url, &install_path.to_string_lossy()])
        .output()
        .map_err(|e| format!("git clone 실패: {}. git이 설치되어 있는지 확인하세요.", e))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("git clone 실패: {}", stderr));
    }
    Ok(())
}

fn install_from_npm(package: &str, install_path: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(install_path).map_err(|e| format!("디렉토리 생성 실패: {}", e))?;

    let result = Command::new("npm")
        .args(["install", package])
        .current_dir(install_path)
        .output()
        .map_err(|e| format!("npm install 실패: {}. Node.js/npm이 설치되어 있는지 확인하세요.", e))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("npm install 실패: {}", stderr));
    }
    Ok(())
}

fn install_from_local(path: &str, install_path: &PathBuf) -> Result<(), String> {
    let src = PathBuf::from(path);
    if !src.exists() {
        return Err(format!("로컬 경로가 존재하지 않습니다: {}", path));
    }

    // 심볼릭 링크 또는 복사
    #[cfg(target_os = "windows")]
    {
        // Windows: 디렉토리 복사
        let result = Command::new("robocopy")
            .args([path, &install_path.to_string_lossy(), "/E", "/NFL", "/NDL", "/NJH", "/NJS"])
            .output()
            .map_err(|e| format!("디렉토리 복사 실패: {}", e))?;
        // robocopy는 exit code 1도 성공임
        if result.status.code().unwrap_or(0) > 7 {
            return Err("디렉토리 복사 실패".to_string());
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::os::unix::fs::symlink(&src, install_path)
            .map_err(|e| format!("심볼릭 링크 생성 실패: {}", e))?;
    }
    Ok(())
}

fn detect_runtime(install_path: &PathBuf) -> String {
    if install_path.join("package.json").exists() {
        "node".to_string()
    } else if install_path.join("pyproject.toml").exists()
        || install_path.join("setup.py").exists()
        || install_path.join("requirements.txt").exists()
    {
        "python".to_string()
    } else if install_path.join("Cargo.toml").exists() {
        "rust".to_string()
    } else if install_path.join("Dockerfile").exists() {
        "docker".to_string()
    } else {
        "node".to_string() // 기본값
    }
}

fn detect_entry(install_path: &PathBuf, runtime: &str) -> (String, Vec<String>) {
    match runtime {
        "node" => {
            // package.json에서 main/bin 찾기
            if let Ok(pkg) = fs::read_to_string(install_path.join("package.json")) {
                if let Ok(pkg_json) = serde_json::from_str::<Value>(&pkg) {
                    if let Some(main) = pkg_json.get("main").and_then(|v| v.as_str()) {
                        return ("node".to_string(), vec![install_path.join(main).to_string_lossy().to_string()]);
                    }
                }
            }
            // 기본: dist/index.js 또는 index.js
            if install_path.join("dist/index.js").exists() {
                ("node".to_string(), vec![install_path.join("dist/index.js").to_string_lossy().to_string()])
            } else {
                ("node".to_string(), vec![install_path.join("index.js").to_string_lossy().to_string()])
            }
        }
        "python" => {
            if install_path.join("server.py").exists() {
                ("python".to_string(), vec![install_path.join("server.py").to_string_lossy().to_string()])
            } else {
                ("python".to_string(), vec!["-m".to_string(), "server".to_string()])
            }
        }
        _ => ("node".to_string(), vec!["index.js".to_string()]),
    }
}

fn build_plugin(install_path: &PathBuf, runtime: &str) -> Result<(), String> {
    match runtime {
        "node" => {
            // npm install
            if install_path.join("package.json").exists() {
                let result = Command::new("npm")
                    .arg("install")
                    .current_dir(install_path)
                    .output()
                    .map_err(|e| format!("npm install 실패: {}", e))?;

                if !result.status.success() {
                    let stderr = String::from_utf8_lossy(&result.stderr);
                    eprintln!("npm install 경고: {}", stderr);
                }

                // npm run build (존재하는 경우)
                if let Ok(pkg) = fs::read_to_string(install_path.join("package.json")) {
                    if pkg.contains("\"build\"") {
                        let _ = Command::new("npm")
                            .args(["run", "build"])
                            .current_dir(install_path)
                            .output();
                    }
                }
            }
        }
        "python" => {
            // pip install -r requirements.txt
            if install_path.join("requirements.txt").exists() {
                let _ = Command::new("pip")
                    .args(["install", "-r", "requirements.txt"])
                    .current_dir(install_path)
                    .output();
            }
        }
        _ => {}
    }
    Ok(())
}

fn sanitize_id(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect::<String>()
        .to_lowercase()
}
