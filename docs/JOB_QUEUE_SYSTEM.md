# Job Queue System

## Overview

DB-backed job queue using Bun and Drizzle for scheduled/background tasks. Can be triggered via pg_cron, API calls, or manual execution.

## Architecture

```
┌─────────────────┐
│   Triggers      │
│ (API/Cron)      │
└────────┬────────┘
         │
         ▼
  ┌──────────────┐
  │ enqueueJob() │  ← Primary method
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  jobs table  │  ← PostgreSQL
  └──────┬───────┘
         │
         ▼
┌─────────────────┐
│ process-jobs.ts │  ← Bun processor
│   (Batch: 25)   │
└─────────────────┘
```

## Usage

### Enqueue a Job

```typescript
import { enqueueJob } from "@/src/services/jobs/enqueue";

const job = await enqueueJob({
  type: "calendar_sync",
  payload: { userId: "system", timeWindowHours: 72 },
  runAt: new Date(),
  maxAttempts: 5
});
```

### Process Jobs

```bash
# Process all pending jobs
bun run scripts/process-jobs.ts

# Test job queue
bun run scripts/test-job-queue.ts

# Check job status
bun run scripts/check-job-status.ts
```

## Job Types

| Type | Purpose | Status |
|------|---------|--------|
| `calendar_sync` | Sync MEXC calendar to database | ✅ Implemented |
| `risk_check` | Risk assessment jobs | 🚧 Planned |
| `housekeeping` | Cleanup, archiving | 🚧 Planned |

## Dual-Run Pattern

The system supports both Bun-based processing (primary) and Inngest (fallback):

**Calendar Sync Cron:**
```typescript
// 1. Enqueue for Bun processing (primary)
const job = await enqueueJob({
  type: "calendar_sync",
  payload: { userId: "system" }
});

// 2. Send Inngest event (fallback)
await inngest.send({
  name: "mexc/calendar.poll",
  data: { trigger: "scheduled" }
});
```

## API Integration

### Calendar Sync API

```typescript
// Default: Use job queue
POST /api/sync/calendar-to-database
{
  "userId": "system",
  "timeWindowHours": 72
}

// Direct execution (skip queue)
POST /api/sync/calendar-to-database
{
  "useQueue": false,
  "userId": "system"
}
```

## Database Schema

```sql
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb,
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_status_run_at ON jobs (status, run_at);
```

## Job States

- `pending` - Waiting to be processed
- `running` - Currently being processed
- `completed` - Successfully finished
- `dead` - Failed after max attempts

## Error Handling

- Failed jobs increment `attempts` counter
- After `max_attempts`, job status becomes `dead`
- Errors stored in `last_error` field
- Failed jobs automatically retry on next processor run

## pg_cron Integration (Supabase)

### Setup

Run the setup script in Supabase SQL Editor:
```bash
cat scripts/setup-cron-jobs.sql
```

### Scheduling Options

**Option 1: API Trigger (Recommended)**
```sql
SELECT cron.schedule(
  'process-job-queue',
  '* * * * *',  -- Every minute
  $$
  SELECT net.http_post(
    url:='http://localhost:3008/api/jobs/process',
    headers:='{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
```

**Option 2: NOTIFY/LISTEN Pattern**
```sql
SELECT cron.schedule(
  'notify-job-processor',
  '* * * * *',
  $$NOTIFY process_jobs_trigger, 'check_pending';$$
);
```

**Option 3: Edge Function (Production)**
```sql
SELECT cron.schedule(
  'process-job-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://YOUR_PROJECT.supabase.co/functions/v1/process-jobs',
    headers:='{"Authorization": "Bearer YOUR_KEY"}'::jsonb
  );
  $$
);
```

### Job Management

```sql
-- View scheduled jobs
SELECT * FROM cron.job;

-- View execution history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Remove a job
SELECT cron.unschedule('process-job-queue');
```

## Future Enhancements

1. Add `risk_check` job type for portfolio monitoring
2. Add `housekeeping` job type for cleanup tasks
3. Add job priority levels
4. Implement job cancellation
5. Add job result storage and history
