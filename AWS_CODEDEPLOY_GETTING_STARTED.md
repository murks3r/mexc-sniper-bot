# AWS CodeDeploy Setup - Getting Started Checklist

This checklist will guide you through deploying your MEXC Sniper Bot to EC2 using AWS CodeDeploy.

## 📋 Before You Begin

Required tools and access:
- [ ] AWS Account with admin access
- [ ] GitHub repository admin access
- [ ] AWS CLI installed: `aws --version`
- [ ] GitHub CLI installed (optional): `gh --version`
- [ ] SSH client for EC2 access

## Phase 1: Information Gathering (5 minutes)

Gather this information before starting:

- [ ] **AWS Account ID**: `____________`
- [ ] **Desired S3 Bucket Name**: `mexc-sniper-bot-deployments-osaka` (or customize)
- [ ] **SSH Key Pair Name**: `____________` (or create new)
- [ ] **Preferred EC2 Instance Type**: `t3.micro` (recommended for start)

## Phase 2: AWS Infrastructure Setup (60-90 minutes)

### Step 1: Create S3 Bucket

```bash
export AWS_REGION=ap-northeast-3
export BUCKET_NAME="mexc-sniper-bot-deployments-osaka"
aws s3 mb s3://$BUCKET_NAME --region $AWS_REGION
```

- [ ] S3 bucket created in Osaka region
- [ ] Versioning enabled (optional but recommended)
- [ ] Note bucket name: `____________`

### Step 2: Create GitHub Actions IAM User

```bash
aws iam create-user --user-name github-actions-deployer
aws iam create-access-key --user-name github-actions-deployer
```

**⚠️ SAVE THESE CREDENTIALS IMMEDIATELY:**
- [ ] Access Key ID: `____________`
- [ ] Secret Access Key: `____________`

```bash
# Apply policy
aws iam create-policy \
  --policy-name GitHubActionsCodeDeployPolicy \
  --policy-document file://github-actions-policy.json

# Get account ID
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Attach policy
aws iam attach-user-policy \
  --user-name github-actions-deployer \
  --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/GitHubActionsCodeDeployPolicy"
```

- [ ] IAM user created
- [ ] Policy attached
- [ ] Credentials saved securely

### Step 3: Create EC2 IAM Role

```bash
# Create role
aws iam create-role \
  --role-name EC2CodeDeployRole \
  --assume-role-policy-document file://ec2-role-trust-policy.json

# Attach managed policy
aws iam attach-role-policy \
  --role-name EC2CodeDeployRole \
  --policy-arn "arn:aws:iam::aws:policy/AmazonEC2RoleforAWSCodeDeploy"

# Create S3 access policy
aws iam create-policy \
  --policy-name EC2CodeDeployS3Access \
  --policy-document file://ec2-s3-access-policy.json

aws iam attach-role-policy \
  --role-name EC2CodeDeployRole \
  --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/EC2CodeDeployS3Access"

# Create instance profile
aws iam create-instance-profile \
  --instance-profile-name EC2CodeDeployInstanceProfile

aws iam add-role-to-instance-profile \
  --instance-profile-name EC2CodeDeployInstanceProfile \
  --role-name EC2CodeDeployRole
```

- [ ] EC2 role created
- [ ] Policies attached
- [ ] Instance profile created

### Step 4: Launch EC2 Instance

First, get the Amazon Linux 2 AMI for Osaka:

```bash
AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters "Name=name,Values=amzn2-ami-hvm-*-x86_64-gp2" \
  --query 'Images[0].ImageId' \
  --region ap-northeast-3 \
  --output text)
echo "AMI ID: $AMI_ID"
```

**⚠️ IMPORTANT**: Update these values with your own:
- Your SSH key pair name
- Your security group ID
- Your subnet ID

```bash
# Launch instance (customize security-group-ids and subnet-id)
aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t3.micro \
  --key-name YOUR-KEY-PAIR \
  --security-group-ids sg-XXXXXXXXX \
  --subnet-id subnet-XXXXXXXXX \
  --iam-instance-profile Name=EC2CodeDeployInstanceProfile \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=mexc-sniper-bot-server},{Key=Application,Value=mexc-sniper-bot}]' \
  --region ap-northeast-3
```

