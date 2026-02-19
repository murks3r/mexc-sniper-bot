#!/bin/bash
set -e

echo "=== CodeDeploy BeforeInstall Phase ==="
echo "Timestamp: $(date)"

# Create application directory if it doesn't exist
APP_DIR="/home/ec2-user/mexc-sniper-bot"
echo "Creating application directory: $APP_DIR"
mkdir -p $APP_DIR

# Clean up previous deployment (optional - remove if you want to preserve data)
if [ -d "$APP_DIR" ]; then
    echo "Cleaning up existing deployment files..."
    # Keep .env files and node_modules for faster deployments
    find $APP_DIR -mindepth 1 -maxdepth 1 ! -name '.env*' ! -name 'node_modules' -exec rm -rf {} + 2>/dev/null || true
fi

# Ensure proper ownership
echo "Setting directory ownership to ec2-user..."
sudo chown -R ec2-user:ec2-user $APP_DIR

echo "=== BeforeInstall Phase Complete ==="
