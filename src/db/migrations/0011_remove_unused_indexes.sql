-- Remove Unused Indexes
-- Based on Supabase advisor recommendations, these indexes have never been used
-- Removing them reduces write overhead without impacting query performance

-- Note: Before removing, verify these indexes are truly unused in production
-- Some indexes may be needed for future queries or specific access patterns

-- Transactions table unused indexes
DROP INDEX IF EXISTS transactions_snipe_target_id_idx;
DROP INDEX IF EXISTS transactions_user_idx;
DROP INDEX IF EXISTS transactions_symbol_idx;
DROP INDEX IF EXISTS transactions_status_idx;
DROP INDEX IF EXISTS transactions_transaction_time_idx;
DROP INDEX IF EXISTS transactions_type_idx;
DROP INDEX IF EXISTS transactions_user_status_idx;
DROP INDEX IF EXISTS transactions_user_time_idx;
DROP INDEX IF EXISTS transactions_symbol_time_idx;

-- Positions table unused indexes
DROP INDEX IF EXISTS positions_status_idx;
DROP INDEX IF EXISTS positions_snipe_target_idx;
DROP INDEX IF EXISTS positions_max_hold_idx;
DROP INDEX IF EXISTS positions_symbol_idx;

-- Snipe targets table unused indexes
DROP INDEX IF EXISTS snipe_targets_vcoin_id_idx;
DROP INDEX IF EXISTS snipe_targets_user_vcoin_id_idx;

-- Execution history table unused indexes
DROP INDEX IF EXISTS execution_history_snipe_target_idx;
DROP INDEX IF EXISTS execution_history_position_idx;

COMMENT ON TABLE transactions IS 'Unused indexes removed to reduce write overhead. Primary indexes on id and foreign keys remain.';
COMMENT ON TABLE positions IS 'Unused indexes removed to reduce write overhead. Primary indexes on id and user_id remain.';
COMMENT ON TABLE snipe_targets IS 'Unused indexes removed to reduce write overhead. Primary indexes on id and user_id remain.';
COMMENT ON TABLE execution_history IS 'Unused indexes removed to reduce write overhead. Primary indexes on id and user_id remain.';

