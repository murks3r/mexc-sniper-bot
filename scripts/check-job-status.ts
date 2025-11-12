#!/usr/bin/env bun

/**
 * Check job queue status
 */

import { desc } from "drizzle-orm";
import { db, jobs } from "../src/db";

async function checkJobStatus() {
  console.log("📊 Job Queue Status\n");

  const allJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(10);

  console.log(`Total jobs (last 10): ${allJobs.length}\n`);

  const statusCounts = {
    pending: 0,
    running: 0,
    completed: 0,
    dead: 0,
  };

  for (const job of allJobs) {
    statusCounts[job.status as keyof typeof statusCounts]++;

    const statusEmoji = {
      pending: "⏳",
      running: "🏃",
      completed: "✅",
      dead: "💀",
    }[job.status] || "❓";

    console.log(`${statusEmoji} ${job.type} (${job.status})`);
    console.log(`   ID: ${job.id}`);
    console.log(`   Attempts: ${job.attempts}/${job.maxAttempts}`);
    console.log(`   Created: ${job.createdAt}`);
    if (job.lastError) {
      console.log(`   Error: ${job.lastError}`);
    }
    console.log();
  }

  console.log("📈 Summary:");
  console.log(`   Pending: ${statusCounts.pending}`);
  console.log(`   Running: ${statusCounts.running}`);
  console.log(`   Completed: ${statusCounts.completed}`);
  console.log(`   Dead: ${statusCounts.dead}`);

  process.exit(0);
}

checkJobStatus();
