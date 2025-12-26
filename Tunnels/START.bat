@echo off
chcp 65001 >nul
title SSH Tunnel Manager
cd /d "%~dp0"

echo.
echo   ========================================
echo        SSH TUNNEL MANAGER
echo   ========================================
echo.

:: Проверка Python
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   [!] Python не найден
    echo.
    echo   Скачайте Python: https://www.python.org/downloads/
    echo   При установке отметьте "Add Python to PATH"
    echo.
    start https://www.python.org/downloads/
    pause
    exit /b
)
echo   [OK] Python найден

:: Проверка plink
where plink >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if exist "C:\Program Files\PuTTY\plink.exe" (
        echo   [OK] PuTTY найден
        goto :run
    )
    if exist "C:\Program Files (x86)\PuTTY\plink.exe" (
        echo   [OK] PuTTY найден
        goto :run
    )
    echo   [!] PuTTY не найден
    echo.
    echo   Скачайте PuTTY: https://www.putty.org/
    echo.
    start https://www.putty.org/
    pause
    exit /b
)
echo   [OK] PuTTY найден

:run
echo.
echo   Запуск...
echo.
python "%~dp0ssh_tunnel_manager.py"
pause

