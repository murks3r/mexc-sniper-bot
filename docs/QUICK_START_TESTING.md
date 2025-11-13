# Quick Start: Clerk Testing

## Unit Tests (Vitest)

```bash
# Run all unit tests
bun test

# Run specific test
bun test app/__tests__/api-auth.spec.ts
```

**No setup required** - Unit tests use mocks and work out of the box.

## Integration Tests

Requires `CLERK_SECRET_KEY` in `.env.local`:

```bash
# Set environment variable
export CLERK_SECRET_KEY=sk_test_...

# Run integration tests
bun test app/__tests__/rls-policies.spec.ts
```

## E2E Tests (Playwright)

### 1. Install Playwright (first time only)

```bash
bunx playwright install
```

### 2. Create Test User

```bash
bun run scripts/create-clerk-test-user.ts --email=test@example.com --password=TestPassword123!
```

### 3. Run E2E Tests

```bash
bun test:e2e              # Run all
bun test:e2e:ui           # With UI
bun test:e2e:debug        # Debug mode
```

## Test User Management

```bash
# Create user
bun run scripts/create-clerk-test-user.ts --email=test@example.com --password=Password123!

# Delete user
bun run scripts/delete-clerk-test-user.ts --userId=user_xxx
```

## Environment Variables

Add to `.env.local`:

```bash
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  # For RLS tests only
```

## Documentation

- [Complete Testing Guide](./CLERK_TESTING.md)
- [E2E Setup Guide](./CLERK_E2E_SETUP.md)
- [Migration Summary](./CLERK_MIGRATION_COMPLETE.md)

