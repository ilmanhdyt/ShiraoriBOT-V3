@echo off
title Nia-AI WhatsApp Bot
color 0A

echo.
echo ========================================
echo    NIA-AI WhatsApp Bot v2.0
echo ========================================
echo.

:: Check if node_modules exists
if not exist "node_modules" (
    echo [!] Dependencies not installed!
    echo [*] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo.
        echo [X] Failed to install dependencies!
        echo [*] Please check your internet connection and try again.
        pause
        exit /b 1
    )
    echo.
    echo [√] Dependencies installed successfully!
    echo.
)

:: Start the bot
echo [*] Starting bot...
echo.
node index.js

:: If bot crashes, show error and wait
if errorlevel 1 (
    echo.
    echo [X] Bot stopped with error!
    echo [*] Check the error message above.
    pause
)
