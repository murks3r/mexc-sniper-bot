#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Deploying to EC2..."

# 1. Lade Secrets aus SSM und generiere .env.local
echo "📋 Lade Secrets aus AWS SSM..."
bash scripts/setup-env-from-ssm.sh .env.local

# 2. Build images
echo "🔨 Building Docker images..."
docker compose -f docker-compose.prod.yml build

# 3. Stop old containers
echo "🛑 Stopping old containers..."
docker compose -f docker-compose.prod.yml down

# 4. Start new containers
echo "▶️  Starting new containers..."
docker compose -f docker-compose.prod.yml up -d

# 5. Health check
echo "🏥 Waiting for health check..."
sleep 10
curl -f http://localhost/health || exit 1

echo "✅ Deployment successful!"
