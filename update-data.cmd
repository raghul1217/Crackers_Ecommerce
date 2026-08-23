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
echo Regenerating sitemap.xml...
node scripts/generate-sitemap.js
if %errorlevel% neq 0 (
    echo.
    echo WARNING: Sitemap generation failed, products.json was still updated.
)
echo.
echo Done! products.json and sitemap.xml are updated. The website picks up changes automatically.
pause
