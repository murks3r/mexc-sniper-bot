# 🚀 Complete Deployment Guide - MEXC Sniper Bot

## Overview

This guide provides complete instructions for deploying the MEXC Sniper Bot application with both **Frontend (Vercel)** and **Backend (AWS EC2)** fully functional.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Browser                         │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│              Frontend (Vercel)                          │
│         Next.js + API Routes                            │
│         - UI Components                                 │
│         - Next.js API endpoints                         │
└────────────────┬────────────────────────────────────────┘
                 │ NEXT_PUBLIC_API_URL
                 │ (http://EC2_IP:8080)
                 ▼
┌─────────────────────────────────────────────────────────┐
│         Rust Backend (AWS EC2)                          │
│         High-Performance Trading Engine                 │
│         - Axum Web Framework                            │
│         - MEXC API Integration                          │
│         - DynamoDB Storage                              │
│         Port: 8080                                      │
└────────────────┬────────────────────────────────────────┘
                 │
                 ├─────────────┬──────────────┐
                 ▼             ▼              ▼
        ┌─────────────┐  ┌──────────┐  ┌──────────┐
        │   DynamoDB  │  │   MEXC   │  │  ECR     │
        │   Database  │  │   API    │  │  Docker  │
        └─────────────┘  └──────────┘  └──────────┘
```

## Prerequisites

Before starting deployment, ensure you have:

### Required Accounts & Access
- [ ] AWS Account with admin access
- [ ] Vercel Account
- [ ] MEXC Account with API access
- [ ] GitHub Repository access

### Required Tools
- [ ] AWS CLI v2 installed and configured
- [ ] `openssl` for generating secrets
- [ ] SSH client for EC2 access

## Deployment Steps

### Phase 1: AWS Infrastructure Setup

#### 1.1 Create EC2 Instance (if not exists)

```bash
# Check if EC2 instance exists
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=mexc-sniper-bot" \
  --region ap-southeast-1

# If not exists, create one:
# - Instance Type: t3.medium or better
# - AMI: Amazon Linux 2023
# - Security Group: Allow ports 22 (SSH), 8080 (API)
# - Key Pair: Create and save as ~/.ssh/mexc-sniper-key.pem
```

#### 1.2 Create DynamoDB Table

```bash
# Run the setup script
bash scripts/setup-dynamodb.sh

# Or manually:
aws dynamodb create-table \
  --table-name mexc_trading_data \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region ap-southeast-1
```

#### 1.3 Create ECR Repository

```bash
aws ecr describe-repositories \
  --repository-names mexc-sniper-rust \
  --region ap-southeast-1 \
  || aws ecr create-repository \
    --repository-name mexc-sniper-rust \
    --region ap-southeast-1
```

#### 1.4 Get AWS Credentials

```bash
# Get AWS Account ID
aws sts get-caller-identity --query Account --output text

# Create Access Keys (if needed)
# Go to: AWS Console → IAM → Users → [Your User] → Security credentials → Create access key
# Save both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY immediately!

# Get EC2 Public IP
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=mexc-sniper-bot" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --region ap-southeast-1 \
  --output text

# Get SSH Private Key
cat ~/.ssh/mexc-sniper-key.pem
```

### Phase 2: MEXC API Setup

#### 2.1 Create MEXC API Keys

1. Login to [mexc.com](https://www.mexc.com)
2. Go to **Account** → **API Management**
3. Click **Create API Key**
4. **Save immediately** (shown only once):
   - API Key (Access Key)
   - Secret Key

⚠️ **IMPORTANT**: 
- The Secret Key is shown only once!
- Copy and save it immediately in a secure location
- Configure IP whitelist for security (recommended)

### Phase 3: GitHub Secrets Configuration

Go to: **GitHub Repository** → **Settings** → **Secrets and variables** → **Actions**

Click **"New repository secret"** and add each of the following:

#### 3.1 AWS Secrets (5 secrets)

| Secret Name | Description | How to Get | Example |
|-------------|-------------|------------|---------|
| `AWS_ACCOUNT_ID` | AWS Account ID (12 digits) | `aws sts get-caller-identity --query Account` | `123456789012` |
| `AWS_ACCESS_KEY_ID` | AWS Access Key | AWS IAM → Create access key | `AKIAZX23EXAMPLE45BK` |
| `AWS_SECRET_ACCESS_KEY` | AWS Secret Key | AWS IAM → Create access key (shown once!) | `wJalrXUtnFEMI/K7MDENG...` |
| `AWS_SSH_PRIVATE_KEY` | EC2 SSH Private Key | `cat ~/.ssh/mexc-sniper-key.pem` | `-----BEGIN RSA PRIVATE KEY-----\n...` |
| `AWS_EC2_IP` | EC2 Public IP Address | From EC2 Console or AWS CLI | `54.179.123.45` |

**⚠️ Important Notes:**
- `AWS_SSH_PRIVATE_KEY`: Copy the **entire** content including `-----BEGIN` and `-----END` lines
- `AWS_SECRET_ACCESS_KEY`: Only shown once when created - if lost, create new keys

#### 3.2 MEXC API Secrets (2 secrets)

| Secret Name | Description | How to Get | Example |
|-------------|-------------|------------|---------|
| `MEXC_API_KEY` | MEXC API Key | mexc.com → API Management | `mx1234567890abcdefgh` |
| `MEXC_SECRET_KEY` | MEXC Secret Key | mexc.com → API Management (shown once!) | `aBcDeFgHiJkLmNoPqRs...` |

#### 3.3 Application Secrets (1 secret)

| Secret Name | Description | How to Get | Example |
|-------------|-------------|------------|---------|
| `JWT_SECRET` | JWT Token Secret | `openssl rand -base64 32` | `eyJhbGciOiJIUzI1NiIs...` |

**Generate JWT_SECRET:**
```bash
openssl rand -base64 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Requirement**: Minimum 32 characters

### Phase 4: Vercel Configuration (Frontend)

#### 4.1 Set Environment Variables in Vercel

1. Go to [vercel.com](https://vercel.com)
2. Select your project: **mexc-sniper-bot**
3. Go to **Settings** → **Environment Variables**
4. Add the following variable:

| Name | Value | Environment |
|------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://[YOUR_EC2_IP]:8080` | Production ✓ |

**Example**: `http://54.179.123.45:8080`

⚠️ **Important**: 
- Use the **Public IP** from your EC2 instance
- Include the protocol (`http://`) and port (`:8080`)
- This allows the frontend to communicate with the Rust backend

#### 4.2 Additional Vercel Secrets (if needed)

You may also need to configure:
- `VERCEL_TOKEN` - For GitHub Actions deployment (Settings → Tokens)
- `VERCEL_ORG_ID` - From Vercel project settings
- `VERCEL_PROJECT_ID` - From Vercel project settings

### Phase 5: Deployment Verification

#### 5.1 Verify GitHub Secrets

```bash
# Check that all 8 secrets are present in GitHub
# GitHub → Settings → Secrets and variables → Actions
# Should see:
✓ AWS_ACCOUNT_ID
✓ AWS_ACCESS_KEY_ID  
✓ AWS_SECRET_ACCESS_KEY
✓ AWS_SSH_PRIVATE_KEY
✓ AWS_EC2_IP
✓ MEXC_API_KEY
✓ MEXC_SECRET_KEY
✓ JWT_SECRET
```

#### 5.2 Deploy Backend to EC2

The deployment happens automatically when you push to `main` branch with changes to `backend-rust/`:

```bash
# Trigger deployment
git add .
git commit -m "Deploy Rust backend to production"
git push origin main
```

**GitHub Actions will**:
1. Run `rust-ci.yml` - Build, test, lint the Rust code
2. Run `deploy-rust.yml` - Build Docker image, push to ECR, deploy to EC2
3. Perform health checks
4. Rollback automatically if deployment fails

**Monitor deployment**:
- Go to: **GitHub** → **Actions**
- Watch: "Rust Backend CI/CD" and "Deploy Rust Backend to AWS EC2" workflows

#### 5.3 Verify Backend Deployment

```bash
# SSH into EC2
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@[YOUR_EC2_IP]

# Check running containers
docker ps
# Should see: mexc-sniper-blue

# Check container logs
docker logs mexc-sniper-blue
# Should show: "Server started on 0.0.0.0:8080"

# Exit EC2
exit

# Test health endpoint from your machine
curl http://[YOUR_EC2_IP]:8080/health
# Should return: {"status":"healthy","timestamp":"..."}

# Test ready endpoint
curl http://[YOUR_EC2_IP]:8080/api/admin/ready
# Should return: 200 OK
```

#### 5.4 Deploy Frontend to Vercel

The frontend deploys automatically when you push to `main` branch:

```bash
# Trigger deployment
git push origin main
```

**GitHub Actions will**:
1. Run pre-deployment checks (lint, type-check, tests)
2. Build the Next.js application
3. Deploy to Vercel production

**Monitor deployment**:
- Go to: **GitHub** → **Actions** → "Deploy Pipeline"
- Or: **Vercel Dashboard** → Deployments

**Verify frontend**:
1. Open the Vercel production URL
2. Check browser console for errors
3. Verify API calls to `NEXT_PUBLIC_API_URL` are working

### Phase 6: Post-Deployment Validation

#### 6.1 End-to-End Test

```bash
# Test the complete flow
# 1. Open frontend in browser
# 2. Check that dashboard loads
# 3. Try creating a test order (if applicable)
# 4. Monitor backend logs for requests
```

#### 6.2 Monitor Logs

**Backend logs** (EC2):
```bash
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@[YOUR_EC2_IP]
docker logs -f mexc-sniper-blue
```

**Frontend logs**:
- Vercel Dashboard → Deployments → View Function Logs

#### 6.3 Check Metrics

**Backend Metrics** (Prometheus):
```bash
curl http://[YOUR_EC2_IP]:8080/api/admin/metrics
```

**Performance Check**:
```bash
# Measure API latency
curl -o /dev/null -s -w 'Total: %{time_total}s\n' http://[YOUR_EC2_IP]:8080/health
# Should be < 0.1s
```

## Troubleshooting

### Common Issues

#### 1. GitHub Actions: "Secret not found"
**Problem**: Workflow fails with "Unable to resolve action" or "Secret X not found"

**Solution**:
- Verify secret names are exactly as specified (case-sensitive)
- Check all 8 secrets are added in GitHub
- Re-create the secret if needed

#### 2. AWS Authentication Failed
**Problem**: "InvalidClientTokenId" error

**Solution**:
```bash
# Verify AWS credentials
aws sts get-caller-identity

# If error, regenerate access keys in AWS IAM
```

#### 3. Docker Image Push Failed
**Problem**: "InvalidParameterException" when pushing to ECR

**Solution**:
- Verify `AWS_ACCOUNT_ID` is correct (12 digits, no spaces)
- Check ECR repository exists: `aws ecr describe-repositories`

#### 4. SSH Connection Failed
**Problem**: "Permission denied (publickey)" when deploying

**Solution**:
- Verify `AWS_SSH_PRIVATE_KEY` includes entire PEM file
- Check EC2 security group allows port 22
- Ensure key has correct format:
  ```
  -----BEGIN RSA PRIVATE KEY-----
  ...content...
  -----END RSA PRIVATE KEY-----
  ```

#### 5. Container Won't Start
**Problem**: Container exits immediately after start

**Solution**:
```bash
# Check container logs
docker logs mexc-sniper-blue

# Common causes:
# - Missing environment variables (MEXC_API_KEY, etc.)
# - Invalid JWT_SECRET (must be 32+ characters)
# - DynamoDB table doesn't exist
```

#### 6. Health Check Timeout
**Problem**: `curl http://EC2_IP:8080/health` times out

**Solution**:
- Check EC2 security group allows port 8080 from your IP
- Verify container is running: `docker ps`
- Check container logs: `docker logs mexc-sniper-blue`

#### 7. Frontend Can't Reach Backend
**Problem**: Frontend shows "Network Error" or "Failed to fetch"

**Solution**:
- Verify `NEXT_PUBLIC_API_URL` is set correctly in Vercel
- Check EC2 security group allows port 8080 from anywhere (0.0.0.0/0)
- Test backend directly: `curl http://EC2_IP:8080/health`
- Check CORS configuration in backend

## Deployment Workflows

### Automatic Deployment Triggers

**Backend (Rust)**:
- Trigger: Push to `main` with changes in `backend-rust/`
- Workflow: `.github/workflows/deploy-rust.yml`
- Steps: Build → Docker → ECR → Deploy → Health Check

**Frontend (Next.js)**:
- Trigger: Push to `main` branch
- Workflow: `.github/workflows/deploy.yml`
- Steps: Lint → Test → Build → Deploy to Vercel

### Manual Deployment

**Backend**:
```bash
# Via GitHub Actions UI
gh workflow run deploy-rust.yml --ref main

# Or trigger by making a change
cd backend-rust
touch .deploy-trigger
git add .deploy-trigger
git commit -m "Trigger backend deployment"
git push origin main
```

**Frontend**:
```bash
# Via Vercel CLI
vercel --prod

# Or via GitHub
git push origin main
```

### Rollback Procedures

**Backend Rollback**:
```bash
# Automatic rollback on health check failure
# Or manual rollback:
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@[YOUR_EC2_IP]

# Stop current container
docker stop mexc-sniper-blue
docker rm mexc-sniper-blue

# Rename previous version
docker rename mexc-sniper-green mexc-sniper-blue
docker start mexc-sniper-blue
```

**Frontend Rollback**:
```bash
# Via Vercel Dashboard
vercel rollback

# Or via CLI with specific deployment
vercel rollback [deployment-url]
```

## Security Checklist

- [ ] All secrets are stored in GitHub Secrets (not in code)
- [ ] `.env` files are in `.gitignore`
- [ ] SSH private keys are secured locally (`chmod 600`)
- [ ] MEXC API keys have IP whitelist configured
- [ ] EC2 security group restricts SSH to your IP
- [ ] JWT_SECRET is 32+ characters and randomly generated
- [ ] AWS credentials are rotated every 90 days
- [ ] DynamoDB has encryption at rest enabled
- [ ] CloudWatch logs are enabled for monitoring

## Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| API Response Time | < 15ms | ✅ Rust Backend |
| MEXC Order Latency | < 50ms | ✅ Connection Pooling |
| Frontend Load Time | < 2s | ✅ Vercel CDN |
| Backend Uptime | 99.9% | ✅ Health Checks |
| Container Startup | < 5s | ✅ Alpine Image |

## Monitoring & Maintenance

### Daily Checks
- Review CloudWatch logs for errors
- Check Vercel deployment status
- Monitor MEXC API rate limits

### Weekly Checks
- Review DynamoDB capacity metrics
- Check disk space on EC2
- Review security group rules

### Monthly Tasks
- Rotate AWS credentials
- Review and clean DynamoDB (TTL handles automatic cleanup)
- Update dependencies (Rust and Node.js)
- Test rollback procedures

## Support & Documentation

### Quick Reference Files
- `PHASE_7_8_START_HERE.md` - Quick start guide
- `PHASE_7_8_COMPLETE_ANSWER.md` - Detailed explanation
- `PHASE_7_8_QUICK_CHECKLIST.md` - Quick checklist
- `GITHUB_SECRETS_REFERENCE.md` - Secrets lookup table
- `RUST_DEPLOYMENT_GUIDE.md` - Rust backend deployment details
- `RUST_MIGRATION_COMPLETE.md` - Migration documentation

### Additional Resources
- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)
- [Vercel Documentation](https://vercel.com/docs)
- [MEXC API Documentation](https://mexcdevelop.github.io/apidocs/)
- [Rust Axum Framework](https://docs.rs/axum/)

## Summary

**Total Setup Time**: ~40 minutes
- AWS Setup: 10 minutes
- Secrets Configuration: 25 minutes
- Deployment: 5 minutes (automatic)

**After completion, you will have**:
- ✅ Frontend deployed on Vercel
- ✅ Rust backend running on EC2
- ✅ Automatic CI/CD pipeline
- ✅ Blue-green deployment with rollback
- ✅ Health monitoring
- ✅ Full production environment

**Your application is now fully operational! 🎉**
