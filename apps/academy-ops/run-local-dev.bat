@echo off
setlocal
pushd "%~dp0"
node ..\..\scripts\docker-dev.mjs dev academy-ops
set "RESULT=%ERRORLEVEL%"
popd
exit /b %RESULT%