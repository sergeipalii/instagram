CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"object" text,
	"raw" jsonb NOT NULL,
	"handled_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "webhook_deliveries_received" ON "webhook_deliveries" USING btree ("received_at");