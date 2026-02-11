# UTF-8 인코딩 설정
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 환경 변수 새로고침
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "=== Checking Rust Project ===" -ForegroundColor Cyan

$projectRoot = $PSScriptRoot
$srcTauriDir = Join-Path $projectRoot "Handbox\src-tauri"

Push-Location $srcTauriDir
cargo check
Pop-Location

Write-Host "`n=== Rust Check Complete ===" -ForegroundColor Green
