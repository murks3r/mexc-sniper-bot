import { sql } from "drizzle-orm";
import { db, jobs } from "@/src/db";

export type JobType = "calendar_sync" | "risk_check" | "housekeeping";

export interface EnqueueJobOptions<T = unknown> {
  type: JobType;
  payload?: T;
  runAt?: Date;
  maxAttempts?: number;
}

export async function enqueueJob<T = unknown>({
  type,
  payload,
  runAt,
  maxAttempts = 5,
}: EnqueueJobOptions<T>) {
  const [job] = await db
    .insert(jobs)
    .values({
      type,
      payload: payload ? sql`${JSON.stringify(payload)}::jsonb` : undefined,
      runAt: runAt ? runAt.toISOString() : new Date().toISOString(),
      maxAttempts,
    })
    .returning();

  return job;
}
