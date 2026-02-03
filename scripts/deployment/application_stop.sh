#!/bin/bash
set -e

echo "=== CodeDeploy: ApplicationStop Stage ==="
echo "Timestamp: $(date)"

# Stop running containers gracefully
echo "Stopping existing application containers..."

# Stop Next.js application if running
if docker ps -a --format '{{.Names}}' | grep -q 'mexc-sniper-next'; then
    echo "Stopping Next.js container..."
    docker stop mexc-sniper-next || true
    docker rm mexc-sniper-next || true
fi

# Stop Rust backend containers (blue-green deployment)
if docker ps -a --format '{{.Names}}' | grep -q 'mexc-sniper-blue'; then
    echo "Stopping Blue container..."
    docker stop mexc-sniper-blue || true
    docker rm mexc-sniper-blue || true
fi

if docker ps -a --format '{{.Names}}' | grep -q 'mexc-sniper-green'; then
    echo "Stopping Green container..."
    docker stop mexc-sniper-green || true
    docker rm mexc-sniper-green || true
fi

# Clean up dangling images to save space
echo "Cleaning up Docker resources..."
docker system prune -f || true

echo "ApplicationStop stage completed successfully"
