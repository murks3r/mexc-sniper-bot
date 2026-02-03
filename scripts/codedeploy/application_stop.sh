#!/bin/bash
set -e

echo "=== CodeDeploy ApplicationStop Phase ==="
echo "Timestamp: $(date)"

APP_DIR="/home/ec2-user/mexc-sniper-bot"

# Check if PM2 is installed
if command -v pm2 &> /dev/null; then
    echo "Stopping application with PM2..."
    pm2 stop mexc-sniper-bot || echo "Application not running or already stopped"
    pm2 delete mexc-sniper-bot || echo "Application not in PM2 process list"
else
    echo "PM2 not installed. Attempting to stop via port..."
    # Try to find and kill any process on port 3008
    PORT=3008
    PID=$(lsof -ti:$PORT) || true
    if [ ! -z "$PID" ]; then
        echo "Stopping process on port $PORT (PID: $PID)"
        kill -9 $PID || true
    else
        echo "No process found on port $PORT"
    fi
fi

echo "=== ApplicationStop Phase Complete ==="
