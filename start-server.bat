@echo off
echo.
echo ========================================
echo  Starting Lead Marketplace Backend
echo ========================================
echo.

cd /d "%~dp0"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting server...
echo Press Ctrl+C to stop the server
echo.

node server.js

REM If server exits, keep window open to see error
if errorlevel 1 (
    echo.
    echo Server stopped with an error!
    echo.
    pause
)

