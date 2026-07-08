import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  accounts,
  conversations,
  events,
  webhookDeliveries,
  type Account,
  type Conversation,
  type Event,
  type WebhookDelivery,
} from "./db/schema";

// ─── Webhook deliveries (raw audit log) ──────────────────────────────────────

/**
 * Persist a signature-valid webhook POST verbatim, before any typed handling.
 * Capture-everything-first: even payloads no handler recognises leave a trace.
 * `object` is body.object (null if unparseable); `raw` is the parsed body, or
 * `{ _unparseable: <text> }` when JSON.parse failed. Returns the row id so the
 * caller can backfill handledCount after the typed handlers run.
 */
export async function recordDelivery(input: {
  object: string | null;
  raw: unknown;
}): Promise<string | null> {
  const [row] = await db
    .insert(webhookDeliveries)
    .values({ object: input.object, raw: input.raw ?? null })
    .returning({ id: webhookDeliveries.id });
  return row?.id ?? null;
}

/** Backfill how many typed items this delivery produced in `events`. */
export async function setDeliveryHandledCount(id: string, count: number): Promise<void> {
  await db.update(webhookDeliveries).set({ handledCount: count }).where(eq(webhookDeliveries.id, id));
}

// ─── Accounts ────────────────────────────────────────────────────────────────

/** Get (or lazily create) the account row for an IG user id. */
export async function getOrCreateAccount(
  igUserId: string,
  username?: string,
): Promise<Account> {
  const [existing] = await db.select().from(accounts).where(eq(accounts.igUserId, igUserId));
  if (existing) return existing;
  // onConflictDoNothing (not DoUpdate) so a missing username can't produce an
  // empty SET clause; re-select on the rare race where another insert won.
  const [created] = await db
    .insert(accounts)
    .values({ igUserId, username })
    .onConflictDoNothing({ target: accounts.igUserId })
    .returning();
  if (created) return created;
  const [again] = await db.select().from(accounts).where(eq(accounts.igUserId, igUserId));
  return again;
}

// ─── Conversations ───────────────────────────────────────────────────────────

interface ConvoInput {
  accountId: string;
  kind: "dm" | "comment";
  externalId: string;
  participantId?: string;
  participantUsername?: string;
  permalink?: string;
  mediaCaption?: string;
}

/** Upsert a conversation thread; returns its id. */
export async function upsertConversation(input: ConvoInput): Promise<string> {
  const [row] = await db
    .insert(conversations)
    .values({
      accountId: input.accountId,
      kind: input.kind,
      externalId: input.externalId,
      participantId: input.participantId,
      participantUsername: input.participantUsername,
      permalink: input.permalink,
      mediaCaption: input.mediaCaption,
      lastActivityAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [conversations.accountId, conversations.kind, conversations.externalId],
      set: {
        lastActivityAt: new Date(),
        participantUsername: input.participantUsername,
        permalink: input.permalink,
        mediaCaption: input.mediaCaption,
      },
    })
    .returning({ id: conversations.id });
  return row.id;
}

// ─── Events ──────────────────────────────────────────────────────────────────

interface InboundInput {
  conversationId: string;
  externalId: string;
  /** "in" (default) queues for the processor; "out" (echoes/own) is inert history. */
  direction?: "in" | "out";
  author?: string;
  text?: string;
  attachments?: unknown;
  raw?: unknown;
}

/**
 * Dumb ingest primitive: persist one received event verbatim. Inbound rows land
 * as `received` (the processor queue via the DB default); no filtering or
 * classification happens here — that's the process-events cron. Outbound echoes
 * (our own messages Meta reflects back) are recorded as `answered` history and
 * never enter the queue/inbox (both filter `direction = 'in'`). Idempotent by
 * externalId (dedups webhook↔poll redelivery). Returns the row, or null on dupe.
 */
export async function recordInbound(input: InboundInput): Promise<Event | null> {
  const outbound = input.direction === "out";
  const [row] = await db
    .insert(events)
    .values({
      conversationId: input.conversationId,
      direction: input.direction ?? "in",
      externalId: input.externalId,
      author: input.author,
      text: input.text,
      attachments: input.attachments ?? null,
      raw: input.raw ?? null,
      // inbound → DB default 'received'; outbound echo → terminal 'answered'
      ...(outbound ? { status: "answered" as const, handledAt: new Date() } : {}),
    })
    .onConflictDoNothing({ target: events.externalId })
    .returning();
  return row ?? null;
}

interface OutboundInput {
  conversationId: string;
  externalId: string;
  text: string;
  modelUsed?: string;
}

