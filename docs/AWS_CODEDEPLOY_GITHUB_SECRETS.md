# GitHub Secrets for AWS CodeDeploy

This document lists all GitHub Secrets required for AWS CodeDeploy continuous deployment to EC2 (Osaka region).

## 📋 Required Secrets

### AWS Credentials

| Secret Name | Description | How to Obtain | Example |
|------------|-------------|---------------|---------|
| `AWS_ACCESS_KEY_ID` | IAM user access key for GitHub Actions | Created when setting up `github-actions-deployer` IAM user | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret access key | Shown only once when creating access key - save it! | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_S3_BUCKET` | S3 bucket name for deployment artifacts | Created in Osaka region (ap-northeast-3) | `mexc-sniper-bot-deployments-osaka` |

## 🔧 How to Add Secrets

### Method 1: GitHub Web UI

1. Navigate to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Enter the **Name** (exactly as shown above)
5. Enter the **Value**
6. Click **Add secret**

Repeat for each secret.

### Method 2: GitHub CLI

```bash
# Install GitHub CLI if not already installed
# https://cli.github.com/

# Authenticate
gh auth login

# Add secrets
gh secret set AWS_ACCESS_KEY_ID --body "AKIAIOSFODNN7EXAMPLE"
gh secret set AWS_SECRET_ACCESS_KEY --body "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
gh secret set AWS_S3_BUCKET --body "mexc-sniper-bot-deployments-osaka"
```

### Method 3: From File (More Secure)

```bash
# Store secret in a file
echo "AKIAIOSFODNN7EXAMPLE" > aws_access_key.txt

# Add secret from file
gh secret set AWS_ACCESS_KEY_ID < aws_access_key.txt

# Delete the file immediately
rm aws_access_key.txt
```

## 🔍 Verify Secrets

### Check if Secrets Exist

```bash
# List all secrets (values are hidden)
gh secret list
```

Expected output:
```
AWS_ACCESS_KEY_ID         Updated 2024-XX-XX
AWS_SECRET_ACCESS_KEY     Updated 2024-XX-XX
AWS_S3_BUCKET            Updated 2024-XX-XX
```

### Test Secrets in Workflow

The workflow will fail if secrets are missing or incorrect. Check workflow logs:

```bash
# View recent workflow runs
gh run list

# View specific run
gh run view RUN_ID
```

## 🔐 Security Best Practices

### 1. Access Key Rotation

Rotate AWS access keys regularly (every 90 days recommended):

```bash
# Create new access key
aws iam create-access-key --user-name github-actions-deployer

# Update GitHub secret with new key
gh secret set AWS_ACCESS_KEY_ID --body "NEW_ACCESS_KEY"
gh secret set AWS_SECRET_ACCESS_KEY --body "NEW_SECRET_KEY"

# Delete old access key (after verifying new one works)
aws iam delete-access-key \
  --user-name github-actions-deployer \
  --access-key-id OLD_ACCESS_KEY_ID
```

### 2. Principle of Least Privilege

The `github-actions-deployer` IAM user should only have permissions for:
- S3 bucket access (specific bucket only)
- CodeDeploy deployment creation
- CodeDeploy deployment status checking

See [github-actions-policy.json](../github-actions-policy.json) for the minimal policy.

### 3. Monitor Secret Usage

Check CloudTrail for IAM user activity:

```bash
# List recent API calls by the IAM user
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=Username,AttributeValue=github-actions-deployer \
  --max-results 50
```

### 4. Enable MFA for Root Account

While the IAM user for GitHub Actions doesn't need MFA (it's automated), ensure your AWS root account has MFA enabled.

### 5. Use Environment-Specific Secrets

For staging vs production deployments, consider using GitHub Environments:

```yaml
# In workflow file
jobs:
  deploy:
    environment: production  # Uses secrets from 'production' environment
```

## ❌ Common Mistakes

### 1. Wrong Secret Names

✅ Correct: `AWS_ACCESS_KEY_ID`  
❌ Wrong: `aws_access_key_id` (lowercase)  
❌ Wrong: `AWS_ACCESS_KEY` (missing _ID)

Secret names must match **exactly** as referenced in the workflow file.

### 2. Extra Whitespace

Secrets should not have leading/trailing whitespace:

```bash
# Bad - has trailing space
echo "AKIAIOSFODNN7EXAMPLE " | gh secret set AWS_ACCESS_KEY_ID

