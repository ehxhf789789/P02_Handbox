# UTF-8 인코딩 설정
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 환경 변수 새로고침
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "=== Building Frontend ===" -ForegroundColor Cyan

$projectRoot = $PSScriptRoot
$handboxDir = Join-Path $projectRoot "Handbox"

Push-Location $handboxDir
npm run build
Pop-Location

Write-Host "`n=== Frontend Build Complete ===" -ForegroundColor Green
