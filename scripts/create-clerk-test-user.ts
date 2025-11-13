#!/usr/bin/env bun

/**
 * Create a Clerk test user for E2E testing
 *
 * Usage:
 *   bun run scripts/create-clerk-test-user.ts
 *   bun run scripts/create-clerk-test-user.ts --email test@example.com --password TestPassword123!
 *
 * This script creates a test user in Clerk that can be used for E2E tests.
 * The user will be created with the provided email and password.
 */

import { createClerkClient } from "@clerk/backend";

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

if (!CLERK_SECRET_KEY) {
  console.error("❌ CLERK_SECRET_KEY environment variable is required");
  console.error("Set it in your .env.local file:");
  console.error("  CLERK_SECRET_KEY=sk_test_...");
  process.exit(1);
}

async function createTestUser() {
  const args = process.argv.slice(2);
  const emailArg = args.find((arg) => arg.startsWith("--email="));
  const passwordArg = args.find((arg) => arg.startsWith("--password="));

  const email = emailArg ? emailArg.split("=")[1] : `test_${Date.now()}@example.com`;
  const password = passwordArg ? passwordArg.split("=")[1] : `TestPassword${Date.now()}!`;

  const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });

  try {
    console.log(`Creating Clerk test user...`);
    console.log(`  Email: ${email}`);
    console.log(`  Password: ${password}`);

    const user = await clerk.users.createUser({
      emailAddress: [email],
      password,
      firstName: "Test",
      lastName: "User",
      skipPasswordChecks: true,
    });

    console.log(`\n✅ Test user created successfully!`);
    console.log(`\nUser Details:`);
    console.log(`  User ID: ${user.id}`);
    console.log(`  Email: ${user.emailAddresses[0]?.emailAddress}`);
    console.log(`\nUse these credentials in your E2E tests:`);
    console.log(`  Email: ${email}`);
    console.log(`  Password: ${password}`);
    console.log(`\nTo delete this user, use:`);
    console.log(`  bun run scripts/delete-clerk-test-user.ts --userId ${user.id}`);
  } catch (error: any) {
    console.error(`\n❌ Failed to create test user:`, error.message);
    if (error.errors) {
      error.errors.forEach((err: any) => {
        console.error(`  - ${err.message}`);
      });
    }
    process.exit(1);
  }
}

createTestUser();
