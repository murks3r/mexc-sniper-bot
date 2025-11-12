-- Drop constraint if it exists (idempotent)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public'
        AND constraint_name = 'execution_history_position_id_positions_id_fk'
    ) THEN
        ALTER TABLE "execution_history" DROP CONSTRAINT "execution_history_position_id_positions_id_fk";
    END IF;
END $$;
