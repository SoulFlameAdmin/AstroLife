@echo off
chcp 65001 >nul
cd /d "%~dp0"

py -3 --version >nul 2>nul
if errorlevel 1 (
  echo Python 3 не е намерен.
  pause
  exit /b 1
)

start "Masterhouse Local Server" cmd /k "cd /d %~dp0 && py -3 -m http.server 8123"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8123/launcher.html
