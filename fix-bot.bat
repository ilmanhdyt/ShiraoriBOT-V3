@echo off
title NIA-AI Bot - Automatic Fix
color 0E

echo.
echo ==========================================
echo    NIA-AI Bot - AUTOMATIC FIX
echo ==========================================
echo.
echo This script will:
echo  1. Clean old dependencies
echo  2. Reinstall all packages
echo  3. Test bot compatibility
echo.
pause

echo.
echo [*] Step 1: Cleaning old dependencies...
if exist "node_modules" (
    echo [*] Removing node_modules folder...
    rmdir /s /q node_modules
)
if exist "package-lock.json" (
    echo [*] Removing package-lock.json...
    del /f package-lock.json
)
echo [√] Cleanup complete!

echo.
echo [*] Step 2: Installing dependencies...
echo [*] This may take 3-5 minutes...
call npm install
if errorlevel 1 (
    echo.
    echo [X] Installation failed!
    echo [*] Possible solutions:
    echo     - Check internet connection
    echo     - Run as Administrator
    echo     - Try: npm cache clean --force
    echo.
    pause
    exit /b 1
)
echo [√] Installation complete!

echo.
echo [*] Step 3: Testing bot compatibility...
node test.js
if errorlevel 1 (
    echo.
    echo [!] Some tests failed!
    echo [*] Please check the errors above.
    echo.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo [√] All fixes applied successfully!
echo ==========================================
echo.
echo You can now start the bot:
echo  • Double-click start.bat (QR Code)
echo  • Double-click start-pairing.bat (Pairing Code)
echo  • Or run: node .
echo.
pause
