# 환경 변수 새로고침
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "Installing Tauri CLI..." -ForegroundColor Cyan
cargo install tauri-cli

Write-Host "`nVerifying installation..." -ForegroundColor Cyan
cargo tauri --version
