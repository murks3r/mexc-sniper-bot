/**
 * Job Schedulers - Future Risk/Housekeeping Triggers
 *
 * Placeholder for future risk checking and housekeeping jobs.
 * These will be triggered via enqueueJob when implemented.
 */

import { enqueueJob } from "./enqueue";

/**
 * Enqueue risk check job
 * TODO: Implement risk checking logic
 */
export async function scheduleRiskCheck(payload?: Record<string, unknown>) {
  return enqueueJob({
    type: "risk_check",
    payload,
    runAt: new Date(),
  });
}

/**
 * Enqueue housekeeping job
 * TODO: Implement housekeeping logic (cleanup old data, archive logs, etc.)
 */
export async function scheduleHousekeeping(payload?: Record<string, unknown>) {
  return enqueueJob({
    type: "housekeeping",
    payload,
    runAt: new Date(),
  });
}
