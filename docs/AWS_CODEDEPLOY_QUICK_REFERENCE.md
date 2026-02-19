# AWS CodeDeploy Quick Reference

Quick reference for AWS CodeDeploy continuous deployment setup for EC2 (Osaka region).

## 📋 Required Information Checklist

Before starting, gather this information:

- [ ] **AWS Account ID**: `____________`
- [ ] **S3 Bucket Name**: `mexc-sniper-bot-deployments-osaka` (or your choice)
- [ ] **EC2 Instance ID**: `i-____________`
- [ ] **EC2 Public IP**: `____________`
- [ ] **SSH Key Pair Name**: `____________`
- [ ] **GitHub Access Key ID**: `AKIA____________`
- [ ] **GitHub Secret Access Key**: `____________`

## ⚡ Quick Setup Commands

### 1. Environment Setup

```bash
export AWS_REGION=ap-northeast-3
export BUCKET_NAME="mexc-sniper-bot-deployments-osaka"
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

### 2. Create S3 Bucket

```bash
aws s3 mb s3://$BUCKET_NAME --region $AWS_REGION
aws s3api put-bucket-versioning \
  --bucket $BUCKET_NAME \
  --versioning-configuration Status=Enabled \
  --region $AWS_REGION
```

### 3. Create IAM Resources

```bash
# GitHub Actions User
aws iam create-user --user-name github-actions-deployer
aws iam create-access-key --user-name github-actions-deployer

# EC2 Role
aws iam create-role \
  --role-name EC2CodeDeployRole \
  --assume-role-policy-document file://ec2-role-trust-policy.json

aws iam attach-role-policy \
  --role-name EC2CodeDeployRole \
  --policy-arn "arn:aws:iam::aws:policy/AmazonEC2RoleforAWSCodeDeploy"

# Instance Profile
aws iam create-instance-profile --instance-profile-name EC2CodeDeployInstanceProfile
aws iam add-role-to-instance-profile \
  --instance-profile-name EC2CodeDeployInstanceProfile \
  --role-name EC2CodeDeployRole
```

### 4. Install CodeDeploy Agent on EC2

```bash
# SSH into EC2 and run:
sudo yum update -y
sudo yum install -y ruby wget
cd /home/ec2-user
wget https://aws-codedeploy-ap-northeast-3.s3.ap-northeast-3.amazonaws.com/latest/install
chmod +x ./install
sudo ./install auto
sudo service codedeploy-agent start
sudo systemctl enable codedeploy-agent
```

### 5. Create CodeDeploy Application

```bash
# CodeDeploy Application
aws deploy create-application \
  --application-name mexc-sniper-bot \
  --compute-platform Server \
  --region $AWS_REGION

# Service Role
aws iam create-role \
  --role-name CodeDeployServiceRole \
  --assume-role-policy-document file://codedeploy-trust-policy.json

aws iam attach-role-policy \
  --role-name CodeDeployServiceRole \
  --policy-arn "arn:aws:iam::aws:policy/AWSCodeDeployRole"

# Deployment Group
CODEDEPLOY_ROLE_ARN=$(aws iam get-role --role-name CodeDeployServiceRole --query 'Role.Arn' --output text)

aws deploy create-deployment-group \
  --application-name mexc-sniper-bot \
  --deployment-group-name mexc-sniper-bot-deployment-group \
  --service-role-arn $CODEDEPLOY_ROLE_ARN \
  --ec2-tag-filters Key=Application,Value=mexc-sniper-bot,Type=KEY_AND_VALUE \
  --deployment-config-name CodeDeployDefault.OneAtATime \
  --region $AWS_REGION
