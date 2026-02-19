# 🎯 Deployment Readiness Checklist

Use this checklist to verify you have everything needed for a successful deployment of the MEXC Sniper Bot.

## ✅ Pre-Deployment Checklist

### AWS Infrastructure
- [ ] AWS Account with admin access
- [ ] EC2 instance created (t3.medium or better)
  - [ ] Instance Name: `mexc-sniper-bot`
  - [ ] AMI: Amazon Linux 2023
  - [ ] Region: ap-southeast-1
- [ ] Security Group configured:
  - [ ] Port 22 (SSH) - Restricted to your IP
  - [ ] Port 8080 (API) - Open to 0.0.0.0/0
- [ ] SSH Key Pair created and saved: `~/.ssh/mexc-sniper-key.pem`
- [ ] EC2 Public IP noted: `________________`
- [ ] DynamoDB table created: `mexc_trading_data`
- [ ] ECR repository created: `mexc-sniper-rust`

### AWS Credentials
- [ ] AWS Account ID: `________________` (12 digits)
- [ ] AWS Access Key ID created: `AKIA________________`
- [ ] AWS Secret Access Key saved (shown only once!)
- [ ] SSH Private Key content copied from: `~/.ssh/mexc-sniper-key.pem`

### MEXC API
- [ ] MEXC Account created
- [ ] API Key created: `________________`
- [ ] Secret Key saved (shown only once!)
- [ ] IP Whitelist configured (recommended)

### Application Secrets
- [ ] JWT Secret generated (32+ characters)
  ```bash
  openssl rand -base64 32
  ```
  Result: `________________`

## 🔐 GitHub Secrets Configuration

Go to: **GitHub** → **Settings** → **Secrets and variables** → **Actions**

### Required Secrets (8 total)

- [ ] `AWS_ACCOUNT_ID` = `________________`
- [ ] `AWS_ACCESS_KEY_ID` = `________________`
- [ ] `AWS_SECRET_ACCESS_KEY` = `________________`
- [ ] `AWS_SSH_PRIVATE_KEY` = (Full PEM file content)
- [ ] `AWS_EC2_IP` = `________________`
- [ ] `MEXC_API_KEY` = `________________`
- [ ] `MEXC_SECRET_KEY` = `________________`
- [ ] `JWT_SECRET` = `________________`

**Verification Command:**
```bash
# Count secrets in GitHub (should be 8)
gh secret list | wc -l
```

## 🌐 Vercel Configuration

Go to: **Vercel** → **Project Settings** → **Environment Variables**

### Frontend Environment Variable

- [ ] `NEXT_PUBLIC_API_URL` = `http://[EC2_IP]:8080`
  - Example: `http://54.179.123.45:8080`
  - Environment: Production ✓

### Optional Vercel Secrets (for GitHub Actions)

- [ ] `VERCEL_TOKEN` (if using GitHub Actions for frontend deployment)
- [ ] `VERCEL_ORG_ID` 
- [ ] `VERCEL_PROJECT_ID`

## 🚀 Deployment Execution

### Backend Deployment (Automatic via GitHub Actions)

- [ ] Code changes committed to repository
- [ ] Pushed to `main` branch
  ```bash
  git add .
  git commit -m "Deploy backend to production"
  git push origin main
  ```
- [ ] GitHub Actions workflow started:
  - [ ] `rust-ci.yml` - Build & Test
  - [ ] `deploy-rust.yml` - Deploy to EC2
- [ ] Workflows completed successfully
- [ ] Backend health check passed: `curl http://[EC2_IP]:8080/health`

### Frontend Deployment (Automatic via Vercel)

- [ ] Code pushed to `main` branch
- [ ] Vercel build started automatically
- [ ] Build completed successfully
- [ ] Production deployment live
- [ ] Frontend can reach backend API

## ✅ Post-Deployment Verification

### Backend Verification

