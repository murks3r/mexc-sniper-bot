#!/bin/bash
set -e

echo "=== CodeDeploy: ApplicationStart Stage ==="
echo "Timestamp: $(date)"

cd /home/ec2-user/mexc-sniper-bot

# Read AWS region and account ID from environment or use defaults
AWS_REGION=${AWS_REGION:-ap-northeast-3}
AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}

# ECR Repository
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE_NAME="mexc-sniper-rust"

echo "Using ECR Registry: ${ECR_REGISTRY}"

# Login to ECR
echo "Logging into ECR..."
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${ECR_REGISTRY}

# Pull latest image
echo "Pulling latest Docker image..."
docker pull ${ECR_REGISTRY}/${IMAGE_NAME}:latest || {
    echo "WARNING: Failed to pull from ECR, will try to build locally..."
    if [ -d "backend-rust" ]; then
        cd backend-rust
        docker build -t ${IMAGE_NAME}:latest .
        cd ..
    fi
}

# Start the application container
echo "Starting application container..."
docker run -d \
  --name mexc-sniper-blue \
  --restart unless-stopped \
  -p 8080:8080 \
  -e AWS_REGION=${AWS_REGION} \
  -e MEXC_API_KEY=${MEXC_API_KEY} \
  -e MEXC_SECRET_KEY=${MEXC_SECRET_KEY} \
  -e JWT_SECRET=${JWT_SECRET} \
  ${ECR_REGISTRY}/${IMAGE_NAME}:latest || \
  docker run -d \
    --name mexc-sniper-blue \
    --restart unless-stopped \
    -p 8080:8080 \
    -e AWS_REGION=${AWS_REGION} \
    -e MEXC_API_KEY=${MEXC_API_KEY} \
    -e MEXC_SECRET_KEY=${MEXC_SECRET_KEY} \
    -e JWT_SECRET=${JWT_SECRET} \
    ${IMAGE_NAME}:latest

echo "Waiting for application to start..."
sleep 10

echo "ApplicationStart stage completed successfully"
