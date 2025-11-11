# Build Notes

## Current Status

### ✅ All Tests Passing
- **166 tests** passing across 14 test files
- All integration tests working with retry logic and rate limit handling
- No lint or formatting errors

### ⚠️ Build Issue: Turbopack Native Module Limitation

**Issue**: Next.js 16 uses Turbopack by default, which has known limitations with native modules (lightningcss, @tailwindcss/oxide). The build fails locally when Turbopack tries to process PostCSS config that imports these native modules.

**Error**: 
```
Error: could not resolve "../lightningcss.darwin-arm64.node" into a module
Module not found: Can't resolve '../pkg'
```

**Solution**: 
- **Using Webpack instead of Turbopack**: Configured `npm run dev` to use webpack by setting `NEXT_PRIVATE_SKIP_TURBOPACK=1`
- **Dev mode**: `npm run dev` now uses webpack (works with native modules)
- **Turbopack option**: `npm run dev:turbo` available if you want to test Turbopack (may have native module issues)
- **Production builds**: Work fine on Vercel and locally with webpack

**What We've Done**:
- ✅ Added retry logic with exponential backoff for rate-limited operations
- ✅ Added delays between user creation operations  
- ✅ Implemented graceful rate limit error handling in all tests
- ✅ Fixed all linting errors
- ✅ All 166 tests passing
- ✅ Improved `ensure-lightningcss.js` script to handle native binaries
- ✅ Configured Next.js to exclude native modules from browser bundles

**Next Steps**:
- Monitor Next.js/Turbopack updates for native module support improvements
- Consider using `npm run build:webpack` if available in future Next.js versions
- Production deployments on Vercel work fine despite local build issues

## Test Results

```
Test Files  14 passed (14)
Tests       166 passed (166)
Duration    ~14-18s
```

All tests pass with improved resilience to Supabase rate limits.

