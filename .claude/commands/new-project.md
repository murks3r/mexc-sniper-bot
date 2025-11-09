---
allowed-tools: all
description: Analyze daddy_project.md and create sequenced task database
---

# /new-project

## Purpose
Parse daddy_project.md requirements and generate optimally sequenced tasks using senior developer principles.

## Arguments
Optional: `ARGUMENTS$` for project type or priority focus

## Execution

### Phase 1: Requirements Analysis
1. Read daddy_project.md for complete requirements
2. Extract custom project structure from file
3. Identify project type and tech stack
4. Map dependencies and critical paths
5. Assess risks and unknowns

### Phase 2: Task Generation
Use mcp__hey-daddy__add_task for each task with:
- Clear description with agent assignment
- Specific requirements including which specialist agent
- Exact files following project structure
- Expected results and success criteria
- Scope: 'project'

Agent assignments in requirements:
- Go tasks → "Implementation by gopher agent"
- JavaScript → "Implementation by jsmaster agent"
- Python → "Implementation by thesnake agent"
- TypeScript → "Implementation by typegod agent"
- React → "Implementation by reactlord agent"
- Vue → "Implementation by vuelord agent"
- Next.js → "Implementation by nextking agent"

### Phase 3: Sequencing
Order tasks by:
1. Foundation and infrastructure first
2. High-risk items early
3. Critical path priorities
4. Parallel opportunities identified
5. Incremental delivery milestones

## Success Criteria
- All requirements from daddy_project.md covered
- Tasks follow custom project structure
- Optimal dependency ordering
- Risk mitigation in early tasks
- Each task independently testable

## Visual Response
```
📋 PROJECT SETUP
├─ Project Type: [detected]
├─ Tech Stack: [identified]
├─ Tasks Created: X
├─ Risk Items: Y (prioritized)
└─ Ready for: /start-project
```

---
*Optimized for: completeness*