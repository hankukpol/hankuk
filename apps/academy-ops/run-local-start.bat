@echo off
setlocal

if /I "%~1"=="--help" goto :help
if /I "%~1"=="/?" goto :help

set "ROOT=%~dp0"
cd /d "%ROOT%" || (
  echo Failed to enter the app directory.
  exit /b 1
)

set "USERPROFILE=%CD%"
set "HOME=%CD%"
set "PORT=%~1"

if "%PORT%"=="" set "PORT=3000"

echo Building the app in "%CD%"
call pnpm run build
if errorlevel 1 exit /b %ERRORLEVEL%

echo Starting Next.js production server
echo URL: http://localhost:%PORT%
echo Press Ctrl+C to stop.

call pnpm run start -- --port %PORT%
exit /b %ERRORLEVEL%

:help
echo Usage: run-local-start.bat [port]
echo.
echo Examples:
echo   run-local-start.bat
echo   run-local-start.bat 3001
exit /b 0
