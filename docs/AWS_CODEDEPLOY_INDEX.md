# AWS CodeDeploy Documentation Index

Complete documentation for AWS CodeDeploy continuous deployment setup for MEXC Sniper Bot.

## 📚 Documentation Overview

This repository contains complete documentation for setting up continuous deployment from GitHub Actions to AWS EC2 using AWS CodeDeploy, specifically configured for the Osaka region (ap-northeast-3).

## 🗂️ Documentation Structure

### 1. Quick Start
- **[AWS CodeDeploy Quick Reference](./AWS_CODEDEPLOY_QUICK_REFERENCE.md)** - Fast setup commands and troubleshooting
  - One-page reference for common tasks
  - Quick verification commands
  - Troubleshooting shortcuts
  - Cost estimates

### 2. Complete Setup Guide
- **[AWS CodeDeploy Setup Guide](./AWS_CODEDEPLOY_SETUP.md)** - Comprehensive step-by-step instructions
  - Complete AWS infrastructure setup
  - IAM roles and policies
  - EC2 instance configuration
  - CodeDeploy application setup
  - Detailed troubleshooting
  - Security best practices

### 3. GitHub Integration
- **[GitHub Secrets Configuration](./AWS_CODEDEPLOY_GITHUB_SECRETS.md)** - GitHub Secrets management
  - Required secrets list
  - How to add secrets securely
  - Security best practices
  - Secret rotation procedures
  - Troubleshooting secret issues

### 4. Configuration Files

Located in repository root:

| File | Purpose |
|------|---------|
| `appspec.yml` | CodeDeploy application specification |
| `github-actions-policy.json` | IAM policy for GitHub Actions user |
| `ec2-s3-access-policy.json` | IAM policy for EC2 S3 access |
| `ec2-role-trust-policy.json` | Trust policy for EC2 role |
| `codedeploy-trust-policy.json` | Trust policy for CodeDeploy service role |
| `s3-lifecycle-policy.json` | S3 bucket lifecycle policy |

### 5. Deployment Scripts

Located in `scripts/codedeploy/`:

| Script | Purpose |
|--------|---------|
| `before_install.sh` | Prepare environment before deployment |
| `after_install.sh` | Install dependencies and build application |
| `application_stop.sh` | Stop running application |
| `application_start.sh` | Start application with PM2 |
| `validate_service.sh` | Verify deployment success |

### 6. GitHub Workflow

Located in `.github/workflows/`:

- **`deploy-ec2-codedeploy.yml`** - Main deployment workflow
  - Triggered on push to main branch
  - Creates deployment package
  - Uploads to S3 (Osaka)
  - Triggers CodeDeploy
  - Notifies via GitHub issues

## 🚀 Getting Started

### New Users - Start Here

1. **Read the overview** (this document)
2. **Review** [AWS CodeDeploy Quick Reference](./AWS_CODEDEPLOY_QUICK_REFERENCE.md)
3. **Follow** [AWS CodeDeploy Setup Guide](./AWS_CODEDEPLOY_SETUP.md) step-by-step
4. **Configure** [GitHub Secrets](./AWS_CODEDEPLOY_GITHUB_SECRETS.md)
5. **Test deployment** by pushing to main branch

### Quick Setup (Experienced Users)

If you're familiar with AWS:

1. Use commands from [Quick Reference](./AWS_CODEDEPLOY_QUICK_REFERENCE.md)
2. Set GitHub Secrets from [GitHub Secrets Guide](./AWS_CODEDEPLOY_GITHUB_SECRETS.md)
3. Push to main branch to trigger deployment

## 📋 Prerequisites Checklist

Before starting, ensure you have:

- [ ] AWS Account with administrative access
- [ ] GitHub repository admin access
- [ ] AWS CLI installed and configured
- [ ] GitHub CLI installed (optional, but recommended)
- [ ] Basic understanding of:
  - AWS IAM (users, roles, policies)
  - AWS EC2 (instances, security groups)
  - AWS S3 (buckets, objects)
  - AWS CodeDeploy (applications, deployment groups)
  - GitHub Actions (workflows, secrets)

## 🎯 Implementation Checklist

### Phase 1: AWS Infrastructure (60-90 minutes)

