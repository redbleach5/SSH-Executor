# Pre-dev script - автоматически освобождает порт перед запуском

param(
    [int]$Port = 1420
)

Write-Host "Preparing development environment..." -ForegroundColor Cyan

# Освобождаем порт
Write-Host "Checking port $Port..." -ForegroundColor Yellow
$connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object {$_.State -eq "Listen" -or $_.State -eq "Established"}

if ($connections) {
    $processes = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    
    foreach ($processId in $processes) {
        if ($processId -gt 0) {
            try {
                $process = Get-Process -Id $processId -ErrorAction Stop
                Write-Host "Stopping process: $($process.ProcessName) (PID: $processId)" -ForegroundColor Yellow
                Stop-Process -Id $processId -Force -ErrorAction Stop
                Write-Host "Process stopped" -ForegroundColor Green
            } catch {
                Write-Host "Failed to stop process $processId : $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
    
    Start-Sleep -Seconds 1
    
    # Проверяем, освобожден ли порт
    $remaining = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object {$_.State -eq "Listen"}
    if (-not $remaining) {
        Write-Host "Port $Port is now free" -ForegroundColor Green
    } else {
        Write-Host "Port $Port is still in use" -ForegroundColor Yellow
    }
} else {
    Write-Host "Port $Port is free" -ForegroundColor Green
}

# Настройка переменных окружения для обхода SSL проблем
# ВНИМАНИЕ: Основная конфигурация находится в src-tauri/.cargo/config.toml
# Здесь устанавливаем только дополнительные переменные окружения
Write-Host "Configuring Cargo SSL settings (dev mode only)..." -ForegroundColor Yellow

# Безопасные настройки (все полностью безопасны)
# Git индекс настроен в .cargo/config.toml через [registries.crates-io] protocol = "git"
$env:CARGO_NET_GIT_FETCH_WITH_CLI = "true"  # Использование Git CLI - безопасно
$env:CARGO_NET_RETRY = "10"                 # Количество повторов - безопасно

# При использовании git-индекса проверка сертификатов выполняется Git'ом
# Поэтому проверку отозванных сертификатов можно оставить включенной
# Отключаем только если все еще возникают проблемы (что маловероятно)
# Для отключения раскомментируйте следующую строку:
# $env:CARGO_HTTP_CHECK_REVOKE = "false"

Write-Host "  Using git index (configured in .cargo/config.toml)" -ForegroundColor Green
Write-Host "  Certificate revocation check: enabled (Git handles SSL verification)" -ForegroundColor Green

Write-Host "Ready to start development server" -ForegroundColor Green

# Явно завершаем скрипт с кодом успеха
exit 0
