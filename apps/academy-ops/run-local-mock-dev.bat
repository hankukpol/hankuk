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
  echo   run-local-mock-dev.bat 3010
  exit /b 1
)

set "NEXT_PUBLIC_APP_URL=http://%HOST%:%PORT%"
set "LOCAL_DEV_MODE=mock"
set "NEXT_PUBLIC_LOCAL_DEV_MODE=mock"
set "LOCAL_DEV_ADMIN_ID=00000000-0000-0000-0000-000000000001"
set "LOCAL_DEV_ADMIN_EMAIL=local-admin@morningmock.local"
set "STUDENT_JWT_SECRET=local-dev-student-secret"
set "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:51214/template1?sslmode=disable&pgbouncer=true&connection_limit=1&statement_cache_size=0&connect_timeout=0&max_idle_connection_lifetime=0&pool_timeout=0&socket_timeout=0"
set "DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:51214/template1?sslmode=disable&connection_limit=10&connect_timeout=0&max_idle_connection_lifetime=0&pool_timeout=0&socket_timeout=0"

echo Starting local Prisma Postgres...
call npx prisma dev --detach --name morning-mock-local -p 51213 -P 51214 --shadow-db-port 51215
if errorlevel 1 exit /b %ERRORLEVEL%

echo Generating Prisma client...
call pnpm run db:generate
if errorlevel 1 exit /b %ERRORLEVEL%

echo Applying current schema to the local mock database...
call npx prisma db push --accept-data-loss --skip-generate
if errorlevel 1 exit /b %ERRORLEVEL%

echo Seeding local mock data...
call npx tsx scripts/seed-local-mock.ts
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo Local mock environment is ready.
echo Admin URL:   %NEXT_PUBLIC_APP_URL%/admin
echo Login URL:   %NEXT_PUBLIC_APP_URL%/login
echo Student URL: %NEXT_PUBLIC_APP_URL%/student/login
echo Student test account: 2501001 / 000115
echo.
echo Press Ctrl+C to stop the Next.js server.
echo To stop the local Prisma DB later:
echo   cd apps\\academy-ops ^&^& npx prisma dev stop morning-mock-local
echo.

call pnpm run dev -- --hostname %HOST% --port %PORT%
exit /b %ERRORLEVEL%

:help
echo Usage: run-local-mock-dev.bat [port]
echo.
echo Examples:
echo   run-local-mock-dev.bat
echo   run-local-mock-dev.bat 3001
exit /b 0

