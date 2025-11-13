-- Performance Indexes Addition
-- Adding optimized indexes based on common query patterns

-- execution_history index for user trade history queries
-- Supports queries filtering by user, symbol, and time range
CREATE INDEX CONCURRENTLY idx_execution_history_user_symbol_timestamp
ON execution_history(user_id, symbol_name, executed_at DESC);
--> statement-breakpoint
-- snipe_targets index for upcoming targets queries
-- Uses target_execution_time instead of scheduled_at (doesn't exist in schema)
-- Filters for ready status to optimize upcoming snipes queries
CREATE INDEX CONCURRENTLY idx_snipe_targets_user_scheduled
ON snipe_targets(user_id, target_execution_time DESC)
WHERE status = 'ready';
--> statement-breakpoint
