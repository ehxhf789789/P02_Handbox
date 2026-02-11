// CLI 명령어 실행 모듈
// 로컬 시스템의 CLI 도구를 실행하고 결과를 반환

use serde::{Deserialize, Serialize};
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
