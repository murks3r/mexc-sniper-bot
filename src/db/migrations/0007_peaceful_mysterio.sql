-- Create mexc_symbols table if it doesn't exist
CREATE TABLE IF NOT EXISTS "mexc_symbols" (
	"symbol" text PRIMARY KEY NOT NULL,
	"status" text,
	"is_api_tradable" boolean DEFAULT false NOT NULL,
	"listing_zone" text,
	"base_asset" text,
	"quote_asset" text,
	"base_asset_precision" integer,
	"quote_precision" integer,
	"base_size_precision" real,
	"quote_amount_precision" real,
	"quote_amount_precision_market" real,
	"order_types" text,
	"filters" text,
	"permissions" text,
	"last_qualified_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
-- Drop constraints only if they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND constraint_name = 'alert_instances_rule_id_alert_rules_id_fk'
  ) THEN
    ALTER TABLE "alert_instances" DROP CONSTRAINT "alert_instances_rule_id_alert_rules_id_fk";
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND constraint_name = 'alert_notifications_alert_id_alert_instances_id_fk'
  ) THEN
    ALTER TABLE "alert_notifications" DROP CONSTRAINT "alert_notifications_alert_id_alert_instances_id_fk";
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
    AND constraint_name = 'alert_notifications_channel_id_notification_channels_id_fk'
  ) THEN
    ALTER TABLE "alert_notifications" DROP CONSTRAINT "alert_notifications_channel_id_notification_channels_id_fk";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "alert_notifications" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "alert_notifications" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
-- Convert threshold from real to jsonb with explicit cast
-- First drop default, then convert type
ALTER TABLE "alert_rules" ALTER COLUMN "threshold" DROP DEFAULT;
ALTER TABLE "alert_rules" ALTER COLUMN "threshold" TYPE jsonb 
  USING CASE 
    WHEN "threshold" IS NULL THEN NULL
    ELSE jsonb_build_object('value', "threshold")
  END;--> statement-breakpoint
ALTER TABLE "alert_rules" ALTER COLUMN "aggregation_window" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "alert_rules" ALTER COLUMN "evaluation_interval" DROP DEFAULT;--> statement-breakpoint
-- Convert anomaly_threshold from real to jsonb with explicit cast
-- First drop default, then convert type
ALTER TABLE "alert_rules" ALTER COLUMN "anomaly_threshold" DROP DEFAULT;
ALTER TABLE "alert_rules" ALTER COLUMN "anomaly_threshold" TYPE jsonb 
  USING CASE 
    WHEN "anomaly_threshold" IS NULL THEN NULL
    ELSE jsonb_build_object('value', "anomaly_threshold")
  END;--> statement-breakpoint
ALTER TABLE "alert_rules" ALTER COLUMN "learning_window" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "alert_rules" ALTER COLUMN "suppression_duration" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "alert_rules" ALTER COLUMN "escalation_delay" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "alert_rules" ALTER COLUMN "max_alerts" DROP DEFAULT;--> statement-breakpoint
-- Convert tags from text to jsonb with explicit cast
ALTER TABLE "alert_rules" ALTER COLUMN "tags" TYPE jsonb 
  USING CASE 
    WHEN "tags" IS NULL OR "tags" = '' THEN '[]'::jsonb
    WHEN "tags"::text ~ '^\[.*\]$' THEN "tags"::jsonb
    WHEN "tags"::text ~ '^\{.*\}$' THEN "tags"::jsonb
    ELSE jsonb_build_array("tags")
  END;--> statement-breakpoint
-- Convert custom_fields from text to jsonb with explicit cast
ALTER TABLE "alert_rules" ALTER COLUMN "custom_fields" TYPE jsonb 
  USING CASE 
    WHEN "custom_fields" IS NULL OR "custom_fields" = '' THEN '{}'::jsonb
    WHEN "custom_fields"::text ~ '^\{.*\}$' THEN "custom_fields"::jsonb
    ELSE jsonb_build_object('value', "custom_fields")
  END;--> statement-breakpoint