- [ ] Create S3 bucket in ap-northeast-3 (Osaka)
- [ ] Create IAM user for GitHub Actions
- [ ] Create and configure IAM policies
- [ ] Create IAM role for EC2
- [ ] Launch EC2 instance in Osaka
- [ ] Configure security groups
- [ ] Install CodeDeploy agent on EC2
- [ ] Create CodeDeploy application
- [ ] Create CodeDeploy deployment group
- [ ] Test infrastructure setup

### Phase 2: GitHub Configuration (10-15 minutes)

- [ ] Add AWS_ACCESS_KEY_ID secret
- [ ] Add AWS_SECRET_ACCESS_KEY secret
- [ ] Add AWS_S3_BUCKET secret
- [ ] Verify workflow file exists
- [ ] Verify appspec.yml exists
- [ ] Verify deployment scripts exist

### Phase 3: Testing (15-30 minutes)

- [ ] Push to main branch
- [ ] Monitor GitHub Actions workflow
- [ ] Check S3 for deployment artifact
- [ ] Monitor CodeDeploy deployment
- [ ] Verify application is running on EC2
- [ ] Test application functionality
- [ ] Review logs

### Phase 4: Production Readiness (30-60 minutes)

- [ ] Configure environment variables on EC2
- [ ] Set up database connection
- [ ] Configure domain/DNS (if applicable)
- [ ] Enable HTTPS/SSL
- [ ] Set up monitoring (CloudWatch)
- [ ] Configure logging
- [ ] Test rollback procedure
- [ ] Document custom configurations

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         GitHub Repository                        │
│  (Contains: Application Code, AppSpec, Deployment Scripts)      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                    Push to main
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GitHub Actions Workflow                     │
│  - Build deployment package                                      │
│  - Upload to S3 bucket (Osaka)                                  │
│  - Trigger CodeDeploy deployment                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  S3 Bucket (ap-northeast-3)                     │
│  - Stores deployment artifacts                                  │
│  - Versioning enabled                                           │
│  - Lifecycle policy for cleanup                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AWS CodeDeploy                             │
│  - Application: mexc-sniper-bot                                 │
│  - Deployment Group: mexc-sniper-bot-deployment-group          │
│  - Deployment Config: OneAtATime                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                EC2 Instance (ap-northeast-3)                    │
│  - CodeDeploy Agent running                                     │
│  - Executes deployment hooks:                                   │
│    1. BeforeInstall → Prepare environment                       │
│    2. AfterInstall → Install deps & build                       │
│    3. ApplicationStop → Stop current app                        │
│    4. ApplicationStart → Start with PM2                         │
│    5. ValidateService → Verify running                          │
└─────────────────────────────────────────────────────────────────┘
```

## 🔐 Security Architecture

```
GitHub Actions (IAM User: github-actions-deployer)
├── Permissions:
│   ├── S3: PutObject, GetObject (specific bucket)
│   └── CodeDeploy: CreateDeployment, GetDeployment
│
EC2 Instance (IAM Role: EC2CodeDeployRole)
├── Permissions:
│   ├── S3: GetObject (specific bucket)
│   ├── CodeDeploy: Read deployment information
│   └── CloudWatch: Write logs and metrics
│
CodeDeploy Service (IAM Role: CodeDeployServiceRole)
└── Permissions:
    ├── EC2: Describe and manage instances
    ├── Auto Scaling: Manage deployment groups
    └── Load Balancers: Update target groups
```

## 📊 Deployment Flow

```
1. Developer pushes code to main branch
   ↓
2. GitHub Actions workflow triggers
   ↓
3. Workflow creates deployment.zip
   ↓
4. Workflow uploads to S3 (Osaka)
   ↓
5. Workflow calls CodeDeploy API
   ↓
6. CodeDeploy downloads from S3
   ↓
7. CodeDeploy agent runs BeforeInstall hook
   ↓
8. CodeDeploy copies files to EC2
   ↓
9. CodeDeploy agent runs AfterInstall hook
   ↓
10. CodeDeploy agent runs ApplicationStop hook
   ↓
11. CodeDeploy agent runs ApplicationStart hook
   ↓
12. CodeDeploy agent runs ValidateService hook
   ↓
13. CodeDeploy marks deployment as successful
   ↓
