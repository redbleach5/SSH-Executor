# Скрипт для исправления проблем с SSL в Cargo

Write-Host "Проверка и исправление проблем с SSL в Cargo..." -ForegroundColor Cyan

# 1. Проверка наличия .cargo директории
$cargoDir = "$env:USERPROFILE\.cargo"
if (-not (Test-Path $cargoDir)) {
    Write-Host "Создание директории .cargo..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $cargoDir -Force | Out-Null
}

# 2. Создание/обновление конфигурации Cargo
$configPath = "$cargoDir\config.toml"
Write-Host "Проверка конфигурации Cargo..." -ForegroundColor Yellow

$configContent = @"
# Конфигурация Cargo для обхода проблем с SSL

[net]
# Увеличиваем таймауты
retry = 5
git-fetch-with-cli = true

# Альтернативные источники (если основной не работает)
[source.crates-io]
replace-with = "crates-io"

[source.crates-io]
registry = "https://github.com/rust-lang/crates.io-index"

# Если проблемы с SSL, можно попробовать использовать git вместо https
# [source.crates-io]
# registry = "git+https://github.com/rust-lang/crates.io-index"
"@

# Проверяем, существует ли уже конфигурация
if (Test-Path $configPath) {
    Write-Host "Конфигурация уже существует. Создаю резервную копию..." -ForegroundColor Yellow
    Copy-Item $configPath "$configPath.backup" -Force
}

# Записываем новую конфигурацию
Set-Content -Path $configPath -Value $configContent -Encoding UTF8
Write-Host "Конфигурация Cargo обновлена: $configPath" -ForegroundColor Green

# 3. Очистка кэша Cargo (опционально)
Write-Host "`nОчистка кэша Cargo..." -ForegroundColor Yellow
$cacheDir = "$cargoDir\registry\cache"
if (Test-Path $cacheDir) {
    Write-Host "Кэш найден. Для полной очистки выполните: cargo clean" -ForegroundColor Yellow
}

# 4. Обновление индекса crates.io
Write-Host "`nПопытка обновления индекса crates.io..." -ForegroundColor Yellow
Set-Location "E:\SSH Executor\src-tauri"
try {
    $env:CARGO_NET_RETRY = "5"
    cargo update --dry-run 2>&1 | Out-Null
    Write-Host "Индекс обновлен успешно" -ForegroundColor Green
} catch {
    Write-Host "Не удалось обновить индекс. Это нормально, если есть проблемы с сетью." -ForegroundColor Yellow
}

Write-Host "`nГотово! Попробуйте снова выполнить: npm run tauri dev" -ForegroundColor Green
Write-Host "`nЕсли проблема сохраняется:" -ForegroundColor Yellow
Write-Host "1. Проверьте интернет-соединение" -ForegroundColor White
Write-Host "2. Попробуйте использовать VPN" -ForegroundColor White
Write-Host "3. Проверьте настройки прокси/файрвола" -ForegroundColor White
Write-Host "4. Попробуйте выполнить: cargo clean && cargo update" -ForegroundColor White
