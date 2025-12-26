# Script for diagnosing and fixing SSL issues in Cargo

Write-Host "Diagnosing Cargo SSL issues..." -ForegroundColor Cyan
Write-Host ""

# Check internet connection
Write-Host "1. Checking crates.io availability..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://crates.io" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "   OK: crates.io is accessible" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: crates.io is not accessible: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   TIP: Proxy or VPN may be required" -ForegroundColor Yellow
}

# Check Git
Write-Host "`n2. Checking Git configuration..." -ForegroundColor Yellow
$gitVersion = git --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   OK: Git is installed: $gitVersion" -ForegroundColor Green
} else {
    Write-Host "   ERROR: Git not found" -ForegroundColor Red
}

# Check proxy environment variables
Write-Host "`n3. Checking proxy settings..." -ForegroundColor Yellow
if ($env:HTTP_PROXY -or $env:HTTPS_PROXY) {
    Write-Host "   INFO: Proxy detected:" -ForegroundColor Cyan
    if ($env:HTTP_PROXY) { Write-Host "      HTTP_PROXY: $env:HTTP_PROXY" -ForegroundColor Gray }
    if ($env:HTTPS_PROXY) { Write-Host "      HTTPS_PROXY: $env:HTTPS_PROXY" -ForegroundColor Gray }
} else {
    Write-Host "   INFO: No proxy configured" -ForegroundColor Gray
}

# Solutions
Write-Host "`nRecommended solutions:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Solution 1: Configure proxy (if behind corporate proxy)" -ForegroundColor Yellow
Write-Host "   `$env:HTTP_PROXY='http://proxy:port'" -ForegroundColor Gray
Write-Host "   `$env:HTTPS_PROXY='http://proxy:port'" -ForegroundColor Gray
Write-Host "   Then: cd src-tauri; cargo update" -ForegroundColor Gray
Write-Host ""
Write-Host "Solution 2: Use VPN" -ForegroundColor Yellow
Write-Host "   If crates.io is blocked, use VPN" -ForegroundColor Gray
Write-Host ""
Write-Host "Solution 3: Update Windows certificates" -ForegroundColor Yellow
Write-Host "   Run Windows Update to update certificates" -ForegroundColor Gray
Write-Host ""
Write-Host "Solution 4: Use mobile internet" -ForegroundColor Yellow
Write-Host "   Try connecting via mobile hotspot" -ForegroundColor Gray
Write-Host ""

# Check Cargo configuration
$configPath = "src-tauri\.cargo\config.toml"
if (Test-Path $configPath) {
    Write-Host "OK: Cargo config found: $configPath" -ForegroundColor Green
    Write-Host "`nCurrent configuration:" -ForegroundColor Cyan
    Get-Content $configPath | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
} else {
    Write-Host "WARNING: Cargo config not found" -ForegroundColor Yellow
}

Write-Host "`nDiagnosis complete" -ForegroundColor Green
