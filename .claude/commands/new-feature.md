---
allowed-tools: all
description: Build complete features with proper architecture, testing, and documentation
---

# /new-feature - Complete Feature Development

Build complete features: design first, build incrementally, test thoroughly.

## Arguments
Required: `ARGUMENTS$` describing the feature

## How to Spawn Agents (Phase by Phase)

### Phase 1: Analysis (Parallel)
```
Use Task tool 4 times in ONE message:
- Task(subagent_type="sherlock", prompt="Research [feature] implementations using WebSearch and GREP MCP. Find version numbers, code patterns, deprecations.", description="Research implementations")
- Task(subagent_type="validation", prompt="Analyze codebase at [path]. Identify patterns to follow for [feature].", description="Analyze patterns")
- Task(subagent_type=[specialist], prompt="Review codebase structure. Identify integration points for [feature]. File paths: [list].", description="Find integration points")
- Task(subagent_type="opinion", prompt="Assess complexity of [feature]. Score approach options. Consider: [constraints].", description="Assess complexity")
```

### Phase 2: Design
Create feature design document with architecture, API contracts, database schema (if needed), component structure.

### Phase 3: Implementation (Parallel)
```
Use Task tool 3-4 times in ONE message:
- Task(subagent_type=[language_specialist], prompt="Implement [feature] core logic in [files]. Requirements: [detailed]. Follow patterns from [analysis].", description="Build core logic")
- Task(subagent_type=[framework_specialist], prompt="Create UI components for [feature] in [path]. Use [design system]. Server Components default.", description="Build UI")
- Task(subagent_type="tester", prompt="Write tests for [feature]. Unit: [X], Integration: [Y]. Coverage: 70-80%.", description="Write tests")
- Task(subagent_type="scribe", prompt="Document [feature] API. Include: endpoints, parameters, examples, error codes.", description="Document API")
```

**Specialist Selection**:
- Backend: Go→gopher, JS→jsmaster, Python→thesnake, TS→typegod
- Frontend: React→reactlord, Vue→vuelord, Next.js→nextking/fronty

### Phase 4: Validation (Parallel)
```
Use Task tool 4 times in ONE message:
- Task(subagent_type="validation", prompt="Verify [feature] meets requirements: [list]. Check files: [paths]. Score objectively.", description="Validate requirements")
- Task(subagent_type="bugsy", prompt="Fix any integration issues in [feature]. Check: [specific concerns].", description="Fix issues")
- Task(subagent_type="tester", prompt="Run E2E tests for [feature] workflow: [steps].", description="E2E tests")
- Task(subagent_type="murphy", prompt="Update configs for [feature]: env vars, dependencies, build settings.", description="Update configs")
```

## Success Criteria
- Feature works end-to-end
- Tests passing (70-80% coverage)
- Zero tolerance: no warnings, console.logs, unused code
- Documented
- Performance acceptable

## Visual Response
```
🎯 FEATURE: [name]
├─ Backend: ✅ API endpoints
├─ Frontend: ✅ UI components
├─ Database: ✅ Schema
├─ Tests: ✅ XX% coverage
└─ Status: ✅ Ready
```