/** Record a reply we sent (for thread history). */
export async function recordOutbound(input: OutboundInput): Promise<void> {
  await db
    .insert(events)
    .values({
      conversationId: input.conversationId,
      direction: "out",
      externalId: input.externalId,
      author: "us",
      text: input.text,
      status: "answered",
      modelUsed: input.modelUsed,
      handledAt: new Date(),
    })
    .onConflictDoNothing({ target: events.externalId });
}

export interface InboxItem {
  event: Event;
  conversation: Conversation;
}

/** List inbox items (inbound + `new` by default), newest first. */
export async function listInbox(opts?: {
  kind?: "dm" | "comment";
  statuses?: Event["status"][];
  limit?: number;
}): Promise<InboxItem[]> {
  const statuses = opts?.statuses ?? ["triaged"];
  const conds = [
    eq(events.direction, "in"),
    eq(events.ignored, false), // hide echo / our own / replies from the inbox
    inArray(events.status, statuses),
  ];
  if (opts?.kind) conds.push(eq(conversations.kind, opts.kind));

  const rows = await db
    .select({ event: events, conversation: conversations })
    .from(events)
    .innerJoin(conversations, eq(events.conversationId, conversations.id))
    .where(and(...conds))
    .orderBy(desc(events.createdAt))
    .limit(opts?.limit ?? 200);
  return rows;
}

/** A single inbox item with its conversation. */
export async function getInboxItem(eventId: string): Promise<InboxItem | null> {
  const [row] = await db
    .select({ event: events, conversation: conversations })
    .from(events)
    .innerJoin(conversations, eq(events.conversationId, conversations.id))
    .where(eq(events.id, eventId));
  return row ?? null;
}

/** Prior messages in a DM thread, oldest-first, for model context. */
export async function threadHistory(
  conversationId: string,
): Promise<{ role: "user" | "assistant"; text: string }[]> {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.conversationId, conversationId))
    .orderBy(events.createdAt);
  return rows
    .filter((r) => r.text)
    .map((r) => ({ role: r.direction === "in" ? "user" : "assistant", text: r.text! }));
}

/** Update an event's status (+ optional metadata). */
export async function setEventStatus(
  eventId: string,
  status: Event["status"],
  extra?: { category?: Event["category"]; escalation?: Event["escalation"]; modelUsed?: string },
): Promise<void> {
  await db
    .update(events)
    .set({ status, handledAt: new Date(), ...extra })
    .where(eq(events.id, eventId));
}

// ─── Processor queue (process-events cron) ───────────────────────────────────

export interface ClaimedEvent {
  id: string;
  conversationId: string;
  externalId: string;
  author: string | null;
  text: string | null;
  raw: any;
  attempts: number;
}

/** Minutes a `processing` row can sit before it's considered crashed & reclaimed. */
const STALE_CLAIM_MIN = 10;

/**
 * Atomically claim up to `limit` queued events for processing. One SQL statement
 * (works on the neon-http driver, which has no multi-statement transactions):
 * flips `received` → `processing`, bumps `attempts`, stamps `claimed_at`.
 * `FOR UPDATE SKIP LOCKED` means two concurrent cron runs never grab the same
 * row; the stale-`processing` branch reclaims rows a crashed run left behind.
 */
export async function claimEvents(limit = 25): Promise<ClaimedEvent[]> {
  const res: any = await db.execute(sql`
    UPDATE events SET status = 'processing', attempts = attempts + 1, claimed_at = now()
    WHERE id IN (
      SELECT id FROM events
      WHERE direction = 'in'
        AND (
          status = 'received'
          OR (status = 'processing' AND claimed_at < now() - make_interval(mins => ${STALE_CLAIM_MIN}))
        )
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, conversation_id AS "conversationId", external_id AS "externalId",
              author, text, raw, attempts
  `);
  return (res.rows ?? res) as ClaimedEvent[];
}

/** Filtered out by the processor (echo already excluded at ingest via direction). */
export async function skipEvent(id: string, reason: string): Promise<void> {
  await db
    .update(events)
    .set({ status: "skipped", ignored: true, ignoredReason: reason, handledAt: new Date() })
    .where(eq(events.id, id));
}

/** Processing errored: requeue for another attempt, or dead-letter to `failed`. */
export async function failEvent(id: string, error: string, retry: boolean): Promise<void> {
  await db
    .update(events)
    .set({
      status: retry ? "received" : "failed",
      lastError: error.slice(0, 1000),
      ...(retry ? {} : { handledAt: new Date() }),
    })
    .where(eq(events.id, id));
}

/** Count of unhandled inbox items, for the badge. */
export async function inboxCount(): Promise<number> {
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(eq(events.direction, "in"), eq(events.ignored, false), eq(events.status, "triaged")),
    );
  return rows.length;
}
