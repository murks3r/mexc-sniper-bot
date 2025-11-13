#!/usr/bin/env bun

/**
 * Delete a Clerk test user
 *
 * Usage:
 *   bun run scripts/delete-clerk-test-user.ts --userId user_xxx
 */

import { createClerkClient } from "@clerk/backend";

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

if (!CLERK_SECRET_KEY) {
  console.error("❌ CLERK_SECRET_KEY environment variable is required");
  process.exit(1);
}

async function deleteTestUser() {
  const args = process.argv.slice(2);
  const userIdArg = args.find((arg) => arg.startsWith("--userId="));

  if (!userIdArg) {
    console.error("❌ --userId parameter is required");
    console.error("Usage: bun run scripts/delete-clerk-test-user.ts --userId=user_xxx");
    process.exit(1);
  }

  const userId = userIdArg.split("=")[1];

  const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });

  try {
    console.log(`Deleting Clerk user ${userId}...`);

    await clerk.users.deleteUser(userId);

    console.log(`✅ User deleted successfully!`);
  } catch (error: any) {
    console.error(`❌ Failed to delete user:`, error.message);
    process.exit(1);
  }
}

deleteTestUser();
