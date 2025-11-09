---
allowed-tools: all
description: Validate code quality, tests, and production readiness
---

# /check - Zero Tolerance Quality Gate

Validates entire codebase with ZERO TOLERANCE for issues.

## Arguments
Optional: `ARGUMENTS$` for specific areas/files

## How to Spawn Agents

**CRITICAL**: Use Task tool with ONE message containing MULTIPLE tool invocations (not separate messages).

```
Use Task tool 6 times in single message:
1. Task(subagent_type="tester", prompt="Run ALL tests...", description="Run tests")
2. Task(subagent_type="murphy", prompt="Check dependencies...", description="Check deps")
3. Task(subagent_type="bugsy", prompt="Find runtime errors...", description="Find errors")
4. Task(subagent_type="validation", prompt="Verify imports...", description="Validate code")
5. Task(subagent_type=[specialist], prompt="Language checks...", description="Language check")
6. Task(subagent_type="deploy", prompt="Verify build...", description="Verify build")
```

**Specialist Selection**: Go→gopher, JS→jsmaster, Python→thesnake, TS→typegod, React→reactlord, Vue→vuelord, Next.js→nextking

**Detailed Prompts**: Include file paths, context, what to check. Each agent gets separate Task invocation in ONE message.

## Zero Tolerance Criteria

- NO warnings (not even deprecation)
- NO console.logs in production code
- NO commented code
- NO unused anything
- NO test failures
- NO linting errors
- NO build warnings
- NO security vulnerabilities

## Fix Protocol (When Issues Found)

**CRITICAL**: After identifying issues, IMMEDIATELY spawn fix agents in parallel.

### Step 1: Collect All Issues
From all agent reports, compile:
- Test failures → list of failing tests
- Dependency issues → list of problems
- Runtime errors → file:line locations
- Code quality → specific violations
- Build errors → error messages

### Step 2: Spawn Fix Agents (ONE message, MULTIPLE Tasks)
```
Use Task tool for each issue type in ONE message:
- Task(subagent_type="bugsy", prompt="Fix these errors: [list with file:line]. Root cause: [from analysis]. Test fixes work.", description="Fix errors")
- Task(subagent_type="tester", prompt="Fix failing tests: [list]. Debug why they fail. Make them pass.", description="Fix tests")
- Task(subagent_type="murphy", prompt="Fix dependency issues: [list]. Update packages, resolve conflicts, verify versions.", description="Fix dependencies")
- Task(subagent_type=[specialist], prompt="Fix language-specific issues: [list with file:line]. Zero tolerance: no warnings.", description="Fix code issues")
- Task(subagent_type="validation", prompt="Remove all unused code: [list]. Delete console.logs, commented code, unused imports.", description="Clean code")
```

### Step 3: Re-Run Complete Check
After fixes applied, spawn ALL 6 check agents again (from "How to Spawn Agents" section).

### Step 4: Loop Until Clean
Repeat Steps 1-3 until ALL agents report zero issues. Do NOT stop until 100% clean.

## Visual Response

**Initial Check**:
```
| Component    | Status | Issues |
|--------------|--------|--------|
| Tests        | ❌     | 5      |
| Dependencies | ❌     | 3      |
| Errors       | ❌     | 12     |
```

**After Fixes**:
```
| Component    | Status | Issues | Action   |
|--------------|--------|--------|----------|
| Tests        | ✅     | 0      | 🔧 Fixed |
| Dependencies | ✅     | 0      | 🔧 Fixed |
| Errors       | ✅     | 0      | 🔧 Fixed |
| Build        | ✅     | 0      | -        |
| Code Quality | ✅     | 0      | 🔧 Fixed |

✅ CODEBASE 100% CLEAN - PRODUCTION READY
```