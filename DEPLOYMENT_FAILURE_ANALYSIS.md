# Deployment Failure Analysis Report

**Date:** 2026-01-28  
**Issue:** Failed deployment on main branch  
**Workflow Run ID:** 21347379254  
**Commit SHA:** 6b2e3c646cbc4847053f61f34fc2af4f0adb2057  

---

## Executive Summary

The deployment to AWS EC2 failed due to the use of **deprecated GitHub Actions versions**. Specifically, the workflow uses `actions/upload-artifact@v3` and `actions/download-artifact@v3`, which were officially deprecated and are no longer functional as of April 2024.

---

## Root Cause Analysis

### Primary Issue: Deprecated GitHub Actions

**Error Details:**
```
##[error]This request has been automatically failed because it uses a deprecated version of `actions/upload-artifact: v3`. 
Learn more: https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/
```

**Affected Workflow:** `.github/workflows/deploy-rust.yml`

**Specific Locations:**
1. **Line 54-58:** Upload artifact step using `actions/upload-artifact@v3`
2. **Line 71-74:** Download artifact step using `actions/download-artifact@v3`

### Secondary Issues

1. **Job Execution Sequence:**
   - The "Build Rust Backend" job failed early in the workflow
   - This triggered the "Rollback on Failure" job
   - The rollback job also failed with `exit code 1`

2. **Rollback Job Failure:**
   - The rollback attempted to SSH into EC2 instance
   - Failed to connect or execute rollback commands
   - This is likely due to missing SSH configuration or EC2 instance state

---

## Impact Assessment

### Critical Impact
- ❌ **Deployment Pipeline Blocked:** Cannot deploy Rust backend to AWS EC2
- ❌ **Automated Deployments Halted:** All main branch pushes to `backend-rust/**` will fail
- ❌ **Manual Intervention Required:** Deployments must be done manually or workflow must be fixed

### Affected Components
1. Rust Backend Deployment (`deploy-rust.yml`)
2. Blue-Green deployment mechanism
3. Automated rollback functionality

---

## AWS Infrastructure Status

### What We Know
- **EC2 Instance:** Configured with tag `Name=mexc-sniper-bot`
- **Region:** ap-southeast-1 (Singapore)
- **ECR Repository:** mexc-sniper-rust
- **Deployment Method:** Blue-Green deployment with Docker containers

### What Needs Verification
- ✅ EC2 Instance State (running/stopped)
- ✅ Security Groups & Network Configuration
- ✅ IAM Roles and Permissions
- ✅ SSH Key Configuration
- ✅ Docker Installation on EC2
- ✅ CloudWatch Logs (if configured)

**Note:** Cannot access AWS directly from GitHub Actions logs. AWS CLI commands require proper credentials which are configured in the workflow but not visible in logs.

---

## Resolution Steps

### Immediate Fix (Critical Priority)

#### 1. Update GitHub Actions to v4
**Files to Modify:** `.github/workflows/deploy-rust.yml`

**Changes Required:**
```yaml
# Line 54-58: Change from v3 to v4
- name: Upload build artifact
  uses: actions/upload-artifact@v4  # Updated from v3
  with:
    name: mexc-sniper-binary
    path: backend-rust/target/x86_64-unknown-linux-musl/release/mexc-sniper
    retention-days: 1

# Line 71-74: Change from v3 to v4
- name: Download build artifact
  uses: actions/download-artifact@v4  # Updated from v3
  with:
    name: mexc-sniper-binary
    path: backend-rust/target/x86_64-unknown-linux-musl/release/
```

**Breaking Changes in v4:**
- Artifacts are now scoped to the workflow run (cannot be downloaded across different runs without explicit sharing)
- Different artifact naming and retrieval mechanisms
- Improved performance and reliability

#### 2. Test the Updated Workflow
```bash
# After making changes, trigger workflow manually
gh workflow run deploy-rust.yml --ref main
```

### Recommended Follow-up Actions

