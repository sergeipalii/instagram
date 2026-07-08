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
        // Only overwrite when we actually have a value, so a source that lacks it
        // (e.g. a webhook DM with no username) can't wipe what the poll stored.
        ...(input.participantUsername ? { participantUsername: input.participantUsername } : {}),
        ...(input.permalink ? { permalink: input.permalink } : {}),
        ...(input.mediaCaption ? { mediaCaption: input.mediaCaption } : {}),
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
  /** Comment replies (by parent_external_id), oldest-first. Empty for DM threads. */
  replies: Event[];
  /** DM only: the whole conversation, both directions, oldest-first (chat feed).
   *  Undefined for comments. */
  messages?: Event[];
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

/**
 * Comment inbox items: one per inbound comment matching the status filter, each
 * with its reply thread. (DMs are handled separately as one card per thread.)
 */
async function listCommentItems(
  statuses: Event["status"][],
  limit: number,
): Promise<InboxItem[]> {
  const rows = await db
    .select({ event: events, conversation: conversations })
    .from(events)
    .innerJoin(conversations, eq(events.conversationId, conversations.id))
    .where(
      and(
        eq(events.direction, "in"),
        eq(events.ignored, false), // hide auto-skipped (echo/reply/empty) noise
        inArray(events.status, statuses),
        eq(conversations.kind, "comment"),
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(limit);
  return attachReplies(rows);
}

/**
 * DM inbox: ONE card per conversation (not per message). Each card carries the
 * full chat feed (`messages`, both directions, oldest-first). A thread's tab is
 * derived at the conversation level: it's "new" (triaged) while it has an open
 * inbound (non-ignored, still `triaged`); otherwise, if we've ever replied
 * (any outbound), it's "answered". Threads with neither — e.g. only skipped
 * reactions and no reply — surface nowhere. This is why the anna case (empty
 * inbound + our replies) shows up under Answered even with no open inbound.
 */
async function listDmThreads(
  statuses: Event["status"][],
  limit: number,
): Promise<InboxItem[]> {
  const convoRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.kind, "dm"))
    .orderBy(desc(conversations.lastActivityAt))
    .limit(limit);
  if (!convoRows.length) return [];
  const convoById = new Map(convoRows.map((c) => [c.id, c]));

  const evRows = await db
    .select()
    .from(events)
    .where(inArray(events.conversationId, [...convoById.keys()]))
    .orderBy(events.createdAt);

  const byConvo = new Map<string, Event[]>();
  for (const e of evRows) {
    const arr = byConvo.get(e.conversationId);
    if (arr) arr.push(e);
    else byConvo.set(e.conversationId, [e]);
  }

  const wantTriaged = statuses.includes("triaged");
  const wantAnswered = statuses.some((s) => s !== "triaged"); // answered / all

  const out: InboxItem[] = [];
  for (const [cid, msgs] of byConvo) {
    const conversation = convoById.get(cid)!;
    const inbound = msgs.filter((m) => m.direction === "in");
    const openInbound = inbound.filter((m) => !m.ignored && m.status === "triaged");
    const hasOutbound = msgs.some((m) => m.direction === "out");
    const isNew = openInbound.length > 0;

    // Tab visibility: new threads → Новые; replied-to threads → Отвеченные.
    if (isNew ? !wantTriaged : !(wantAnswered && hasOutbound)) continue;

    // Reply target: latest open inbound (so status close targets a live one),
    // else latest inbound, else latest message of any kind.
    const rep =
      openInbound[openInbound.length - 1] ??
      inbound[inbound.length - 1] ??
      msgs[msgs.length - 1];
    out.push({ event: rep, conversation, replies: [], messages: msgs });
  }
  return out;
}

/** List inbox items (comments one-per-comment; DMs one-per-thread). */
export async function listInbox(opts?: {
  kind?: "dm" | "comment";
  statuses?: Event["status"][];
  limit?: number;
}): Promise<InboxItem[]> {
  const statuses = opts?.statuses ?? ["triaged"];
  const limit = opts?.limit ?? 200;

  const [comments, dms] = await Promise.all([
    opts?.kind === "dm" ? Promise.resolve<InboxItem[]>([]) : listCommentItems(statuses, limit),
    opts?.kind === "comment" ? Promise.resolve<InboxItem[]>([]) : listDmThreads(statuses, limit),
  ]);

  // Merge both kinds newest-first by the representative event's time.
  const merged = [...comments, ...dms].sort(
    (a, b) => new Date(b.event.createdAt).getTime() - new Date(a.event.createdAt).getTime(),
  );
  return merged.slice(0, limit);
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

/**
 * Close a whole DM thread: mark every open inbound (non-ignored, still `triaged`)
 * in the conversation with the given terminal status. A DM card shows one reply
 * box for many messages, so one send must clear all of them — otherwise a thread
 * with several unanswered "Привет!" lingers in Новые after we've replied.
 */
export async function closeDmThread(
  conversationId: string,
  status: Event["status"],
  extra?: { category?: Event["category"]; escalation?: Event["escalation"]; modelUsed?: string },
): Promise<void> {
  await db
    .update(events)
    .set({ status, handledAt: new Date(), ...extra })
    .where(
      and(
        eq(events.conversationId, conversationId),
        eq(events.direction, "in"),
        eq(events.ignored, false),
        eq(events.status, "triaged"),
      ),
    );
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

/**
 * Count of unhandled inbox cards, for the badge. Comments count per open comment;
 * DMs count per thread (a conversation with several open inbounds is one card).
 */
export async function inboxCount(): Promise<number> {
  const rows = await db
    .select({ kind: conversations.kind, conversationId: events.conversationId })
    .from(events)
    .innerJoin(conversations, eq(events.conversationId, conversations.id))
    .where(
      and(eq(events.direction, "in"), eq(events.ignored, false), eq(events.status, "triaged")),
    );
  let comments = 0;
  const dmThreads = new Set<string>();
  for (const r of rows) {
    if (r.kind === "dm") dmThreads.add(r.conversationId);
    else comments++;
  }
  return comments + dmThreads.size;
}
