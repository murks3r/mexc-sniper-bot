-- Setup pg_cron jobs for mexc-sniper-bot
-- Run this in Supabase SQL Editor
--
-- IMPORTANT: Set these variables before running:
-- - YOUR_API_URL: Your deployed app URL (e.g., https://your-app.vercel.app)
--   ✅ PRODUCTION URL: https://mexc-sniper-bot-nine.vercel.app
-- - YOUR_CRON_SECRET: Value of JOBS_CRON_SECRET environment variable
--   Run: vercel env pull .env.production && grep JOBS_CRON_SECRET .env.production

-- Enable pg_cron (should already be enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ========================================
-- PRODUCTION SETUP: pg_cron → HTTP Trigger
-- ========================================
-- Replace YOUR_API_URL and YOUR_CRON_SECRET before running

-- Calendar Sync: Every 30 minutes
SELECT cron.schedule(
  'calendar-sync-cron',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url:='https://mexc-sniper-bot-nine.vercel.app/api/jobs/cron',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body:=jsonb_build_object(
      'jobs', jsonb_build_array(
        jsonb_build_object(
          'type', 'calendar_sync',
          'payload', jsonb_build_object(
            'userId', 'system',
            'timeWindowHours', 72,
            'forceSync', false
          )
        )
      )
    )
  );
  $$
);

-- Risk Check: Every 5 minutes
SELECT cron.schedule(
  'risk-check-cron',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://mexc-sniper-bot-nine.vercel.app/api/jobs/cron',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body:=jsonb_build_object(
      'jobs', jsonb_build_array(
        jsonb_build_object(
          'type', 'risk_check',
          'payload', jsonb_build_object('checkType', 'portfolio')
        )
      )
    )
  );
  $$
);

-- Housekeeping: Daily at 3 AM UTC
SELECT cron.schedule(
  'housekeeping-cron',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url:='https://mexc-sniper-bot-nine.vercel.app/api/jobs/cron',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body:=jsonb_build_object(
      'jobs', jsonb_build_array(
        jsonb_build_object(
          'type', 'housekeeping',
          'payload', jsonb_build_object('tasks', jsonb_build_array('cleanup_old_jobs', 'archive_logs'))
        )
      )
    )
  );
  $$
);

-- ========================================
-- ALTERNATIVE: NOTIFY approach (Development)
-- ========================================
-- Uncomment if you want to use NOTIFY/LISTEN pattern instead
--
-- SELECT cron.schedule(
--   'notify-job-processor',
--   '* * * * *',
--   $$NOTIFY process_jobs_trigger, 'check_pending';$$
-- );

-- ========================================
-- Job Management Queries
-- ========================================

-- View all scheduled cron jobs
-- SELECT * FROM cron.job;

-- View job execution history
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Unschedule a job
-- SELECT cron.unschedule('notify-job-processor');

-- ========================================
-- Helper Functions
-- ========================================

-- Count pending jobs
CREATE OR REPLACE FUNCTION count_pending_jobs()
RETURNS bigint AS $$
  SELECT COUNT(*) FROM jobs
  WHERE status = 'pending'
    AND run_at <= now()
    AND attempts < max_attempts;
$$ LANGUAGE sql STABLE;

-- View for job queue status
CREATE OR REPLACE VIEW job_queue_status AS
SELECT
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM jobs
GROUP BY status;

-- Grant permissions
GRANT SELECT ON job_queue_status TO postgres;
GRANT EXECUTE ON FUNCTION count_pending_jobs() TO postgres;