- [ ] EC2 instance launched
- [ ] Instance ID: `____________`
- [ ] Public IP: `____________`
- [ ] Security group allows ports: 22 (SSH), 3008 (app), 443 (HTTPS)

### Step 5: Install CodeDeploy Agent

SSH into your EC2 instance:

```bash
ssh -i YOUR-KEY.pem ec2-user@YOUR-EC2-IP
```

Then run on the EC2 instance:

```bash
# Update system
sudo yum update -y

# Install CodeDeploy agent
sudo yum install -y ruby wget
cd /home/ec2-user
wget https://aws-codedeploy-ap-northeast-3.s3.ap-northeast-3.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto

# Start and enable agent
sudo service codedeploy-agent start
sudo systemctl enable codedeploy-agent

# Verify
sudo service codedeploy-agent status
```

- [ ] CodeDeploy agent installed
- [ ] Agent is running
- [ ] Agent enabled on boot

### Step 6: Install Application Dependencies

Still on the EC2 instance:

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

# Install PM2
npm install -g pm2

# Set up PM2 to start on boot
pm2 startup systemd -u ec2-user --hp /home/ec2-user
```

- [ ] Node.js installed
- [ ] Bun installed
- [ ] PM2 installed
- [ ] PM2 startup configured

### Step 7: Create CodeDeploy Application

```bash
# Create CodeDeploy service role trust policy
cat > codedeploy-trust-policy.json << 'EOF'
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
EOF

# Create service role
aws iam create-role \
  --role-name CodeDeployServiceRole \
  --assume-role-policy-document file://codedeploy-trust-policy.json

aws iam attach-role-policy \
  --role-name CodeDeployServiceRole \
  --policy-arn "arn:aws:iam::aws:policy/AWSCodeDeployRole"

# Create application
aws deploy create-application \
  --application-name mexc-sniper-bot \
  --compute-platform Server \
  --region ap-northeast-3

# Get role ARN
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

- [ ] CodeDeploy service role created
- [ ] CodeDeploy application created
- [ ] Deployment group created

### Step 8: Configure Environment Variables on EC2

SSH into EC2 and create `.env.local`:

```bash
ssh -i YOUR-KEY.pem ec2-user@YOUR-EC2-IP

# Create directory
mkdir -p /home/ec2-user/mexc-sniper-bot

# Create .env.local file
nano /home/ec2-user/mexc-sniper-bot/.env.local
```

Add your environment variables:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_key
CLERK_SECRET_KEY=your_secret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_ROLE_KEY=your_key

# Database
DATABASE_URL=your_database_url

# MEXC API
MEXC_API_KEY=your_key
MEXC_SECRET_KEY=your_secret
```

```bash
# Secure the file
chmod 600 /home/ec2-user/mexc-sniper-bot/.env.local
```

- [ ] Environment variables configured
- [ ] File permissions set correctly

## Phase 3: GitHub Configuration (10-15 minutes)

### Step 9: Add GitHub Secrets

Go to your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

Add these three secrets:

```
Name: AWS_ACCESS_KEY_ID
Value: [Your access key from Step 2]

Name: AWS_SECRET_ACCESS_KEY
Value: [Your secret key from Step 2]

Name: AWS_S3_BUCKET
Value: mexc-sniper-bot-deployments-osaka (or your bucket name)
```

Or using GitHub CLI:

```bash
gh secret set AWS_ACCESS_KEY_ID --body "AKIA..."
gh secret set AWS_SECRET_ACCESS_KEY --body "..."
gh secret set AWS_S3_BUCKET --body "mexc-sniper-bot-deployments-osaka"
```

- [ ] AWS_ACCESS_KEY_ID added
- [ ] AWS_SECRET_ACCESS_KEY added
- [ ] AWS_S3_BUCKET added

### Step 10: Verify Secrets

```bash
gh secret list | grep AWS
```

Should show:
```
AWS_ACCESS_KEY_ID         Updated YYYY-MM-DD
AWS_SECRET_ACCESS_KEY     Updated YYYY-MM-DD
AWS_S3_BUCKET            Updated YYYY-MM-DD
```

- [ ] All secrets verified

## Phase 4: First Deployment (15-30 minutes)

### Step 11: Trigger Deployment

Push to main branch:

```bash
git add .
git commit -m "Test deployment"
git push origin main
```

Or trigger manually:

```bash
gh workflow run deploy-ec2-codedeploy.yml
```

- [ ] Deployment triggered

### Step 12: Monitor Deployment

**GitHub Actions:**
- [ ] Go to: Repository → Actions
- [ ] Watch workflow progress
- [ ] Check for errors

**AWS CodeDeploy Console:**
- [ ] Visit: https://ap-northeast-3.console.aws.amazon.com/codesuite/codedeploy/applications
- [ ] Select: mexc-sniper-bot
- [ ] Monitor deployment status

**EC2 Logs (SSH into instance):**

```bash
# Watch CodeDeploy agent logs
sudo tail -f /var/log/aws/codedeploy-agent/codedeploy-agent.log