14. GitHub Actions creates success issue
```

## 🔍 Monitoring and Debugging

### Logs Location

| Component | Log Location |
|-----------|-------------|
| CodeDeploy Agent | `/var/log/aws/codedeploy-agent/codedeploy-agent.log` |
| Deployment Logs | `/opt/codedeploy-agent/deployment-root/deployment-logs/` |
| Application (PM2) | `pm2 logs mexc-sniper-bot` |
| System Logs | `/var/log/messages` |

### AWS Console Links

- [CodeDeploy Console (Osaka)](https://ap-northeast-3.console.aws.amazon.com/codesuite/codedeploy/applications)
- [EC2 Console (Osaka)](https://ap-northeast-3.console.aws.amazon.com/ec2/)
- [S3 Console](https://s3.console.aws.amazon.com/)
- [IAM Console](https://console.aws.amazon.com/iam/)
- [CloudWatch Console (Osaka)](https://ap-northeast-3.console.aws.amazon.com/cloudwatch/)

## 💰 Cost Estimation

| Service | Usage | Monthly Cost (USD) |
|---------|-------|-------------------|
| EC2 t3.micro | 24/7 | $7.50 |
| S3 Storage | 10 GB | $0.25 |
| S3 Requests | 1000 requests | $0.01 |
| CodeDeploy | Unlimited | Free |
| Data Transfer | 10 GB outbound | $0.90 |
| **Total** | | **~$8.66/month** |

*Costs may vary by region and usage. Check AWS pricing for current rates.*

## 🆘 Support and Troubleshooting

### Common Issues

1. **CodeDeploy Agent Not Running**
   - See: [Quick Reference - Troubleshooting](./AWS_CODEDEPLOY_QUICK_REFERENCE.md#-quick-troubleshooting)

2. **Deployment Fails**
   - See: [Setup Guide - Troubleshooting](./AWS_CODEDEPLOY_SETUP.md#troubleshooting)

3. **GitHub Secrets Issues**
   - See: [GitHub Secrets - Troubleshooting](./AWS_CODEDEPLOY_GITHUB_SECRETS.md#-troubleshooting)

4. **Application Won't Start**
   - Check PM2 logs: `pm2 logs mexc-sniper-bot`
   - Verify environment variables
   - Check database connection

### Getting Help

1. Review relevant documentation section
2. Check AWS CloudWatch logs
3. Review CodeDeploy deployment history
4. Verify IAM permissions
5. Test components individually
6. Open GitHub issue with:
   - Detailed error description
   - Relevant log excerpts
   - Steps to reproduce
   - Environment information

## 📚 Additional Resources

### AWS Documentation
- [AWS CodeDeploy User Guide](https://docs.aws.amazon.com/codedeploy/)
- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS EC2 User Guide](https://docs.aws.amazon.com/ec2/)
- [Amazon S3 User Guide](https://docs.aws.amazon.com/s3/)

### GitHub Documentation
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)

### Third-Party Resources
- [Original Guide (fastfwd.com)](https://www.fastfwd.com/continuous-deployment-github-aws-ec2-using-aws-codedeploy/)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Next.js Deployment Documentation](https://nextjs.org/docs/deployment)

## 🔄 Maintenance

### Regular Tasks

| Task | Frequency | Documentation |
|------|-----------|---------------|
| Rotate AWS access keys | Every 90 days | [GitHub Secrets](./AWS_CODEDEPLOY_GITHUB_SECRETS.md#1-access-key-rotation) |
| Update dependencies | Weekly | Run `bun update` on EC2 |
| Review CloudWatch logs | Weekly | Check for errors/warnings |
| Clean up S3 old deployments | Automated | Via lifecycle policy |
| Update CodeDeploy agent | Monthly | [AWS Guide](https://docs.aws.amazon.com/codedeploy/latest/userguide/codedeploy-agent-operations-update.html) |
| Review IAM permissions | Quarterly | Audit access policies |
| Test rollback procedure | Quarterly | Verify deployment rollback works |

## 📝 Change Log

### Version History

- **v1.0** (2024-XX-XX)
  - Initial AWS CodeDeploy setup
  - Complete documentation suite
  - Osaka region (ap-northeast-3) configuration
  - GitHub Actions integration
  - Automated deployment pipeline

## 🤝 Contributing

To improve this documentation:

1. Fork the repository
2. Create a feature branch
3. Update documentation
4. Test instructions thoroughly
5. Submit pull request with:
   - Clear description of changes
   - Reason for changes
   - Testing performed

## 📄 License

This documentation is part of the MEXC Sniper Bot project and follows the same MIT License.

---

**Last Updated:** 2024-XX-XX  
**Maintained By:** MEXC Sniper Bot Team  
**Region:** ap-northeast-3 (Osaka, Japan)