#### 3. Verify AWS EC2 Configuration
```bash
# Check EC2 instance state
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=mexc-sniper-bot" \
  --region ap-southeast-1 \
  --output table

# Verify security groups allow SSH (port 22) and HTTP (port 8080)
aws ec2 describe-security-groups \
  --group-ids <security-group-id> \
  --region ap-southeast-1
```

#### 4. Validate GitHub Secrets
Ensure these secrets are properly configured:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_ACCOUNT_ID`
- `AWS_SSH_PRIVATE_KEY`
- `AWS_EC2_IP`
- `MEXC_API_KEY`
- `MEXC_SECRET_KEY`
- `JWT_SECRET`

#### 5. Test SSH Connection to EC2
```bash
# From GitHub Actions or local machine
ssh -i ~/.ssh/id_rsa ec2-user@<EC2_IP> "echo 'Connection successful'"
```

#### 6. Verify Docker on EC2
```bash
# SSH into EC2 and check Docker status
ssh -i ~/.ssh/id_rsa ec2-user@<EC2_IP> << 'EOF'
  docker --version
  docker ps -a
  docker images
  aws --version
EOF
```

#### 7. Enable CloudWatch Logging (Recommended)
Add CloudWatch agent to EC2 for better observability:
```bash
# Install CloudWatch agent on EC2
sudo yum install amazon-cloudwatch-agent -y

# Configure CloudWatch to monitor:
# - Docker container logs
# - System metrics
# - Application logs
```

---

## Prevention Measures

### 1. Automated Dependency Updates
- Enable Dependabot for GitHub Actions
- Already configured in `.github/dependabot.yml`
- Ensure it includes workflow files

### 2. Pre-deployment Validation
Consider adding a validation job before deployment:
```yaml
validate:
  runs-on: ubuntu-latest
  steps:
    - name: Validate GitHub Actions versions
      run: |
        # Check for deprecated action versions
        grep -r "upload-artifact@v[1-3]" .github/workflows/ && exit 1 || true
        grep -r "download-artifact@v[1-3]" .github/workflows/ && exit 1 || true
```

### 3. Enhanced Monitoring
- Add deployment status notifications (Slack, Discord, email)
- Set up CloudWatch alarms for EC2 health
- Configure automatic health checks

### 4. Documentation Updates
- Update deployment documentation with latest workflow
- Add troubleshooting guide
- Document rollback procedures

---

## Timeline

1. **2026-01-26 05:31:55Z:** Deployment workflow triggered on main branch
2. **2026-01-26 05:31:59Z:** Build job started
3. **2026-01-26 05:31:59Z:** Build job failed immediately due to deprecated artifact action
4. **2026-01-26 05:32:05Z:** Rollback job triggered
5. **2026-01-26 05:32:10Z:** Rollback job failed (exit code 1)
6. **2026-01-26 05:32:12Z:** Workflow marked as failed

**Total Duration:** ~17 seconds (early failure prevented further damage)

---

## References

- [GitHub Actions Artifact v3 Deprecation Notice](https://github.blog/changelog/2024-04-16-deprecation-notice-v3-of-the-artifact-actions/)
- [actions/upload-artifact@v4 Documentation](https://github.com/actions/upload-artifact)
- [actions/download-artifact@v4 Documentation](https://github.com/actions/download-artifact)
- [AWS EC2 Deployment Best Practices](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/deployment-best-practices.html)

---

## Conclusion

The deployment failure is **not related to AWS infrastructure issues** but rather a **configuration issue in the GitHub Actions workflow**. The fix is straightforward: update the deprecated actions to v4. 

Once this change is implemented, the deployment should proceed normally, assuming AWS credentials and infrastructure are properly configured.

**Estimated Time to Fix:** 10-15 minutes  
**Risk Level:** Low (changes are well-documented and tested by GitHub)  
**Recommended Action:** Apply fix immediately and test with a manual workflow trigger
