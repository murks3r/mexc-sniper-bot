-- Enable pg_cron extension (Supabase has this pre-installed)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to process pending jobs
-- This function fetches pending jobs and marks them for external processing
-- The actual processing happens in the Bun script, but we can trigger it via HTTP
CREATE OR REPLACE FUNCTION process_pending_jobs()
RETURNS TABLE(
  job_id uuid,
  job_type text,
  job_status text
) AS $$
DECLARE
  processed_count int := 0;
  job_record record;
BEGIN
  -- Mark jobs as running and return them for processing
  FOR job_record IN
    UPDATE jobs
    SET status = 'running', updated_at = now()
    WHERE status = 'pending'
      AND run_at <= now()
      AND attempts < max_attempts
      AND id IN (
        SELECT id FROM jobs
        WHERE status = 'pending'
          AND run_at <= now()
          AND attempts < max_attempts
        ORDER BY run_at ASC
        LIMIT 25  -- Process max 25 jobs at a time
      )
    RETURNING id, type, status
  LOOP
    job_id := job_record.id;
    job_type := job_record.type;
    job_status := job_record.status;
    processed_count := processed_count + 1;
    RETURN NEXT;
  END LOOP;

  -- Log processing summary
  RAISE NOTICE 'Marked % jobs for processing', processed_count;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Create function to handle calendar sync directly in database
-- This calls the API endpoint that processes calendar sync
CREATE OR REPLACE FUNCTION process_calendar_sync_job(job_data jsonb)
RETURNS void AS $$
BEGIN
  -- In a real implementation, this would:
  -- 1. Call the calendar sync service API
  -- 2. Or use http extension to POST to /api/sync/calendar-to-database
  -- For now, this is a placeholder that logs the intent
  RAISE NOTICE 'Processing calendar_sync job with payload: %', job_data;

  -- TODO: Implement actual sync logic or HTTP call
  -- Example with http extension (requires installation):
  -- PERFORM http_post(
  --   'http://localhost:3008/api/sync/calendar-to-database',
  --   jsonb_build_object('useQueue', false, 'userId', job_data->>'userId'),
  --   'application/json'
  -- );
END;
$$ LANGUAGE plpgsql;

-- Schedule job processor to run every minute
-- This checks for pending jobs and triggers external processing
SELECT cron.schedule(
  'process-job-queue',
  '* * * * *',  -- Every minute
  $$
  -- Trigger external job processor via notification
  -- The Bun script can LISTEN for this notification
  NOTIFY process_jobs_trigger, 'check_pending';
  $$
);

-- Alternative: Schedule to mark jobs every 30 seconds
-- Uncomment if you want sub-minute processing
-- SELECT cron.schedule(
--   'mark-pending-jobs',
--   '30 seconds',
--   $$SELECT * FROM process_pending_jobs();$$
-- );

-- Create index for job processing efficiency
CREATE INDEX IF NOT EXISTS idx_jobs_pending_run_at
  ON jobs (run_at)
  WHERE status = 'pending';

-- Grant necessary permissions
-- Note: Adjust role name based on your Supabase setup
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT SELECT ON cron.job TO postgres;
