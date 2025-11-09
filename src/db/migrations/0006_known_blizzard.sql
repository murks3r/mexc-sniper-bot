CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"snipe_target_id" integer,
	"symbol_name" text NOT NULL,
	"vcoin_id" text,
	"entry_price" real NOT NULL,
	"quantity" real NOT NULL,
	"entry_time" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"buy_execution_id" integer,
	"stop_loss_price" real NOT NULL,
	"take_profit_price" real NOT NULL,
	"max_hold_until" timestamp NOT NULL,
	"exit_price" real,
	"exit_time" timestamp,
	"sell_execution_id" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"realized_pnl" real,
	"realized_pnl_percent" real,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_snipe_target_id_snipe_targets_id_fk" FOREIGN KEY ("snipe_target_id") REFERENCES "public"."snipe_targets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "positions_user_status_idx" ON "positions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "positions_status_idx" ON "positions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "positions_snipe_target_idx" ON "positions" USING btree ("snipe_target_id");--> statement-breakpoint
CREATE INDEX "positions_max_hold_idx" ON "positions" USING btree ("max_hold_until");--> statement-breakpoint
CREATE INDEX "positions_symbol_idx" ON "positions" USING btree ("symbol_name");