ALTER TYPE "public"."event_status" ADD VALUE 'received' BEFORE 'answered';--> statement-breakpoint
ALTER TYPE "public"."event_status" ADD VALUE 'processing' BEFORE 'answered';--> statement-breakpoint
ALTER TYPE "public"."event_status" ADD VALUE 'triaged' BEFORE 'answered';--> statement-breakpoint
ALTER TYPE "public"."event_status" ADD VALUE 'failed';--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "status" SET DEFAULT 'received';--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "last_error" text;--> statement-breakpoint
CREATE INDEX "events_queue" ON "events" USING btree ("direction","status","created_at");--> statement-breakpoint
-- Data migration: legacy inbox items (status='new') become the new inbox status 'triaged'.
-- Runs as its own auto-committed request on the neon-http driver, after the ADD VALUE above.
UPDATE "events" SET "status" = 'triaged' WHERE "status" = 'new';