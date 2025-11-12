ALTER TABLE "api_credentials" DROP CONSTRAINT "api_credentials_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "balance_snapshots" DROP CONSTRAINT "balance_snapshots_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "execution_history" DROP CONSTRAINT "execution_history_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "portfolio_summary" DROP CONSTRAINT "portfolio_summary_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "position_snapshots" DROP CONSTRAINT "position_snapshots_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "simulation_sessions" DROP CONSTRAINT "simulation_sessions_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "snipe_targets" DROP CONSTRAINT "snipe_targets_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "strategy_performance_metrics" DROP CONSTRAINT "strategy_performance_metrics_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "strategy_phase_executions" DROP CONSTRAINT "strategy_phase_executions_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "trading_strategies" DROP CONSTRAINT "trading_strategies_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_user_id_user_id_fk";
--> statement-breakpoint
-- Add position_id column if it doesn't exist (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'execution_history' 
        AND column_name = 'position_id'
    ) THEN
        ALTER TABLE "execution_history" ADD COLUMN "position_id" integer;
    END IF;
END $$;--> statement-breakpoint
-- Add foreign key constraint if it doesn't exist and positions table exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public'
        AND constraint_name = 'execution_history_position_id_positions_id_fk'
    ) THEN
        -- Only add constraint if positions table exists
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'positions'
        ) THEN
            ALTER TABLE "execution_history" 
            ADD CONSTRAINT "execution_history_position_id_positions_id_fk" 
            FOREIGN KEY ("position_id") 
            REFERENCES "public"."positions"("id") 
            ON DELETE set null 
            ON UPDATE no action;
        END IF;
    END IF;
END $$;--> statement-breakpoint
CREATE INDEX "execution_history_position_idx" ON "execution_history" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "snipe_targets_vcoin_id_idx" ON "snipe_targets" USING btree ("vcoin_id");--> statement-breakpoint
CREATE INDEX "snipe_targets_user_vcoin_id_idx" ON "snipe_targets" USING btree ("user_id","vcoin_id");