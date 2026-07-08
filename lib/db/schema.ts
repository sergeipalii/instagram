import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const conversationKind = pgEnum("conversation_kind", ["dm", "comment"]);
export const eventDirection = pgEnum("event_direction", ["in", "out"]);
export const eventStatus = pgEnum("event_status", [
  // Lifecycle: received → processing → {triaged|auto|answered|hidden|skipped|failed}.
  // Ingest (webhook/poll) writes `received`; the processor cron claims into
  // `processing`, then lands a terminal status. The inbox = `triaged`.
  "new", // legacy (migrated → triaged); kept so the enum isn't narrowed
  "received", // ingested, awaiting the processor — this is the queue
  "processing", // claimed by a processor run (in flight)
  "triaged", // processed, awaiting a human reply — this is the inbox
  "answered", // we replied
  "skipped", // filtered/dismissed (echo / own / reply / empty)
  "auto", // auto-handled (auto_mode) without manual review
  "hidden", // comment hidden via moderation
  "failed", // dead-letter: processing kept erroring past max attempts
]);
export const commentCategory = pgEnum("comment_category", [
  "question_or_lead",
  "praise",
  "spam",
  "toxic",
  "prohibited",
  "offtopic",
]);
export const escalation = pgEnum("escalation", [
  "none",
  "hot_lead",
  "complaint",
  "human_request",
  "complex_commitment",
]);

// ─── Accounts ────────────────────────────────────────────────────────────────
// One row per connected IG account. Today: a single row = the Sepia account.
// Multi-tenant (phase 2) adds an org_id column; nothing else changes.
export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  igUserId: text("ig_user_id").notNull().unique(),
  username: text("username"),
  platform: text("platform").notNull().default("instagram"),
  autoMode: boolean("auto_mode").notNull().default(false),
  defaultModel: text("default_model"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Conversations ───────────────────────────────────────────────────────────
// A DM thread (external_id = IG conversation id) or a post's comment thread
// (external_id = media id).
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: conversationKind("kind").notNull(),
    externalId: text("external_id").notNull(),
    participantId: text("participant_id"),
    participantUsername: text("participant_username"),
    permalink: text("permalink"),
    mediaCaption: text("media_caption"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("conversations_account_external").on(t.accountId, t.kind, t.externalId)],
);

// ─── Events ──────────────────────────────────────────────────────────────────
// Every inbound message/comment and every outbound reply. The inbox view is
// `direction = 'in' AND status = 'new'`. external_id is UNIQUE → DB-level dedup
// of redelivered webhooks.
export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: eventDirection("direction").notNull(),
    externalId: text("external_id").notNull(),
    author: text("author"),
    text: text("text"),
    attachments: jsonb("attachments"),
    category: commentCategory("category"),
    escalation: escalation("escalation").default("none"),
    status: eventStatus("status").notNull().default("received"),
    modelUsed: text("model_used"),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    raw: jsonb("raw"),
    // Processor bookkeeping (see process-events cron): how many times the
    // processor has claimed this row, when it was last claimed (for stale
    // reclaim), and the last error if it keeps failing (dead-letter at attempts
    // ≥ MAX → status `failed`).
    attempts: integer("attempts").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    lastError: text("last_error"),
    // Recorded but excluded from the inbox at read time (echo / our own / reply /
    // empty). Every signature-valid delivery leaves a DB trace; the inbox filters
    // `ignored = false`, so validation + handling are observable without noise.
    ignored: boolean("ignored").notNull().default(false),
    ignoredReason: text("ignored_reason"),
  },
  (t) => [
    uniqueIndex("events_external_id").on(t.externalId),
    index("events_inbox").on(t.status, t.direction),
    index("events_conversation").on(t.conversationId),
    // Processor queue: WHERE direction='in' AND status='received' ORDER BY created_at.
    index("events_queue").on(t.direction, t.status, t.createdAt),
  ],
);

// ─── Webhook deliveries (raw audit log) ──────────────────────────────────────
// One row per signature-valid webhook POST, captured UNCONDITIONALLY before any
// typed handling. "Fix everything first, understand the fields later": whatever
// Meta sends that passes the HMAC check leaves a trace here, even payloads the
// typed handlers (events) don't recognise. Distinct from `events` (which is the
// semantic inbox and needs a conversation); this is a pure firehose.
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    // body.object (e.g. "instagram"); null when the body wasn't JSON.
    object: text("object"),
    // Parsed body, or { _unparseable: "<raw text>" } when JSON.parse failed.
    raw: jsonb("raw").notNull(),
    // How many items from this delivery were dispatched to a typed handler
    // (messaging[] + comment changes[]) — 0 means "captured raw but nothing
    // matched a handler" (e.g. the messages-as-changes Test, or other fields).
    handledCount: integer("handled_count").notNull().default(0),
  },
  (t) => [index("webhook_deliveries_received").on(t.receivedAt)],
);

export type Account = typeof accounts.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
