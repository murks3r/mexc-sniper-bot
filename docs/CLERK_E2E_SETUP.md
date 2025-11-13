# Clerk E2E Testing Setup Guide

This guide explains how to set up and run E2E tests with Clerk authentication.

## Prerequisites

1. **Clerk Account**: You need a Clerk account with a development instance
2. **Environment Variables**: Set up your `.env.local` file with Clerk keys
3. **Test Users**: Create test users in Clerk Dashboard or via script

## Step 1: Install Playwright

```bash
bunx playwright install
```

This installs browser binaries needed for E2E tests.

## Step 2: Set Environment Variables

Add to your `.env.local`:

```bash
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_SITE_URL=http://localhost:3008
```

## Step 3: Create Test Users

### Option A: Using the Script (Recommended)

```bash
# Create a test user
bun run scripts/create-clerk-test-user.ts --email=test@example.com --password=TestPassword123!

# The script will output:
# ✅ Test user created successfully!
# User ID: user_xxx
# Email: test@example.com
# Password: TestPassword123!
```

### Option B: Via Clerk Dashboard

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Navigate to **Users** → **Create User**
3. Enter:
   - Email: `test@example.com`
   - Password: `TestPassword123!`
   - First Name: `Test`
   - Last Name: `User`
4. Save the credentials for your tests

### Option C: Multiple Test Users

Create multiple users for different test scenarios:

```bash
# User 1: Standard test user
bun run scripts/create-clerk-test-user.ts --email=test1@example.com --password=TestPassword123!

# User 2: Admin user (if needed)
bun run scripts/create-clerk-test-user.ts --email=admin@example.com --password=AdminPassword123!
```

## Step 4: Update E2E Tests

Update your E2E tests in `__tests__/e2e/` to use the test user credentials:

```typescript
import { test, expect } from '@playwright/test';
import { setupClerkAuth, signInClerkUser } from '@/src/lib/test-helpers/clerk-playwright-helpers';

test('authenticated flow', async ({ page }) => {
  // Setup Clerk testing token (bypasses bot detection)
  await setupClerkAuth(page);
  
  // Sign in with test user
  await signInClerkUser(page, 'test@example.com', 'TestPassword123!');
  
  // Navigate to protected route
  await page.goto('/dashboard');
  
  // Verify authenticated content
  await expect(page).toHaveURL(/.*dashboard/);
});
```

## Step 5: Run E2E Tests

```bash
# Run all E2E tests
bun test:e2e

# Run with UI (interactive)
bun test:e2e:ui

# Debug mode
bun test:e2e:debug

# Run specific test file
bunx playwright test __tests__/e2e/example.spec.ts
```

## Test User Management

### List Test Users

You can view test users in the Clerk Dashboard under **Users**.

### Delete Test Users

```bash
# Delete a test user by ID
bun run scripts/delete-clerk-test-user.ts --userId=user_xxx
```

Or delete via Clerk Dashboard:
1. Go to **Users**
2. Find the test user
3. Click **Delete**

## Troubleshooting

### "CLERK_SECRET_KEY not configured"

- Ensure `.env.local` exists and contains `CLERK_SECRET_KEY`
- Check that the key starts with `sk_test_` (development) or `sk_live_` (production)

### "Bot traffic detected"

- Ensure `setupClerkAuth()` is called before any navigation
- Check that `playwright.config.ts` has Clerk setup configured
- Verify testing tokens are being used (check network requests)

### Tests timing out

- Ensure dev server is running (`bun run dev`)
- Check that `baseURL` in `playwright.config.ts` matches your dev server URL
- Increase timeout in test config if needed

### Sign-in fails

- Verify test user credentials are correct
- Check that email/password authentication is enabled in Clerk Dashboard
- Ensure test user email is verified (or skip email verification in test user creation)

## Best Practices

1. **Use dedicated test users**: Don't use production user accounts
2. **Clean up after tests**: Delete test users when done
3. **Use environment-specific keys**: Use `sk_test_` keys for development
4. **Store credentials securely**: Don't commit test user passwords to git
5. **Use testing tokens**: Always call `setupClerkAuth()` to bypass bot detection

## Example Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { setupClerkAuth, signInClerkUser, isClerkAuthenticated } from '@/src/lib/test-helpers/clerk-playwright-helpers';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Setup Clerk auth for each test
    await setupClerkAuth(page);
  });

  test('should require authentication', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should redirect to sign-in if not authenticated
    const authenticated = await isClerkAuthenticated(page);
    if (!authenticated) {
      await expect(page).toHaveURL(/.*sign-in/);
    }
  });

  test('should show dashboard when authenticated', async ({ page }) => {
    await signInClerkUser(page, 'test@example.com', 'TestPassword123!');
    await page.goto('/dashboard');
    
    await expect(page).toHaveURL(/.*dashboard/);
    // Add more assertions for dashboard content
  });
});
```

## References

- [Clerk Playwright Testing](https://clerk.com/docs/guides/development/testing/playwright/overview)
- [Clerk Testing Overview](https://clerk.com/docs/guides/development/testing/overview)
- [Playwright Documentation](https://playwright.dev)

