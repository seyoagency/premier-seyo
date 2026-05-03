@echo off
setlocal enabledelayedexpansion
title PremierSEYO Plugin Kurulum

echo.
echo  ============================================
echo   PremierSEYO - Premiere Pro Plugin Kurulum
echo  ============================================
echo.

set "VERSION=1.2.4"
set "PLUGIN_ID=com.seyoweb.premierseyo"
set "PLUGIN_DIR=%APPDATA%\Adobe\UXP\Plugins\External\%PLUGIN_ID%_%VERSION%"
set "INFO_DIR=%APPDATA%\Adobe\UXP\PluginsInfo\v1"
set "INFO_FILE=%INFO_DIR%\premierepro.json"
set "TEMP_DIR=%TEMP%\premier-seyo-install"
set "RELEASE_URL=https://github.com/seyoagency/premier-seyo/releases/download/v%VERSION%-windows.3/PremierSEYO-Windows-Portable-%VERSION%.zip"

echo [1/5] Calisma klasoru hazirlaniyor...
if exist "%TEMP_DIR%" rmdir /S /Q "%TEMP_DIR%" 2>nul
mkdir "%TEMP_DIR%" 2>nul

echo [2/5] Plugin dosyalari indiriliyor (~5 MB)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%RELEASE_URL%' -OutFile '%TEMP_DIR%\plugin.zip' -UseBasicParsing"
if errorlevel 1 (
    echo HATA: Indirme basarisiz. Internet baglantisi kontrol edip tekrar dene.
    pause
    exit /b 1
)

echo [3/5] Arsiv aciliyor...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Expand-Archive -Path '%TEMP_DIR%\plugin.zip' -DestinationPath '%TEMP_DIR%\extracted' -Force"
if errorlevel 1 (
    echo HATA: Arsiv acilamadi.
    pause
    exit /b 1
)

if not exist "%TEMP_DIR%\extracted\plugin-source" (
    echo HATA: plugin-source klasoru bulunamadi.
    pause
    exit /b 1
)

echo [4/5] Plugin kopyalaniyor: %PLUGIN_DIR%
if exist "%PLUGIN_DIR%" rmdir /S /Q "%PLUGIN_DIR%" 2>nul
mkdir "%PLUGIN_DIR%" 2>nul
xcopy /E /Y /I /Q "%TEMP_DIR%\extracted\plugin-source\*" "%PLUGIN_DIR%\" >nul
if errorlevel 1 (
    echo HATA: Dosyalar kopyalanamadi.
    pause
    exit /b 1
)

echo [5/5] Premiere'in plugin'i tanimasi icin kayit yaziliyor...
if not exist "%INFO_DIR%" mkdir "%INFO_DIR%" 2>nul
> "%INFO_FILE%" echo {"plugins":[{"hostMinVersion":"25.6.0","name":"PremierSEYO","path":"$localPlugins/External/%PLUGIN_ID%_%VERSION%","pluginId":"%PLUGIN_ID%","status":"enabled","type":"uxp","versionString":"%VERSION%"}]}

rmdir /S /Q "%TEMP_DIR%" 2>nul

echo.
echo  ============================================
echo   PremierSEYO Plugin kuruldu!
echo  ============================================
echo.
echo   Sonraki adimlar:
echo    1. Premiere Pro'yu kapat (calisiyorsa)
echo    2. Tekrar ac
echo    3. Window menusu ^> UXP Plugins ^> PremierSEYO
echo.
echo  Kapatmak icin herhangi bir tusa bas...
pause >nul
