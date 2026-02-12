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
echo "Waiting for services to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if curl -f http://localhost/api/health 2>/dev/null; then
    echo "✅ Deployment successful!"
    exit 0
  fi
  ATTEMPT=$((ATTEMPT + 1))
  echo "Attempt $ATTEMPT/$MAX_ATTEMPTS: Services not ready yet..."
  sleep 2
done

echo "❌ Deployment failed: Services did not become healthy in time"
exit 1
