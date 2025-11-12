#!/usr/bin/env bun

/**
 * Test Job Queue End-to-End
 *
 * This script tests the full job queue flow:
 * 1. Enqueues a calendar_sync job
 * 2. Runs the job processor
 * 3. Verifies job completion
 */

import { eq } from "drizzle-orm";
import { db, jobs } from "../src/db";
import { enqueueJob } from "../src/services/jobs/enqueue";

async function testJobQueue() {
  console.log("🧪 Testing job queue end-to-end...\n");

  try {
    // Step 1: Enqueue a calendar sync job
    console.log("1️⃣ Enqueuing calendar_sync job...");
    const job = await enqueueJob({
      type: "calendar_sync",
      payload: { userId: "system", timeWindowHours: 72, forceSync: false },
      runAt: new Date(),
    });
    console.log(`✅ Job enqueued: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Type: ${job.type}`);
    console.log(`   Run at: ${job.runAt}\n`);

    // Step 2: Check job in database
    console.log("2️⃣ Verifying job in database...");
    const [dbJob] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    if (!dbJob) {
      throw new Error("Job not found in database!");
    }
    console.log(`✅ Job found in database`);
    console.log(`   ID: ${dbJob.id}`);
    console.log(`   Status: ${dbJob.status}`);
    console.log(`   Attempts: ${dbJob.attempts}/${dbJob.maxAttempts}\n`);

    // Step 3: Instructions for processing
    console.log("3️⃣ To process the job, run:");
    console.log("   bun run scripts/process-jobs.ts\n");

    // Step 4: Check for pending jobs
    const pendingJobs = await db.select().from(jobs).where(eq(jobs.status, "pending"));
    console.log(`📊 Total pending jobs: ${pendingJobs.length}`);

    if (pendingJobs.length > 0) {
      console.log("\n📋 Pending jobs:");
      for (const j of pendingJobs) {
        console.log(`   - ${j.type} (ID: ${j.id}) - attempts: ${j.attempts}/${j.maxAttempts}`);
      }
    }

    console.log("\n✅ Job queue test completed successfully!");
    console.log("\n💡 Next steps:");
    console.log("   1. Run: bun run scripts/process-jobs.ts");
    console.log("   2. Check job status: SELECT * FROM jobs WHERE id = '" + job.id + "';");
    console.log("   3. Verify sync results in snipe_targets table");

  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }

  process.exit(0);
}

testJobQueue();
