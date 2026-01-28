# 🔐 Complete Secrets Reference - MEXC Sniper Bot

This document provides a complete reference for all secrets and environment variables needed for deployment.

## GitHub Secrets (Required for Backend Deployment)

| # | Secret Name | Purpose | Where to Get | Required |
|---|-------------|---------|--------------|----------|
| 1 | `AWS_ACCOUNT_ID` | AWS Account identifier | `aws sts get-caller-identity --query Account` | ✅ Yes |
| 2 | `AWS_ACCESS_KEY_ID` | AWS API authentication | AWS IAM → Create access key | ✅ Yes |
| 3 | `AWS_SECRET_ACCESS_KEY` | AWS API signing | AWS IAM → Create access key (shown once!) | ✅ Yes |
| 4 | `AWS_SSH_PRIVATE_KEY` | SSH access to EC2 | `cat ~/.ssh/mexc-sniper-key.pem` | ✅ Yes |
| 5 | `AWS_EC2_IP` | EC2 instance address | AWS Console → EC2 → Public IPv4 | ✅ Yes |
| 6 | `MEXC_API_KEY` | MEXC API access | mexc.com → API Management | ✅ Yes |
| 7 | `MEXC_SECRET_KEY` | MEXC API signing | mexc.com → API Management (shown once!) | ✅ Yes |
| 8 | `JWT_SECRET` | JWT token signing | `openssl rand -base64 32` | ✅ Yes |

### Additional GitHub Secrets (Optional - for Frontend GitHub Actions)

| Secret Name | Purpose | Required |
|-------------|---------|----------|
| `VERCEL_TOKEN` | Vercel API authentication | If using GitHub Actions for frontend |
| `VERCEL_ORG_ID` | Vercel organization ID | If using GitHub Actions for frontend |
| `VERCEL_PROJECT_ID` | Vercel project ID | If using GitHub Actions for frontend |

## Vercel Environment Variables (Required for Frontend)

| Variable Name | Purpose | Value | Environment |
|---------------|---------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API endpoint | `http://[EC2_IP]:8080` | Production ✓ |

**Example:** `http://54.179.123.45:8080`

## Backend Runtime Environment Variables

These are configured in the Rust backend code and passed via Docker container:

| Variable | Default | Purpose |
|----------|---------|---------|
| `MEXC_API_KEY` | - | From GitHub Secret |
| `MEXC_SECRET_KEY` | - | From GitHub Secret |
| `MEXC_BASE_URL` | `https://api.mexc.com` | MEXC API endpoint |
| `AWS_REGION` | `ap-southeast-1` | AWS region |
| `DYNAMODB_TABLE` | `mexc_trading_data` | DynamoDB table name |
| `RUST_API_PORT` | `8080` | Backend port |
| `JWT_SECRET` | - | From GitHub Secret |
| `RUST_LOG` | `info,mexc_sniper=debug` | Logging level |

## Secret Generation Commands

### JWT Secret
```bash
# Option 1: OpenSSL
openssl rand -base64 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### AWS Account ID
```bash
aws sts get-caller-identity --query Account --output text
```

### EC2 Public IP
```bash
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=mexc-sniper-bot" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --region ap-southeast-1 \
  --output text
```

### SSH Private Key
```bash
cat ~/.ssh/mexc-sniper-key.pem
```

## Secrets Validation Checklist

### GitHub Secrets Validation

```bash
# List all secrets (requires gh CLI)
gh secret list

# Should show 8-11 secrets depending on configuration:
# - AWS_ACCOUNT_ID
# - AWS_ACCESS_KEY_ID
# - AWS_SECRET_ACCESS_KEY
# - AWS_SSH_PRIVATE_KEY
# - AWS_EC2_IP
# - MEXC_API_KEY
# - MEXC_SECRET_KEY
# - JWT_SECRET
# Optional:
# - VERCEL_TOKEN
# - VERCEL_ORG_ID
# - VERCEL_PROJECT_ID
```

### Vercel Environment Variables Validation

```bash
# Using Vercel CLI
vercel env ls

