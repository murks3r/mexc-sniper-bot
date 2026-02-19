# AWS CodeDeploy Setup Guide for EC2 (Osaka Region)

This guide provides complete instructions for setting up AWS CodeDeploy continuous deployment from GitHub Actions to an EC2 instance in the Osaka region (ap-northeast-3).

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [AWS Infrastructure Setup](#aws-infrastructure-setup)
4. [GitHub Secrets Configuration](#github-secrets-configuration)
5. [Deployment Workflow](#deployment-workflow)
6. [Troubleshooting](#troubleshooting)

## Overview

This setup implements continuous deployment following the guide at https://www.fastfwd.com/continuous-deployment-github-aws-ec2-using-aws-codedeploy/

**Architecture:**
```
GitHub Actions → S3 (Osaka) → AWS CodeDeploy → EC2 Instance (Osaka)
```

**Key Components:**
- **GitHub Actions**: Triggers deployment on push to main branch
- **AWS S3**: Stores deployment artifacts
- **AWS CodeDeploy**: Manages deployment lifecycle
- **EC2 Instance**: Hosts the application in Osaka (ap-northeast-3)

## Prerequisites

- AWS Account with administrative access
- GitHub repository access
- Basic understanding of AWS services (IAM, EC2, S3, CodeDeploy)
- EC2 instance running Amazon Linux 2 or similar

## AWS Infrastructure Setup

### 1. Create S3 Bucket for Deployments

The S3 bucket must be in the **ap-northeast-3 (Osaka)** region.

```bash
# Set region
export AWS_REGION=ap-northeast-3

# Create S3 bucket (replace with your bucket name)
export BUCKET_NAME="mexc-sniper-bot-deployments-osaka"
aws s3 mb s3://$BUCKET_NAME --region $AWS_REGION

# Enable versioning (recommended)
aws s3api put-bucket-versioning \
  --bucket $BUCKET_NAME \
  --versioning-configuration Status=Enabled \
  --region $AWS_REGION

# Set lifecycle policy to clean up old deployments (optional)
cat > lifecycle-policy.json << 'EOF'
{
  "Rules": [
    {
      "Id": "DeleteOldDeployments",
      "Status": "Enabled",
      "ExpirationInDays": 30,
      "NoncurrentVersionExpirationInDays": 7
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket $BUCKET_NAME \
  --lifecycle-configuration file://lifecycle-policy.json \
  --region $AWS_REGION
```

**Required Information:**
- Bucket Name: `<your-bucket-name>` (needed for GitHub Secrets)

---

### 2. Create IAM User for GitHub Actions

This user needs permissions to upload to S3 and trigger CodeDeploy deployments.

**Step 1: Create IAM user**

```bash
# Create IAM user
aws iam create-user --user-name github-actions-deployer

# Create access key for the user
aws iam create-access-key --user-name github-actions-deployer
```

**Note:** Save the `AccessKeyId` and `SecretAccessKey` from the output - you'll need these for GitHub Secrets.

**Step 2: Create IAM policy for GitHub Actions user**

Create file `github-actions-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::mexc-sniper-bot-deployments-osaka/*",
        "arn:aws:s3:::mexc-sniper-bot-deployments-osaka"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "codedeploy:CreateDeployment",
        "codedeploy:GetDeployment",
        "codedeploy:GetDeploymentConfig",
        "codedeploy:GetApplicationRevision",
        "codedeploy:RegisterApplicationRevision"
      ],
      "Resource": [
        "arn:aws:codedeploy:ap-northeast-3:*:application:mexc-sniper-bot",
        "arn:aws:codedeploy:ap-northeast-3:*:deploymentgroup:mexc-sniper-bot/*",
        "arn:aws:codedeploy:ap-northeast-3:*:deploymentconfig:*"
      ]
    }
  ]
}
```

**Apply the policy:**

```bash
# Create policy
aws iam create-policy \
  --policy-name GitHubActionsCodeDeployPolicy \
  --policy-document file://github-actions-policy.json

# Attach policy to user (replace ACCOUNT_ID with your AWS account ID)
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws iam attach-user-policy \
  --user-name github-actions-deployer \
  --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/GitHubActionsCodeDeployPolicy"
```

---

### 3. Create IAM Role for EC2 Instance

The EC2 instance needs permissions to download from S3 and interact with CodeDeploy.

**Step 1: Create trust policy**

File already exists in the repository: `ec2-role-trust-policy.json`

**Step 2: Create the role**

```bash
# Create EC2 role
aws iam create-role \
  --role-name EC2CodeDeployRole \
  --assume-role-policy-document file://ec2-role-trust-policy.json

# Attach AWS managed policy for CodeDeploy
aws iam attach-role-policy \
  --role-name EC2CodeDeployRole \
  --policy-arn "arn:aws:iam::aws:policy/AmazonEC2RoleforAWSCodeDeploy"

# Attach AWS managed policy for SSM (optional, for Systems Manager access)
aws iam attach-role-policy \
  --role-name EC2CodeDeployRole \
  --policy-arn "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
```

**Step 3: Create S3 access policy for EC2**

Create file `ec2-s3-access-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::mexc-sniper-bot-deployments-osaka/*",
        "arn:aws:s3:::mexc-sniper-bot-deployments-osaka"
      ]
    }
  ]
}
```

```bash
# Create and attach S3 policy
aws iam create-policy \
  --policy-name EC2CodeDeployS3Access \
  --policy-document file://ec2-s3-access-policy.json

aws iam attach-role-policy \
  --role-name EC2CodeDeployRole \
  --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/EC2CodeDeployS3Access"
```

**Step 4: Create instance profile**

```bash
# Create instance profile
aws iam create-instance-profile \
  --instance-profile-name EC2CodeDeployInstanceProfile

# Add role to instance profile
aws iam add-role-to-instance-profile \
  --instance-profile-name EC2CodeDeployInstanceProfile \
  --role-name EC2CodeDeployRole
```

---

### 4. Launch and Configure EC2 Instance

**Step 1: Launch EC2 instance**

```bash
# Launch instance in Osaka region with the IAM role
aws ec2 run-instances \
  --image-id ami-xxxxxxxxx \  # Use Amazon Linux 2 AMI for ap-northeast-3
  --instance-type t3.micro \
  --key-name your-key-pair \
  --security-group-ids sg-xxxxxxxxx \
  --subnet-id subnet-xxxxxxxxx \
  --iam-instance-profile Name=EC2CodeDeployInstanceProfile \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=mexc-sniper-bot-server},{Key=Application,Value=mexc-sniper-bot}]' \
  --region ap-northeast-3
```

**Required AMI for Osaka (ap-northeast-3):**
- Find the latest Amazon Linux 2 AMI:
  ```bash
  aws ec2 describe-images \
    --owners amazon \
    --filters "Name=name,Values=amzn2-ami-hvm-*-x86_64-gp2" \
    --query 'Images[0].ImageId' \
    --region ap-northeast-3 \
    --output text
  ```

**Step 2: Configure Security Group**

Ensure your security group allows:
- **Inbound**: Port 3008 (application), Port 22 (SSH), Port 443 (HTTPS)
- **Outbound**: All traffic (to download dependencies)

```bash
# Add inbound rule for application port
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxxx \
  --protocol tcp \
  --port 3008 \
  --cidr 0.0.0.0/0 \
  --region ap-northeast-3
```

**Step 3: Install CodeDeploy Agent on EC2**

SSH into your EC2 instance and run:

```bash
# Update system
sudo yum update -y

# Install CodeDeploy agent
sudo yum install -y ruby wget

cd /home/ec2-user
wget https://aws-codedeploy-ap-northeast-3.s3.ap-northeast-3.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto

# Verify installation
sudo service codedeploy-agent status

# Enable auto-start on boot
sudo systemctl enable codedeploy-agent
```

**Step 4: Install Node.js and dependencies**

The deployment scripts will handle this, but you can pre-install:

```bash
# Install Node.js 20.x
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Install Bun
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="/home/ec2-user/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
echo 'export BUN_INSTALL="/home/ec2-user/.bun"' >> ~/.bashrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc

# Install PM2 globally
npm install -g pm2

# Set up PM2 to start on boot
pm2 startup systemd -u ec2-user --hp /home/ec2-user
```

---

### 5. Create CodeDeploy Application and Deployment Group

**Step 1: Create CodeDeploy application**

```bash
aws deploy create-application \
  --application-name mexc-sniper-bot \
  --compute-platform Server \
  --region ap-northeast-3
```

**Step 2: Create service role for CodeDeploy**

Create file `codedeploy-trust-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "codedeploy.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

```bash
# Create role
aws iam create-role \
  --role-name CodeDeployServiceRole \
  --assume-role-policy-document file://codedeploy-trust-policy.json

# Attach AWS managed policy
aws iam attach-role-policy \
  --role-name CodeDeployServiceRole \
  --policy-arn "arn:aws:iam::aws:policy/AWSCodeDeployRole"
```

**Step 3: Create deployment group**

```bash
# Get the role ARN
export CODEDEPLOY_ROLE_ARN=$(aws iam get-role \
  --role-name CodeDeployServiceRole \
  --query 'Role.Arn' \
  --output text)

# Create deployment group
aws deploy create-deployment-group \
  --application-name mexc-sniper-bot \
  --deployment-group-name mexc-sniper-bot-deployment-group \
  --service-role-arn $CODEDEPLOY_ROLE_ARN \
  --ec2-tag-filters Key=Application,Value=mexc-sniper-bot,Type=KEY_AND_VALUE \
  --deployment-config-name CodeDeployDefault.OneAtATime \
  --region ap-northeast-3
```

**Deployment Group Configuration:**
- **Name**: `mexc-sniper-bot-deployment-group`
- **EC2 Tag Filter**: `Application=mexc-sniper-bot`
- **Deployment Config**: `CodeDeployDefault.OneAtATime` (deploys to one instance at a time)

---

### 6. Configure Environment Variables on EC2

Create `.env.local` file on your EC2 instance:

```bash
# SSH into EC2
ssh -i your-key.pem ec2-user@your-ec2-ip

# Create .env.local file
cat > /home/ec2-user/mexc-sniper-bot/.env.local << 'EOF'
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_key
CLERK_SECRET_KEY=your_clerk_secret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key

# Database
DATABASE_URL=your_database_url

# MEXC API
MEXC_API_KEY=your_mexc_api_key
MEXC_SECRET_KEY=your_mexc_secret_key

# Optional
INNGEST_SIGNING_KEY=your_inngest_signing_key
INNGEST_EVENT_KEY=your_inngest_event_key
EOF

# Secure the file
chmod 600 /home/ec2-user/mexc-sniper-bot/.env.local
```

**Security Best Practice**: Use AWS Secrets Manager or Systems Manager Parameter Store for production secrets.

---

## GitHub Secrets Configuration

Add the following secrets to your GitHub repository:

**Navigate to:** Repository → Settings → Secrets and variables → Actions → New repository secret

| Secret Name | Description | Example Value |
|------------|-------------|---------------|
| `AWS_ACCESS_KEY_ID` | Access key for github-actions-deployer IAM user | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | Secret key for github-actions-deployer IAM user | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_S3_BUCKET` | S3 bucket name for deployments | `mexc-sniper-bot-deployments-osaka` |

**How to add secrets:**

```bash
# Using GitHub CLI
gh secret set AWS_ACCESS_KEY_ID --body "your-access-key-id"
gh secret set AWS_SECRET_ACCESS_KEY --body "your-secret-access-key"
gh secret set AWS_S3_BUCKET --body "mexc-sniper-bot-deployments-osaka"
```

Or manually via GitHub UI:
1. Go to your repository on GitHub
2. Click Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Enter name and value
5. Click "Add secret"

---

## Deployment Workflow

### Automatic Deployment

The deployment workflow automatically triggers on:
- **Push to main branch**: Deploys to production
- **Manual trigger**: Via GitHub Actions UI

### Deployment Process

1. **GitHub Actions** detects push to main branch
2. **Package Creation**: Creates deployment ZIP excluding unnecessary files
3. **S3 Upload**: Uploads package to S3 bucket in Osaka
4. **CodeDeploy Trigger**: Creates deployment in CodeDeploy
5. **EC2 Deployment**: CodeDeploy agent on EC2 executes deployment hooks:
   - `BeforeInstall`: Prepares environment
   - `AfterInstall`: Installs dependencies and builds application
   - `ApplicationStop`: Stops running application
   - `ApplicationStart`: Starts application with PM2
   - `ValidateService`: Verifies application is running
6. **Notification**: Creates GitHub issue with deployment status

### Manual Deployment

Trigger manual deployment via GitHub Actions:

```bash
# Using GitHub CLI
gh workflow run deploy-ec2-codedeploy.yml

# Or via GitHub UI
Actions → Deploy to EC2 via CodeDeploy → Run workflow
```

---

## Monitoring and Logs

### CodeDeploy Logs on EC2

```bash
# CodeDeploy agent logs
sudo tail -f /var/log/aws/codedeploy-agent/codedeploy-agent.log

# Deployment logs
sudo tail -f /opt/codedeploy-agent/deployment-root/deployment-logs/codedeploy-agent-deployments.log

# Script execution logs
sudo ls -la /opt/codedeploy-agent/deployment-root/
```

### Application Logs

```bash
# PM2 logs
pm2 logs mexc-sniper-bot

# PM2 status
pm2 status

# Application errors
pm2 logs mexc-sniper-bot --err
```

### AWS Console Monitoring

1. **CodeDeploy Console**: 
   - Navigate to: CodeDeploy → Applications → mexc-sniper-bot
   - View deployment history and status

2. **CloudWatch Logs**:
   - Set up CloudWatch agent for application logs (optional)

3. **EC2 Instance Monitoring**:
   - Navigate to: EC2 → Instances
   - View instance metrics and status

---

## Troubleshooting

### Common Issues

#### 1. CodeDeploy Agent Not Running

```bash
# Check status
sudo service codedeploy-agent status

# Start agent
sudo service codedeploy-agent start

# Enable on boot
sudo systemctl enable codedeploy-agent
```

#### 2. Deployment Fails at AfterInstall

**Possible causes:**
- Missing dependencies
- Build errors
- Database connection issues

**Debug:**
```bash
# Check deployment logs
sudo tail -100 /var/log/aws/codedeploy-agent/codedeploy-agent.log

# Run deployment script manually
cd /home/ec2-user/mexc-sniper-bot
bash scripts/codedeploy/after_install.sh
```

#### 3. Application Not Starting

```bash
# Check PM2 status
pm2 status

# Check application logs
pm2 logs mexc-sniper-bot

# Try starting manually
cd /home/ec2-user/mexc-sniper-bot
pm2 start npm --name "mexc-sniper-bot" -- run start
```

#### 4. S3 Access Denied

**Verify:**
- EC2 instance has correct IAM role
- S3 bucket policy allows EC2 role
- Bucket is in correct region (ap-northeast-3)

```bash
# Test S3 access from EC2
aws s3 ls s3://mexc-sniper-bot-deployments-osaka/ --region ap-northeast-3
```

#### 5. GitHub Actions Deployment Fails

**Check:**
- GitHub Secrets are correctly configured
- IAM user has necessary permissions
- AWS region is set to ap-northeast-3

---

## Security Considerations

1. **Secrets Management**:
   - Never commit secrets to Git
   - Use AWS Secrets Manager for production
   - Rotate access keys regularly

2. **IAM Permissions**:
   - Follow principle of least privilege
   - Use separate IAM users for different purposes
   - Enable MFA for AWS accounts

3. **Network Security**:
   - Restrict EC2 security group rules
   - Use VPC and subnets appropriately
   - Consider using Application Load Balancer

4. **Application Security**:
   - Keep dependencies updated
   - Run security scans
   - Use HTTPS for production

---

## Rollback Procedure

### Automatic Rollback

CodeDeploy supports automatic rollback on deployment failure.

Configure in deployment group:
```bash
aws deploy update-deployment-group \
  --application-name mexc-sniper-bot \
  --current-deployment-group-name mexc-sniper-bot-deployment-group \
  --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE \
  --region ap-northeast-3
```

### Manual Rollback

```bash
# List recent deployments
aws deploy list-deployments \
  --application-name mexc-sniper-bot \
  --deployment-group-name mexc-sniper-bot-deployment-group \
  --region ap-northeast-3

# Stop current deployment
aws deploy stop-deployment \
  --deployment-id d-XXXXXXXXX \
  --auto-rollback-enabled \
  --region ap-northeast-3
```

---

## Cost Optimization

1. **S3 Lifecycle Policies**: Automatically delete old deployments
2. **EC2 Instance Type**: Use appropriate instance size (t3.micro for development)
3. **Reserved Instances**: Consider for long-term production use
4. **Stop instances**: When not in use (development/testing)

---

## Next Steps

After completing this setup:

1. ✅ Test deployment by pushing to main branch
2. ✅ Monitor first deployment in CodeDeploy console
3. ✅ Verify application is accessible on EC2 instance
4. ✅ Set up CloudWatch alarms for monitoring
5. ✅ Configure domain and SSL certificate (optional)
6. ✅ Set up database backups
7. ✅ Document any custom configurations

---

## Additional Resources

- [AWS CodeDeploy Documentation](https://docs.aws.amazon.com/codedeploy/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Original Guide](https://www.fastfwd.com/continuous-deployment-github-aws-ec2-using-aws-codedeploy/)

---

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review AWS CodeDeploy logs
3. Check GitHub Actions workflow logs
4. Open an issue in the repository
