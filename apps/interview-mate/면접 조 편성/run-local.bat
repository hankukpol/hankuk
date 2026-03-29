@echo off
setlocal

cd /d "%~dp0"

if not defined PORT set "PORT=3000"
set "APP_URL=http://localhost:%PORT%"

if /i "%NO_BROWSER%"=="1" (
  set "OPEN_BROWSER=0"
) else (
  set "OPEN_BROWSER=1"
)

echo [INFO] Working directory: %CD%
echo [INFO] Target URL: %APP_URL%

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo [ERROR] Install Node.js 18+ and run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not available in PATH.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json was not found.
  pause
  exit /b 1
)

if /i "%DRY_RUN%"=="1" (
  echo [DRY RUN] node and npm are available.
  if exist "node_modules" (
    echo [DRY RUN] node_modules exists.
  ) else (
    echo [DRY RUN] node_modules is missing and npm install would run.
  )
  if /i "%SKIP_BUILD%"=="1" (
    echo [DRY RUN] SKIP_BUILD=1, build would be skipped.
  ) else (
    echo [DRY RUN] npm run build would run.
  )
  if "%OPEN_BROWSER%"=="1" (
    echo [DRY RUN] browser watcher would be started.
  ) else (
    echo [DRY RUN] browser launch is disabled.
  )
  echo [DRY RUN] npm run start would launch on port %PORT%.
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing '%APP_URL%' | Out-Null; exit 0 } catch { exit 1 }"
if "%errorlevel%"=="0" (
  echo [INFO] Something is already listening on %APP_URL%.
  if "%OPEN_BROWSER%"=="1" start "" "%APP_URL%"
  exit /b 0
)

if not exist "node_modules" (
  echo [INFO] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

if /i "%SKIP_BUILD%"=="1" (
  echo [INFO] SKIP_BUILD=1. Skipping build.
) else (
  echo [INFO] Building the production app...
  call npm run build
  if errorlevel 1 (
    echo [ERROR] npm run build failed.
    pause
    exit /b 1
  )
)

if "%OPEN_BROWSER%"=="1" (
  start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$uri='%APP_URL%'; for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest -UseBasicParsing $uri | Out-Null; Start-Process $uri; exit 0 } catch { Start-Sleep -Seconds 1 } }; Start-Process $uri"
)

echo [INFO] Starting the local server...
echo [INFO] Close this window to stop the app.
set "PORT=%PORT%"
call npm run start

set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo [ERROR] npm run start exited with code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
