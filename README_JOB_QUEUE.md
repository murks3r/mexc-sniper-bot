# Job Queue Quick Start

## 🚀 Getting Started

The mexc-sniper-bot uses a DB-backed job queue for reliable background task processing.

### Local Development

1. **Test the queue:**
   ```bash
   bun run scripts/test-job-queue.ts
   ```

2. **Process jobs manually:**
   ```bash
   bun run scripts/process-jobs.ts
   ```

3. **Check queue status:**
   ```bash
   bun run scripts/check-job-status.ts
   ```

### Production Setup (Supabase)

#### Option 1: pg_cron (Recommended)

1. Open Supabase SQL Editor
2. Run the setup script:
   ```sql
   -- See: scripts/setup-cron-jobs.sql

   SELECT cron.schedule(
     'process-job-queue',
     '* * * * *',
     $$
     SELECT net.http_post(
       url:='https://YOUR_APP.vercel.app/api/jobs/process',
       headers:='{"Content-Type": "application/json"}'::jsonb
     );
     $$
   );
   ```

3. Verify job is scheduled:
   ```sql
   SELECT * FROM cron.job;
   ```

#### Option 2: External Cron

Set up a cron job on your server:
```bash
# crontab -e
* * * * * cd /path/to/project && bun run scripts/process-jobs.ts >> /var/log/jobs.log 2>&1
```

#### Option 3: GitHub Actions / CI

Create `.github/workflows/process-jobs.yml`:
```yaml
name: Process Jobs
on:
  schedule:
    - cron: '* * * * *'
  workflow_dispatch:

jobs:
  process:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run scripts/process-jobs.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## 📋 Current Job Types

| Type | Purpose | Trigger |
|------|---------|---------|
| `calendar_sync` | Sync MEXC calendar to DB | API, Cron |
| `risk_check` | Portfolio risk monitoring | Planned |
| `housekeeping` | DB cleanup, archiving | Planned |

## 🔧 API Usage

### Enqueue a Job

```bash
curl -X POST http://localhost:3008/api/sync/calendar-to-database \
  -H "Content-Type: application/json" \
  -d '{"useQueue": true}'
```

Response:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid-here",
    "queuedAt": "2025-11-12T16:16:26.794Z"
  }
}
```

### Trigger Processing

```bash
curl -X POST http://localhost:3008/api/jobs/process
```

## 📊 Monitoring

### Check Queue Status

```typescript
import { db, jobs } from "@/src/db";

const stats = await db
  .select({ status: jobs.status, count: sql`count(*)` })
  .from(jobs)
  .groupBy(jobs.status);
```

### View Job History

```sql
SELECT id, type, status, attempts, created_at, updated_at
FROM jobs
ORDER BY created_at DESC
LIMIT 20;
```

### Failed Jobs

```sql
SELECT * FROM jobs
WHERE status = 'dead'
ORDER BY updated_at DESC;
```

## 🐛 Troubleshooting

### Jobs Stuck in "pending"

1. Check if processor is running:
   ```bash
   bun run scripts/check-job-status.ts
   ```

2. Manually trigger processing:
   ```bash
   bun run scripts/process-jobs.ts
   ```

3. Check job details:
   ```sql
   SELECT * FROM jobs WHERE status = 'pending';
   ```

### Jobs Failing

Check the `last_error` field:
```sql
SELECT id, type, last_error, attempts, max_attempts
FROM jobs
WHERE status = 'dead'
ORDER BY updated_at DESC;
```

### pg_cron Not Running

1. Verify extension is enabled:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. Check scheduled jobs:
   ```sql
   SELECT * FROM cron.job;
   ```

3. View execution logs:
   ```sql
   SELECT * FROM cron.job_run_details
   ORDER BY start_time DESC
   LIMIT 10;
   ```

## 📚 Full Documentation

See [docs/HYBRID_QUEUE_ARCHITECTURE.md](./docs/HYBRID_QUEUE_ARCHITECTURE.md) for complete details.
