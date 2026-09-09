@echo off
rem Dev server launcher. Double-click from Explorer, or make a desktop shortcut.
rem Change the port by editing the PORT value below.
rem Keep this file ASCII-only: cmd.exe reads batch files in the system code page,
rem so non-ASCII text here breaks parsing on a Korean Windows install.

chcp 65001 > nul
cd /d "%~dp0.."

if "%PORT%"=="" set PORT=3200

echo [start-dev] %CD%
echo [start-dev] port %PORT%
echo.

call npm run dev

echo.
echo [start-dev] Dev server stopped. Press any key to close.
pause > nul
