#!/bin/bash
set -e

echo "=== CodeDeploy ValidateService Phase ==="
echo "Timestamp: $(date)"

# Wait for application to start
echo "Waiting for application to be ready..."
sleep 10

# Check if application is running
if command -v pm2 &> /dev/null; then
    echo "Checking PM2 status..."
    pm2 status
    
    if pm2 list | grep -q "mexc-sniper-bot"; then
        echo "✅ Application is running in PM2"
    else
        echo "❌ Application not found in PM2"
        exit 1
    fi
else
    echo "PM2 not installed, checking port..."
fi

# Check if application is responding on port 3008
PORT=3008
MAX_ATTEMPTS=10
ATTEMPT=1

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    echo "Attempt $ATTEMPT/$MAX_ATTEMPTS: Checking if application is responding on port $PORT..."
    
    if curl -f -s -o /dev/null -w "%{http_code}" http://localhost:$PORT | grep -q "200\|301\|302"; then
        echo "✅ Application is responding successfully on port $PORT"
        echo "=== ValidateService Phase Complete ==="
        exit 0
    fi
    
    echo "Application not ready yet, waiting..."
    sleep 5
    ATTEMPT=$((ATTEMPT + 1))
done

echo "❌ Application failed to respond after $MAX_ATTEMPTS attempts"
echo "Last status check:"
pm2 status || true
exit 1
