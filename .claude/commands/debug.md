---
allowed-tools: all
description: Deep debugging for complex issues with comprehensive analysis
---

# /debug - Root Cause Analysis

Deep troubleshooting with systematic investigation.

## Arguments
Optional: `ARGUMENTS$` for specific issue/symptom

## How to Spawn Agents

**CRITICAL**: Use Task tool with ONE message containing MULTIPLE tool invocations.

```
Use Task tool 4 times in ONE message:
- Task(subagent_type="bugsy", prompt="Analyze error: [error message]. Stack trace: [trace]. Find root cause in files: [paths].", description="Analyze errors")
- Task(subagent_type="sherlock", prompt="Research '[error]' using WebSearch and GREP MCP. Find similar issues, solutions, known bugs.", description="Research issue")
- Task(subagent_type="murphy", prompt="Check environment for [issue]: dependencies, configs, env vars. Verify versions match.", description="Check environment")
- Task(subagent_type=[specialist], prompt="Debug [issue] in [language]. Check: [specific areas]. Files: [paths].", description="Language-specific debug")
```

**Specialist Selection**: Go→gopher, JS→jsmaster, Python→thesnake, TS→typegod

**Detailed Prompts**: Include error messages, stack traces, file paths, symptoms, when it occurs.

## Investigation Areas
Logs, performance, memory, network, database, integrations, race conditions, timing issues.

## Success Criteria
- Root cause identified
- Issue reproduced
- Fix implemented
- Verified resolved

## Failure Protocol
When cannot identify:
1. Add logging/instrumentation
2. Isolate components systematically
3. Report findings with evidence

## Visual Response
```
🔍 DEBUG
├─ Issue: [problem]
├─ Root Cause: [cause]
├─ Fix: [solution]
└─ Status: ✅/⚠️/❌
```