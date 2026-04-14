@echo off
cd /d "%~dp0"
py sync-products.py
echo.
echo Готово. Обнови index.html в браузъра.
pause
