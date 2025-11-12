-- Setup Supabase Queues (pgmq) for mexc-sniper-bot
-- Run this in Supabase SQL Editor

-- Enable pgmq extension (should be available in Supabase)
CREATE EXTENSION IF NOT EXISTS pgmq CASCADE;

-- ========================================
-- Create Queues
-- ========================================

-- Queue for high-throughput autosniping execution jobs
SELECT pgmq.create('autosniping_jobs');

-- Queue for safety alerts and trading notifications
SELECT pgmq.create('alert_jobs');

-- Queue for performance metrics and analytics
SELECT pgmq.create('metrics_jobs');

-- ========================================
-- Verify Queue Creation
-- ========================================

-- List all queues
SELECT * FROM pgmq.list_queues();

-- Check queue metrics (should be empty initially)
SELECT
  pgmq.metrics('autosniping_jobs') as autosniping_metrics,
  pgmq.metrics('alert_jobs') as alert_metrics,
  pgmq.metrics('metrics_jobs') as metrics_metrics;

-- ========================================
-- Grant Permissions
-- ========================================

-- Grant usage on pgmq schema to service role
GRANT USAGE ON SCHEMA pgmq TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA pgmq TO postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA pgmq TO postgres;

-- ========================================
-- Monitoring Views
-- ========================================

-- Create view for all queue metrics
CREATE OR REPLACE VIEW pgmq_all_metrics AS
SELECT
  'autosniping_jobs' as queue_name,
  (pgmq.metrics('autosniping_jobs')).*
UNION ALL
SELECT
  'alert_jobs' as queue_name,
  (pgmq.metrics('alert_jobs')).*
UNION ALL
SELECT
  'metrics_jobs' as queue_name,
  (pgmq.metrics('metrics_jobs')).*;

-- Grant select on monitoring view
GRANT SELECT ON pgmq_all_metrics TO postgres;

-- ========================================
-- Cleanup Functions (Optional)
-- ========================================

-- Function to purge all messages from a queue (use with caution!)
CREATE OR REPLACE FUNCTION purge_queue(queue_name text)
RETURNS void AS $$
BEGIN
  EXECUTE format('SELECT pgmq.purge_queue(%L)', queue_name);
END;
$$ LANGUAGE plpgsql;

-- Function to get queue depth
CREATE OR REPLACE FUNCTION get_queue_depth(queue_name text)
RETURNS bigint AS $$
DECLARE
  depth bigint;
BEGIN
  SELECT (pgmq.metrics(queue_name)).queue_length INTO depth;
  RETURN COALESCE(depth, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- ========================================
-- Test Queues (Optional)
-- ========================================

-- Test sending a message to autosniping_jobs
-- SELECT pgmq.send(
--   'autosniping_jobs',
--   '{"type": "execution", "payload": {"test": true}}'::jsonb
-- );

-- Test reading a message
-- SELECT * FROM pgmq.read('autosniping_jobs', 30, 1);

-- Test deleting a message (replace msg_id)
-- SELECT pgmq.delete('autosniping_jobs', <msg_id>);

-- ========================================
-- Notes
-- ========================================

-- Queue message visibility timeout: 30 seconds (configurable per read)
-- Messages automatically become visible again after timeout if not deleted
-- Archive failed messages to DLQ: pgmq.archive('queue_name', msg_id)
-- View archived messages: SELECT * FROM pgmq.a_<queue_name>

COMMENT ON EXTENSION pgmq IS 'PostgreSQL Message Queue for high-throughput job processing';
