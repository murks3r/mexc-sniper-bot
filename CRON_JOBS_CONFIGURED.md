# Cron Jobs Configuration - Complete ✅

**Date:** 2025-11-12  
**Status:** ✅ **CONFIGURED AND ACTIVE**

## Configuration Summary

All pg_cron jobs have been successfully configured in Supabase using the Supabase MCP tools.

### Production Details
- **API URL:** `https://mexc-sniper-bot-nine.vercel.app`
- **Cron Secret:** Retrieved from Vercel production environment
- **Migration:** `setup_production_cron_jobs`

## Configured Jobs

### 1. Calendar Sync ✅
- **Job Name:** `calendar-sync-cron`
- **Schedule:** `*/30 * * * *` (Every 30 minutes)
- **Status:** Active
- **Purpose:** Syncs MEXC calendar listings to create snipe targets
- **Payload:** 
  - userId: `system`
  - timeWindowHours: `72`
  - forceSync: `false`

### 2. Risk Check ✅
- **Job Name:** `risk-check-cron`
- **Schedule:** `*/5 * * * *` (Every 5 minutes)
- **Status:** Active
- **Purpose:** Monitors portfolio risk levels
- **Payload:**
  - checkType: `portfolio`

### 3. Housekeeping ✅
- **Job Name:** `housekeeping-cron`
- **Schedule:** `0 3 * * *` (Daily at 3 AM UTC)
- **Status:** Active
- **Purpose:** Cleanup old jobs and archive logs
- **Payload:**
  - tasks: `['cleanup_old_jobs', 'archive_logs']`

## Verification

### Check Job Status
```sql
SELECT 
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
ORDER BY jobid;
```

### View Job Execution History
```sql
SELECT 
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

### Test Endpoint Manually
```bash
curl -X POST https://mexc-sniper-bot-nine.vercel.app/api/jobs/cron \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -d '{"jobs":[]}'
```

## Next Steps

1. **Monitor Job Execution**
   - Check `cron.job_run_details` table periodically
   - Verify jobs are executing successfully
   - Monitor for any errors in return_message

2. **Verify Calendar Sync**
   - After first calendar sync job runs (within 30 minutes)
   - Check snipe_targets table:
     ```sql
     SELECT COUNT(*), status FROM snipe_targets GROUP BY status;
     ```

3. **Monitor Health Endpoints**
   - Check `/api/health/queues` for queue status
   - Verify jobs are being processed correctly

## Troubleshooting

### If Jobs Fail to Execute

1. **Check Job Run Details:**
   ```sql
   SELECT * FROM cron.job_run_details 
   WHERE status = 'failed'
   ORDER BY start_time DESC;
   ```

2. **Verify API Endpoint:**
   - Ensure the Vercel deployment is accessible
   - Check that `JOBS_CRON_SECRET` matches in both Supabase and Vercel

3. **Check Network Connectivity:**
   - Supabase needs to be able to reach your Vercel deployment
   - Verify `net.http_post` function is available (part of pg_net extension)

### Unschedule Jobs (if needed)
```sql
SELECT cron.unschedule('calendar-sync-cron');
SELECT cron.unschedule('risk-check-cron');
SELECT cron.unschedule('housekeeping-cron');
```

## Success Criteria

- ✅ All 3 cron jobs are scheduled
- ✅ All jobs are active
- ✅ Production URL configured correctly
- ✅ Cron secret retrieved from Vercel
- ✅ Jobs will execute automatically per schedule

**Status:** 🎉 **PRODUCTION READY** - Cron jobs are configured and will start executing automatically!

