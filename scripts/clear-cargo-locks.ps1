# Скрипт для очистки блокировок Cargo

Write-Host "Очистка блокировок Cargo..." -ForegroundColor Cyan

# Остановка всех процессов Cargo и rustc
Write-Host "`nОстановка процессов Cargo и rustc..." -ForegroundColor Yellow
$cargoProcesses = Get-Process | Where-Object {$_.ProcessName -like "*cargo*" -or $_.ProcessName -like "*rustc*"}
if ($cargoProcesses) {
    $cargoProcesses | ForEach-Object {
        Write-Host "  Остановка процесса: $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "  Процессы Cargo/rustc не найдены" -ForegroundColor Gray
}

# Поиск и удаление файлов блокировок в кэше Cargo
Write-Host "`nПоиск файлов блокировок..." -ForegroundColor Yellow
$cargoDir = "$env:USERPROFILE\.cargo"
$lockFiles = @()

# Поиск в registry cache
$registryCache = "$cargoDir\registry\cache"
if (Test-Path $registryCache) {
    $lockFiles += Get-ChildItem -Path $registryCache -Recurse -Filter "*.lock" -ErrorAction SilentlyContinue
}

# Поиск в git index
$gitIndex = "$cargoDir\registry\index"
if (Test-Path $gitIndex) {
    $lockFiles += Get-ChildItem -Path $gitIndex -Recurse -Filter ".cargo-index.lock" -ErrorAction SilentlyContinue
}

if ($lockFiles.Count -gt 0) {
    Write-Host "  Найдено файлов блокировок: $($lockFiles.Count)" -ForegroundColor Yellow
    $lockFiles | ForEach-Object {
        try {
            Remove-Item $_.FullName -Force -ErrorAction Stop
            Write-Host "  Удален: $($_.Name)" -ForegroundColor Green
        } catch {
            Write-Host "  Не удалось удалить: $($_.FullName) - $($_.Exception.Message)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "  Файлы блокировок не найдены" -ForegroundColor Gray
}

Write-Host "`nГотово! Теперь можно запустить: npm run tauri dev" -ForegroundColor Green
