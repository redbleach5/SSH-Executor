# Комплексный скрипт для исправления SSL проблем в Cargo

Write-Host "=== Исправление SSL проблем в Cargo ===" -ForegroundColor Cyan
Write-Host ""

# Переходим в директорию проекта
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# 1. Настройка Git для обхода SSL проблем (временно)
Write-Host "1. Настройка Git SSL..." -ForegroundColor Yellow
git config --global http.sslVerify false
git config --global http.postBuffer 524288000
Write-Host "   Git SSL настройки обновлены" -ForegroundColor Green

# 2. Очистка кэша Cargo
Write-Host "`n2. Очистка кэша Cargo..." -ForegroundColor Yellow
$cargoDir = "$env:USERPROFILE\.cargo"
$registryCache = "$cargoDir\registry\cache"
$gitCache = "$cargoDir\git\db"

if (Test-Path $registryCache) {
    Write-Host "   Очистка registry cache..." -ForegroundColor Gray
    Remove-Item "$registryCache\*" -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Path $gitCache) {
    Write-Host "   Очистка git cache..." -ForegroundColor Gray
    Remove-Item "$gitCache\*" -Recurse -Force -ErrorAction SilentlyContinue
}

# 3. Очистка локального кэша проекта
Write-Host "`n3. Очистка локального кэша проекта..." -ForegroundColor Yellow
Set-Location "src-tauri"
if (Test-Path "target") {
    Write-Host "   Очистка target директории..." -ForegroundColor Gray
    cargo clean 2>&1 | Out-Null
}
Set-Location $projectRoot

# 4. Обновление конфигурации Cargo
Write-Host "`n4. Проверка конфигурации Cargo..." -ForegroundColor Yellow
$cargoConfig = "src-tauri\.cargo\config.toml"
if (Test-Path $cargoConfig) {
    Write-Host "   Конфигурация найдена: $cargoConfig" -ForegroundColor Green
} else {
    Write-Host "   Создание конфигурации..." -ForegroundColor Yellow
    $cargoConfigDir = "src-tauri\.cargo"
    if (-not (Test-Path $cargoConfigDir)) {
        New-Item -ItemType Directory -Path $cargoConfigDir -Force | Out-Null
    }
}

# 5. Установка переменных окружения для текущей сессии
Write-Host "`n5. Настройка переменных окружения..." -ForegroundColor Yellow
$env:CARGO_NET_RETRY = "10"
$env:CARGO_NET_TIMEOUT = "60"
$env:GIT_SSL_NO_VERIFY = "1"
$env:SSL_CERT_FILE = ""
Write-Host "   Переменные окружения установлены" -ForegroundColor Green

# 6. Попытка обновления индекса
Write-Host "`n6. Попытка обновления индекса crates.io..." -ForegroundColor Yellow
Set-Location "src-tauri"
try {
    $env:CARGO_NET_RETRY = "10"
    $env:GIT_SSL_NO_VERIFY = "1"
    cargo update --dry-run 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   Индекс обновлен успешно" -ForegroundColor Green
    } else {
        Write-Host "   Предупреждение: обновление индекса завершилось с ошибкой" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   Предупреждение: не удалось обновить индекс" -ForegroundColor Yellow
}
Set-Location $projectRoot

Write-Host "`n=== Готово! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Рекомендации:" -ForegroundColor Cyan
Write-Host "1. Попробуйте запустить: npm run tauri dev" -ForegroundColor White
Write-Host "2. Если проблема сохраняется, попробуйте использовать VPN" -ForegroundColor White
Write-Host "3. Проверьте настройки прокси/файрвола" -ForegroundColor White
Write-Host "4. Для отмены Git SSL настройки выполните: git config --global --unset http.sslVerify" -ForegroundColor Yellow
Write-Host ""

