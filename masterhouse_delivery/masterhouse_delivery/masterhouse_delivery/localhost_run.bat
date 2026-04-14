@echo off
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
    start "" cmd /k "cd /d %~dp0 && python -m http.server 8123"
    timeout /t 2 /nobreak >nul
    start "" http://127.0.0.1:8123/launcher.html
    exit /b
)

where py >nul 2>nul
if %errorlevel%==0 (
    start "" cmd /k "cd /d %~dp0 && py -m http.server 8123"
    timeout /t 2 /nobreak >nul
    start "" http://127.0.0.1:8123/launcher.html
    exit /b
)

where node >nul 2>nul
if %errorlevel%==0 (
    start "" cmd /k "cd /d %~dp0 && npx http-server -p 8123"
    timeout /t 4 /nobreak >nul
    start "" http://127.0.0.1:8123/launcher.html
    exit /b
)

echo Ne e nameren Python ili Node.js.
echo Instalirai Python ili Node.js i pusni pak.
pause