#!/usr/bin/env bun

/**
 * Create Test User Script
 *
 * Creates a test user in Supabase Auth and syncs to local database.
 *
 * Usage:
 *   bun run scripts/create-test-user.ts
 *   bun run scripts/create-test-user.ts --email user@example.com --password "SecurePass123!"
 */

import type { User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing required environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "✓" : "✗");
  console.error("\n💡 Make sure these are set in your .env.local file");
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
let email = process.env.TEST_USER_EMAIL || "ryan@ryanlisse.com";
let password = process.env.TEST_USER_PASSWORD || "Openenu2025!";
let name = "Ryan Lisse";

// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--email" && args[i + 1]) {
    email = args[i + 1];
    i++;
  } else if (args[i] === "--password" && args[i + 1]) {
    password = args[i + 1];
    i++;
  } else if (args[i] === "--name" && args[i + 1]) {
    name = args[i + 1];
    i++;
  }
}

async function createTestUser() {
  console.log("🔐 Creating test user...");
  console.log(`   Email: ${email}`);
  console.log(`   Name: ${name}`);
  console.log(`   Password: ${"*".repeat(password.length)}`);
  console.log();

  // Create Supabase Admin client
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // Try to find existing user first
    let existingUserData: User | null = null;
    try {
      const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
      const existingUsers = (existingUser?.users as User[] | undefined) ?? undefined;
      const foundUser = existingUsers?.find((u) => u.email === email) ?? null;
      if (foundUser) {
        existingUserData = foundUser;
      }
    } catch (_listError) {
      // If list fails, try to create and catch the error
    }

    // Create user using Admin API (will fail if exists)
    console.log("📝 Creating/updating user via Supabase Admin API...");
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        full_name: name,
      },
    });

    // If user already exists, update instead
    if (
      error &&
      (error.message.includes("already been registered") ||
        error.message.includes("already exists"))
    ) {
      console.log("⚠️  User already exists, updating password and email confirmation...");

      // Get user ID from existing user or find it
      let userId: string;
      if (existingUserData) {
        userId = existingUserData.id;
      } else {
        // Try to find user by email - paginate through all users if needed
        console.log("   Searching for user by email...");
        let foundUser: User | null = null;
        let page = 1;
        const perPage = 1000;

        while (!foundUser) {
          const { data: userList, error: listError } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage,
          });

          if (listError) {
            console.error("❌ Failed to list users:", listError.message);
            break;
          }

          const users = (userList?.users as User[] | undefined) ?? undefined;
          foundUser = users?.find((u) => u.email === email) ?? null;

          if (foundUser) {
            break;
          }

          // If we got fewer users than perPage, we've reached the end
          if (!userList?.users || userList.users.length < perPage) {
            break;
          }

          page++;
        }

        if (!foundUser) {
          console.error("❌ Could not find existing user to update");
          console.error("   The user exists in Supabase but could not be found via API");
          console.error("   This might be a pagination issue or the user was soft-deleted");
          process.exit(1);
        }
        userId = foundUser.id;
      }

      // Update password and confirm email
      const { data: updateData, error: updateError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: {
            name,
            full_name: name,
          },
        });

      if (updateError) {
        console.error("❌ Failed to update user:", updateError.message);
        process.exit(1);
      }

      console.log("✅ User password updated successfully!");
      console.log(`   User ID: ${updateData.user.id}`);
      console.log(`   Email: ${updateData.user.email}`);
      console.log(`   Email Confirmed: ${updateData.user.email_confirmed_at ? "Yes" : "No"}`);

      // Sync user to local database
      await syncUserToDatabase(updateData.user, name, email);

      console.log("\n🎉 Test user updated successfully!");
      console.log("\n📋 Login Credentials:");
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${password}`);
      console.log("\n💡 You can now use these credentials to log in at:");
      console.log(`   http://localhost:3008/auth`);
      return;
    }

    if (error) {
      console.error("❌ Failed to create user:", error.message);
      console.error("   Code:", error.status);
      if (error.message.includes("rate limit")) {
        console.error("\n💡 Rate limit hit. Wait a moment and try again.");
      }
      process.exit(1);
    }

    if (!data.user) {
      console.error("❌ Failed to create user: No user data returned");
      process.exit(1);
    }

    console.log("✅ User created successfully!");
    console.log(`   User ID: ${data.user.id}`);
    console.log(`   Email: ${data.user?.email || "N/A"}`);
    console.log(`   Email Confirmed: ${data.user?.email_confirmed_at ? "Yes" : "No"}`);
    console.log(`   Created: ${data.user.created_at}`);

    // Sync user to local database
    await syncUserToDatabase(data.user, name, email);

    console.log("\n🎉 Test user created successfully!");
    console.log("\n📋 Login Credentials:");
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log("\n💡 You can now use these credentials to log in at:");
    console.log(`   http://localhost:3008/auth`);
  } catch (error) {
    console.error("\n❌ Unexpected error:", error);
    process.exit(1);
  }
}

async function syncUserToDatabase(supabaseUser: any, name: string, email: string) {
  console.log("\n🔄 Syncing user to local database...");
  try {
    const { db } = await import("../src/db");
    const { user: userTable } = await import("../src/db/schemas/auth");
    const { eq } = await import("drizzle-orm");

    // Check if user exists in local DB
    const existing = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, supabaseUser.id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(userTable).values({
        id: supabaseUser.id,
        email: supabaseUser.email || email,
        name: name,
        emailVerified: true,
        createdAt: new Date(supabaseUser.created_at),
        updatedAt: new Date(supabaseUser.updated_at),
      });
      console.log("✅ User synced to local database");
    } else {
      // Update existing user
      await db
        .update(userTable)
        .set({
          email: supabaseUser.email || email,
          name: name,
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(userTable.id, supabaseUser.id));
      console.log("✅ User updated in local database");
    }
  } catch (dbError) {
    console.warn("⚠️  Failed to sync user to local database:", dbError);
    console.warn("   User was created/updated in Supabase Auth, but local sync failed");
    console.warn("   This is usually fine - user will sync on first login");
  }
}

createTestUser().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
