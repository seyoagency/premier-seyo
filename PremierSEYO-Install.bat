@echo off
setlocal enabledelayedexpansion
title PremierSEYO Tam Kurulum

echo.
echo  ============================================
echo   PremierSEYO - Tam Kurulum (Plugin + Daemon)
echo  ============================================
echo.

set "VERSION=1.2.4"
set "PLUGIN_ID=com.seyoweb.premierseyo"
set "PLUGIN_DIR=%APPDATA%\Adobe\UXP\Plugins\External\%PLUGIN_ID%_%VERSION%"
set "INFO_DIR=%APPDATA%\Adobe\UXP\PluginsInfo\v1"
set "INFO_FILE=%INFO_DIR%\premierepro.json"
set "INSTALL_ROOT=%LOCALAPPDATA%\Programs\PremierSEYO"
set "DAEMON_DIR=%INSTALL_ROOT%\daemon"
set "RUNTIME_DIR=%INSTALL_ROOT%\runtime"
set "CONFIG_DIR=%APPDATA%\PremierSEYO"
set "LOG_DIR=%LOCALAPPDATA%\PremierSEYO\logs"
set "TEMP_DIR=%TEMP%\premier-seyo-install"
set "RELEASE_URL=https://github.com/seyoagency/premier-seyo/releases/download/v%VERSION%-windows.3/PremierSEYO-Windows-Portable-%VERSION%.zip"

echo [0/8] Eski PremierSEYO daemon temizleniyor (varsa)...
REM 1) Port 53117'yi dinleyen process'leri oldur (en kesin yol)
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":53117 .*LISTENING"') do (
    taskkill /F /PID %%P >nul 2>nul
)

REM 2) PremierSEYO commandline iceren tum node.exe'leri oldur
REM    (port'a bind edememis ama dosya kilitleyen zombie node.exe yakalama)
powershell -NoProfile -Command "Get-Process node -EA 0 | ForEach-Object { try { $cmd = (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.Id) -EA 0).CommandLine; if ($cmd -and $cmd -match 'PremierSEYO') { Stop-Process -Id $_.Id -Force -EA 0 } } catch {} }" >nul 2>nul

REM 3) Daemon wrapper window'larini kapat (start-daemon.cmd)
taskkill /F /FI "WINDOWTITLE eq PremierSEYO Daemon*" >nul 2>nul

REM 4) Eski HKCU Run entry'sini sil (yeniden ekleyecegiz)
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PremierSEYODaemon" /f >nul 2>nul

REM 5) Eski scheduled task varsa sil
schtasks /Delete /TN "PremierSEYO Daemon" /F >nul 2>nul

REM 6) Dosya kilitleri tamamen bosalsin
timeout /t 2 /nobreak >nul

echo [1/8] Calisma klasoru hazirlaniyor...
if exist "%TEMP_DIR%" rmdir /S /Q "%TEMP_DIR%" 2>nul
mkdir "%TEMP_DIR%" 2>nul

echo [2/8] Paket indiriliyor (~150 MB - Node.js + FFmpeg + plugin + daemon)...
echo        Yavas internette 1-3 dakika surebilir, sabir...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%RELEASE_URL%' -OutFile '%TEMP_DIR%\pkg.zip' -UseBasicParsing"
if errorlevel 1 ( echo HATA: Indirme basarisiz. Internet baglantisi kontrol et. & pause & exit /b 1 )

echo [3/8] Arsiv aciliyor (1-2 dakika)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%TEMP_DIR%\pkg.zip' -DestinationPath '%TEMP_DIR%\extracted' -Force"
if not exist "%TEMP_DIR%\extracted\plugin-source" ( echo HATA: plugin-source yok. & pause & exit /b 1 )
if not exist "%TEMP_DIR%\extracted\daemon" ( echo HATA: daemon yok. & pause & exit /b 1 )
if not exist "%TEMP_DIR%\extracted\runtime\node\node.exe" ( echo HATA: Portable Node.js yok. & pause & exit /b 1 )

