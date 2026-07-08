ALTER TABLE "events" ADD COLUMN "parent_external_id" text;--> statement-breakpoint
CREATE INDEX "events_parent" ON "events" USING btree ("parent_external_id");--> statement-breakpoint
-- Backfill threading from stored raw payloads so existing replies attach to their
-- parent comment immediately.
UPDATE "events" SET "parent_external_id" = "raw"->>'parent_id' WHERE "raw"->>'parent_id' IS NOT NULL;