// Tier 1 프로세스 도구 — 쉘 실행 및 코드 평가
// shell.exec, code.eval

use serde_json::{json, Value};
use std::collections::HashMap;
use std::process::Command;

// ─────────────────────────────────────────────
// 보안: 명령어 화이트리스트
// ─────────────────────────────────────────────

/// 허용된 명령어 목록 (보안을 위해 제한)
fn is_allowed_command(cmd: &str) -> bool {
    let allowed = [
        // 일반 유틸리티
        "echo", "cat", "head", "tail", "wc", "sort", "uniq", "grep", "find", "ls", "dir",
        "pwd", "date", "whoami", "hostname", "uname",
        // 파일 처리
        "cp", "mv", "mkdir", "rm", "touch", "chmod", "chown",
        // 텍스트 처리
        "sed", "awk", "cut", "tr", "paste", "diff", "patch",
        // 네트워크
        "curl", "wget", "ping", "nslookup", "dig",
        // 개발 도구
        "git", "npm", "npx", "node", "python", "python3", "pip", "pip3",
        "cargo", "rustc", "go", "java", "javac", "gcc", "g++", "make", "cmake",
        // 패키지 매니저
        "apt", "brew", "choco", "winget", "scoop",
        // 문서 변환
        "pandoc", "tesseract", "ffmpeg", "magick", "convert",
        "soffice", "libreoffice",
        // 데이터 처리
        "jq", "yq", "sqlite3", "psql", "mysql",
        // MCP 서버 (플러그인 시스템)
        "uvx", "bunx", "deno",
        // Windows 기본
        "cmd", "powershell", "pwsh", "where", "type", "more", "tree",
        "xcopy", "robocopy", "attrib", "icacls", "netstat", "ipconfig",
        "tasklist", "systeminfo",
        // hwp 변환
        "hwp5txt",
    ];

    // 명령어의 기본 이름만 추출 (경로 제거)
    let base_cmd = std::path::Path::new(cmd)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(cmd)
        .to_lowercase();

    allowed.iter().any(|a| base_cmd == *a)
}

/// 위험한 패턴 감지
fn has_dangerous_pattern(full_command: &str) -> Option<String> {
    let dangerous = [
        ("rm -rf /", "루트 디렉토리 삭제"),
        ("rm -rf ~", "홈 디렉토리 삭제"),
        (":(){ :|:& };:", "포크 폭탄"),
        ("mkfs.", "디스크 포맷"),
        ("dd if=/dev/zero", "디스크 덮어쓰기"),
        ("> /dev/sda", "디스크 직접 쓰기"),
        ("chmod -R 777 /", "전체 권한 변경"),
        ("shutdown", "시스템 종료"),
        ("reboot", "시스템 재시작"),
        ("format c:", "디스크 포맷 (Windows)"),
    ];

    let lower = full_command.to_lowercase();
    for (pattern, desc) in &dangerous {
        if lower.contains(pattern) {
            return Some(format!("위험한 명령 감지: {} ({})", pattern, desc));
        }
    }
    None
}

// ─────────────────────────────────────────────
// shell.exec — 쉘 명령 실행
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_shell_exec(
    command: String,
    args: Option<Vec<String>>,
    working_dir: Option<String>,
    env: Option<HashMap<String, String>>,
    timeout_ms: Option<u64>,
    stdin_data: Option<String>,
) -> Result<Value, String> {
    // 보안 검증: 위험한 패턴 확인
    let full_cmd = if let Some(ref a) = args {
        format!("{} {}", command, a.join(" "))
    } else {
        command.clone()
    };

    if let Some(danger) = has_dangerous_pattern(&full_cmd) {
        return Err(danger);
    }

    // 보안 검증: 허용된 명령어 확인
    if !is_allowed_command(&command) {
        return Err(format!(
            "허용되지 않은 명령어: '{}'. 보안을 위해 화이트리스트에 등록된 명령어만 실행할 수 있습니다.",
            command
        ));
    }

    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(60000));
    let start = std::time::Instant::now();

    // 명령어 구성
    let mut cmd = Command::new(&command);

    if let Some(ref a) = args {
        cmd.args(a);
    }

    if let Some(ref dir) = working_dir {
        cmd.current_dir(dir);
    }

    if let Some(ref env_vars) = env {
        for (key, value) in env_vars {
            cmd.env(key, value);
        }
    }

    // stdin 처리
    if stdin_data.is_some() {
        cmd.stdin(std::process::Stdio::piped());
    }

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("명령 실행 실패: {}", e))?;

    // stdin 전달
    if let Some(ref input) = stdin_data {
        if let Some(ref mut stdin) = child.stdin.take() {
            use std::io::Write;
            let _ = stdin.write_all(input.as_bytes());
        }
    }

    // 타임아웃 처리를 위한 대기
    let result = tokio::task::spawn_blocking(move || {
        // wait_with_output은 blocking이므로 spawn_blocking 사용
        child.wait_with_output()
    })
    .await
    .map_err(|e| format!("태스크 실행 실패: {}", e))?
    .map_err(|e| format!("프로세스 대기 실패: {}", e))?;

    let elapsed_ms = start.elapsed().as_millis() as u64;

    if elapsed_ms > timeout.as_millis() as u64 {
        return Err(format!(
            "명령 실행 타임아웃 ({}ms 초과)",
            timeout.as_millis()
        ));
    }

    let stdout = String::from_utf8_lossy(&result.stdout).to_string();
    let stderr = String::from_utf8_lossy(&result.stderr).to_string();
    let exit_code = result.status.code().unwrap_or(-1);

    Ok(json!({
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
        "elapsed_ms": elapsed_ms,
        "command": full_cmd,
    }))
}

