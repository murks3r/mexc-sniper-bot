-- Optimize RLS Policies for Performance
-- Wraps auth.uid() and auth.role() calls in SELECT to prevent re-evaluation per row
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- User table policies
ALTER POLICY "Users can view own profile" ON "user"
  USING ((SELECT auth.uid())::text = id);

ALTER POLICY "Users can update own profile" ON "user"
  USING ((SELECT auth.uid())::text = id);

ALTER POLICY "Enable insert for authenticated users" ON "user"
  WITH CHECK ((SELECT auth.uid())::text = id);

-- User preferences policies
ALTER POLICY "Users can view own preferences" ON user_preferences
  USING ((SELECT auth.uid())::text = user_id);

ALTER POLICY "Users can manage own preferences" ON user_preferences
  USING ((SELECT auth.uid())::text = user_id);

-- Snipe targets policies
ALTER POLICY "Users can view own snipe targets" ON snipe_targets
  USING ((SELECT auth.uid())::text = user_id);

ALTER POLICY "Users can manage own snipe targets" ON snipe_targets
  USING ((SELECT auth.uid())::text = user_id);

-- Execution history policies
ALTER POLICY "Users can view own execution history" ON execution_history
  USING ((SELECT auth.uid())::text = user_id);

ALTER POLICY "Users can create execution history" ON execution_history
  WITH CHECK ((SELECT auth.uid())::text = user_id);

-- Positions policies
ALTER POLICY "Users can view own positions" ON positions
  USING ((SELECT auth.uid())::text = user_id);

ALTER POLICY "Users can manage own positions" ON positions
  USING ((SELECT auth.uid())::text = user_id);

-- API credentials policies
ALTER POLICY "Users can view own API credentials" ON api_credentials
  USING ((SELECT auth.uid())::text = user_id);

ALTER POLICY "Users can manage own API credentials" ON api_credentials
  USING ((SELECT auth.uid())::text = user_id);

-- Bot status policies
ALTER POLICY "Authenticated users can view bot status" ON bot_status
  USING ((SELECT auth.role()) = 'authenticated'::text);

ALTER POLICY "Service role can manage bot status" ON bot_status
  USING ((SELECT auth.role()) = 'service_role'::text);

-- Listing events policies
ALTER POLICY "Authenticated users can view listing events" ON listing_events
  USING ((SELECT auth.role()) = 'authenticated'::text);

ALTER POLICY "Authenticated users can manage listing events" ON listing_events
  USING ((SELECT auth.role()) = 'authenticated'::text);

-- Trade attempts policies
ALTER POLICY "Authenticated users can view trade attempts" ON trade_attempts
  USING ((SELECT auth.role()) = 'authenticated'::text);

ALTER POLICY "Authenticated users can manage trade attempts" ON trade_attempts
  USING ((SELECT auth.role()) = 'authenticated'::text);

-- Trading configurations policies
ALTER POLICY "Users can manage own trading configurations" ON trading_configurations
  USING ((SELECT auth.role()) = 'authenticated'::text);

-- User sessions policies
ALTER POLICY "Users can manage own sessions" ON user_sessions
  USING (((SELECT auth.uid())::text = (user_id)::text) OR ((SELECT auth.role()) = 'service_role'::text));

-- Transactions policies (already optimized, but ensure consistency)
-- Note: These already use (SELECT auth.uid()) but we'll verify they're correct
-- The existing policies are already optimized, so we'll leave them as-is

COMMENT ON POLICY "Users can view own profile" ON "user" IS 'Optimized: Uses (SELECT auth.uid()) for better performance';
COMMENT ON POLICY "Users can view own preferences" ON user_preferences IS 'Optimized: Uses (SELECT auth.uid()) for better performance';
COMMENT ON POLICY "Users can view own snipe targets" ON snipe_targets IS 'Optimized: Uses (SELECT auth.uid()) for better performance';
COMMENT ON POLICY "Users can view own execution history" ON execution_history IS 'Optimized: Uses (SELECT auth.uid()) for better performance';
COMMENT ON POLICY "Users can view own positions" ON positions IS 'Optimized: Uses (SELECT auth.uid()) for better performance';
COMMENT ON POLICY "Users can view own API credentials" ON api_credentials IS 'Optimized: Uses (SELECT auth.uid()) for better performance';

