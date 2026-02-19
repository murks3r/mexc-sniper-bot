#!/bin/bash
set -e

echo "=== CodeDeploy: BeforeInstall Stage ==="
echo "Timestamp: $(date)"

# Update system packages
echo "Updating system packages..."
sudo yum update -y || sudo apt update -y

# Install required dependencies
echo "Installing required dependencies..."
sudo yum install -y docker git || sudo apt install -y docker.io git

# Ensure Docker is running
echo "Checking Docker service..."
sudo systemctl start docker || sudo service docker start
sudo systemctl enable docker || true

# Add ec2-user to docker group (if not already)
sudo usermod -aG docker ec2-user || true

# Install AWS CLI if not present
if ! command -v aws &> /dev/null; then
    echo "Installing AWS CLI..."
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip -q awscliv2.zip
    sudo ./aws/install
    rm -rf aws awscliv2.zip
fi

# Clean up old deployment artifacts
echo "Cleaning up old deployment artifacts..."
rm -rf /home/ec2-user/mexc-sniper-bot-old
if [ -d "/home/ec2-user/mexc-sniper-bot" ]; then
    mv /home/ec2-user/mexc-sniper-bot /home/ec2-user/mexc-sniper-bot-old
fi

echo "BeforeInstall stage completed successfully"
