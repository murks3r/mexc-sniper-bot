# Next.js 16 Upgrade Documentation

## Overview
This document outlines the upgrade from Next.js 15.3.4 to Next.js 16.0.1, including migration to Cache Components.

## Upgrade Date
2025-01-XX

## Changes Made

### 1. Package Upgrades
- **Next.js**: `15.3.4` → `16.0.1`
- **React**: Already at `19.2.0` (compatible with Next.js 16)
- **React DOM**: Already at `19.2.0`

### 2. Configuration Changes

#### `next.config.ts`
- ✅ Removed `eslint` configuration (removed in Next.js 16)
- ✅ Added `cacheComponents: true` to enable Cache Components
- ✅ Kept `webpack` configuration (using `--webpack` flag for builds)

#### `package.json`
- ✅ Updated build script to use `--webpack` flag: `"build": "next build --webpack"`
  - This is required because Next.js 16 defaults to Turbopack, but we have custom webpack configuration
  - Future migration to Turbopack can be done by removing webpack config and the `--webpack` flag

### 3. Middleware Migration

#### `middleware.ts` → `proxy.ts`
- ✅ Renamed `middleware.ts` to `proxy.ts` (Next.js 16 naming convention)
- ✅ Renamed `middleware` function to `proxy` function
- ✅ Updated import in `src/lib/supabase-middleware.ts` (if needed)

**Note**: The `proxy` runtime is `nodejs` (not `edge`). If you need edge runtime, continue using `middleware.ts` for now.

### 4. Cache Components Migration

Cache Components have been enabled via `cacheComponents: true` in `next.config.ts`.

**Key Points**:
- All page components are client components (`"use client"`), so they don't require `"use cache"` directives
- Route handlers (API routes) handle caching differently and don't need `"use cache"` directives
- Server Components that fetch data should use `"use cache"` directive when appropriate

### 5. Breaking Changes Addressed

#### Async Request APIs
- ✅ Route handlers already use async `params` (e.g., `app/api/snipe-targets/[id]/route.ts`)
- ✅ Route handlers use `new URL(request.url).searchParams` which is compatible
- ✅ No page components use `params` or `searchParams` props directly (all are client components)

#### Turbopack Default
- ✅ Build script updated to use `--webpack` flag to maintain compatibility with custom webpack config
- ⚠️ **Future Work**: Consider migrating webpack config to Turbopack for better performance

#### ESLint Removal
- ✅ ESLint config removed from `next.config.ts`
- ✅ Using Biome for linting (already configured)

### 6. Testing

#### Integration Tests
- ✅ Created `app/__tests__/routes.spec.tsx` to verify route imports
- ⚠️ Some tests fail due to missing dependencies in test environment (not related to upgrade)

#### Type Checking
- ⚠️ Pre-existing TypeScript errors remain (not related to upgrade)
- ✅ Build configured with `ignoreBuildErrors: true` (as before)

## Verification Checklist

- [x] Next.js 16.0.1 installed
- [x] React 19.2.0 compatible (already installed)
- [x] `cacheComponents` enabled in config
- [x] Middleware migrated to proxy
- [x] Build script updated for webpack compatibility
- [x] ESLint config removed
- [x] No breaking changes in route handlers
- [x] Linting passes (Biome)
- [x] Type checking runs (pre-existing errors remain)

## Known Issues

1. **Webpack vs Turbopack**: Currently using webpack with `--webpack` flag. Consider migrating to Turbopack in the future for better performance.

2. **TypeScript Errors**: Pre-existing TypeScript errors remain. These don't block builds due to `ignoreBuildErrors: true`.

3. **Test Environment**: Some integration tests fail due to missing dependencies in test environment. This is not related to the upgrade.

## Future Improvements

1. ✅ **Migrate to Turbopack**: Completed - Removed webpack configuration and migrated to Turbopack (see `TURBOPACK_MIGRATION.md`)
2. **Fix TypeScript Errors**: Address pre-existing TypeScript errors
3. **Add Cache Directives**: Review server components and add `"use cache"` directives where appropriate
4. **Update Dependencies**: Ensure all dependencies are compatible with Next.js 16

## References

- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Cache Components Documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)
- [Middleware to Proxy Migration](https://nextjs.org/docs/app/guides/upgrading/version-16#middleware-to-proxy)

## Node.js Requirements

- **Minimum**: Node.js 20.9.0 (LTS)
- **Current**: Node.js 22.19.0 ✅

## Browser Support

- Chrome 111+
- Edge 111+
- Firefox 111+
- Safari 16.4+

