#!/bin/bash
set -e

echo "=== CodeDeploy: AfterInstall Stage ==="
echo "Timestamp: $(date)"

cd /home/ec2-user/mexc-sniper-bot

# Make all scripts executable
echo "Setting script permissions..."
chmod +x scripts/deployment/*.sh

# Set proper ownership
echo "Setting file ownership..."
sudo chown -R ec2-user:ec2-user /home/ec2-user/mexc-sniper-bot

# Install Node.js dependencies if package.json exists
if [ -f "package.json" ]; then
    echo "Installing Node.js dependencies..."
    # Install Node.js if not present
    if ! command -v node &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs || sudo apt install -y nodejs
    fi
    
    # Install dependencies
    npm ci --production || npm install --production
fi

# Build Rust backend if needed
if [ -d "backend-rust" ]; then
    echo "Rust backend detected, will use Docker deployment..."
fi

echo "AfterInstall stage completed successfully"
