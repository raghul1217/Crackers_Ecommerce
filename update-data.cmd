@echo off
title Update products.json from Google Sheet
cd /d "%~dp0"
echo Fetching the latest data from the Google Sheet...
node scripts/export-products.js
if %errorlevel% neq 0 (
    echo.
    echo FAILED. Make sure Node.js is installed from https://nodejs.org
    pause
    exit /b 1
)
echo.
echo Done! products.json is updated. The website picks up changes automatically.
pause
