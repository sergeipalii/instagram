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
  /** external_id of the parent (top-level) comment, for reply threading. */
  parentExternalId?: string;
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
      parentExternalId: input.parentExternalId ?? null,
      // inbound → DB default 'received'; outbound echo → terminal 'answered'
      ...(outbound ? { status: "answered" as const, handledAt: new Date() } : {}),
    })
    .onConflictDoNothing({ target: events.externalId })
    .returning();
  return row ?? null;
}

interface OutboundInput {
  conversationId: string;
  /** Prefer the REAL id returned by the send API — the later poll/webhook
   *  re-ingest of our own message then dedups on it (onConflictDoNothing). */
  externalId: string;
  text: string;
  modelUsed?: string;
  /** For comment replies: the parent (top-level) comment's external_id. */
  parentExternalId?: string;
}

/** Record a reply we sent (shows in the thread immediately; poll re-ingest dedups). */
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
      parentExternalId: input.parentExternalId ?? null,
    })
    .onConflictDoNothing({ target: events.externalId });
}

export interface InboxItem {
  event: Event;
  conversation: Conversation;
  /** The thread under this item: comment replies (by parent_external_id) or, for
   *  DMs, our outbound messages sent after it. Oldest-first. */
  replies: Event[];
}

/**
 * Attach the reply thread to each item in one batched pass. Comments: events
 * whose parent_external_id points at the top comment. DMs: outbound events in
 * the same conversation newer than the item (our replies).
 */
async function attachReplies(
  base: { event: Event; conversation: Conversation }[],
): Promise<InboxItem[]> {
  if (!base.length) return [];
  const commentExtIds = base
    .filter((i) => i.conversation.kind === "comment")
    .map((i) => i.event.externalId);
  const dmConvoIds = base
    .filter((i) => i.conversation.kind === "dm")
    .map((i) => i.conversation.id);

  const commentReplies = commentExtIds.length
    ? await db
        .select()
        .from(events)
        .where(inArray(events.parentExternalId, commentExtIds))
        .orderBy(events.createdAt)
    : [];
  const dmReplies = dmConvoIds.length
    ? await db
        .select()
        .from(events)
        .where(and(inArray(events.conversationId, dmConvoIds), eq(events.direction, "out")))
        .orderBy(events.createdAt)
    : [];

  const byParent = new Map<string, Event[]>();
  for (const r of commentReplies) {
    const k = r.parentExternalId!;
    const arr = byParent.get(k);
    if (arr) arr.push(r);
    else byParent.set(k, [r]);
  }
  const byConvo = new Map<string, Event[]>();
  for (const r of dmReplies) {
    const arr = byConvo.get(r.conversationId);
    if (arr) arr.push(r);
    else byConvo.set(r.conversationId, [r]);
  }

  return base.map((i) => ({
    ...i,
    replies:
      i.conversation.kind === "comment"
        ? (byParent.get(i.event.externalId) ?? [])
        : (byConvo.get(i.conversation.id) ?? []).filter((r) => r.createdAt > i.event.createdAt),
  }));
}

/** List inbox items (inbound, `triaged` by default) with their reply threads. */
export async function listInbox(opts?: {
  kind?: "dm" | "comment";
  statuses?: Event["status"][];
  limit?: number;
}): Promise<InboxItem[]> {
  const statuses = opts?.statuses ?? ["triaged"];
  const conds = [
    eq(events.direction, "in"),
    eq(events.ignored, false), // hide auto-skipped (echo/reply/empty) noise
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
  return attachReplies(rows);
}

/** A single inbox item with its conversation + reply thread. */
export async function getInboxItem(eventId: string): Promise<InboxItem | null> {
  const [row] = await db
    .select({ event: events, conversation: conversations })
    .from(events)
    .innerJoin(conversations, eq(events.conversationId, conversations.id))
    .where(eq(events.id, eventId));
  if (!row) return null;
  const [item] = await attachReplies([row]);
  return item ?? null;
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
