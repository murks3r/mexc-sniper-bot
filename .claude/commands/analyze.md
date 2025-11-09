---
allowed-tools: all
description: Deep codebase analysis to understand architecture and patterns
---

# /analyze

## Purpose
Rapidly understands any codebase structure, patterns, and dependencies.

## Arguments
Optional: `ARGUMENTS$` for specific focus areas

## Execution

### Execution
SPAWN ANALYSIS AGENTS IN PARALLEL (single message, multiple Task tools):
- sherlock: Identify tech stack via WebSearch/GREP MCP
- validation: Analyze code quality and patterns
- murphy: Map ALL dependencies and configurations
- [language_specialist]: Language-specific architecture
- scribe: Document comprehensive findings

Select specialist: Go→gopher, JS→jsmaster, Python→thesnake, TS→typegod, React→reactlord

Analyze: Structure, patterns, dependencies, APIs, database, auth, state, testing

## Success Criteria
- Tech stack identified
- Architecture documented
- Key patterns found
- Dependencies mapped
- Entry points clear

## Failure Protocol
When analysis incomplete:
1. Read more source files
2. Check package files
3. Look for documentation
4. Report partial findings

## Visual Response
```
📊 CODEBASE ANALYSIS
├─ Stack: [detected technologies]
├─ Structure: [architecture pattern]
├─ Dependencies: X packages
├─ APIs: Y endpoints
├─ Database: [type and models]
├─ Tests: Z% coverage
└─ Entry: [main entry points]
```

---
*Optimized for: speed*