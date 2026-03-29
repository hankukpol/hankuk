@echo off
setlocal

if /I "%~1"=="--help" goto :help
if /I "%~1"=="/?" goto :help

set "ROOT=%~dp0"
set "APP_DIR=%ROOT%"
set "ENV_FILE=%APP_DIR%\.env.local"
set "ORIGINAL_USERPROFILE=%USERPROFILE%"
set "ORIGINAL_HOME=%HOME%"

if /I "%~1"=="--check" goto :check

cd /d "%ROOT%" || (
  echo Failed to enter the repository root.
  exit /b 1
)

for /f "delims=" %%I in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%I"
if not defined BRANCH (
  echo Git repository was not detected.
  exit /b 1
)

set "MESSAGE=%~1"
if "%MESSAGE%"=="" set "MESSAGE=deploy: %DATE% %TIME%"

echo [1/3] GitHub push
echo Branch: %BRANCH%
echo Commit message: %MESSAGE%
echo.

git add -A
if errorlevel 1 exit /b %ERRORLEVEL%

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MESSAGE%"
  if errorlevel 1 exit /b %ERRORLEVEL%
) else (
  echo No staged changes to commit. Continuing with push.
)

git push origin %BRANCH%
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo [2/3] Supabase deployment
cd /d "%APP_DIR%" || (
  echo Failed to enter the app directory.
  exit /b 1
)

if not exist "%ENV_FILE%" (
  echo Missing %ENV_FILE%
  echo Copy .env.example to .env.local and fill the database values first.
  exit /b 1
)

call :load_env_file "%ENV_FILE%"
if errorlevel 1 exit /b %ERRORLEVEL%

if "%DATABASE_URL%"=="" (
  echo DATABASE_URL is not configured in .env.local.
  exit /b 1
)

if "%DIRECT_URL%"=="" (
  echo DIRECT_URL is not configured in .env.local.
  exit /b 1
)

call npx prisma migrate deploy
if errorlevel 1 exit /b %ERRORLEVEL%

if exist "supabase\migrations\202603080002_admin_rls.sql" (
  call npx prisma db execute --file "supabase\migrations\202603080002_admin_rls.sql" --schema "prisma\schema.prisma"
  if errorlevel 1 exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Vercel deployment

if not exist "%APP_DIR%\.vercel\project.json" (
  echo Missing .vercel\project.json.
  echo Run ^`vercel link^` in the app directory first.
  exit /b 1
)

call :load_vercel_link "%APP_DIR%\.vercel\project.json"
if errorlevel 1 exit /b %ERRORLEVEL%

cd /d "%ROOT%" || (
  echo Failed to return to the repository root.
  exit /b 1
)

set "USERPROFILE=%ORIGINAL_USERPROFILE%"
set "HOME=%ORIGINAL_HOME%"

call npx --yes vercel --prod --yes
exit /b %ERRORLEVEL%

:load_vercel_link
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$json = Get-Content -LiteralPath '%~1' -Raw | ConvertFrom-Json;" ^
  "Write-Output ('set ""VERCEL_PROJECT_ID=' + $json.projectId + '""');" ^
  "Write-Output ('set ""VERCEL_ORG_ID=' + $json.orgId + '""')"`) do %%I
exit /b 0

:load_env_file
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%~1") do (
  if not "%%A"=="" set "%%A=%%B"
)
exit /b 0

:check
echo [check 1/4] Git remote access
cd /d "%ROOT%" || (
  echo Failed to enter the repository root.
  exit /b 1
)

git ls-remote --heads origin >nul
if errorlevel 1 (
  echo GitHub remote access failed.
  exit /b 1
)

echo [check 2/4] Supabase environment and migration status
cd /d "%APP_DIR%" || (
  echo Failed to enter the app directory.
  exit /b 1
)

if not exist "%ENV_FILE%" (
  echo Missing %ENV_FILE%
  exit /b 1
)

call :load_env_file "%ENV_FILE%"
if errorlevel 1 exit /b %ERRORLEVEL%

if "%DATABASE_URL%"=="" (
  echo DATABASE_URL is not configured in .env.local.
  exit /b 1
)

if "%DIRECT_URL%"=="" (
  echo DIRECT_URL is not configured in .env.local.
  exit /b 1
)

set "PRISMA_STATUS_FILE=%TEMP%\deploy-prisma-status-%RANDOM%.log"
call npx prisma migrate status --schema prisma\schema.prisma > "%PRISMA_STATUS_FILE%" 2>&1
set "PRISMA_STATUS_EXIT=%ERRORLEVEL%"
type "%PRISMA_STATUS_FILE%"
if not "%PRISMA_STATUS_EXIT%"=="0" (
  findstr /C:"Following migrations have not yet been applied:" "%PRISMA_STATUS_FILE%" >nul
  if errorlevel 1 (
    del "%PRISMA_STATUS_FILE%" >nul 2>&1
    exit /b %PRISMA_STATUS_EXIT%
  )
)
del "%PRISMA_STATUS_FILE%" >nul 2>&1

echo [check 3/4] Next.js production build
set "USERPROFILE=%CD%"
set "HOME=%CD%"
call pnpm run build
if errorlevel 1 exit /b %ERRORLEVEL%

echo [check 4/4] Vercel authentication and project link
if not exist ".vercel\project.json" (
  echo Missing .vercel\project.json.
  exit /b 1
)

set "USERPROFILE=%ORIGINAL_USERPROFILE%"
set "HOME=%ORIGINAL_HOME%"

call npx --yes vercel whoami
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo All deployment checks passed.
exit /b 0

:help
echo Usage: deploy.bat [commit-message]
echo.
echo This script runs:
echo   1. git add, commit, push
echo   2. Prisma migration deploy to Supabase
echo   3. Vercel production deploy
echo.
echo Requirements:
echo   1. Git push permission is available
echo   2. .env.local contains DATABASE_URL and DIRECT_URL
echo   3. .vercel\project.json already exists
echo   4. Vercel CLI login is already completed
echo.
echo Verification:
echo   deploy.bat --check
exit /b 0
