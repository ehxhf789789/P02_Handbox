# 환경 변수 새로고침
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Rust 확인
$cargoPath = "$env:USERPROFILE\.cargo\bin\cargo.exe"
$rustcPath = "$env:USERPROFILE\.cargo\bin\rustc.exe"

Write-Host "=== Checking Development Environment ===" -ForegroundColor Cyan

Write-Host "`n[Rust/Cargo]" -ForegroundColor Yellow
if (Test-Path $cargoPath) {
    & $cargoPath --version
    & $rustcPath --version
} else {
    Write-Host "Rust not installed or path not found: $cargoPath" -ForegroundColor Red
}

Write-Host "`n[Node.js/npm]" -ForegroundColor Yellow
try {
    node --version
    npm --version
} catch {
    Write-Host "Node.js not found in PATH" -ForegroundColor Red
}

Write-Host "`n=== Environment Check Complete ===" -ForegroundColor Cyan