echo [4/8] Plugin Premiere'e kopyalaniyor...
if exist "%PLUGIN_DIR%" rmdir /S /Q "%PLUGIN_DIR%" 2>nul
if exist "%PLUGIN_DIR%" (
    echo.
    echo  HATA: Plugin dizini silinemiyor. Premiere Pro acik olabilir.
    echo  Lutfen Premiere'i tamamen kapat - File menusu - Quit - sonra bu .bat'i tekrar calistir.
    echo.
    pause
    exit /b 1
)
mkdir "%PLUGIN_DIR%" 2>nul
xcopy /E /Y /I /Q "%TEMP_DIR%\extracted\plugin-source\*" "%PLUGIN_DIR%\" >nul

REM PluginsInfo JSON: Premiere'in plugin'i tanimasi icin
if not exist "%INFO_DIR%" mkdir "%INFO_DIR%" 2>nul
> "%INFO_FILE%" echo {"plugins":[{"hostMinVersion":"25.6.0","name":"PremierSEYO","path":"$localPlugins/External/%PLUGIN_ID%_%VERSION%","pluginId":"%PLUGIN_ID%","status":"enabled","type":"uxp","versionString":"%VERSION%"}]}

echo [5/8] Daemon + portable Node.js + FFmpeg kuruluyor...
echo        Yer: %INSTALL_ROOT%
if exist "%INSTALL_ROOT%" rmdir /S /Q "%INSTALL_ROOT%" 2>nul
REM Bazen rmdir hemen gerceklesmez, kontrol et
if exist "%INSTALL_ROOT%" (
    timeout /t 2 /nobreak >nul
    rmdir /S /Q "%INSTALL_ROOT%" 2>nul
)
mkdir "%DAEMON_DIR%" 2>nul
mkdir "%RUNTIME_DIR%" 2>nul
xcopy /E /Y /I /Q "%TEMP_DIR%\extracted\daemon\*" "%DAEMON_DIR%\" >nul
xcopy /E /Y /I /Q "%TEMP_DIR%\extracted\runtime\*" "%RUNTIME_DIR%\" >nul

if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%" 2>nul
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" 2>nul

REM Wrapper .cmd: ffmpeg PATH'ini ekle, daemon'u baslat, output log'a yonlendir
> "%INSTALL_ROOT%\start-daemon.cmd" (
    echo @echo off
    echo set "PATH=%RUNTIME_DIR%\ffmpeg\bin;%%PATH%%"
    echo "%RUNTIME_DIR%\node\node.exe" "%DAEMON_DIR%\server.js" ^> "%LOG_DIR%\daemon.log" 2^>^&1
)

echo [6/8] Daemon kullanici login'inde otomatik baslayacak (HKCU Run)...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PremierSEYODaemon" /t REG_SZ /d "\"%INSTALL_ROOT%\start-daemon.cmd\"" /f >nul

echo [7/8] Daemon simdi baslatiliyor...
start "PremierSEYO Daemon" /B "%INSTALL_ROOT%\start-daemon.cmd"

REM Daemon'un ayaga kalkmasini bekle
echo [8/8] Daemon dogrulaniyor...
timeout /t 4 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:53117/ping' -UseBasicParsing -TimeoutSec 3).StatusCode } catch { 0 }" > "%TEMP_DIR%\ping.txt"
set /p PING_STATUS=<"%TEMP_DIR%\ping.txt"

rmdir /S /Q "%TEMP_DIR%" 2>nul

echo.
echo  ============================================
if "%PING_STATUS%"=="200" (
    echo   ^>^>  PremierSEYO basariyla kuruldu! ^<^<
    echo   Daemon calisiyor: http://127.0.0.1:53117
) else (
    echo   ^>^>  Plugin kuruldu, daemon kontrol gerekli ^<^<
    echo   Log: %LOG_DIR%\daemon.log
)
echo  ============================================
echo.
echo   ONEMLI: Premiere Pro acik ise plugin'i goremez!
echo.
echo   Sonraki adimlar:
echo    1. Premiere Pro'yu TAM KAPAT (File ^> Quit, sag ust X yetmez)
echo    2. Tekrar ac
echo    3. Window ^> UXP Plugins ^> PremierSEYO
echo    4. Sag ust ayar ikonu ^> Deepgram API key gir
echo.
echo  Pencereyi kapatmak icin herhangi bir tusa bas...
pause >nul
