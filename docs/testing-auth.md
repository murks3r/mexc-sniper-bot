# Supabase Auth Testing Guide

This guide covers best practices for testing Supabase authentication in the MEXC Sniper Bot project.

## Table of Contents

- [Overview](#overview)
- [Test Modes](#test-modes)
- [Test Helpers](#test-helpers)
- [Writing Tests](#writing-tests)
- [Test Examples](#test-examples)
- [Environment Setup](#environment-setup)
- [CI/CD Configuration](#cicd-configuration)
- [Security Best Practices](#security-best-practices)

## Overview

We use a combination of unit tests (with mocked auth) and integration tests (with real Supabase) to ensure comprehensive coverage:

- **Unit Tests**: Fast, isolated tests using mocked authentication
- **Integration Tests**: Tests against real Supabase test project
- **RLS Tests**: Verify Row Level Security policies work correctly
- **E2E Tests**: Full application flow with authenticated users

## Test Modes

The testing infrastructure automatically detects the test mode:

### Mock Mode (Default)

- Uses placeholder Supabase credentials
- Fast execution, no external dependencies
- Suitable for unit tests and CI/CD when Supabase isn't available
- Set `USE_MOCK_DATABASE=true` or use default placeholder credentials

### Integration Mode

- Uses real Supabase test project
- Tests actual auth flows and RLS policies
- Requires `USE_REAL_SUPABASE=true` and proper credentials
- Slower but more comprehensive

### E2E Mode

- Full application testing with Playwright or similar
- Set `E2E_TEST=true` or `PLAYWRIGHT_TEST=true`

## Test Helpers

### Location

Test helpers are located in `src/lib/test-helpers/`:

- `supabase-auth-test-helpers.ts` - Auth-specific test utilities
- `test-supabase-client.ts` - Supabase client creation for tests

### Key Functions

#### Creating Test Users

```typescript
import { createTestUser, createAndSignInTestUser } from "@/src/lib/test-helpers/supabase-auth-test-helpers";

// Create a test user (via Admin API)
const { user, password } = await createTestUser({
  email: "test@example.com",
  name: "Test User",
  emailVerified: true,
});

// Create and sign in user in one call
const { session, user, accessToken } = await createAndSignInTestUser({
  email: "test@example.com",
});
```

#### Creating Authenticated Requests

```typescript
import { createAuthenticatedRequest } from "@/src/lib/test-helpers/supabase-auth-test-helpers";

const request = createAuthenticatedRequest(
  "http://localhost:3000/api/snipe-targets",
  accessToken
);
```

#### Test Isolation Wrapper

```typescript
import { withAuthenticatedUser } from "@/src/lib/test-helpers/supabase-auth-test-helpers";

await withAuthenticatedUser(
  async (session) => {
    // Your test code here
    // User is automatically cleaned up after test
  },
  {
    email: "test@example.com",
    name: "Test User",
  }
);
```

#### Creating Mock Sessions

```typescript
import { createTestSession } from "@/src/lib/test-helpers/supabase-auth-test-helpers";

const mockSession = createTestSession({
  supabaseUser: {
    id: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    emailVerified: true,
  },
});
```

## Writing Tests

### Unit Tests (Mocked Auth)

For fast unit tests that don't require real Supabase:

```typescript
import { describe, it, expect, vi } from "vitest";
import { requireAuthFromRequest } from "@/src/lib/supabase-auth-server";

// Mock auth for unit tests
const mockRequireAuth = vi.fn().mockResolvedValue({
  id: "test-user-id",
  email: "test@example.com",
  name: "Test User",
  emailVerified: true,
});

vi.mock("@/src/lib/supabase-auth-server", () => ({
  requireAuthFromRequest: mockRequireAuth,
}));

describe("My Feature", () => {
  it("should work with mocked auth", async () => {
    const request = new Request("http://localhost:3000/api/test");
    const user = await requireAuthFromRequest(request);
    expect(user.id).toBe("test-user-id");
  });
});
```

### Integration Tests (Real Supabase)

For tests that require real authentication:

```typescript
import { describe, it, expect } from "vitest";
import { createAndSignInTestUser, cleanupTestUser } from "@/src/lib/test-helpers/supabase-auth-test-helpers";
import { detectTestMode } from "@/src/lib/test-helpers/test-supabase-client";

const testMode = detectTestMode();
const skipIntegrationTests = testMode === "mock";

describe.skipIf(skipIntegrationTests)("Auth Integration", () => {
  it("should sign in user with real Supabase", async () => {
    const { session, user } = await createAndSignInTestUser({
      email: `test_${Date.now()}@example.com`,
    });

    expect(session.accessToken).toBeTruthy();
    expect(user.id).toBeTruthy();

    await cleanupTestUser(user.id);
  });
});
```

### RLS Policy Tests

Test that Row Level Security policies work correctly:

```typescript
import { describe, it, expect } from "vitest";
import { createMultipleTestUsers, getTestSupabaseAnonClient } from "@/src/lib/test-helpers/supabase-auth-test-helpers";

describe.skipIf(skipIntegrationTests)("RLS Policies", () => {
  it("should prevent user from accessing other user's data", async () => {
    const [user1, user2] = await createMultipleTestUsers(2);
    
    const session1 = await signInTestUser(user1.user.email!, user1.password);
    const supabase = getTestSupabaseAnonClient();
    await supabase.auth.setSession({
      access_token: session1.accessToken,
      refresh_token: "dummy",
    });

    // Try to access user2's data
    const { data, error } = await supabase
      .from("snipe_targets")
      .select("*")
      .eq("user_id", user2.user.id);

    expect(data?.length || 0).toBe(0); // Should be empty due to RLS
  });
});
```

## Test Examples

### Example 1: Testing Protected API Route

```typescript
import { describe, it, expect } from "vitest";
import { createAuthenticatedRequest } from "@/src/lib/test-helpers/supabase-auth-test-helpers";
import { requireAuthFromRequest } from "@/src/lib/supabase-auth-server";

describe("Protected Route", () => {
  it("should reject unauthenticated requests", async () => {
    const request = new Request("http://localhost:3000/api/snipe-targets");
    await expect(requireAuthFromRequest(request)).rejects.toThrow("Authentication required");
  });

  it.skipIf(skipIntegrationTests)("should accept authenticated requests", async () => {
    const { session } = await createAndSignInTestUser();
    const request = createAuthenticatedRequest(
      "http://localhost:3000/api/snipe-targets",
      session.accessToken
    );
    
    // Test route handler with authenticated request
    // Note: Full test requires proper cookie handling
  });
});
```

### Example 2: Testing User Data Isolation

```typescript
import { withAuthenticatedUser } from "@/src/lib/test-helpers/supabase-auth-test-helpers";

it("should isolate user data", async () => {
  await withAuthenticatedUser(
    async (session1) => {
      await withAuthenticatedUser(
        async (session2) => {
          // Each user should only see their own data
          expect(session1.user.id).not.toBe(session2.user.id);
        },
        { email: `user2_${Date.now()}@example.com` }
      );
    },
    { email: `user1_${Date.now()}@example.com` }
  );
});
```

### Example 3: Testing Custom JWT Claims

```typescript
import { createTestUser } from "@/src/lib/test-helpers/supabase-auth-test-helpers";

it("should support custom JWT claims", async () => {
  const { user } = await createTestUser({
    email: "test@example.com",
    customClaims: {
      tenant_id: "tenant-123",
      role: "admin",
    },
  });

  expect(user.app_metadata?.tenant_id).toBe("tenant-123");
  expect(user.app_metadata?.role).toBe("admin");
});
```

## Environment Setup

### Local Development

1. **Mock Mode (Default)**: No setup required, uses placeholder credentials

2. **Integration Mode**: 
   - Create a test Supabase project (separate from production)
   - Set environment variables:
     ```bash
     export USE_REAL_SUPABASE=true
     export NEXT_PUBLIC_SUPABASE_URL=https://your-test-project.supabase.co
     export NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
     export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
     ```

### CI/CD

1. Store test Supabase credentials as secrets:
   - `SUPABASE_TEST_URL`
   - `SUPABASE_TEST_ANON_KEY`
   - `SUPABASE_TEST_SERVICE_ROLE_KEY`

2. Set environment variables in CI:
   ```yaml
   env:
     USE_REAL_SUPABASE: true
     NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_TEST_URL }}
     NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_TEST_ANON_KEY }}
     SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_TEST_SERVICE_ROLE_KEY }}
   ```

3. Run tests:
   ```bash
   npm run test
   ```

## CI/CD Configuration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      USE_REAL_SUPABASE: true
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_TEST_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_TEST_ANON_KEY }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_TEST_SERVICE_ROLE_KEY }}
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test
```

## Security Best Practices

### Critical Rules

1. **Never commit service_role key** to the repository
2. **Use separate test Supabase project** (never production)
3. **Clean up test users** after tests complete
4. **Use deterministic test emails** for easier debugging: `test_user_{timestamp}@example.com`
5. **Store credentials in CI secrets** only

### Test User Cleanup

Always clean up test users:

```typescript
import { cleanupTestUser } from "@/src/lib/test-helpers/supabase-auth-test-helpers";

afterAll(async () => {
  if (testUserId) {
    await cleanupTestUser(testUserId);
  }
});
```

Or use the wrapper for automatic cleanup:

```typescript
import { withAuthenticatedUser } from "@/src/lib/test-helpers/supabase-auth-test-helpers";

// User is automatically cleaned up
await withAuthenticatedUser(async (session) => {
  // Your test
});
```

### Service Role Key Usage

The service_role key bypasses RLS and should ONLY be used:

- In test environments
- For creating test users via Admin API
- For cleanup operations
- Never in production client code

## Test File Organization

```
app/__tests__/
  ├── auth-integration.spec.ts    # Real Supabase auth flows
  ├── rls-policies.spec.ts        # RLS policy verification
  ├── api-auth.spec.ts            # API route authentication
  └── debug-auth.spec.ts          # Auth debugging utilities

src/lib/test-helpers/
  ├── supabase-auth-test-helpers.ts  # Auth test utilities
  └── test-supabase-client.ts       # Supabase client for tests
```

## Running Tests

### All Tests

```bash
npm run test
```

### Watch Mode

```bash
npm run test:watch
```

### Coverage

```bash
npm run test:coverage
```

### Integration Tests Only

```bash
USE_REAL_SUPABASE=true npm run test
```

## Troubleshooting

### Tests Skip in Mock Mode

If integration tests are being skipped, ensure:
- `USE_REAL_SUPABASE=true` is set
- Supabase credentials are configured
- Test mode detection is working: `detectTestMode()`

### Cleanup Failures

If test user cleanup fails:
- Check that service_role key has admin permissions
- Verify test user IDs are correct
- Check Supabase project limits

### RLS Test Failures

If RLS tests fail:
- Verify RLS is enabled on tables
- Check that policies are correctly configured
- Ensure test users have proper authentication

## Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase Testing Guide](https://supabase.com/docs/guides/database/testing)
- [Vitest Documentation](https://vitest.dev/)

