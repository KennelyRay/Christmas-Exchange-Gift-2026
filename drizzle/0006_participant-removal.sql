ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'participant_removed' BEFORE 'budget_changed';--> statement-breakpoint
DROP INDEX IF EXISTS "participants_exchange_name_key";--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "removed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "participants_exchange_name_key" ON "participants" USING btree ("exchange_id","name_key") WHERE "participants"."removed_at" IS NULL;