```

### 6. GitHub Secrets

```bash
gh secret set AWS_ACCESS_KEY_ID --body "your-access-key"
gh secret set AWS_SECRET_ACCESS_KEY --body "your-secret-key"
gh secret set AWS_S3_BUCKET --body "$BUCKET_NAME"
```

## 🔍 Verification Commands

### Check CodeDeploy Agent Status

```bash
sudo service codedeploy-agent status
```

### View Deployment Logs

```bash
sudo tail -f /var/log/aws/codedeploy-agent/codedeploy-agent.log
```

### Check Application Status

```bash
pm2 status
pm2 logs mexc-sniper-bot
```

### List Recent Deployments

```bash
aws deploy list-deployments \
  --application-name mexc-sniper-bot \
  --deployment-group-name mexc-sniper-bot-deployment-group \
  --region ap-northeast-3
```

### Get Deployment Details

```bash
aws deploy get-deployment \
  --deployment-id d-XXXXXXXXX \
  --region ap-northeast-3
```

## 🚀 Deployment Workflow

1. **Commit & Push** → `git push origin main`
2. **GitHub Actions** → Triggers automatically
3. **Build Package** → Creates deployment.zip
4. **Upload to S3** → Stores in Osaka bucket
5. **CodeDeploy** → Pulls from S3 and deploys to EC2
6. **Hooks Execute**:
   - BeforeInstall → Prepare environment
   - AfterInstall → Install deps & build
   - ApplicationStop → Stop current app
   - ApplicationStart → Start with PM2
   - ValidateService → Verify running
7. **Notification** → GitHub issue created

## 🐛 Quick Troubleshooting

### Agent Not Running
```bash
sudo service codedeploy-agent start
sudo systemctl enable codedeploy-agent
```

### Deployment Failed
```bash
# Check logs
sudo tail -100 /var/log/aws/codedeploy-agent/codedeploy-agent.log

# Run script manually
cd /home/ec2-user/mexc-sniper-bot
bash scripts/codedeploy/after_install.sh
```

### Application Won't Start
```bash
pm2 logs mexc-sniper-bot
pm2 restart mexc-sniper-bot
```

### S3 Access Issues
```bash
# Test from EC2
aws s3 ls s3://$BUCKET_NAME/ --region ap-northeast-3
```

## 📝 IAM Policies Reference

### GitHub Actions Policy (Minimal Permissions)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::BUCKET_NAME/*", "arn:aws:s3:::BUCKET_NAME"]
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
      "Resource": ["arn:aws:codedeploy:ap-northeast-3:*:*"]
    }
  ]
}
```

### EC2 S3 Access Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::BUCKET_NAME/*", "arn:aws:s3:::BUCKET_NAME"]
    }
  ]
}
```

## 🏷️ EC2 Tags Required

Ensure your EC2 instance has these tags:

```
Key: Application
Value: mexc-sniper-bot
```

Tag your instance:
```bash
aws ec2 create-tags \
  --resources i-XXXXXXXXX \
  --tags Key=Application,Value=mexc-sniper-bot \
  --region ap-northeast-3
```

## 📊 Cost Estimate

| Service | Usage | Estimated Monthly Cost |
|---------|-------|----------------------|
| EC2 t3.micro | 24/7 | ~$7.50 |
| S3 Storage (10 GB) | Deployments | ~$0.25 |
| CodeDeploy | Deployments | Free |
| Data Transfer | Outbound | ~$0.50 |
| **Total** | | **~$8.25/month** |

## 🔗 Quick Links

- [Full Setup Guide](./AWS_CODEDEPLOY_SETUP.md)
- [AWS CodeDeploy Console](https://ap-northeast-3.console.aws.amazon.com/codesuite/codedeploy/applications)
- [EC2 Console (Osaka)](https://ap-northeast-3.console.aws.amazon.com/ec2/)
- [S3 Console](https://s3.console.aws.amazon.com/)
- [IAM Console](https://console.aws.amazon.com/iam/)

## 📞 Getting Help

1. Check [AWS_CODEDEPLOY_SETUP.md](./AWS_CODEDEPLOY_SETUP.md) for detailed troubleshooting
2. Review CloudWatch logs
3. Check CodeDeploy deployment history
4. Verify IAM permissions
5. Open GitHub issue if problems persist
