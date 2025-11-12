-- Setup pg_cron jobs for mexc-sniper-bot - PRODUCTION CONFIGURATION
-- Run this in Supabase SQL Editor
--
-- ✅ PRODUCTION URL: https://mexc-sniper-bot-nine.vercel.app
-- ⚠️  CRON_SECRET: Replace YOUR_CRON_SECRET below with value from Vercel
--    Get it with: bash scripts/get-cron-secret.sh
--    Or manually: vercel env pull .env.production && grep JOBS_CRON_SECRET .env.production

-- Enable pg_cron (should already be enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ========================================
-- PRODUCTION SETUP: pg_cron → HTTP Trigger
-- ========================================
-- ⚠️  IMPORTANT: Replace YOUR_CRON_SECRET with actual value before running!

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
-- Verification Queries
-- ========================================

-- View all scheduled cron jobs
-- SELECT * FROM cron.job;

-- View job execution history
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Unschedule a job (if needed)
-- SELECT cron.unschedule('calendar-sync-cron');
-- SELECT cron.unschedule('risk-check-cron');
-- SELECT cron.unschedule('housekeeping-cron');

