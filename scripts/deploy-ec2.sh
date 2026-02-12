#!/bin/bash
# deploy-ec2.sh - One-command EC2 deployment

set -e

echo "🚀 Deploying to EC2..."

# 1. Build images
docker-compose -f docker-compose.prod.yml build

# 2. Stop old containers
docker-compose -f docker-compose.prod.yml down

# 3. Start new containers
docker-compose -f docker-compose.prod.yml up -d

# 4. Health check
sleep 10
curl -f http://localhost/api/health || exit 1

echo "✅ Deployment successful!"
