#!/bin/bash
set -e

echo "=== CodeDeploy ApplicationStart Phase ==="
echo "Timestamp: $(date)"

APP_DIR="/home/ec2-user/mexc-sniper-bot"
cd $APP_DIR

# Install PM2 if not present
if ! command -v pm2 &> /dev/null; then
    echo "PM2 not found. Installing PM2 globally..."
    npm install -g pm2
fi

# Set up environment
export BUN_INSTALL="/home/ec2-user/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Start the application with PM2
echo "Starting application with PM2..."
pm2 start npm --name "mexc-sniper-bot" -- run start

# Save PM2 configuration
pm2 save

# Set up PM2 to start on system boot
pm2 startup systemd -u ec2-user --hp /home/ec2-user || true

echo "Application started successfully"
pm2 status

echo "=== ApplicationStart Phase Complete ==="
