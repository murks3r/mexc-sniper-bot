---
allowed-tools: all
description: Write and run comprehensive tests for code coverage
---

# /test - Comprehensive Testing

Write and run tests. Target: 70-80% coverage.

## Arguments
Optional: `ARGUMENTS$` for specific components/features

## How to Spawn Agents

**CRITICAL**: Use Task tool with ONE message containing MULTIPLE tool invocations.

```
Use Task tool 5 times in ONE message:
- Task(subagent_type="tester", prompt="Write unit tests for [component] in [files]. Test business logic, edge cases. Use: Vitest/pytest. Coverage: 70-80%.", description="Write unit tests")
- Task(subagent_type="tester", prompt="Write integration tests for [feature]. Test API/database interactions. Mock external services with MSW v2. Files: [paths].", description="Write integration tests")
- Task(subagent_type="tester", prompt="Write E2E tests for critical workflow: [steps]. Use Playwright. Verify: [requirements].", description="Write E2E tests")
- Task(subagent_type="bugsy", prompt="Fix any failing tests in [path]. Debug test failures. Check: mocks, async handling, timing.", description="Fix failing tests")
- Task(subagent_type="murphy", prompt="Setup test environment: install test dependencies, configure test runner, setup mocks. Verify: [test framework] installed.", description="Setup test env")
```

**Coverage Targets**: Unit 70-80%, Integration for critical paths, E2E for key workflows

**Tools**: Vitest (JS/TS), pytest (Python), MSW v2 (API mocking), Playwright (E2E)

## Success Criteria
- Coverage 70-80%
- All tests passing
- Edge cases covered
- Mocks appropriate
- Maintainable

## Visual Response
```
| Type        | Coverage | Status |
|-------------|----------|--------|
| Unit        | XX%      | ✅     |
| Integration | XX%      | ✅     |
| E2E         | XX%      | ✅     |
```