# Good - no whitespace
echo -n "AKIAIOSFODNN7EXAMPLE" | gh secret set AWS_ACCESS_KEY_ID
```

### 3. Wrong Bucket Region

The S3 bucket **must** be in `ap-northeast-3` (Osaka):

```bash
# Verify bucket region
aws s3api get-bucket-location --bucket mexc-sniper-bot-deployments-osaka

# Should return: "ap-northeast-3"
```

### 4. Expired Access Keys

Access keys can be deactivated or deleted. If deployment fails with authentication errors:

```bash
# Check if access key is active
aws iam list-access-keys --user-name github-actions-deployer

# Look for Status: "Active"
```

## 🔄 Update Secrets

To update a secret:

```bash
# Same command as creating - it will overwrite
gh secret set AWS_ACCESS_KEY_ID --body "NEW_VALUE"
```

Or via GitHub UI:
1. Go to Settings → Secrets and variables → Actions
2. Click on the secret name
3. Click **Update secret**
4. Enter new value
5. Click **Update secret**

## 🗑️ Delete Secrets

To remove a secret:

```bash
gh secret delete AWS_ACCESS_KEY_ID
```

Or via GitHub UI:
1. Go to Settings → Secrets and variables → Actions
2. Click on the secret name
3. Click **Delete secret**

## 📊 Secret Audit Log

GitHub provides an audit log for secret changes:

1. Go to repository Settings → Security → Audit log
2. Filter by "secret" events
3. Review who changed what and when

## 🚨 What to Do If Secrets Are Compromised

If you suspect your AWS credentials have been exposed:

### Immediate Actions

1. **Disable the access key immediately:**
   ```bash
   aws iam update-access-key \
     --user-name github-actions-deployer \
     --access-key-id EXPOSED_KEY_ID \
     --status Inactive
   ```

2. **Delete the access key:**
   ```bash
   aws iam delete-access-key \
     --user-name github-actions-deployer \
     --access-key-id EXPOSED_KEY_ID
   ```

3. **Create new access key:**
   ```bash
   aws iam create-access-key --user-name github-actions-deployer
   ```

4. **Update GitHub secret with new key:**
   ```bash
   gh secret set AWS_ACCESS_KEY_ID --body "NEW_KEY"
   gh secret set AWS_SECRET_ACCESS_KEY --body "NEW_SECRET"
   ```

5. **Check CloudTrail for unauthorized activity:**
   ```bash
   aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=Username,AttributeValue=github-actions-deployer \
     --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
     --max-results 100
   ```

6. **Review S3 bucket access logs (if enabled)**

7. **Notify your team**

## 📚 Related Documentation

- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [GitHub Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [AWS CodeDeploy Setup Guide](./AWS_CODEDEPLOY_SETUP.md)
- [AWS CodeDeploy Quick Reference](./AWS_CODEDEPLOY_QUICK_REFERENCE.md)

## 🆘 Troubleshooting

### Workflow Fails with "Secrets not found"

```
Error: AWS credentials not found
```

**Solution:** Verify secrets are set correctly:
```bash
gh secret list | grep AWS
```

### Workflow Fails with "Access Denied"

```
Error: User: arn:aws:iam::123456789:user/github-actions-deployer is not authorized
```

**Solution:** Verify IAM policy is attached:
```bash
aws iam list-attached-user-policies --user-name github-actions-deployer
```

### S3 Upload Fails

```
Error: Access Denied to S3 bucket
```

**Solution:** 
1. Verify bucket name is correct
2. Check IAM policy includes S3 permissions
3. Ensure bucket is in ap-northeast-3 region

## ✅ Checklist

Before running first deployment, verify:

- [ ] All three secrets are added to GitHub
- [ ] Secret names match exactly (case-sensitive)
- [ ] No extra whitespace in secret values
- [ ] AWS access key is Active status
- [ ] IAM policy is attached to user
- [ ] S3 bucket exists in ap-northeast-3
- [ ] S3 bucket name in secret matches actual bucket
- [ ] CodeDeploy application and deployment group exist
- [ ] EC2 instance has correct IAM role
- [ ] CodeDeploy agent is running on EC2

## 📞 Support

If you have issues with secrets:

1. Check this document's troubleshooting section
2. Review GitHub Actions workflow logs
3. Check AWS CloudTrail for authentication errors
4. Verify IAM permissions with AWS Policy Simulator
5. Open an issue in the repository
