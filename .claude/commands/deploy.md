---
allowed-tools: all
description: Deploy application to production platforms
---

# /deploy

## Purpose
Deploys application to Vercel, Railway, Render, or Netlify with proper configuration.

## Arguments
Optional: `ARGUMENTS$` for specific platform/environment

## Execution

### Execution
Sequential flow (deployment must be ordered):
1. deploy: Detect project type and platform
2. deploy: Create platform-specific config
3. murphy: Validate environment variables
4. deploy: Execute deployment
5. tester: Run smoke tests on deployed URL

Auto-select platform: Next.js→Vercel, Full-stack+DB→Railway, Env-heavy→Render, Static→Netlify

## Success Criteria
- Deployment succeeds
- App accessible at URL
- Environment variables set
- Database connected (if applicable)
- No runtime errors

## Failure Protocol
When deployment fails:
1. Check build logs for errors
2. Validate environment variables
3. Fix configuration issues
4. Retry deployment

## Visual Response
```
🚀 DEPLOYMENT STATUS
├─ Platform: [detected platform]
├─ URL: [deployment URL]
├─ Status: ✅ Live
└─ Health: All checks passing
```

---
*Optimized for: reliability*