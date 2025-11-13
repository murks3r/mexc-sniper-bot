# Clerk Testing Guide

This guide explains how to test authenticated flows with Clerk in this project.

## Overview

The project uses Clerk for authentication and provides test helpers for both unit tests (Vitest) and E2E tests (Playwright).

## Unit Tests (Vitest)

### Setup

1. Install dependencies (already included):
   ```bash
   bun add -d @clerk/testing @clerk/backend
   ```

2. Set environment variables (optional for unit tests, required for integration tests):
   ```bash
   CLERK_SECRET_KEY=sk_test_...
   CLERK_PUBLISHABLE_KEY=pk_test_...
   ```

### Using Clerk Test Helpers

Import helpers from `@/src/lib/test-helpers/clerk-auth-test-helpers`:

```typescript
import {
  createTestSession,
  createAuthenticatedRequest,
  createAndSignInClerkUser,
  cleanupClerkTestUser,
  withAuthenticatedClerkUser,
} from "@/src/lib/test-helpers/clerk-auth-test-helpers";
```

### Examples

#### Mock Session (Unit Tests)

```typescript
import { createTestSession, createAuthenticatedRequest } from "@/src/lib/test-helpers/clerk-auth-test-helpers";

test("should create authenticated request", () => {
  const testSession = createTestSession();
  const request = createAuthenticatedRequest(
    "http://localhost:3000/api/test",
    testSession.sessionToken,
  );

  expect(request.headers.get("Authorization")).toBe(`Bearer ${testSession.sessionToken}`);
});
```

#### Integration Tests (Requires CLERK_SECRET_KEY)

```typescript
import { createAndSignInClerkUser, cleanupClerkTestUser } from "@/src/lib/test-helpers/clerk-auth-test-helpers";

test("should authenticate with real Clerk", async () => {
  const { user, sessionToken, clerkUserId } = await createAndSignInClerkUser({
    email: `test_${Date.now()}@example.com`,
  });

  expect(sessionToken).toBeTruthy();
  expect(user.id).toBeTruthy();

  // Cleanup
  await cleanupClerkTestUser(clerkUserId);
});
```

#### Test Wrapper (Auto Cleanup)

```typescript
import { withAuthenticatedClerkUser } from "@/src/lib/test-helpers/clerk-auth-test-helpers";

test("should work with authenticated user", async () => {
  await withAuthenticatedClerkUser(async (session) => {
    // Test with authenticated session
    expect(session.user.id).toBeTruthy();
    // Cleanup happens automatically
  });
});
```

## E2E Tests (Playwright)

### Setup

1. Install Playwright (already included):
   ```bash
   bun add -d @playwright/test
   bunx playwright install
   ```

2. Set environment variables:
   ```bash
   CLERK_SECRET_KEY=sk_test_...
   CLERK_PUBLISHABLE_KEY=pk_test_...
   ```

3. Create a test user in Clerk Dashboard:
   - Email: `test@example.com`
   - Password: `TestPassword123!`

### Using Clerk Playwright Helpers

Import helpers from `@/src/lib/test-helpers/clerk-playwright-helpers`:

```typescript
import {
  setupClerkAuth,
  signInClerkUser,
  signOutClerkUser,
  isClerkAuthenticated,
} from "@/src/lib/test-helpers/clerk-playwright-helpers";
```

### Examples

#### Basic Authentication

```typescript
import { test, expect } from '@playwright/test';
import { setupClerkAuth, signInClerkUser } from '@/src/lib/test-helpers/clerk-playwright-helpers';

test('should sign in', async ({ page }) => {
  // Setup Clerk testing token (bypasses bot detection)
  await setupClerkAuth(page);
  
  // Sign in test user
  await signInClerkUser(page, 'test@example.com', 'TestPassword123!');
  
  // Navigate to protected route
  await page.goto('/dashboard');
  
  // Verify authenticated content
  await expect(page).toHaveURL(/.*dashboard/);
});
```

#### Check Authentication Status

```typescript
import { isClerkAuthenticated } from '@/src/lib/test-helpers/clerk-playwright-helpers';

test('should check auth status', async ({ page }) => {
  await setupClerkAuth(page);
  await page.goto('/dashboard');
  
  const authenticated = await isClerkAuthenticated(page);
  expect(authenticated).toBe(true);
});
```

## Running Tests

### Unit Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test app/__tests__/api-auth.spec.ts

# Watch mode
bun test:watch
```

### E2E Tests

```bash
# Run all E2E tests
bun test:e2e

# Run with UI
bun test:e2e:ui

# Debug mode
bun test:e2e:debug
```

## Testing Tokens

Clerk provides testing tokens that bypass bot detection mechanisms. These are automatically set up:

- **Unit Tests**: Mock sessions don't require real tokens
- **Integration Tests**: Use `createAndSignInClerkUser()` which creates real users and tokens
- **E2E Tests**: `setupClerkAuth()` automatically configures testing tokens via `clerkSetup()` in `playwright.config.ts`

## Environment Variables

| Variable | Required For | Description |
|----------|--------------|-------------|
| `CLERK_SECRET_KEY` | Integration & E2E tests | Clerk secret key for backend API |
| `CLERK_PUBLISHABLE_KEY` | E2E tests | Clerk publishable key for frontend |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | App runtime | Public Clerk key (already configured) |

## Migration from Supabase Auth Tests

If you have existing Supabase auth tests, update them to use Clerk helpers:

### Before (Supabase)
```typescript
import { createAndSignInTestUser } from "@/src/lib/test-helpers/supabase-auth-test-helpers";

const { user, accessToken } = await createAndSignInTestUser();
```

### After (Clerk)
```typescript
import { createAndSignInClerkUser } from "@/src/lib/test-helpers/clerk-auth-test-helpers";

const { user, sessionToken, clerkUserId } = await createAndSignInClerkUser();
```

## Troubleshooting

### "CLERK_SECRET_KEY not configured"
- Set `CLERK_SECRET_KEY` environment variable
- Integration tests will be skipped if not set

### "Bot traffic detected" in E2E tests
- Ensure `setupClerkAuth()` is called before navigation
- Check that `clerkSetup()` runs in `playwright.config.ts` globalSetup

### Tests timing out
- Increase timeout in test config
- Check that Clerk instance is accessible
- Verify test user credentials are correct

## References

- [Clerk Testing Overview](https://clerk.com/docs/guides/development/testing/overview)
- [Clerk Playwright Testing](https://clerk.com/docs/guides/development/testing/playwright/overview)
- [Clerk Backend API](https://clerk.com/docs/reference/backend-api/overview)

