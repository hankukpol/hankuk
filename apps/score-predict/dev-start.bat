@echo off
setlocal
title Fire Exam Prediction - Dev Server (port 3200)

echo ========================================
echo   Fire Exam Prediction - Dev Server
echo   http://localhost:3200
echo ========================================
echo.

pushd "%~dp0"
if errorlevel 1 (
    echo [ERROR] Could not move to script directory.
    echo         Path: %~dp0
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [1/3] node_modules not found. Running npm install...
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed. Check Node.js and npm installation.
        popd
        pause
        exit /b 1
    )
) else (
    echo [1/3] node_modules already exists.
)

echo [2/3] Generating Prisma Client...
call npx prisma generate >nul 2>&1

findstr /C:"TODO_FIRE" ".env" >nul 2>&1
if not errorlevel 1 (
    echo.
    echo [WARNING] DATABASE_URL in .env still contains TODO_FIRE.
    echo           Update fire\.env before starting the server.
    popd
    pause
    exit /b 1
)

echo [3/3] Starting dev server (single-process mode, http://localhost:3200)
echo.
echo   Press Ctrl+C to stop the server.
echo ========================================
echo.

call node scripts\dev-single-process.cjs
set "EXIT_CODE=%ERRORLEVEL%"

popd
if not "%EXIT_CODE%"=="0" (
    echo.
    echo [ERROR] Dev server exited with code %EXIT_CODE%.
)
pause
exit /b %EXIT_CODE%
