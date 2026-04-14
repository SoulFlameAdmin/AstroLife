@echo off
chcp 65001 >nul
cd /d "%~dp0"

py -3 --version >nul 2>nul
if errorlevel 1 (
  echo Python 3 не е намерен.
  pause
  exit /b 1
)

py -3 -m pip install --disable-pip-version-check requests beautifulsoup4
py -3 update_masterhaus.py

pause
