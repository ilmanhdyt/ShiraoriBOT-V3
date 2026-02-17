@echo off
title Nia-AI WhatsApp Bot - Pairing Code
color 0B

echo.
echo ========================================
echo    NIA-AI WhatsApp Bot v2.0
echo    PAIRING CODE MODE
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

:: Start the bot with pairing code
echo [*] Starting bot with pairing code mode...
echo [*] You will be asked to enter your WhatsApp number
echo.
node index.js --pairing-code

:: If bot crashes, show error and wait
if errorlevel 1 (
    echo.
    echo [X] Bot stopped with error!
    echo [*] Check the error message above.
    pause
)
