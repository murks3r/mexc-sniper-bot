---
allowed-tools: all
description: Security audit and vulnerability fixes - NO external services or API keys required
---

# /secure - Security Audit

Audit and fix security vulnerabilities. DEFENSIVE security only - works locally, no external setup needed.

## Arguments
Optional: `ARGUMENTS$` for specific areas

## What Gets Checked (Local Only)

**Code Security**: Input validation, SQL injection, XSS, auth checks, error handling
**Secrets**: Hardcoded keys/passwords in code and git history
**Dependencies**: npm audit / pip-audit / go vulnerabilities
**Config**: Security headers, HTTPS, cookies, CORS
**NOT Checked**: External CI/CD, GitHub Actions, cloud services (require API keys)

## How to Spawn Agents

**CRITICAL**: Use Task tool with ONE message containing MULTIPLE tool invocations.

```
Use Task tool 5 times in ONE message:
- Task(subagent_type="locksmith", prompt="Audit [path] for security vulnerabilities. Check: input validation, SQL injection, XSS, secrets in code, error handling. Fix issues locally.", description="Security audit")
- Task(subagent_type="murphy", prompt="Run npm audit / pip-audit. Check dependencies for known vulnerabilities. List packages to update. NO external service setup.", description="Check dependencies")
- Task(subagent_type="validation", prompt="Scan [path] for hardcoded secrets: API keys, passwords, tokens. Check .gitignore includes .env. Scan git history for leaked secrets.", description="Scan for secrets")
- Task(subagent_type="bugsy", prompt="Fix security vulnerabilities: [list from locksmith]. Apply defensive fixes. Test fixes work.", description="Fix vulnerabilities")
- Task(subagent_type=[specialist], prompt="Implement security best practices in [files]: parameterized queries, input validation, output encoding. Language: [detected].", description="Harden code")
```

**Specialist Selection**: Go→gopher, JS→jsmaster, Python→thesnake, TS→typegod

## What NOT To Do

**FORBIDDEN** (require external setup):
- GitHub Actions workflows
- Dependabot configuration
- External CI/CD pipelines
- Docker security scanning
- Cloud security services
- Monitoring/alerting services requiring API keys

**ALLOWED** (works locally):
- npm audit / pip-audit / go vulnerabilities
- Code security fixes
- Input validation
- Secret scanning in code/git
- Security headers in code
- Local security audits

## Success Criteria

- No critical/high vulnerabilities
- All inputs validated
- No secrets in code or git history
- Dependencies have no known vulnerabilities
- Security headers configured
- Error handling doesn't expose internals

## Visual Response

```
🔒 SECURITY AUDIT
├─ Code: ✅ No injection vulnerabilities
├─ Secrets: ✅ None found in code/git
├─ Dependencies: ✅ 0 vulnerabilities
├─ Headers: ✅ Configured
└─ Status: ✅ SECURE

FIXED:
- [X] SQL injection in [file:line]
- [Y] XSS vulnerability in [file:line]
- [Z] Hardcoded secret removed from [file]
```