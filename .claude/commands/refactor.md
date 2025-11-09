---
allowed-tools: all
description: Improve code quality without changing behavior
---

# /refactor - Code Improvement

Improve code quality while preserving exact behavior. KISS/YAGNI principles.

## Arguments
Optional: `ARGUMENTS$` for specific files/patterns

## How to Spawn Agents

**CRITICAL**: Use Task tool with ONE message containing MULTIPLE tool invocations.

```
Use Task tool 4 times in ONE message:
- Task(subagent_type="validation", prompt="Identify refactoring opportunities in [files]. Check: duplicate code, complex functions, naming, coupling. Score current quality.", description="Identify opportunities")
- Task(subagent_type=[specialist], prompt="Refactor [component] in [files]. Targets: [issues found]. KISS/YAGNI principles. Preserve behavior exactly. Run tests after each change.", description="Implement refactoring")
- Task(subagent_type="tester", prompt="Write tests BEFORE refactoring [component]. Verify behavior unchanged after refactoring. Coverage: 70-80%.", description="Write behavior tests")
- Task(subagent_type="bugsy", prompt="Fix any issues introduced by refactoring in [files]. Verify tests pass. Check: [specific concerns].", description="Fix issues")
```

**Specialist Selection**: Go→gopher, JS→jsmaster, Python→thesnake, TS→typegod, React→reactlord

**Targets**: Duplicate code, complex functions (>20 lines), poor naming, tight coupling, performance bottlenecks

## Success Criteria
- Behavior identical (tests prove it)
- Code simpler (KISS/YAGNI)
- Tests pass
- Performance same or better
- No new bugs

## Failure Protocol
When refactoring breaks something:
1. Revert immediately
2. Add tests first
3. Refactor incrementally
4. Verify each step

## Visual Response
```
♻️ REFACTOR
├─ Files: X changed
├─ Lines: -Y reduced
├─ Tests: ✅ Passing
└─ Behavior: ✅ Unchanged
```