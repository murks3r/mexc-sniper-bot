-- Update RLS policies for Clerk integration
-- These policies use auth.jwt()->>'sub' to get the Clerk user ID

-- Drop existing policies that reference Supabase auth
DROP POLICY IF EXISTS "User can view their own tasks" ON "public"."tasks";
DROP POLICY IF EXISTS "Users must insert their own tasks" ON "public"."tasks";
DROP POLICY IF EXISTS "User can update own tasks" ON "public"."tasks";
DROP POLICY IF EXISTS "User can delete own tasks" ON "public"."tasks";

-- Create new policies for Clerk user IDs
CREATE POLICY "User can view their own tasks"
ON "public"."tasks"
FOR SELECT
TO authenticated
USING (
  ((SELECT auth.jwt()->>'sub') = (user_id)::text)
);

CREATE POLICY "Users must insert their own tasks"
ON "public"."tasks"
AS permissive
FOR INSERT
TO authenticated
WITH CHECK (
  ((SELECT auth.jwt()->>'sub') = (user_id)::text)
);

CREATE POLICY "User can update own tasks"
ON "public"."tasks"
FOR UPDATE
TO authenticated
USING (
  ((SELECT auth.jwt()->>'sub') = (user_id)::text)
);

CREATE POLICY "User can delete own tasks"
ON "public"."tasks"
FOR DELETE
TO authenticated
USING (
  ((SELECT auth.jwt()->>'sub') = (user_id)::text)
);

-- Update user_id column to use Clerk JWT sub claim  
ALTER TABLE "public"."tasks"
ALTER COLUMN "user_id" 
SET DEFAULT (auth.jwt()->>'sub');

-- Add Clerk-specific user metadata tracking if needed
ALTER TABLE "public"."tasks"
ADD COLUMN IF NOT EXISTS "clerk_user_id" TEXT;

-- Update existing records to move supabase user_id to clerk_user_id if needed
UPDATE "public"."tasks"
SET clerk_user_id = user_id 
WHERE clerk_user_id IS NULL;
