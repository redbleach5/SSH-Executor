# Script to free port 1420

param(
    [int]$Port = 1420
)

Write-Host "Searching for processes using port $Port..." -ForegroundColor Cyan

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
    
    Start-Sleep -Seconds 2
    
    # Check if port is free
    $remaining = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object {$_.State -eq "Listen"}
    if (-not $remaining) {
        Write-Host "Port $Port is free" -ForegroundColor Green
    } else {
        Write-Host "Port $Port is still in use" -ForegroundColor Yellow
    }
} else {
    Write-Host "Port $Port is free" -ForegroundColor Green
}

exit 0
