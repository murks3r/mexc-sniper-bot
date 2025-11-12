# Hybrid Queue Architecture

## Overview

The MEXC Sniper Bot uses a hybrid queue architecture combining:
- **DB Queue** (jobs table) for scheduled, coarse-grained tasks
- **Supabase pgmq** for high-throughput, fine-grained events
- **Bun workers** as the primary execution engine
- **Inngest** as an optional fallback/redundancy layer

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Feature Flags                             │
│  PRIMARY_EXECUTOR | INNGEST_FALLBACK | DUAL_RUN_MODE        │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                              │
┌───────▼────────┐          ┌─────────▼────────┐
│   DB Queue     │          │  Supabase pgmq   │
│  (jobs table)  │          │    Queues        │
├────────────────┤          ├──────────────────┤
│ calendar_sync  │          │  execution       │
│ risk_check     │          │  alert           │
│ housekeeping   │          │  metric          │
│                │          │  order_close     │
└────────┬───────┘          └────────┬─────────┘
         │                           │
         └─────────┬─────────────────┘
                   │
        ┌──────────▼──────────┐
        │  Bun Job Processor  │
        │ process-jobs.ts     │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │  Inngest (Fallback) │
        │  Optional/Redundant │
        └─────────────────────┘
```

## Queue Systems

### DB Queue (jobs table)

**Purpose:** Scheduled, coarse-grained tasks that run periodically

**Job Types:**
- `calendar_sync` - Sync MEXC calendar to database (every 30 min)
- `risk_check` - Portfolio risk assessment (every 5 min)
- `housekeeping` - Cleanup and maintenance (daily)

**Features:**
- Priority-based execution
- Retry with exponential backoff
- Dead letter handling
- Status tracking (pending → running → completed/dead)

**Schema:**
```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB,
  run_at TIMESTAMP NOT NULL,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  priority INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Supabase pgmq

**Purpose:** High-throughput, fine-grained events for real-time operations

**Queue Names:**
- `autosniping_jobs` - Trade execution events
- `alert_jobs` - Safety notifications and alerts
- `metrics_jobs` - Performance tracking and analytics

**Job Types:**
- `execution` - Order placement/cancellation
- `alert` - Safety threshold violations
- `metric` - Performance data points
- `order_close` - Position management

**Features:**
- Visibility timeout (message becomes invisible while processing)
- Dead letter queue (DLQ) for failed messages
- Archive for historical tracking
- Automatic retry on visibility timeout expiration

## Execution Modes

### Primary Executor: Supabase (Default)

```bash
PRIMARY_EXECUTOR="supabase"
INNGEST_FALLBACK="false"
DUAL_RUN_MODE="false"
```

**Behavior:**
- All jobs route to DB queue or pgmq
- Bun workers process jobs via `scripts/process-jobs.ts`
- Triggered by pg_cron calling `/api/jobs/process`
- Inngest is disabled

### Primary Executor: Inngest

```bash
PRIMARY_EXECUTOR="inngest"
INNGEST_FALLBACK="false"
DUAL_RUN_MODE="false"
```

**Behavior:**
- Scheduled tasks trigger Inngest events only
- DB queue and pgmq are skipped
- Inngest functions handle all execution
- Useful for Vercel deployments with Inngest Cloud

### Fallback Mode (Recommended for Production)

```bash
PRIMARY_EXECUTOR="supabase"
INNGEST_FALLBACK="true"
DUAL_RUN_MODE="false"
```

**Behavior:**
- Jobs enqueue to DB queue/pgmq (primary)
- Inngest events also triggered (fallback)
- If Bun workers fail, Inngest picks up the work
- Provides redundancy without duplication

### Dual-Run Mode (Testing Only)

```bash
PRIMARY_EXECUTOR="supabase"
INNGEST_FALLBACK="false"
DUAL_RUN_MODE="true"
```

**Behavior:**
- Both systems run simultaneously
- Used for migration validation
- Allows comparison of execution patterns
- Should not be used in production

## Job Processing

### Bun Worker (scripts/process-jobs.ts)

**Invocation:**
```bash
# Manual
bun run scripts/process-jobs.ts

# Via API
POST /api/jobs/process

# Via pg_cron (every minute)
SELECT net.http_post(
  url := 'https://your-app.com/api/jobs/process',
  headers := jsonb_build_object('Authorization', 'Bearer SECRET')
);
```

**Process Flow:**
1. Fetch pending DB jobs (status=pending, run_at <= now())
2. Mark jobs as running
3. Execute job handler (calendar sync, risk check, etc.)
4. Update status to completed or increment attempts
5. Process pgmq queues if `PROCESS_PGMQ=true`
6. Handle visibility timeout and DLQ

**Configuration:**
- `BATCH_SIZE=25` - Max jobs per execution
- `PROCESS_PGMQ=true` - Enable pgmq processing

### pg_cron Setup

**Production Setup** (Supabase SQL Editor):
```sql
-- Run setup-cron-jobs.sql
-- Configure cron schedules:
-- - Calendar sync: */30 * * * * (every 30 min)
-- - Risk check: */5 * * * * (every 5 min)
-- - Housekeeping: 0 3 * * * (daily at 3 AM)
```

**Environment Variables:**
```bash
JOBS_CRON_SECRET="generate-secure-random-string"
```

## API Endpoints

### POST /api/jobs/cron

**Purpose:** Enqueue jobs via pg_cron

**Authentication:** Bearer token (JOBS_CRON_SECRET)

**Request:**
```bash
curl -X POST https://your-app.com/api/jobs/cron \
  -H "Authorization: Bearer $JOBS_CRON_SECRET" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "ok": true
}
```

### GET /api/jobs/process

**Purpose:** Check queue status without processing

