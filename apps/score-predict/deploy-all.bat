@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM One-click flow:
REM 1) git add/commit/push
REM 2) apply Prisma schema to Supabase
REM 3) deploy to Vercel production
REM
REM Usage:
REM   deploy-all.bat
REM   deploy-all.bat "feat: update scoring logic"
REM
REM Optional:
REM   set SKIP_TSC=1   (skip `npx tsc --noEmit`)

if /I "%~1"=="--help" goto :help
if /I "%~1"=="-h" goto :help

cd /d "%~dp0"

echo.
echo [0/7] Preflight checks
where git >nul 2>nul || (
  echo [ERROR] git not found in PATH.
  exit /b 1
)
where npx >nul 2>nul || (
  echo [ERROR] npx not found in PATH.
  exit /b 1
)

if not exist ".vercel\project.json" (
  echo [ERROR] .vercel\project.json not found. Run `vercel link` first.
  exit /b 1
)

for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%B"
if not defined BRANCH (
  echo [ERROR] Could not detect current git branch.
  exit /b 1
)

echo [INFO] Branch: %BRANCH%

if /I not "%SKIP_TSC%"=="1" (
  echo.
  echo [1/7] Type check
  call npx tsc --noEmit
  if errorlevel 1 (
    echo [ERROR] Type check failed.
    exit /b 1
  )
) else (
  echo.
  echo [1/7] Type check skipped (SKIP_TSC=1)
)

echo.
echo [2/7] Detecting changes
set "HAS_CHANGES="
for /f %%I in ('git status --porcelain') do (
  set "HAS_CHANGES=1"
  goto :changes_checked
)
:changes_checked

if defined HAS_CHANGES (
  set "COMMIT_MSG=%~1"
  if "!COMMIT_MSG!"=="" (
    set /p COMMIT_MSG=Commit message ^(default: chore: deploy^): 
  )
  if "!COMMIT_MSG!"=="" set "COMMIT_MSG=chore: deploy"

  echo.
  echo [3/7] git add
  git add -A
  if errorlevel 1 (
    echo [ERROR] git add failed.
    exit /b 1
  )

  echo [4/7] git commit
  git commit -m "!COMMIT_MSG!"
  if errorlevel 1 (
    echo [ERROR] git commit failed.
    exit /b 1
  )
) else (
  echo [INFO] No local changes. Skipping add/commit.
)

echo.
echo [5/7] git push origin %BRANCH%
git push origin "%BRANCH%"
if errorlevel 1 (
  echo [WARN] push without upstream failed. Retrying with -u...
  git push -u origin "%BRANCH%"
  if errorlevel 1 (
    echo [ERROR] git push failed.
    exit /b 1
  )
)

echo.
echo [6/7] Applying DB schema to Supabase (Prisma)
set "HAS_MIGRATIONS=0"
if exist "prisma\migrations" (
  for /d %%D in ("prisma\migrations\*") do (
    set "HAS_MIGRATIONS=1"
    goto :migration_mode_decided
  )
)
:migration_mode_decided

if "%HAS_MIGRATIONS%"=="1" (
  echo [INFO] Migrations found. Running `npx prisma migrate deploy`...
  call npx prisma migrate deploy
) else (
  echo [INFO] No migrations folder entries. Running `npx prisma db push`...
  call npx prisma db push
)
if errorlevel 1 (
  echo [ERROR] Prisma DB apply failed.
  exit /b 1
)

echo.
echo [7/7] Vercel production deploy
call npx --yes vercel --prod --yes
if errorlevel 1 (
  echo [ERROR] Vercel deploy failed.
  exit /b 1
)

echo.
echo [DONE] Push + DB apply + Vercel deploy completed successfully.
exit /b 0

:help
echo.
echo deploy-all.bat
echo.
echo One-click sequence:
echo   1) git add/commit/push
echo   2) Prisma DB apply to Supabase
echo   3) Vercel production deploy
echo.
echo Usage:
echo   deploy-all.bat
echo   deploy-all.bat "feat: update something"
echo.
echo Optional:
echo   set SKIP_TSC=1 ^&^& deploy-all.bat
echo.
exit /b 0
