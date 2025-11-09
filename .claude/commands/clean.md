---
allowed-tools: all
description: Remove dead code and improve codebase maintainability
---

# /clean - Remove Dead Code

Remove unused code, dependencies, files based on evidence. Zero tolerance mode.

## Arguments
Optional: `ARGUMENTS$` for specific areas

## How to Spawn Agents

**CRITICAL**: Use Task tool with ONE message containing MULTIPLE tool invocations.

```
Use Task tool 4 times in ONE message:
- Task(subagent_type="validation", prompt="Identify unused code in [path]. Find: unused imports, dead functions, orphaned files, commented code. Verify with grep/analysis.", description="Identify dead code")
- Task(subagent_type="murphy", prompt="Find unused dependencies in package.json. Check: npm ls, dependency graph. List packages to remove.", description="Find unused deps")
- Task(subagent_type=[specialist], prompt="Remove dead code from [files]. Targets: [list from validation]. Test after each removal. Verify build succeeds.", description="Remove dead code")
- Task(subagent_type="tester", prompt="Run ALL tests after cleanup. Verify nothing broke. Check: [critical paths].", description="Verify tests pass")
```

**Specialist Selection**: Go→gopher, JS→jsmaster, Python→thesnake, TS→typegod

**Targets**: Unused imports, dead functions, orphaned files, unused deps, commented code, console.logs

## Success Criteria
- Only unused code removed (proven by tests)
- Tests pass
- Build succeeds
- Bundle size reduced
- Zero tolerance: no warnings

## Failure Protocol
When cleanup breaks something:
1. Revert immediately
2. Trace actual usage carefully
3. Clean incrementally
4. Test after each removal

## Visual Response
```
🧹 CLEANUP
├─ Files: X removed
├─ Lines: -Y deleted
├─ Dependencies: -Z
├─ Bundle: -XX KB
└─ Tests: ✅ Passing
```