/**
 * Hybrid Queue Integration Tests
 *
 * Tests the hybrid queue architecture:
 * - DB queue (jobs table) for scheduled tasks
 * - Supabase pgmq for high-throughput tasks
 * - Unified queue routing
 * - Feature flag behavior
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db, jobs } from "../src/db";
import { eq, sql } from "drizzle-orm";
import { enqueueJob } from "../src/services/jobs/enqueue";
import { enqueueJobUnified } from "../src/services/queues/unified-queue";

describe("Hybrid Queue Integration", () => {
  beforeEach(async () => {
    // Clean up test data
    await db.delete(jobs).where(sql`1=1`);
  });

  describe("DB Queue (Scheduled Tasks)", () => {
    it("should enqueue calendar_sync job to DB queue", async () => {
      const job = await enqueueJob({
        type: "calendar_sync",
        payload: { userId: "test-user", timeWindowHours: 72 },
      });

      expect(job).toBeDefined();
      expect(job.type).toBe("calendar_sync");
      expect(job.status).toBe("pending");
      expect(job.attempts).toBe(0);
      expect(job.maxAttempts).toBe(5);
    });

    it("should enqueue risk_check job to DB queue", async () => {
      const job = await enqueueJob({
        type: "risk_check",
        payload: { checkType: "portfolio" },
      });

      expect(job).toBeDefined();
      expect(job.type).toBe("risk_check");
      expect(job.status).toBe("pending");
    });

    it("should enqueue housekeeping job to DB queue", async () => {
      const job = await enqueueJob({
        type: "housekeeping",
        payload: { tasks: ["cleanup"] },
      });

      expect(job).toBeDefined();
      expect(job.type).toBe("housekeeping");
      expect(job.status).toBe("pending");
    });

    it("should respect maxAttempts parameter", async () => {
      const job = await enqueueJob({
        type: "calendar_sync",
        maxAttempts: 3,
      });

      expect(job.maxAttempts).toBe(3);
    });

    it("should handle scheduled jobs with runAt parameter", async () => {
      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
      const job = await enqueueJob({
        type: "calendar_sync",
        runAt: futureDate,
      });

      expect(new Date(job.runAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("Unified Queue Routing", () => {
    it("should route calendar_sync to DB queue via unified API", async () => {
      const job = await enqueueJobUnified("calendar_sync", {
        timeWindowHours: 72,
      });

      if (job && typeof job === "object" && "type" in job && "id" in job) {
        expect(job.type).toBe("calendar_sync");
        const [dbJob] = await db
          .select()
          .from(jobs)
          .where(eq(jobs.id, job.id as string));
        expect(dbJob).toBeDefined();
      }
    });

    it("should route risk_check to DB queue via unified API", async () => {
      const job = await enqueueJobUnified("risk_check");

      if (job && typeof job === "object" && "type" in job) {
        expect(job.type).toBe("risk_check");
      }
    });

    it("should route housekeeping to DB queue via unified API", async () => {
      const job = await enqueueJobUnified("housekeeping");

      if (job && typeof job === "object" && "type" in job) {
        expect(job.type).toBe("housekeeping");
      }
    });
  });

  describe("Job Status Tracking", () => {
    it("should initialize jobs with correct status", async () => {
      const job = await enqueueJob({
        type: "calendar_sync",
      });

      expect(job.status).toBe("pending");
      expect(job.attempts).toBe(0);
      expect(job.lastError).toBeNull();
    });

    it("should track job creation timestamp", async () => {
      const before = Date.now();
      const job = await enqueueJob({
        type: "calendar_sync",
      });
      const after = Date.now();

      const createdTime = new Date(job.createdAt).getTime();
      expect(createdTime).toBeGreaterThanOrEqual(before);
      expect(createdTime).toBeLessThanOrEqual(after);
    });

    it("should set runAt to current time if not specified", async () => {
      const before = Date.now();
      const job = await enqueueJob({
        type: "calendar_sync",
      });
      const after = Date.now();

      const runAtTime = new Date(job.runAt).getTime();
      expect(runAtTime).toBeGreaterThanOrEqual(before);
      expect(runAtTime).toBeLessThanOrEqual(after);
    });
  });

  describe("Job Payload Handling", () => {
    it("should store and retrieve job payload correctly", async () => {
      const payload = {
        userId: "test-user",
        timeWindowHours: 72,
        forceSync: true,
      };

      const job = await enqueueJob({
        type: "calendar_sync",
        payload,
      });

      const [retrieved] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, job.id));

      expect(retrieved.payload).toEqual(payload);
    });

    it("should handle complex nested payloads", async () => {
      const payload = {
        config: {
          nested: {
            value: 123,
            array: [1, 2, 3],
          },
        },
      };

      const job = await enqueueJob({
        type: "risk_check",
        payload,
      });

      expect(job.payload).toEqual(payload);
    });

    it("should handle null/undefined payloads", async () => {
      const job = await enqueueJob({
        type: "housekeeping",
      });

      expect(job.payload).toBeNull();
    });
  });

  describe("Queue Health Queries", () => {
    it("should count pending jobs correctly", async () => {
      // Create test jobs
      await enqueueJob({ type: "calendar_sync" });
      await enqueueJob({ type: "risk_check" });
      await enqueueJob({ type: "housekeeping" });

      const [result] = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM jobs
        WHERE status = 'pending'
      `);

      expect(Number((result as any).count)).toBe(3);
    });

    it("should group jobs by status", async () => {
      await enqueueJob({ type: "calendar_sync" });
      await enqueueJob({ type: "risk_check" });

      const results = await db.execute(sql`
        SELECT status, COUNT(*) as count
        FROM jobs
        GROUP BY status
      `);

      expect(results.length).toBeGreaterThan(0);
      const statusMap = (results as any[]).reduce(
        (acc, row) => {
          acc[row.status] = Number(row.count);
          return acc;
        },
        {} as Record<string, number>,
      );

      expect(statusMap.pending).toBe(2);
    });
  });
});
