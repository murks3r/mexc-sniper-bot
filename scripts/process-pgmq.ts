#!/usr/bin/env bun

import { popQueueJob } from "../src/services/queues/supabase-queues";
import { handleExecutionJob } from "../src/services/jobs/handlers/execution.handler";
import { handleAlertJob } from "../src/services/jobs/handlers/alert.handler";

async function processOnce() {
  const msg = await popQueueJob();
  if (!msg) return;

  const { message } = msg;

  // Only handle pgmq job types (execution, alert, metric, order_close)
  // Scheduled jobs (calendar_sync, risk_check, housekeeping) go to DB queue
  switch (message.type) {
    case "execution":
      await handleExecutionJob(message);
      break;
    case "alert":
      await handleAlertJob(message);
      break;
    case "metric":
      // Metric handler not yet implemented
      console.log("[INFO] Metric job received but handler not implemented", {
        payload: message.payload,
      });
      break;
    case "order_close":
      // Order close handler not yet implemented
      console.log("[INFO] Order close job received but handler not implemented", {
        payload: message.payload,
      });
      break;
    default:
      console.warn(`[WARN] Unknown pgmq job type: ${message.type} - skipping`);
      break;
  }
}

async function main() {
  await processOnce();
}

main().catch((error) => {
  console.error("pgmq processor failed", error);
  process.exit(1);
});