# Should show:
# NEXT_PUBLIC_API_URL (Production)
```

## Secret Format Examples

### AWS_ACCOUNT_ID
```
123456789012
```
**Format:** 12 digits, no spaces

### AWS_ACCESS_KEY_ID
```
AKIAZX23EXAMPLE45BK
```
**Format:** Starts with AKIA, 20 characters

### AWS_SECRET_ACCESS_KEY
```
wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```
**Format:** 40 characters, alphanumeric + special chars

### AWS_SSH_PRIVATE_KEY
```
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA2qa9/aqJ...
(multiple lines)
...
-----END RSA PRIVATE KEY-----
```
**Format:** Complete PEM file including BEGIN/END lines

### AWS_EC2_IP
```
54.179.123.45
```
**Format:** IPv4 address (xxx.xxx.xxx.xxx)

### MEXC_API_KEY
```
mx1234567890abcdefgh
```
**Format:** Alphanumeric string from MEXC

### MEXC_SECRET_KEY
```
aBcDeFgHiJkLmNoPqRsTuVwXyZ...
```
**Format:** Long alphanumeric string from MEXC

### JWT_SECRET
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
**Format:** Base64 string, minimum 32 characters

## Security Best Practices

### ✅ DO
- Store secrets in GitHub Secrets / Vercel Environment Variables only
- Use different keys for development/staging/production
- Rotate AWS credentials every 90 days
- Use IP whitelisting for MEXC API keys
- Keep SSH private keys secured with `chmod 600`
- Use strong, randomly generated JWT secrets (32+ chars)
- Audit who has access to secrets regularly

### ❌ DON'T
- Commit secrets to Git (check .gitignore)
- Share secrets via Slack/Email/unencrypted channels
- Use default or test keys in production
- Hardcode secrets in code
- Store secrets in plain text files
- Reuse secrets across different environments

## Troubleshooting

### "Secret not found in workflow"
**Cause:** Secret name misspelled or not set

**Fix:**
1. Check exact spelling (case-sensitive)
2. Verify secret exists in GitHub Settings
3. Re-create if needed

### "AWS API returns Unauthorized"
**Cause:** Invalid AWS credentials

**Fix:**
1. Verify credentials with: `aws sts get-caller-identity`
2. Regenerate access keys if needed
3. Check credentials haven't expired

### "Permission denied (publickey)"
**Cause:** Invalid SSH private key

**Fix:**
1. Verify entire PEM content is copied (including BEGIN/END)
2. Check no extra spaces or newlines
3. Verify key matches EC2 key pair

### "Container fails to start"
**Cause:** Missing or invalid runtime environment variables

**Fix:**
1. Check MEXC_API_KEY is valid
2. Verify JWT_SECRET is 32+ characters
3. Ensure all required secrets are set
4. Check DynamoDB table exists

## Quick Secret Setup Script

```bash
#!/bin/bash
# This script helps gather all secrets needed for deployment

echo "🔐 MEXC Sniper Bot - Secrets Collection"
echo "========================================"
echo ""

# AWS Secrets
echo "📊 Collecting AWS Secrets..."
echo "AWS_ACCOUNT_ID:"
aws sts get-caller-identity --query Account --output text

echo ""
echo "AWS_EC2_IP:"
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=mexc-sniper-bot" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --region ap-southeast-1 \
  --output text

echo ""
echo "⚠️  Manual Collection Required:"
echo "- AWS_ACCESS_KEY_ID: Create in AWS IAM Console"
echo "- AWS_SECRET_ACCESS_KEY: Create in AWS IAM Console (shown once!)"
echo "- AWS_SSH_PRIVATE_KEY: cat ~/.ssh/mexc-sniper-key.pem"
echo "- MEXC_API_KEY: Get from mexc.com → API Management"
echo "- MEXC_SECRET_KEY: Get from mexc.com → API Management (shown once!)"
echo ""

# Generate JWT Secret
echo "🔑 Generating JWT_SECRET..."
echo "JWT_SECRET:"
openssl rand -base64 32

echo ""
echo "✅ Secrets collection complete!"
echo "📝 Add these to GitHub Secrets and Vercel Environment Variables"
```

## Resources

- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [GitHub Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [MEXC API Documentation](https://mexcdevelop.github.io/apidocs/)

## Summary

**Total Secrets Required:**
- 8 GitHub Secrets (backend deployment)
- 1 Vercel Environment Variable (frontend API connection)
- 3 Optional GitHub Secrets (frontend GitHub Actions deployment)

**Setup Time:** ~25 minutes

**After Setup:**
- Push to `main` branch triggers automatic deployment
- Backend deploys to AWS EC2
- Frontend deploys to Vercel
- Full CI/CD pipeline operational

---

**Last Updated:** 2026-01-28
**Version:** 1.0.0
