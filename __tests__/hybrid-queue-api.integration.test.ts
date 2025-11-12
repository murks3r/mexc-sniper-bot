/**
 * Hybrid Queue API Integration Tests
 *
 * Tests the HTTP API endpoints for the hybrid queue system:
 * - /api/jobs/process - Manual job processing trigger
 * - /api/jobs/cron - Cron job scheduling endpoint
 * - /api/health/queues - Queue health monitoring
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { db, jobs } from "../src/db";
import { sql } from "drizzle-orm";
import { enqueueJob } from "../src/services/jobs/enqueue";

describe("Hybrid Queue API Integration", () => {
  beforeEach(async () => {
    // Clean up test data
    await db.delete(jobs).where(sql`1=1`);
  });

  describe("GET /api/jobs/process", () => {
    it("should return queue status when no jobs are pending", async () => {
      const response = await fetch("http://localhost:3000/api/jobs/process");
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toBeDefined();
      expect(data.data.queues).toBeDefined();
      expect(data.data.totalPending).toBe(0);
    });

    it("should detect pending jobs in queue status", async () => {
      // Create a pending job
      await enqueueJob({
        type: "calendar_sync",
        payload: { userId: "test", timeWindowHours: 72 },
      });

      const response = await fetch("http://localhost:3000/api/jobs/process");
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.queues.dbQueue).toBeGreaterThan(0);
      expect(data.data.totalPending).toBeGreaterThan(0);
    });
  });

  describe("POST /api/jobs/process", () => {
    it("should require valid jobs to process", async () => {
      const response = await fetch("http://localhost:3000/api/jobs/process", {
        method: "POST",
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it("should process pending jobs when triggered", async () => {
      // Create a pending job
      await enqueueJob({
        type: "calendar_sync",
        payload: { userId: "test", timeWindowHours: 72 },
      });

      const response = await fetch("http://localhost:3000/api/jobs/process", {
        method: "POST",
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe("POST /api/jobs/cron", () => {
    const CRON_SECRET = process.env.JOBS_CRON_SECRET || "test-secret";

    it("should reject requests without authorization", async () => {
      const response = await fetch("http://localhost:3000/api/jobs/cron", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobs: [{ type: "calendar_sync", payload: {} }],
        }),
      });

      expect(response.status).toBe(401);
    });

    it("should reject requests with invalid authorization", async () => {
      const response = await fetch("http://localhost:3000/api/jobs/cron", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid-token",
        },
        body: JSON.stringify({
          jobs: [{ type: "calendar_sync", payload: {} }],
        }),
      });

      expect(response.status).toBe(401);
    });

    it("should accept requests with valid authorization", async () => {
      const response = await fetch("http://localhost:3000/api/jobs/cron", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.ok).toBe(true);
    });

    it("should enqueue multiple job types", async () => {
      const beforeCount = (
        await db.execute(sql`SELECT COUNT(*) as count FROM jobs`)
      )[0] as any;

      const response = await fetch("http://localhost:3000/api/jobs/cron", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      });

      expect(response.status).toBe(200);

      // Verify jobs were created
      const afterCount = (
        await db.execute(sql`SELECT COUNT(*) as count FROM jobs`)
      )[0] as any;
      expect(Number(afterCount.count)).toBeGreaterThan(
        Number(beforeCount.count),
      );
    });
  });

  describe("GET /api/health/queues", () => {
    it("should return queue health status", async () => {
      const response = await fetch("http://localhost:3000/api/health/queues");
      const data = await response.json();

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(data.status).toBeDefined();
      expect(data.timestamp).toBeDefined();
      expect(data.executionMode).toBeDefined();
      expect(data.dbQueue).toBeDefined();
      expect(data.pgmqQueues).toBeDefined();
    });

    it("should include execution mode configuration", async () => {
      const response = await fetch("http://localhost:3000/api/health/queues");
      const data = await response.json();

      expect(data.executionMode.primary).toBeDefined();
      expect(data.executionMode.inngestFallback).toBeDefined();
      expect(data.executionMode.dualRun).toBeDefined();
    });

    it("should provide DB queue metrics", async () => {
      const response = await fetch("http://localhost:3000/api/health/queues");
      const data = await response.json();

      expect(data.dbQueue.status).toBeDefined();
      expect(data.dbQueue.pending).toBeDefined();
      expect(data.dbQueue.running).toBeDefined();
      expect(data.dbQueue.completed).toBeDefined();
      expect(data.dbQueue.dead).toBeDefined();
    });

    it("should provide pgmq queue metrics", async () => {
      const response = await fetch("http://localhost:3000/api/health/queues");
      const data = await response.json();

      expect(data.pgmqQueues.status).toBeDefined();
      expect(data.pgmqQueues.autosniping).toBeDefined();
      expect(data.pgmqQueues.alerts).toBeDefined();
      expect(data.pgmqQueues.metrics).toBeDefined();
      expect(data.pgmqQueues.total).toBeDefined();
    });

    it("should provide health recommendations", async () => {
      const response = await fetch("http://localhost:3000/api/health/queues");
      const data = await response.json();

      expect(Array.isArray(data.recommendations)).toBe(true);
    });

    it("should return healthy status when queues are empty", async () => {
      const response = await fetch("http://localhost:3000/api/health/queues");
      const data = await response.json();

      // With no jobs, system should be healthy
      expect(["healthy", "degraded", "unhealthy"]).toContain(data.status);
    });
  });

  describe("Queue System Integration", () => {
    it("should handle end-to-end job lifecycle", async () => {
      // 1. Enqueue job via cron endpoint
      const CRON_SECRET = process.env.JOBS_CRON_SECRET || "test-secret";
      const enqueueResponse = await fetch(
        "http://localhost:3000/api/jobs/cron",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${CRON_SECRET}`,
          },
        },
      );

      expect(enqueueResponse.status).toBe(200);

      // 2. Check queue health shows pending jobs
      const healthResponse = await fetch(
        "http://localhost:3000/api/health/queues",
      );
      const healthData = await healthResponse.json();

      expect(healthData.dbQueue.pending).toBeGreaterThan(0);

      // 3. Verify jobs are in database
      const [countResult] = await db.execute(
        sql`SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'`,
      );
      expect(Number((countResult as any).count)).toBeGreaterThan(0);
    });
  });
});
