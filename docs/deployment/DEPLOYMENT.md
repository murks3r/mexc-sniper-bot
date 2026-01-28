# Deployment Guide

This guide covers deployment options for the MEXC Sniper Bot application.

## Overview

The MEXC Sniper Bot supports multiple deployment strategies:

- **Frontend**: Vercel (recommended) or Railway
- **Backend**: AWS EC2 with Docker (automated via GitHub Actions)
- **Database**: NeonDB, Supabase, or local PostgreSQL

## Automated Deployment (GitHub Actions)

The project includes automated deployment workflows:

### Frontend to Vercel

**Workflow**: `.github/workflows/deploy.yml`

Automatically deploys on:
- Push to `main` branch → Production deployment
- Pull requests → Staging preview deployments

**Prerequisites**:
- Vercel account
- GitHub secrets configured:
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`

**Setup**:
1. Create a Vercel project
2. Link to GitHub repository
3. Add secrets to GitHub repository settings
4. Push to `main` or create a PR

### Backend to AWS EC2

**Workflow**: `.github/workflows/deploy-rust.yml`

Automatically deploys on:
- Push to `main` branch with changes in `backend-rust/`
- Manual workflow dispatch

**Prerequisites**:
- AWS account with EC2 instance
- Docker installed on EC2
- GitHub secrets configured:
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `AWS_ACCOUNT_ID`
  - `AWS_EC2_IP`
  - `AWS_SSH_PRIVATE_KEY`
  - `MEXC_API_KEY`
  - `MEXC_SECRET_KEY`
  - `JWT_SECRET`

**Deployment Process**:
1. Builds Rust binary
2. Creates Docker image
3. Pushes to AWS ECR
4. SSH to EC2 and performs blue-green deployment
5. Runs health checks
6. Rollback on failure

For detailed instructions, see [RUST_DEPLOYMENT_GUIDE.md](../../RUST_DEPLOYMENT_GUIDE.md)

## Manual Deployment

### Vercel Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy to staging
vercel

# Deploy to production
vercel --prod
```

### Railway Deployment

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up
```

### EC2 Manual Deployment

See [EC2_DEPLOYMENT_STATUS.md](EC2_DEPLOYMENT_STATUS.md) for comprehensive EC2 deployment and verification instructions.

Quick steps:

```bash
# SSH to EC2
ssh -i your-key.pem ec2-user@<EC2_IP>

# Pull latest code
cd mexc-sniper-bot
git pull

# Backend (Docker)
cd backend-rust
docker build -t mexc-sniper-rust .
docker run -d --name mexc-sniper-blue -p 8080:8080 \
  -e MEXC_API_KEY=$MEXC_API_KEY \
  -e MEXC_SECRET_KEY=$MEXC_SECRET_KEY \
  mexc-sniper-rust:latest

# Frontend (PM2)
cd ..
npm install
npm run build
pm2 start npm --name mexc-frontend -- start
```

## Environment Variables

### Required for All Deployments

```bash
# Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_key
CLERK_SECRET_KEY=your_clerk_secret

# Database
DATABASE_URL=postgresql://user:pass@host/db

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Additional for EC2 Backend

```bash
# MEXC API
MEXC_API_KEY=your_mexc_api_key
MEXC_SECRET_KEY=your_mexc_secret_key
MEXC_BASE_URL=https://api.mexc.com

# AWS
AWS_REGION=ap-southeast-1
DYNAMODB_TABLE=mexc_trading_data

# Security
JWT_SECRET=your_jwt_secret
```

## Deployment Verification

### Check Deployment Status

Use the automated verification script:

```bash
# On EC2 instance
./scripts/check-ec2-deployment.sh
```

For manual checks, see [EC2_DEPLOYMENT_STATUS.md](EC2_DEPLOYMENT_STATUS.md)

### Health Checks

```bash
# Backend health
curl http://localhost:8080/health

# Backend ready status
curl http://localhost:8080/api/admin/ready

# Frontend
curl http://localhost:3000
```

### GitHub Actions Status

1. Go to: https://github.com/murks3r/mexc-sniper-bot/actions
2. Check recent workflow runs:
   - **Deploy Pipeline** - Frontend deployments
   - **Deploy Rust Backend to AWS EC2** - Backend deployments
3. Verify latest runs are successful (green checkmark)

Or use GitHub CLI:

```bash
gh run list --limit 10
gh run view <RUN_ID>
```

## Database Setup

### NeonDB (Recommended for Production)

1. Create account at https://neon.tech
2. Create new project
3. Copy connection string
4. Add to environment variables:
   ```
   DATABASE_URL=postgresql://user:pass@hostname/database?sslmode=require
   ```
5. Run migrations:
   ```bash
   npm run db:migrate
   ```

### Supabase

1. Create project at https://supabase.com
2. Get PostgreSQL connection string from Settings → Database
3. Configure Clerk integration for authentication
4. Run migrations

### Local Development

```bash
# SQLite (default)
DATABASE_URL=sqlite:///./mexc_sniper.db

# Or local PostgreSQL
DATABASE_URL=postgresql://localhost/mexc_sniper

# Run migrations
npm run db:migrate
```

## Monitoring & Maintenance

### Logs

**Vercel**:
- View logs in Vercel dashboard
- Or use CLI: `vercel logs`

**EC2**:
```bash
# Docker container logs
docker logs -f mexc-sniper-blue

# System logs
journalctl -u nginx -f

# PM2 logs
pm2 logs
```

### Performance Monitoring

**Vercel**:
- Built-in analytics in dashboard
- Response times, error rates

**EC2**:
```bash
# Resource usage
docker stats

# System resources
htop
free -h
df -h
```

### Updates and Rollbacks

**Vercel**:
- Automatic rollback available in dashboard
- Select previous deployment and promote

**EC2**:
```bash
# Rollback to previous container
docker stop mexc-sniper-blue
docker rename mexc-sniper-green mexc-sniper-blue
docker start mexc-sniper-blue
```

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check environment variables are set
   - Verify dependencies in package.json
   - Check build logs for specific errors

2. **Deployment Failures**
   - Verify GitHub secrets are configured
   - Check AWS credentials are valid
   - Ensure EC2 instance is running

3. **Runtime Errors**
   - Check health endpoints
   - Review application logs
   - Verify database connectivity

For detailed troubleshooting, see:
- [EC2_DEPLOYMENT_STATUS.md](EC2_DEPLOYMENT_STATUS.md) - EC2-specific issues
- [RUST_DEPLOYMENT_GUIDE.md](../../RUST_DEPLOYMENT_GUIDE.md) - Rust backend issues

## Security Best Practices

1. **Secrets Management**
   - Never commit secrets to repository
   - Use GitHub Secrets for CI/CD
   - Use environment variables in production

2. **Access Control**
   - Limit SSH access to EC2 instances
   - Use IAM roles with minimal permissions
   - Enable VPC security groups

3. **Updates**
   - Regularly update dependencies
   - Apply security patches promptly
   - Monitor security advisories

## Support

For deployment assistance:

1. Review this documentation
2. Check GitHub Actions workflow logs
3. Run verification script: `./scripts/check-ec2-deployment.sh`
4. Create GitHub issue with logs and error messages

## Related Documentation

- [README.md](../../README.md) - Main documentation
- [EC2_DEPLOYMENT_STATUS.md](EC2_DEPLOYMENT_STATUS.md) - EC2 verification guide
- [RUST_DEPLOYMENT_GUIDE.md](../../RUST_DEPLOYMENT_GUIDE.md) - Rust backend deployment
- [GitHub Actions Workflows](../../.github/workflows/) - CI/CD configuration
