@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist data mkdir data

echo [1/4] Проверка на Python...
py -3 --version >nul 2>nul
if errorlevel 1 (
  echo Python 3 не е намерен. Инсталирай Python и маркирай "Add Python to PATH".
  pause
  exit /b 1
)

echo [2/4] Инсталиране/проверка на нужните пакети...
py -3 -m pip install --disable-pip-version-check requests beautifulsoup4

echo [3/4] Пускане на локален сървър...
start "Masterhouse Local Server" cmd /k "cd /d %~dp0 && py -3 -m http.server 8123"

timeout /t 2 /nobreak >nul

echo [4/4] Отваряне на сайта и пускане на scraper...
start "" http://127.0.0.1:8123/launcher.html
start "Masterhouse Updater" cmd /k "cd /d %~dp0 && py -3 update_masterhaus.py"

echo.
echo Сайтът е отворен.
echo Ако каталогът е празен в началото, изчакай scraper-a да напълни data/products.json.
pause
