# AWS Deployment Troubleshooting Guide

This guide provides step-by-step instructions for troubleshooting AWS EC2 deployment issues for the mexc-sniper-bot Rust backend.

---

## Quick Diagnostics Checklist

Use this checklist to quickly diagnose deployment issues:

- [ ] GitHub Actions workflow completed successfully
- [ ] AWS credentials are valid and have proper permissions
- [ ] EC2 instance is running
- [ ] Security groups allow required ports (22, 8080)
- [ ] SSH private key is correctly configured
- [ ] Docker is installed and running on EC2
- [ ] ECR repository exists and is accessible
- [ ] CloudWatch logs are available (if configured)

---

## 1. Verify EC2 Instance Status

### Check Instance State
```bash
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=mexc-sniper-bot" \
  --region ap-southeast-1 \
  --query 'Reservations[*].Instances[*].[InstanceId,State.Name,PublicIpAddress,PrivateIpAddress]' \
  --output table
```

**Expected Output:**
- State should be `running`
- Should have a public IP address
- Instance ID should match your configuration

### Check Instance System Status
```bash
aws ec2 describe-instance-status \
  --instance-ids <instance-id> \
  --region ap-southeast-1 \
  --output table
```

**Expected Output:**
- System Status: `ok`
- Instance Status: `ok`

---

## 2. Verify Security Groups

### List Security Group Rules
```bash
# Get security group ID from instance
SECURITY_GROUP_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=mexc-sniper-bot" \
  --region ap-southeast-1 \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' \
  --output text)

# Check inbound rules
aws ec2 describe-security-groups \
  --group-ids $SECURITY_GROUP_ID \
  --region ap-southeast-1 \
  --query 'SecurityGroups[*].IpPermissions[*].[IpProtocol,FromPort,ToPort,IpRanges[*].CidrIp]' \
  --output table
```

**Required Ports:**
- Port 22 (SSH) - For deployment scripts
- Port 8080 (HTTP) - For application access
- Port 443 (HTTPS) - If using SSL/TLS

### Add Missing Rules (if needed)

**⚠️ SECURITY WARNING:** Opening SSH (port 22) to 0.0.0.0/0 is a security risk. Only use for temporary troubleshooting, then immediately restrict to specific IP addresses.

```bash
# ⚠️ TEMPORARY ONLY - Allow SSH from anywhere for troubleshooting
# Replace 0.0.0.0/0 with your specific IP address for production
aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0 \
  --region ap-southeast-1

# Allow HTTP on port 8080
aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp \
  --port 8080 \
  --cidr 0.0.0.0/0 \
  --region ap-southeast-1
```

---

## 3. Test SSH Connection

### Manual SSH Test
```bash
# Replace with your EC2 IP and SSH key
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@<EC2_IP> "echo 'SSH connection successful'"
```

### Common SSH Issues

#### Issue: Permission denied (publickey)
**Solution:**
- Verify SSH private key is correct
- Check key permissions: `chmod 600 ~/.ssh/mexc-sniper-key.pem`
- Ensure key matches the EC2 key pair

#### Issue: Connection timeout
**Solution:**
- Check security group allows port 22
- Verify EC2 instance is running
- Check VPC and subnet configuration
- Verify public IP is accessible

---

## 4. Verify Docker on EC2

### Check Docker Status
```bash
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@<EC2_IP> << 'EOF'
  # Check Docker version
  docker --version
  
  # Check Docker service status
  sudo systemctl status docker
  
  # List running containers
  docker ps
  
  # List all containers (including stopped)
  docker ps -a
  
  # Check Docker images
  docker images
EOF
```

### Install Docker (if not installed)
```bash
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@<EC2_IP> << 'EOF'
  # Update packages
  sudo yum update -y
  
  # Install Docker
  sudo yum install docker -y
  
  # Start Docker service
  sudo systemctl start docker
  sudo systemctl enable docker
  
  # Add ec2-user to docker group
  sudo usermod -aG docker ec2-user
  
  # Verify installation
  docker --version
EOF
```

**Note:** You'll need to reconnect SSH after adding user to docker group.

---

## 5. Verify AWS CLI and ECR Access

### Check AWS CLI
```bash
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@<EC2_IP> << 'EOF'
  # Check AWS CLI version
  aws --version
  
  # Test AWS credentials (should use IAM role)
  aws sts get-caller-identity --region ap-southeast-1
  
  # Test ECR access
  aws ecr describe-repositories --region ap-southeast-1 --repository-names mexc-sniper-rust
EOF
```

### Configure IAM Role for EC2

If AWS CLI doesn't work, attach an IAM role to EC2:

1. **Create IAM Role:**
   - Service: EC2
   - Policies: `AmazonEC2ContainerRegistryReadOnly`, `CloudWatchAgentServerPolicy`

2. **Attach Role to Instance:**
```bash
aws ec2 associate-iam-instance-profile \
  --instance-id <instance-id> \
  --iam-instance-profile Name=<iam-role-name> \
  --region ap-southeast-1
```

---

## 6. Check Application Logs

### View Docker Container Logs
```bash
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@<EC2_IP> << 'EOF'
  # View logs for blue container
  docker logs mexc-sniper-blue
  
  # View logs for green container (if exists)
  docker logs mexc-sniper-green
  
  # Follow logs in real-time
  docker logs -f mexc-sniper-blue
  
  # Last 100 lines
  docker logs --tail 100 mexc-sniper-blue
EOF
```

### Check Container Health
```bash
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@<EC2_IP> << 'EOF'
  # Inspect container
  docker inspect mexc-sniper-blue
  
  # Check health endpoint
  curl -f http://localhost:8080/health
  
  # Check readiness endpoint
  curl -f http://localhost:8080/ready
EOF
```

---

