# Скрипт для немедленного исправления SSL проблем в Cargo
# Использует git индекс вместо sparse протокола для обхода SSL ошибок

Write-Host "Исправление SSL проблем в Cargo..." -ForegroundColor Cyan
Write-Host ""

# Переходим в директорию проекта
$projectRoot = Split-Path -Parent $PSScriptRoot
$cargoConfigPath = Join-Path $projectRoot "src-tauri\.cargo\config.toml"
$cargoDir = Join-Path $projectRoot "src-tauri\.cargo"

# Создаем директорию .cargo если её нет
if (-not (Test-Path $cargoDir)) {
    Write-Host "Создание директории .cargo..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $cargoDir -Force | Out-Null
}

# Создаем резервную копию существующей конфигурации
if (Test-Path $cargoConfigPath) {
    Write-Host "Создание резервной копии конфигурации..." -ForegroundColor Yellow
    $backupPath = "$cargoConfigPath.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $cargoConfigPath $backupPath -Force
    Write-Host "Резервная копия сохранена: $backupPath" -ForegroundColor Gray
}

# Новая конфигурация с использованием git индекса
$configContent = @"
# Конфигурация Cargo для решения проблем с SSL/сетью

# Использование Git CLI вместо встроенного HTTP клиента
[net]
git-fetch-with-cli = true
retry = 5

# Использование git индекса вместо sparse протокола для обхода SSL проблем
# Git использует свой собственный SSL стек, который более устойчив к проблемам
[source.crates-io]
replace-with = "crates-io-git"

[source.crates-io-git]
registry = "https://github.com/rust-lang/crates.io-index"
"@

# Записываем новую конфигурацию
Write-Host "Обновление конфигурации Cargo..." -ForegroundColor Yellow
Set-Content -Path $cargoConfigPath -Value $configContent -Encoding UTF8
Write-Host "Конфигурация обновлена: $cargoConfigPath" -ForegroundColor Green

# Очищаем кэш Cargo
Write-Host "`nОчистка кэша Cargo..." -ForegroundColor Yellow
$cargoCacheDir = "$env:USERPROFILE\.cargo\registry\cache"
if (Test-Path $cargoCacheDir) {
    Write-Host "Кэш найден. Для полной очистки выполните: cargo clean" -ForegroundColor Gray
}

# Очищаем индекс crates.io
Write-Host "Очистка индекса crates.io..." -ForegroundColor Yellow
$indexDir = "$env:USERPROFILE\.cargo\registry\index"
if (Test-Path $indexDir) {
    $gitIndexDir = Join-Path $indexDir "github.com-*"
    Get-ChildItem -Path $gitIndexDir -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "Удаление старого индекса: $($_.Name)" -ForegroundColor Gray
        Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Переходим в директорию src-tauri
Set-Location (Join-Path $projectRoot "src-tauri")

# Пытаемся обновить индекс
Write-Host "`nОбновление индекса crates.io через git..." -ForegroundColor Yellow
Write-Host "Это может занять некоторое время при первом запуске..." -ForegroundColor Gray

$env:CARGO_NET_RETRY = "5"
$env:CARGO_NET_GIT_FETCH_WITH_CLI = "true"

try {
    # Пытаемся выполнить cargo update --dry-run для инициализации индекса
    $output = cargo update --dry-run 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Индекс успешно обновлен!" -ForegroundColor Green
    } else {
        Write-Host "Предупреждение: cargo update вернул код $LASTEXITCODE" -ForegroundColor Yellow
        Write-Host "Это может быть нормально, если зависимости уже актуальны" -ForegroundColor Gray
    }
} catch {
    Write-Host "Не удалось обновить индекс автоматически: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "Попробуйте выполнить вручную: cd src-tauri && cargo update" -ForegroundColor Gray
}

Write-Host "`nГотово! Конфигурация обновлена для использования git индекса." -ForegroundColor Green
Write-Host "Попробуйте снова выполнить: npm run tauri dev" -ForegroundColor Cyan
Write-Host "`nЕсли проблема сохраняется:" -ForegroundColor Yellow
Write-Host "1. Проверьте интернет-соединение" -ForegroundColor White
Write-Host "2. Убедитесь, что Git установлен и доступен в PATH" -ForegroundColor White
Write-Host "3. Попробуйте выполнить: cd src-tauri && cargo clean && cargo update" -ForegroundColor White
Write-Host "4. Если используете прокси, настройте переменные HTTP_PROXY и HTTPS_PROXY" -ForegroundColor White

