@echo off
setlocal

if /I "%~1"=="--help" goto :help
if /I "%~1"=="/?" goto :help

set "ROOT=%~dp0"
cd /d "%ROOT%" || (
  echo Failed to enter the app directory.
  exit /b 1
)

set "HOST=127.0.0.1"
set "PORT=%~1"

if "%PORT%"=="" set "PORT=3000"

netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo Port %PORT% is already in use.
  echo Close the existing server or run with another port. Example:
  echo   run-local-dev.bat 3010
  exit /b 1
)

set "NEXT_PUBLIC_APP_URL=http://%HOST%:%PORT%"

echo Starting Next.js dev server in "%CD%"
echo App URL: %NEXT_PUBLIC_APP_URL%
echo Admin login: %NEXT_PUBLIC_APP_URL%/login
echo Student login: %NEXT_PUBLIC_APP_URL%/student/login
echo First compile can take 10-20 seconds on the first page request.
echo Press Ctrl+C to stop.

call pnpm run dev -- --hostname %HOST% --port %PORT%
exit /b %ERRORLEVEL%

:help
echo Usage: run-local-dev.bat [port]
echo.
echo Examples:
echo   run-local-dev.bat
echo   run-local-dev.bat 3001
exit /b 0
