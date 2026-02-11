# 환경 변수 새로고침
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "=== Installing Project Dependencies ===" -ForegroundColor Cyan

# npm 의존성 설치
Write-Host "`n[1/2] Installing npm dependencies..." -ForegroundColor Yellow
Set-Location "c:\Users\이한빈\SynologyDrive\Handbox-Project\Handbox"
npm install

# Cargo 빌드 확인
Write-Host "`n[2/2] Building Rust project (cargo check)..." -ForegroundColor Yellow
Set-Location "c:\Users\이한빈\SynologyDrive\Handbox-Project\Handbox\src-tauri"
cargo check

Write-Host "`n=== Dependencies Installation Complete ===" -ForegroundColor Cyan
