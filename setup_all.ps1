# UTF-8 인코딩 설정
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 환경 변수 새로고침
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "=== Installing Project Dependencies ===" -ForegroundColor Cyan

# 현재 디렉토리 확인
$projectRoot = $PSScriptRoot
$handboxDir = Join-Path $projectRoot "Handbox"
$srcTauriDir = Join-Path $handboxDir "src-tauri"

Write-Host "Project root: $projectRoot" -ForegroundColor Gray
Write-Host "Handbox dir: $handboxDir" -ForegroundColor Gray

# 기존 node_modules 삭제 (권한 문제 방지)
$nodeModulesPath = Join-Path $handboxDir "node_modules"
if (Test-Path $nodeModulesPath) {
    Write-Host "`nRemoving existing node_modules..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $nodeModulesPath -ErrorAction SilentlyContinue
}

# npm 의존성 설치
Write-Host "`n[1/2] Installing npm dependencies..." -ForegroundColor Yellow
Push-Location $handboxDir
npm install
Pop-Location

# Cargo 빌드 확인
Write-Host "`n[2/2] Checking Rust project..." -ForegroundColor Yellow
Push-Location $srcTauriDir
cargo check
Pop-Location

Write-Host "`n=== All Dependencies Installed ===" -ForegroundColor Green
