@echo off
setlocal
pushd "%~dp0"
node ..\..\scripts\docker-dev.mjs dev score-predict
set "RESULT=%ERRORLEVEL%"
popd
exit /b %RESULT%