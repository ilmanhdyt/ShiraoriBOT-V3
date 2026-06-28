#!/bin/bash
# keep-alive.sh - Auto restart bot kalau mati
# Cara pakai: bash keep-alive.sh

BOT_DIR="$(cd "$(dirname "$0")" && pwd)"  # folder tempat script ini berada
LOG_FILE="$BOT_DIR/logs/bot.log"
PID_FILE="$BOT_DIR/logs/bot.pid"

mkdir -p "$BOT_DIR/logs"

echo "🤖 Keep-alive dimulai..."
echo "📁 Folder bot : $BOT_DIR"
echo "📄 Log file   : $LOG_FILE"

while true; do
    # Cek apakah bot sedang jalan
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            # Bot masih jalan, tunggu 30 detik
            sleep 30
            continue
        fi
    fi

    # Bot mati atau belum jalan → restart
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🔄 Bot mati! Restart..." | tee -a "$LOG_FILE"

    cd "$BOT_DIR"
    nohup node main.js >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Bot restart dengan PID $(cat $PID_FILE)" | tee -a "$LOG_FILE"

    # Tunggu 10 detik sebelum cek lagi
    sleep 10
done