ALTER TABLE "alert_rules" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "alert_rules" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_rules" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "alert_rules" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_suppressions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "alert_suppressions" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "anomaly_models" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "anomaly_models" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "escalation_policies" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "escalation_policies" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
-- Convert config from text to jsonb with explicit cast
ALTER TABLE "notification_channels" ALTER COLUMN "config" TYPE jsonb 
  USING CASE 
    WHEN "config" IS NULL OR "config" = '' THEN '{}'::jsonb
    WHEN "config"::text ~ '^\{.*\}$' THEN "config"::jsonb
    ELSE jsonb_build_object('value', "config")
  END;--> statement-breakpoint
ALTER TABLE "notification_channels" ALTER COLUMN "config" DROP NOT NULL;--> statement-breakpoint
-- Convert headers from text to jsonb with explicit cast
ALTER TABLE "notification_channels" ALTER COLUMN "headers" TYPE jsonb 
  USING CASE 
    WHEN "headers" IS NULL OR "headers" = '' THEN '{}'::jsonb
    WHEN "headers"::text ~ '^\{.*\}$' THEN "headers"::jsonb
    ELSE jsonb_build_object('value', "headers")
  END;--> statement-breakpoint
ALTER TABLE "notification_channels" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "notification_channels" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_channels" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "notification_channels" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_analytics" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "alert_correlations" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "alert_instances" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
-- Add user_id column with default value to handle existing rows (only if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'alert_rules' 
    AND column_name = 'user_id'
  ) THEN
    ALTER TABLE "alert_rules" ADD COLUMN "user_id" text NOT NULL DEFAULT 'system';
    ALTER TABLE "alert_rules" ALTER COLUMN "user_id" DROP DEFAULT;
  END IF;
END $$;--> statement-breakpoint
-- Add user_id column with default value to handle existing rows (only if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_channels' 
    AND column_name = 'user_id'
  ) THEN
    ALTER TABLE "notification_channels" ADD COLUMN "user_id" text NOT NULL DEFAULT 'system';
    ALTER TABLE "notification_channels" ALTER COLUMN "user_id" DROP DEFAULT;
  END IF;
END $$;--> statement-breakpoint
-- Add channel column with default value to handle existing rows (only if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_channels' 
    AND column_name = 'channel'
  ) THEN
    ALTER TABLE "notification_channels" ADD COLUMN "channel" text NOT NULL DEFAULT 'webhook';
    ALTER TABLE "notification_channels" ALTER COLUMN "channel" DROP DEFAULT;
  END IF;
END $$;--> statement-breakpoint
-- Add other notification_channels columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_channels' 
    AND column_name = 'enabled'
  ) THEN
    ALTER TABLE "notification_channels" ADD COLUMN "enabled" boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_channels' 
    AND column_name = 'credentials'
  ) THEN
    ALTER TABLE "notification_channels" ADD COLUMN "credentials" jsonb;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notification_channels' 
    AND column_name = 'webhook_url'
  ) THEN
    ALTER TABLE "notification_channels" ADD COLUMN "webhook_url" text;
  END IF;