// ─────────────────────────────────────────────
// code.eval — 코드 평가 (Python/JavaScript)
// ─────────────────────────────────────────────
#[tauri::command]
pub async fn tool_code_eval(
    code: String,
    language: String,
    timeout_ms: Option<u64>,
    input_data: Option<Value>,
) -> Result<Value, String> {
    let lang = language.to_lowercase();

    // 지원 언어 확인
    let (interpreter, ext, wrapper) = match lang.as_str() {
        "python" | "py" | "python3" => {
            let py = find_python()?;
            (py, "py", build_python_wrapper(&code, &input_data))
        }
        "javascript" | "js" | "node" => {
            let node = find_node()?;
            (node, "js", build_node_wrapper(&code, &input_data))
        }
        _ => {
            return Err(format!(
                "지원되지 않는 언어: {}. 지원: python, javascript",
                lang
            ));
        }
    };

    // 임시 파일 생성
    let tmp_dir = std::env::temp_dir();
    let tmp_file = tmp_dir.join(format!("handbox_eval_{}.{}", uuid::Uuid::new_v4(), ext));

    std::fs::write(&tmp_file, &wrapper)
        .map_err(|e| format!("임시 파일 생성 실패: {}", e))?;

    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(30000));
    let start = std::time::Instant::now();

    // 실행
    let tmp_path = tmp_file.to_string_lossy().to_string();
    let result = tokio::task::spawn_blocking(move || {
        Command::new(&interpreter)
            .arg(&tmp_path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
    })
    .await
    .map_err(|e| format!("태스크 실행 실패: {}", e))?
    .map_err(|e| format!("{} 실행 실패: {}", lang, e))?;

    let elapsed_ms = start.elapsed().as_millis() as u64;

    // 임시 파일 정리
    let _ = std::fs::remove_file(&tmp_file);

    if elapsed_ms > timeout.as_millis() as u64 {
        return Err(format!(
            "코드 실행 타임아웃 ({}ms 초과)",
            timeout.as_millis()
        ));
    }

    let stdout = String::from_utf8_lossy(&result.stdout).to_string();
    let stderr = String::from_utf8_lossy(&result.stderr).to_string();
    let exit_code = result.status.code().unwrap_or(-1);

    // stdout에서 JSON 결과 파싱 시도
    let parsed_result = serde_json::from_str::<Value>(stdout.trim()).ok();

    Ok(json!({
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
        "elapsed_ms": elapsed_ms,
        "result": parsed_result,
        "language": lang,
    }))
}

// ─────────────────────────────────────────────
// 헬퍼 함수
// ─────────────────────────────────────────────

fn find_python() -> Result<String, String> {
    // python3 또는 python 찾기
    for cmd in &["python3", "python", "py"] {
        if Command::new(cmd).arg("--version").output().is_ok() {
            return Ok(cmd.to_string());
        }
    }
    Err("Python이 설치되지 않았습니다. python3 또는 python을 PATH에 추가하세요.".to_string())
}

fn find_node() -> Result<String, String> {
    if Command::new("node").arg("--version").output().is_ok() {
        return Ok("node".to_string());
    }
    Err("Node.js가 설치되지 않았습니다. node를 PATH에 추가하세요.".to_string())
}

fn build_python_wrapper(code: &str, input_data: &Option<Value>) -> String {
    let input_json = input_data
        .as_ref()
        .map(|v| v.to_string())
        .unwrap_or_else(|| "null".to_string());

    format!(
        r#"import sys, json

# 입력 데이터를 전역 변수로 설정
INPUT = json.loads('{input_json}')

# 결과를 캡처하기 위한 래퍼
__result__ = None

{code}

# 마지막 표현식의 결과를 JSON으로 출력
if __result__ is not None:
    try:
        print(json.dumps(__result__, ensure_ascii=False, default=str))
    except:
        print(str(__result__))
"#,
        input_json = input_json.replace('\'', "\\'").replace('\n', "\\n"),
        code = code,
    )
}

fn build_node_wrapper(code: &str, input_data: &Option<Value>) -> String {
    let input_json = input_data
        .as_ref()
        .map(|v| v.to_string())
        .unwrap_or_else(|| "null".to_string());

    format!(
        r#"// 입력 데이터
const INPUT = {input_json};

// 사용자 코드 실행
(async () => {{
  try {{
    {code}
  }} catch (e) {{
    console.error(e.message);
    process.exit(1);
  }}
}})();
"#,
        input_json = input_json,
        code = code,
    )
}
