import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  accounts,
  conversations,
  events,
  type Account,
  type Conversation,
  type Event,
} from "./db/schema";

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
  author?: string;
  text?: string;
  attachments?: unknown;
  raw?: unknown;
  /** Persist but keep out of the inbox (echo / our own / reply / empty). */
  ignored?: boolean;
  ignoredReason?: string;
}

/**
 * Record an inbound message/comment. Normally a `new` inbox item; pass
 * `ignored` to persist it for observability while hiding it from the inbox
 * (the read side filters `ignored = false`). Idempotent: a redelivered webhook
 * (same externalId) is silently ignored. Returns the event, or null on dupe.
 */
export async function recordInbound(input: InboundInput): Promise<Event | null> {
  const [row] = await db
    .insert(events)
    .values({
      conversationId: input.conversationId,
      direction: "in",
      externalId: input.externalId,
      author: input.author,
      text: input.text,
      attachments: input.attachments ?? null,
      raw: input.raw ?? null,
      status: "new",
      ignored: input.ignored ?? false,
      ignoredReason: input.ignoredReason ?? null,
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
  const statuses = opts?.statuses ?? ["new"];
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

/** Count of unhandled inbox items, for the badge. */
export async function inboxCount(): Promise<number> {
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(eq(events.direction, "in"), eq(events.ignored, false), eq(events.status, "new")),
    );
  return rows.length;
}