END $$;--> statement-breakpoint
-- Create indexes for mexc_symbols if they don't exist
CREATE INDEX IF NOT EXISTS "mexc_symbols_is_api_tradable_idx" ON "mexc_symbols" USING btree ("is_api_tradable");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mexc_symbols_status_idx" ON "mexc_symbols" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mexc_symbols_listing_zone_idx" ON "mexc_symbols" USING btree ("listing_zone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mexc_symbols_last_qualified_at_idx" ON "mexc_symbols" USING btree ("last_qualified_at");--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "bucket";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "timestamp";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "total_alerts";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "critical_alerts";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "high_alerts";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "medium_alerts";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "low_alerts";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "resolved_alerts";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "average_resolution_time";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "mttr";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "false_positives";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "false_positive_rate";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "email_notifications";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "slack_notifications";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "webhook_notifications";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "sms_notifications";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "failed_notifications";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "trading_alerts";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "safety_alerts";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "performance_alerts";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "system_alerts";--> statement-breakpoint
ALTER TABLE "alert_analytics" DROP COLUMN "agent_alerts";--> statement-breakpoint
ALTER TABLE "alert_correlations" DROP COLUMN "correlation_key";--> statement-breakpoint
ALTER TABLE "alert_correlations" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "alert_correlations" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "alert_correlations" DROP COLUMN "severity";--> statement-breakpoint
ALTER TABLE "alert_correlations" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "alert_correlations" DROP COLUMN "alert_count";--> statement-breakpoint
ALTER TABLE "alert_correlations" DROP COLUMN "pattern";--> statement-breakpoint
ALTER TABLE "alert_correlations" DROP COLUMN "confidence";--> statement-breakpoint
ALTER TABLE "alert_correlations" DROP COLUMN "first_alert_at";--> statement-breakpoint
ALTER TABLE "alert_correlations" DROP COLUMN "last_alert_at";--> statement-breakpoint
ALTER TABLE "alert_correlations" DROP COLUMN "resolved_at";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "rule_id";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "severity";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "message";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "metric_value";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "threshold";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "anomaly_score";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "source";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "source_id";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "environment";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "correlation_id";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "parent_alert_id";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "escalation_level";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "last_escalated_at";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "resolved_at";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "resolved_by";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "resolution_notes";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "first_triggered_at";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "last_triggered_at";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "additional_data";--> statement-breakpoint
ALTER TABLE "alert_instances" DROP COLUMN "labels";--> statement-breakpoint
ALTER TABLE "alert_notifications" DROP COLUMN "alert_id";--> statement-breakpoint
ALTER TABLE "alert_notifications" DROP COLUMN "channel_id";--> statement-breakpoint
ALTER TABLE "alert_notifications" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "alert_notifications" DROP COLUMN "attempts";--> statement-breakpoint
ALTER TABLE "alert_notifications" DROP COLUMN "last_attempt_at";--> statement-breakpoint
ALTER TABLE "alert_notifications" DROP COLUMN "sent_at";--> statement-breakpoint
ALTER TABLE "alert_notifications" DROP COLUMN "subject";--> statement-breakpoint
ALTER TABLE "alert_notifications" DROP COLUMN "message";--> statement-breakpoint
ALTER TABLE "alert_notifications" DROP COLUMN "response";--> statement-breakpoint
ALTER TABLE "alert_notifications" DROP COLUMN "error_message";--> statement-breakpoint
ALTER TABLE "alert_suppressions" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "alert_suppressions" DROP COLUMN "reason";--> statement-breakpoint
ALTER TABLE "alert_suppressions" DROP COLUMN "rule_ids";--> statement-breakpoint
ALTER TABLE "alert_suppressions" DROP COLUMN "category_filter";--> statement-breakpoint
ALTER TABLE "alert_suppressions" DROP COLUMN "severity_filter";--> statement-breakpoint
ALTER TABLE "alert_suppressions" DROP COLUMN "source_filter";--> statement-breakpoint
ALTER TABLE "alert_suppressions" DROP COLUMN "tag_filter";--> statement-breakpoint
ALTER TABLE "alert_suppressions" DROP COLUMN "starts_at";--> statement-breakpoint
ALTER TABLE "alert_suppressions" DROP COLUMN "ends_at";--> statement-breakpoint
ALTER TABLE "alert_suppressions" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "alert_suppressions" DROP COLUMN "created_by";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "metric_name";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "model_type";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "parameters";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "training_data_from";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "training_data_to";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "sample_count";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "accuracy";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "precision";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "recall";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "f1_score";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "false_positive_rate";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "model_data";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "features";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "last_trained_at";--> statement-breakpoint
ALTER TABLE "anomaly_models" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "escalation_policies" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "escalation_policies" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "escalation_policies" DROP COLUMN "steps";--> statement-breakpoint
ALTER TABLE "escalation_policies" DROP COLUMN "is_enabled";--> statement-breakpoint
ALTER TABLE "escalation_policies" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "escalation_policies" DROP COLUMN "created_by";