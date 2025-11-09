---
allowed-tools: all
description: Execute project tasks in batches using specialized agents and validation workflow
---

# /start-project

## Purpose
Execute tasks from daddy MCP database in intelligent batches with automated validation and completion tracking.

## Arguments
Optional: `ARGUMENTS$` for batch size or focus area

## Execution

### Phase 1: Task Batching
Get incomplete tasks via mcp__hey-daddy__get_incomplete_tasks
Group tasks by:
- File proximity (same directory/module)
- Functional cohesion (same feature)
- Dependency chains
- Technology layer
- Similar complexity

### Phase 2: Batch Execution
For each batch:

1. **Implementation Loop**
   - Get task via mcp__hey-daddy__get_task
   - Check status:
     - todo/needs_fixes → Spawn SPECIALIZED agent
     - coding_done → Ready for validation
     - validated → Mark complete

   SPAWN CORRECT SPECIALIST (NEVER use generic agents):
   - Go → gopher
   - JavaScript → jsmaster
   - Python → thesnake
   - TypeScript → typegod
   - React → reactlord
   - Vue → vuelord
   - Next.js → nextking

2. **Validation Phase**
   After batch reaches coding_done:
   - Spawn validation agent with all task IDs
   - Validation sets: validated or needs_fixes

3. **Fix Loop**
   If needs_fixes:
   - Spawn bugsy for each failed task
   - Bugsy sets back to coding_done
   - Re-validate until all pass

4. **Completion**
   When validated:
   - Update status to complete via mcp__hey-daddy__update_task_status
   - Move to next batch

### Phase 3: Adaptive Optimization
- Track validation success rates
- Adjust batch sizes based on failures
- Learn optimal grouping patterns

## Success Criteria
- All tasks follow: todo → coding_done → validated → complete
- Correct specialist agents used
- No tasks skipped or stuck
- Validation passes before completion

## Visual Response
```
🚀 PROJECT EXECUTION
├─ Batch 1/N: [task descriptions]
│  ├─ Status: ✅ Complete
│  └─ Time: Xm Ys
├─ Current: Batch 2/N
│  ├─ Tasks: 3 in progress
│  └─ Agent: jsmaster working
└─ Progress: XX% complete
```

---
*Optimized for: reliability*