**Response:**
```json
{
  "data": {
    "queues": {
      "dbQueue": 5,
      "pgmqQueues": {
        "autosniping": 10,
        "alerts": 2,
        "metrics": 15
      }
    },
    "totalPending": 32
  }
}
```

### POST /api/jobs/process

**Purpose:** Manually trigger job processing

**Response:**
```json
{
  "data": {
    "pendingBefore": { "dbQueue": 5, "pgmqQueues": {...} },
    "output": "Job processor output..."
  }
}
```

### GET /api/health/queues

**Purpose:** Monitor queue health and performance

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:00:00Z",
  "executionMode": {
    "primary": "supabase",
    "inngestFallback": true,
    "dualRun": false
  },
  "dbQueue": {
    "status": "healthy",
    "pending": 5,
    "running": 2,
    "completed": 1250,
    "dead": 3,
    "oldestPending": "2025-01-15T09:55:00Z",
    "processingRate": 42
  },
  "pgmqQueues": {
    "status": "healthy",
    "autosniping": 10,
    "alerts": 2,
    "metrics": 15,
    "total": 27
  },
  "recommendations": [
    "High pending job count - consider increasing worker frequency"
  ]
}
```

## Monitoring & Observability

### Health Check Endpoints

- `/api/health` - Overall system health
- `/api/health/queues` - Queue-specific metrics
- `/api/health/db` - Database connectivity
- `/api/health/system` - System resources

### Key Metrics

**DB Queue:**
- Pending job count
- Average processing time
- Success/failure ratio
- Dead letter queue size

**pgmq:**
- Queue depth per queue
- Message age
- Processing throughput
- DLQ size

**System:**
- Worker uptime
- Memory usage
- CPU utilization
- Error rate

### Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| DB pending jobs | 50+ | 100+ |
| pgmq total depth | 100+ | 500+ |
| Dead jobs | 10+ | 50+ |
| Processing rate | <10/hr | 0/hr |
| Oldest pending | 1hr+ | 3hr+ |

## Deployment

### Environment Variables

**Required:**
```bash
# Database
DATABASE_URL="postgresql://..."

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://..."
SUPABASE_SERVICE_ROLE_KEY="..."

# Queue Configuration
PRIMARY_EXECUTOR="supabase"
INNGEST_FALLBACK="true"
JOBS_CRON_SECRET="generate-secure-secret"

# Optional
PROCESS_PGMQ="true"
```

**Optional (Inngest):**
```bash
INNGEST_SIGNING_KEY="signkey-prod-..."
INNGEST_EVENT_KEY="..."
```

### Deployment Checklist

1. ✅ Configure environment variables
2. ✅ Run database migrations
3. ✅ Set up pgmq extension: `CREATE EXTENSION IF NOT EXISTS pgmq;`
4. ✅ Run `scripts/setup-supabase-queues.sql`
5. ✅ Run `scripts/setup-cron-jobs.sql` (update URLs and secrets)
6. ✅ Test with `/api/jobs/cron` endpoint
7. ✅ Verify `/api/health/queues` shows healthy status
8. ✅ Monitor first job execution
9. ✅ Set up alerting for critical thresholds

### Troubleshooting

**No jobs processing:**
- Check pg_cron is enabled: `SELECT * FROM cron.job;`
- Verify cron jobs are scheduled: `SELECT * FROM cron.job_run_details LIMIT 10;`
- Check worker logs: `bun run scripts/process-jobs.ts`
- Verify `JOBS_CRON_SECRET` matches in both places

**pgmq unavailable:**
- Check extension: `SELECT * FROM pg_extension WHERE extname = 'pgmq';`
- Create extension: `CREATE EXTENSION IF NOT EXISTS pgmq;`
- Run setup script: `scripts/setup-supabase-queues.sql`

**High dead job count:**
- Check `last_error` column: `SELECT type, last_error FROM jobs WHERE status = 'dead';`
- Investigate common failure patterns
- Adjust `max_attempts` if needed
- Fix underlying service issues

## Migration Guide

### From Inngest-only to Hybrid

1. Set `PRIMARY_EXECUTOR="supabase"` and `INNGEST_FALLBACK="true"`
2. Run database migrations
3. Set up pg_cron jobs
4. Enable dual-run mode for testing: `DUAL_RUN_MODE="true"`
5. Monitor both systems for 24-48 hours
6. Disable dual-run: `DUAL_RUN_MODE="false"`
7. Optionally disable Inngest fallback after confidence

### Rollback Plan

If issues arise:
1. Set `PRIMARY_EXECUTOR="inngest"`
2. Disable pgmq processing: `PROCESS_PGMQ="false"`
3. Inngest handles all execution
4. Investigate and fix issues
5. Re-enable hybrid mode when ready

## Best Practices

### Job Design

1. **Idempotency:** Jobs should be safe to retry
2. **Timeouts:** Set reasonable max_attempts
3. **Payload Size:** Keep payloads small (<1MB)
4. **Error Handling:** Always catch and log errors
5. **Status Updates:** Update job status promptly

### Performance

1. **Batch Processing:** Process multiple jobs per execution
2. **Indexes:** Ensure proper indexes on jobs table
3. **Cleanup:** Archive old completed/dead jobs
4. **Monitoring:** Track processing rates and queue depths

### Security

1. **Secret Rotation:** Rotate JOBS_CRON_SECRET regularly
2. **IP Allowlisting:** Restrict cron endpoint access
3. **Rate Limiting:** Prevent abuse of manual triggers
4. **Audit Logs:** Track all job executions

## Support

For issues or questions:
- Check logs: `bun run scripts/process-jobs.ts`
- Review health: `/api/health/queues`
- See troubleshooting section above
- File issue on GitHub repository
