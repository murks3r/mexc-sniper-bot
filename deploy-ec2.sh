#!/usr/bin/env bash
set -euo pipefail

echo "Deploying to EC2..."

docker compose -f docker-compose.prod.yml build

docker compose -f docker-compose.prod.yml down

docker compose -f docker-compose.prod.yml up -d

sleep 10

curl -f http://localhost/health

echo "Deployment successful."
