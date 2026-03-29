@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "CHECK_ONLY=0"
if /I "%~1"=="--check" set "CHECK_ONLY=1"

echo [local-dev] Project root: %CD%

where node >nul 2>&1
if errorlevel 1 (
  echo [local-dev] Node.js is not installed or not available on PATH.
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [local-dev] npm is not installed or not available on PATH.
  exit /b 1
)

if not exist package.json (
  echo [local-dev] package.json was not found in this folder.
  exit /b 1
)

if not exist .env.local (
  if exist .env.local.example (
    copy /Y .env.local.example .env.local >nul
    echo [local-dev] Created .env.local from .env.local.example.
    echo [local-dev] Fill in the real environment values, then run this file again.
  ) else (
    echo [local-dev] .env.local is missing and no .env.local.example was found.
  )
  exit /b 1
)

if not exist node_modules\.bin\next.cmd (
  echo [local-dev] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [local-dev] npm install failed.
    exit /b 1
  )
)

if "%CHECK_ONLY%"=="1" (
  echo [local-dev] Checks passed.
  exit /b 0
)

echo [local-dev] Starting Next.js dev server...
echo [local-dev] Open http://localhost:3000 after the server is ready.
echo [local-dev] Press Ctrl+C to stop.

call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo [local-dev] Dev server exited with code %EXIT_CODE%.
)

exit /b %EXIT_CODE%
