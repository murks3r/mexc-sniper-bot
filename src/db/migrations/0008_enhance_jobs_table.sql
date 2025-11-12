-- Enhance jobs table for hybrid queue system
-- This migration adds priority and improves indexing

-- Add priority column for future use
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS priority int NOT NULL DEFAULT 0;

-- Add index for priority-based processing
CREATE INDEX IF NOT EXISTS idx_jobs_priority
ON jobs (priority DESC, run_at ASC)
WHERE status = 'pending';

-- Improve existing index for better query performance
DROP INDEX IF EXISTS idx_jobs_status_run_at;
CREATE INDEX idx_jobs_status_run_at_attempts
ON jobs (status, run_at, attempts)
WHERE status IN ('pending', 'running');

-- Add composite index for monitoring queries
CREATE INDEX IF NOT EXISTS idx_jobs_type_status
ON jobs (type, status, updated_at DESC);

-- Create view for queue monitoring
CREATE OR REPLACE VIEW job_queue_status AS
SELECT
  type,
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest,
  AVG(attempts) as avg_attempts,
  COUNT(*) FILTER (WHERE attempts >= max_attempts) as max_attempts_reached
FROM jobs
GROUP BY type, status
ORDER BY type, status;

-- Create view for failed jobs that need attention
CREATE OR REPLACE VIEW failed_jobs_summary AS
SELECT
  id,
  type,
  status,
  attempts,
  max_attempts,
  last_error,
  created_at,
  updated_at,
  run_at
FROM jobs
WHERE status = 'dead'
  OR (status = 'pending' AND attempts >= max_attempts - 1)
ORDER BY updated_at DESC
LIMIT 100;

-- Function to get queue health metrics
CREATE OR REPLACE FUNCTION get_job_queue_health()
RETURNS TABLE(
  metric text,
  value bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'pending_jobs'::text, COUNT(*)::bigint FROM jobs WHERE status = 'pending'
  UNION ALL
  SELECT 'running_jobs'::text, COUNT(*)::bigint FROM jobs WHERE status = 'running'
  UNION ALL
  SELECT 'completed_jobs_last_hour'::text, COUNT(*)::bigint
  FROM jobs
  WHERE status = 'completed' AND updated_at > now() - interval '1 hour'
  UNION ALL
  SELECT 'dead_jobs'::text, COUNT(*)::bigint FROM jobs WHERE status = 'dead'
  UNION ALL
  SELECT 'jobs_stuck_running'::text, COUNT(*)::bigint
  FROM jobs
  WHERE status = 'running' AND updated_at < now() - interval '5 minutes';
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT SELECT ON job_queue_status TO postgres;
GRANT SELECT ON failed_jobs_summary TO postgres;
GRANT EXECUTE ON FUNCTION get_job_queue_health() TO postgres;

-- Cleanup old completed jobs (optional, run manually or via housekeeping job)
-- DELETE FROM jobs
-- WHERE status = 'completed'
--   AND updated_at < now() - interval '7 days';

COMMENT ON COLUMN jobs.priority IS 'Job priority (higher = processed first). Default 0.';
COMMENT ON VIEW job_queue_status IS 'Real-time overview of job queue by type and status';
COMMENT ON VIEW failed_jobs_summary IS 'Failed or nearly-failed jobs requiring attention';
COMMENT ON FUNCTION get_job_queue_health() IS 'Returns key health metrics for job queue monitoring';
