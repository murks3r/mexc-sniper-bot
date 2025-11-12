-- Consolidate Multiple Permissive RLS Policies
-- Removes redundant SELECT policies where ALL policies already cover SELECT
-- This reduces policy evaluation overhead

-- API credentials: Remove redundant SELECT policy (ALL policy already covers it)
DROP POLICY IF EXISTS "Users can view own API credentials" ON api_credentials;
-- The "Users can manage own API credentials" ALL policy already covers SELECT

-- Snipe targets: Remove redundant SELECT policy (ALL policy already covers it)
DROP POLICY IF EXISTS "Users can view own snipe targets" ON snipe_targets;
-- The "Users can manage own snipe targets" ALL policy already covers SELECT

-- User preferences: Remove redundant SELECT policy (ALL policy already covers it)
DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
-- The "Users can manage own preferences" ALL policy already covers SELECT

-- Positions: Remove redundant SELECT policy (ALL policy already covers it)
DROP POLICY IF EXISTS "Users can view own positions" ON positions;
-- The "Users can manage own positions" ALL policy already covers SELECT

-- Bot status: Keep both policies as they have different conditions
-- "Authenticated users can view bot status" (SELECT) - for authenticated users
-- "Service role can manage bot status" (ALL) - for service role only
-- These serve different purposes, so we keep both

-- Listing events: Consolidate into single ALL policy
-- Both policies have same condition (authenticated), so we can consolidate
DROP POLICY IF EXISTS "Authenticated users can view listing events" ON listing_events;
-- The "Authenticated users can manage listing events" ALL policy already covers SELECT

-- Trade attempts: Consolidate into single ALL policy
-- Both policies have same condition (authenticated), so we can consolidate
DROP POLICY IF EXISTS "Authenticated users can view trade attempts" ON trade_attempts;
-- The "Authenticated users can manage trade attempts" ALL policy already covers SELECT

-- Transactions: Keep both policies as they serve different purposes
-- "Users can view own transactions" (SELECT) - for users viewing their own
-- "Service role can manage all transactions" (ALL) - for service role managing all
-- "Users can create own transactions" (INSERT) - for users creating their own
-- These have different conditions and purposes, so we keep all

-- Execution history: Keep both policies as they serve different purposes
-- "Users can view own execution history" (SELECT) - for viewing
-- "Users can create execution history" (INSERT) - for creating
-- These are different operations, so we keep both

COMMENT ON POLICY "Users can manage own API credentials" ON api_credentials IS 'Consolidated: Covers SELECT, INSERT, UPDATE, DELETE for user-owned credentials';
COMMENT ON POLICY "Users can manage own snipe targets" ON snipe_targets IS 'Consolidated: Covers SELECT, INSERT, UPDATE, DELETE for user-owned targets';
COMMENT ON POLICY "Users can manage own preferences" ON user_preferences IS 'Consolidated: Covers SELECT, INSERT, UPDATE, DELETE for user-owned preferences';
COMMENT ON POLICY "Users can manage own positions" ON positions IS 'Consolidated: Covers SELECT, INSERT, UPDATE, DELETE for user-owned positions';
COMMENT ON POLICY "Authenticated users can manage listing events" ON listing_events IS 'Consolidated: Covers SELECT, INSERT, UPDATE, DELETE for authenticated users';
COMMENT ON POLICY "Authenticated users can manage trade attempts" ON trade_attempts IS 'Consolidated: Covers SELECT, INSERT, UPDATE, DELETE for authenticated users';