## 7. CloudWatch Logs (Optional but Recommended)

### Install CloudWatch Agent
```bash
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@<EC2_IP> << 'EOF'
  # Install CloudWatch agent
  sudo yum install amazon-cloudwatch-agent -y
  
  # Create configuration
  sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
  
  # Start agent
  sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -s \
    -c file:/opt/aws/amazon-cloudwatch-agent/bin/config.json
EOF
```

### View CloudWatch Logs
```bash
# List log streams
aws logs describe-log-streams \
  --log-group-name /aws/ec2/mexc-sniper-bot \
  --region ap-southeast-1 \
  --output table

# Get recent logs
aws logs tail /aws/ec2/mexc-sniper-bot \
  --follow \
  --region ap-southeast-1
```

---

## 8. Manual Deployment Test

If automated deployment fails, try manual deployment:

```bash
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@<EC2_IP> << 'EOF'
  # Login to ECR
  aws ecr get-login-password --region ap-southeast-1 | \
    docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-southeast-1.amazonaws.com
  
  # Pull latest image
  docker pull <account-id>.dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest
  
  # Stop old container
  docker stop mexc-sniper-blue || true
  docker rm mexc-sniper-blue || true
  
  # Run new container
  # ⚠️ SECURITY: Replace placeholders with actual secrets
  # Never store credentials in shell history - use environment files
  docker run -d \
    --name mexc-sniper-blue \
    --restart unless-stopped \
    -p 8080:8080 \
    -e AWS_REGION=ap-southeast-1 \
    -e MEXC_API_KEY=<your-key> \
    -e MEXC_SECRET_KEY=<your-secret> \
    -e JWT_SECRET=<your-jwt-secret> \
    <account-id>.dkr.ecr.ap-southeast-1.amazonaws.com/mexc-sniper-rust:latest
  
  # Check container status
  docker ps
  
  # Test health endpoint
  sleep 5
  curl http://localhost:8080/health
EOF
```

---

## 9. Common Issues and Solutions

### Issue: "No space left on device"
**Solution:**
```bash
# Check disk usage
df -h

# Clean up Docker
docker system prune -af
docker volume prune -f

# Remove old images
docker image prune -af
```

### Issue: Container exits immediately
**Solution:**
```bash
# Check container logs for errors
docker logs mexc-sniper-blue

# Check environment variables
docker inspect mexc-sniper-blue | grep -A 20 Env

# Try running interactively for debugging
docker run -it --rm --entrypoint /bin/sh <image-name>
```

### Issue: Health check fails
**Solution:**
```bash
# Check if port is listening
netstat -tlnp | grep 8080

# Check application logs
docker logs mexc-sniper-blue

# Try curl from within container
docker exec mexc-sniper-blue curl http://localhost:8080/health

# Check firewall rules
sudo iptables -L -n
```

### Issue: ECR authentication fails
**Solution:**
```bash
# Check IAM role permissions
aws sts get-caller-identity

# Re-authenticate
aws ecr get-login-password --region ap-southeast-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-southeast-1.amazonaws.com

# Check ECR repository exists
aws ecr describe-repositories --region ap-southeast-1
```

---

## 10. GitHub Secrets Validation

Ensure these secrets are properly set in GitHub repository settings → Settings → Secrets and variables → Actions.

**Required Secrets:**
- `AWS_ACCESS_KEY_ID` - AWS access key with EC2, ECR permissions
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key
- `AWS_ACCOUNT_ID` - 12-digit AWS account ID
- `AWS_SSH_PRIVATE_KEY` - Private SSH key for EC2 (PEM format)
- `AWS_EC2_IP` - Public IP address of EC2 instance
- `MEXC_API_KEY` - MEXC exchange API key
- `MEXC_SECRET_KEY` - MEXC exchange secret key
- `JWT_SECRET` - Secret for JWT token generation

**⚠️ NEVER** print, log, or commit these secrets to version control.

---

## 11. Emergency Rollback

If deployment fails and automatic rollback doesn't work:

```bash
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@<EC2_IP> << 'EOF'
  # Stop failed blue container
  docker stop mexc-sniper-blue 2>/dev/null || true
  docker rm mexc-sniper-blue 2>/dev/null || true
  
  # Restore green container (previous version)
  if docker ps -a --format '{{.Names}}' | grep -q '^mexc-sniper-green$'; then
    docker rename mexc-sniper-green mexc-sniper-blue
    docker start mexc-sniper-blue
    echo "Rollback completed"
  else
    echo "No previous version found - manual intervention required"
  fi
  
  # Verify rollback
  docker ps
  curl http://localhost:8080/health
EOF
```

---

## 12. Monitoring and Alerts

### Set Up CloudWatch Alarms

```bash
# CPU utilization alarm
aws cloudwatch put-metric-alarm \
  --alarm-name mexc-sniper-high-cpu \
  --alarm-description "Alert when CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --dimensions Name=InstanceId,Value=<instance-id> \
  --region ap-southeast-1

# Status check alarm
aws cloudwatch put-metric-alarm \
  --alarm-name mexc-sniper-status-check \
  --alarm-description "Alert on instance status check failure" \
  --metric-name StatusCheckFailed \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 2 \
  --dimensions Name=InstanceId,Value=<instance-id> \
  --region ap-southeast-1
```

---

## Support and Resources

- **AWS Documentation:** https://docs.aws.amazon.com/ec2/
- **Docker Documentation:** https://docs.docker.com/
- **GitHub Actions:** https://docs.github.com/en/actions
- **MEXC API:** https://mexcdevelop.github.io/apidocs/

---

## Contact

For issues not covered in this guide:
1. Check GitHub Actions workflow logs
2. Review CloudWatch logs (if configured)
3. Check Docker container logs on EC2
4. Create a GitHub issue with detailed error logs