```bash
# 1. Check container is running
ssh -i ~/.ssh/mexc-sniper-key.pem ec2-user@[EC2_IP]
docker ps
# Should show: mexc-sniper-blue

# 2. Check container logs
docker logs mexc-sniper-blue
# Should show: "Server started on 0.0.0.0:8080"

# 3. Test health endpoint
curl http://[EC2_IP]:8080/health
# Should return: {"status":"healthy","timestamp":"..."}

# 4. Test ready endpoint
curl http://[EC2_IP]:8080/api/admin/ready
# Should return: 200 OK

# 5. Check metrics endpoint
curl http://[EC2_IP]:8080/api/admin/metrics
# Should return: Prometheus metrics
```

### Frontend Verification

- [ ] Open production URL in browser
- [ ] Dashboard loads without errors
- [ ] Check browser console (no errors)
- [ ] Test API connectivity
  ```javascript
  // In browser console:
  fetch(process.env.NEXT_PUBLIC_API_URL + '/health')
    .then(r => r.json())
    .then(console.log)
  ```
- [ ] Verify authentication works (Clerk)
- [ ] Test creating a snipe target (if applicable)

### End-to-End Test

- [ ] Create test snipe target via frontend
- [ ] Verify it appears in DynamoDB
- [ ] Check backend logs for request processing
- [ ] Test pattern detection (if applicable)
- [ ] Verify position management works

## 📊 Performance Checks

### Response Time Tests

```bash
# Backend API latency
curl -o /dev/null -s -w 'Time: %{time_total}s\n' http://[EC2_IP]:8080/health
# Target: < 0.1s

# Frontend load time
# Use browser DevTools Network tab
# Target: < 2s
```

### Load Testing (Optional)

```bash
# Install k6 for load testing
# Then run:
k6 run load-test.js --vus 10 --duration 30s
```

## 🔍 Monitoring Setup

- [ ] CloudWatch logs enabled for EC2
- [ ] DynamoDB monitoring configured
- [ ] Vercel analytics enabled
- [ ] Error tracking configured (optional: Sentry)

### Key Metrics to Monitor

**Backend:**
- Response time (< 15ms target)
- Error rate (< 1% target)
- Container uptime
- Memory usage

**Frontend:**
- Page load time
- API call success rate
- User authentication success
- Error logs

**Database:**
- DynamoDB read/write capacity
- Item count growth
- TTL cleanup working

## 🆘 Troubleshooting Quick Reference

| Problem | Quick Fix |
|---------|-----------|
| GitHub Actions fails | Check all 8 secrets are set correctly |
| AWS auth error | Regenerate AWS access keys |
| Container won't start | Check MEXC_API_KEY and JWT_SECRET |
| Health check timeout | Check EC2 security group port 8080 |
| Frontend can't reach backend | Verify NEXT_PUBLIC_API_URL in Vercel |
| SSH fails | Check AWS_SSH_PRIVATE_KEY includes full PEM |

## 📚 Documentation References

- [Complete Deployment Guide](DEPLOYMENT_COMPLETE_GUIDE.md)
- [Phase 7 & 8 Instructions](PHASE_7_8_COMPLETE_ANSWER.md)
- [Quick Checklist](PHASE_7_8_QUICK_CHECKLIST.md)
- [GitHub Secrets Reference](GITHUB_SECRETS_REFERENCE.md)
- [Rust Deployment Guide](RUST_DEPLOYMENT_GUIDE.md)

## ✨ Success Criteria

Your deployment is successful when:

✅ All 8 GitHub secrets configured
✅ Vercel environment variable set
✅ Backend container running on EC2
✅ Health check returns 200 OK
✅ Frontend deployed on Vercel
✅ Frontend can communicate with backend
✅ End-to-end test passes
✅ No errors in logs
✅ Response times meet targets

## 🎉 Deployment Complete!

Once all items are checked, your MEXC Sniper Bot is fully deployed and operational!

**Next Steps:**
1. Monitor logs for the first 24 hours
2. Set up alerts for critical errors
3. Test with small amounts first
4. Scale up gradually
5. Regular maintenance (see DEPLOYMENT_COMPLETE_GUIDE.md)

---

**Deployment Date:** ________________
**Deployed By:** ________________
**Backend Version:** ________________
**Frontend Version:** ________________
**Notes:** ________________
