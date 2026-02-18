@echo off
title NIA-AI WhatsApp Bot
color 0A

echo.
echo  ============================================
echo   NIA-AI WHATSAPP BOT - Installer & Starter
echo  ============================================
echo.

:: Cek apakah node_modules ada
if not exist "node_modules\" (
    echo  [!] node_modules tidak ditemukan, install dependencies...
    echo.
    call npm install
    echo.
    echo  [+] Install selesai!
    echo.
)

:: Hapus session lama jika ada masalah
:: Uncomment baris di bawah jika ingin scan QR ulang:
:: rmdir /s /q session

echo  [*] Menjalankan bot...
echo.
node main.js

pause
