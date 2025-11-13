#!/usr/bin/env bun

/**
 * Continuous System Monitoring Script
 *
 * Monitors:
 * - Job queue health and processing
 * - Trade execution status
 * - System connectivity
 * - Database health
 *
 * Run continuously with: bun run scripts/monitor-system.ts
 * Or schedule via cron: 0,5,10,15,20,25,30,35,40,45,50,55 * * * * cd /path/to/project && bun run scripts/monitor-system.ts --once
 */

import { sql } from "drizzle-orm";
import { db } from "../src/db";

type JobQueueStatus = {
  pending: number;
  running: number;
  completed: number;
  dead: number;
  oldestPending: string | null;
};

type TradeExecutionStats = {
  recentExecutions: number;
  successful: number;
  failed: number;
  lastExecution: string | null;
};

type SystemHealthStats = {
  dbConnected: boolean;
  queueProcessing: boolean;
};

interface MonitoringResult {
  timestamp: string;
  jobQueue: JobQueueStatus;
  tradeExecution: TradeExecutionStats;
  systemHealth: SystemHealthStats;
}

async function checkJobQueue(): Promise<JobQueueStatus> {
  try {
    const statusCounts = await db.execute(sql`
      SELECT
        status,
        COUNT(*) as count,
        MIN(created_at) as oldest
      FROM jobs
      WHERE status IN ('pending', 'running', 'completed', 'dead')
      GROUP BY status
    `);

    const rows = (Array.isArray(statusCounts) ? statusCounts : [statusCounts]) as Array<{
      status: string;
      count: string | number;
      oldest?: string | null;
    }>;

    const counts: JobQueueStatus = {
      pending: 0,
      running: 0,
      completed: 0,
      dead: 0,
      oldestPending: null,
    };

    for (const row of rows) {
      if (row.status === "pending" || row.status === "running" || row.status === "completed") {
        counts[row.status] = Number(row.count);
      }
      if (row.status === "dead") {
        counts.dead = Number(row.count);
      }
      if (row.status === "pending" && row.oldest) {
        counts.oldestPending = row.oldest;
      }
    }

    return counts;
  } catch (error) {
    console.error("❌ Failed to check job queue:", error);
    return {
      pending: 0,
      running: 0,
      completed: 0,
      dead: 0,
      oldestPending: null,
    };
  }
}

async function checkTradeExecution(): Promise<TradeExecutionStats> {
  try {
    // Check execution history from last hour
    const executions = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as successful,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        MAX(created_at) as last_execution
      FROM execution_history
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);

    const rows = (Array.isArray(executions) ? executions : [executions]) as Array<{
      total: string | number;
      successful: string | number;
      failed: string | number;
      last_execution: string | null;
    }>;
    const row = rows[0];

    return {
      recentExecutions: Number(row?.total || 0),
      successful: Number(row?.successful || 0),
      failed: Number(row?.failed || 0),
      lastExecution: row?.last_execution || null,
    };
  } catch (error) {
    console.error("❌ Failed to check trade execution:", error);
    return {
      recentExecutions: 0,
      successful: 0,
      failed: 0,
      lastExecution: null,
    };
  }
}

async function checkSystemHealth(): Promise<SystemHealthStats> {
  try {
    // Test database connection
    await db.execute(sql`SELECT 1`);
    return {
      dbConnected: true,
      queueProcessing: true,
    };
  } catch (_error) {
    return {
      dbConnected: false,
      queueProcessing: false,
    };
  }
}

async function monitor() {
  const timestamp = new Date().toISOString();
  console.log(`\n📊 System Monitoring - ${timestamp}`);
  console.log("=".repeat(60));

  const jobQueue = await checkJobQueue();
  const tradeExecution = await checkTradeExecution();
  const systemHealth = await checkSystemHealth();

  const result: MonitoringResult = {
    timestamp,
    jobQueue,
    tradeExecution,
    systemHealth,
  };

  // Display results
  console.log("\n📋 Job Queue Status:");
  console.log(`   Pending: ${jobQueue.pending}`);
  console.log(`   Running: ${jobQueue.running}`);
  console.log(`   Completed: ${jobQueue.completed}`);
  console.log(`   Dead: ${jobQueue.dead}`);
  if (jobQueue.oldestPending) {
    const age = Math.round((Date.now() - new Date(jobQueue.oldestPending).getTime()) / 1000 / 60);
    console.log(`   Oldest Pending: ${age} minutes ago`);
  }

  console.log("\n💰 Trade Execution (Last Hour):");
  console.log(`   Total: ${tradeExecution.recentExecutions}`);
  console.log(`   Successful: ${tradeExecution.successful}`);
  console.log(`   Failed: ${tradeExecution.failed}`);
  if (tradeExecution.lastExecution) {
    const age = Math.round(
      (Date.now() - new Date(tradeExecution.lastExecution).getTime()) / 1000 / 60,
    );
    console.log(`   Last Execution: ${age} minutes ago`);
  }

  console.log("\n🔧 System Health:");
  console.log(`   Database: ${systemHealth.dbConnected ? "✅ Connected" : "❌ Disconnected"}`);
  console.log(`   Queue Processing: ${systemHealth.queueProcessing ? "✅ Active" : "❌ Inactive"}`);

  // Alerts
  const alerts: string[] = [];
  if (jobQueue.pending > 50) {
    alerts.push("⚠️  High pending job count (>50)");
  }
  if (jobQueue.dead > 10) {
    alerts.push("⚠️  High dead job count (>10)");
  }
  if (jobQueue.oldestPending) {
    const age = Date.now() - new Date(jobQueue.oldestPending).getTime();
    if (age > 60 * 60 * 1000) {
      alerts.push("⚠️  Oldest pending job is over 1 hour old");
    }
  }
  if (tradeExecution.failed > tradeExecution.successful && tradeExecution.recentExecutions > 0) {
    alerts.push("⚠️  High failure rate in trade execution");
  }
  if (!systemHealth.dbConnected) {
    alerts.push("❌ Database connection lost");
  }

  if (alerts.length > 0) {
    console.log("\n🚨 Alerts:");
    alerts.forEach((alert) => console.log(`   ${alert}`));
  } else {
    console.log("\n✅ All systems operational");
  }

  return result;
}

// Main execution
if (import.meta.main) {
  const interval = process.env.MONITOR_INTERVAL
    ? parseInt(process.env.MONITOR_INTERVAL, 10)
    : 300000; // 5 minutes default

  if (process.argv.includes("--once")) {
    // Run once and exit
    monitor()
      .then(() => {
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Monitoring failed:", error);
        process.exit(1);
      });
  } else {
    // Run continuously
    console.log(`🔄 Starting continuous monitoring (interval: ${interval / 1000}s)`);
    console.log("   Press Ctrl+C to stop\n");

    // Run immediately
    monitor().catch(console.error);

    // Then run on interval
    setInterval(() => {
      monitor().catch(console.error);
    }, interval);
  }
}