# Check PM2 status
pm2 status

# View application logs
pm2 logs mexc-sniper-bot
```

- [ ] Deployment successful
- [ ] Application running

### Step 13: Verify Application

Test the application:

```bash
# From your EC2 instance
curl http://localhost:3008

# From your browser (if security group allows)
http://YOUR-EC2-PUBLIC-IP:3008
```

- [ ] Application responding
- [ ] Home page loads
- [ ] No errors in logs

## Phase 5: Production Readiness (Optional, 30-60 minutes)

### Step 14: Set Up Domain (Optional)

If you want a custom domain:

- [ ] Register/configure domain
- [ ] Point DNS to EC2 IP
- [ ] Set up SSL certificate
- [ ] Configure HTTPS

### Step 15: Set Up Monitoring

- [ ] CloudWatch alarms configured
- [ ] Error notifications set up
- [ ] Log aggregation configured

### Step 16: Configure Backups

- [ ] Database backup schedule
- [ ] S3 versioning enabled
- [ ] Disaster recovery plan documented

## 🎉 Success Criteria

Your setup is complete when:

- [x] All AWS infrastructure created
- [x] GitHub Secrets configured
- [x] First deployment successful
- [x] Application accessible and working
- [x] No errors in logs
- [x] PM2 showing application running
- [x] Automatic deployments working

## 📚 Reference Documentation

- **Start Here**: [docs/AWS_CODEDEPLOY_INDEX.md](docs/AWS_CODEDEPLOY_INDEX.md)
- **Detailed Setup**: [docs/AWS_CODEDEPLOY_SETUP.md](docs/AWS_CODEDEPLOY_SETUP.md)
- **Quick Commands**: [docs/AWS_CODEDEPLOY_QUICK_REFERENCE.md](docs/AWS_CODEDEPLOY_QUICK_REFERENCE.md)
- **GitHub Secrets**: [docs/AWS_CODEDEPLOY_GITHUB_SECRETS.md](docs/AWS_CODEDEPLOY_GITHUB_SECRETS.md)

## 🆘 Troubleshooting

### CodeDeploy Agent Issues

```bash
sudo service codedeploy-agent status
sudo service codedeploy-agent start
sudo tail -100 /var/log/aws/codedeploy-agent/codedeploy-agent.log
```

### Application Issues

```bash
pm2 status
pm2 logs mexc-sniper-bot --lines 100
pm2 restart mexc-sniper-bot
```

### S3 Access Issues

```bash
aws s3 ls s3://mexc-sniper-bot-deployments-osaka/ --region ap-northeast-3
```

## ✅ Post-Setup Checklist

After successful deployment:

- [ ] Document your specific configuration
- [ ] Save all AWS resource IDs
- [ ] Backup your environment variables
- [ ] Test rollback procedure
- [ ] Set up monitoring alerts
- [ ] Schedule regular maintenance
- [ ] Document custom procedures

## 🎊 Congratulations!

You now have a fully automated continuous deployment pipeline!

Every push to the main branch will automatically:
1. Build your application
2. Upload to S3
3. Deploy to EC2
4. Restart with zero downtime
5. Notify you via GitHub issues

---

**Need Help?**
- Check [Troubleshooting Guide](docs/AWS_CODEDEPLOY_SETUP.md#troubleshooting)
- Review AWS CloudWatch logs
- Check CodeDeploy deployment history
- Open a GitHub issue
