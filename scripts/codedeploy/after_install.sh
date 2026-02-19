#!/bin/bash
set -e

echo "=== CodeDeploy AfterInstall Phase ==="
echo "Timestamp: $(date)"

APP_DIR="/home/ec2-user/mexc-sniper-bot"
cd $APP_DIR

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing Node.js 20.x..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
fi

# Install Bun if not present
if ! command -v bun &> /dev/null; then
    echo "Bun not found. Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="/home/ec2-user/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    # Add to .bashrc for persistence
    echo 'export BUN_INSTALL="/home/ec2-user/.bun"' >> ~/.bashrc
    echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
fi

# Verify installations
echo "Node version: $(node --version)"
echo "Bun version: $(bun --version)"

# Install dependencies
echo "Installing dependencies with Bun..."
bun install --frozen-lockfile

# Build the application
echo "Building the application..."
bun run build

# Run database migrations if needed
if [ -f "drizzle.config.ts" ]; then
    echo "Running database migrations..."
    bun run db:migrate || echo "Migrations failed or not required"
fi

echo "=== AfterInstall Phase Complete ==="
