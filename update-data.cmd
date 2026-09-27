@echo off
title Regenerate sitemap.xml
cd /d "%~dp0"

REM NOTE: products.json is no longer exported from a Google Sheet.
REM It is now the live catalogue, written by the admin panel (admin.html)
REM through the GitHub Contents API. Do not overwrite it from a script.

echo Regenerating image manifest (images/products, images/giftbox)...
node scripts/generate-image-manifest.js
if %errorlevel% neq 0 (
    echo.
    echo WARNING: Image manifest generation failed.
)

echo.
echo Regenerating sitemap.xml...
node scripts/generate-sitemap.js
if %errorlevel% neq 0 (
    echo.
    echo WARNING: Sitemap generation failed.
)

echo.
echo Done! image-manifest.json and sitemap.xml are updated.
echo Manage products at /admin - the storefront picks up changes automatically.
pause
