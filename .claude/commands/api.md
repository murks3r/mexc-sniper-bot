---
allowed-tools: all
description: Build complete REST/GraphQL APIs with testing and documentation
---

# /api

## Purpose
Creates production-ready APIs with authentication, testing, and documentation.

## Arguments
Optional: `ARGUMENTS$` for specific endpoints/features

## Execution

### Execution
SPAWN API AGENTS IN PARALLEL (single message, multiple Task tools):
- sherlock: Research API patterns via WebSearch/GREP MCP
- [language_specialist]: Build endpoints and middleware
- [same_specialist]: Implement authentication/validation
- tester: Create comprehensive API tests
- scribe: Generate API documentation

Select specialist: Go→gopher, JS/Node→jsmaster, Python→thesnake, TS→typegod, Next.js→nextking

Components: Routes, validation, auth, error handling, models, rate limiting, docs

## Success Criteria
- All endpoints working
- Authentication secure
- Validation comprehensive
- Tests passing
- Documentation complete
- Performance acceptable

## Failure Protocol
When API fails:
1. Check request/response cycle
2. Validate database connections
3. Test authentication flow
4. Fix middleware order

## Visual Response
```
🔌 API ENDPOINTS
├─ GET    /api/users     ✅ Tested
├─ POST   /api/users     ✅ Tested
├─ PUT    /api/users/:id ✅ Tested
├─ DELETE /api/users/:id ✅ Tested
├─ Auth:  JWT/OAuth configured
└─ Docs:  /api/docs available
```

---
*Optimized for: completeness*