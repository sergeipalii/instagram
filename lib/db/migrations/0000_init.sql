CREATE TYPE "public"."comment_category" AS ENUM('question_or_lead', 'praise', 'spam', 'toxic', 'prohibited', 'offtopic');--> statement-breakpoint
CREATE TYPE "public"."conversation_kind" AS ENUM('dm', 'comment');--> statement-breakpoint
CREATE TYPE "public"."escalation" AS ENUM('none', 'hot_lead', 'complaint', 'human_request', 'complex_commitment');--> statement-breakpoint
CREATE TYPE "public"."event_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('new', 'answered', 'skipped', 'auto', 'hidden');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ig_user_id" text NOT NULL,
	"username" text,
	"platform" text DEFAULT 'instagram' NOT NULL,
	"auto_mode" boolean DEFAULT false NOT NULL,
	"default_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_ig_user_id_unique" UNIQUE("ig_user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "conversation_kind" NOT NULL,
	"external_id" text NOT NULL,
	"participant_id" text,
	"participant_username" text,
	"permalink" text,
	"media_caption" text,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "event_direction" NOT NULL,
	"external_id" text NOT NULL,
	"author" text,
	"text" text,
	"attachments" jsonb,
	"category" "comment_category",
	"escalation" "escalation" DEFAULT 'none',
	"status" "event_status" DEFAULT 'new' NOT NULL,
	"model_used" text,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_account_external" ON "conversations" USING btree ("account_id","kind","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_external_id" ON "events" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "events_inbox" ON "events" USING btree ("status","direction");--> statement-breakpoint
CREATE INDEX "events_conversation" ON "events" USING btree ("conversation_id");