/**
 * Dumb ingest — the single write path shared by the webhook and the poll cron.
 * It does exactly ONE bit of logic: decide `direction` (echo/own → "out", else
 * "in"), which is pure and can't lose a message. NO filtering of replies/empties
 * and NO classification — the process-events cron does all of that. Everything
 * inbound lands as `received` (the queue). Idempotent by externalId, so the
 * webhook and the poll never double-record the same message.
 */
import type { Account } from "./db/schema";
import { upsertConversation, recordInbound } from "./inbox";

export interface DmIngest {
  senderId: string;
  recipientId?: string;
  mid: string;
  text?: string;
  attachments?: unknown;
  isEcho?: boolean;
  raw: unknown;
}

/** Ingest one DM message. Thread is keyed by the other party. */
export async function ingestDm(account: Account, m: DmIngest) {
  const fromUs = Boolean(m.isEcho) || m.senderId === account.igUserId;
  const participantId = fromUs ? (m.recipientId ?? m.senderId) : m.senderId;
  const conversationId = await upsertConversation({
    accountId: account.id,
    kind: "dm",
    externalId: participantId,
    participantId,
  });
  return recordInbound({
    conversationId,
    externalId: m.mid,
    direction: fromUs ? "out" : "in",
    author: m.senderId,
    text: m.text,
    attachments: m.attachments,
    raw: m.raw,
  });
}

export interface CommentIngest {
  commentId: string;
  mediaId?: string;
  fromId?: string;
  fromUsername?: string;
  text?: string;
  parentId?: string;
  permalink?: string;
  mediaCaption?: string;
  raw: unknown;
}

/** Ingest one comment. Thread is keyed by the media. Replies/empties are NOT
 *  filtered here — the processor decides (marks them `skipped`). */
export async function ingestComment(account: Account, c: CommentIngest) {
  const fromUs = Boolean(c.fromId) && c.fromId === account.igUserId;
  const conversationId = await upsertConversation({
    accountId: account.id,
    kind: "comment",
    externalId: c.mediaId ?? c.commentId,
    participantId: c.fromId,
    participantUsername: c.fromUsername,
    permalink: c.permalink,
    mediaCaption: c.mediaCaption,
  });
  return recordInbound({
    conversationId,
    externalId: c.commentId,
    direction: fromUs ? "out" : "in",
    author: c.fromUsername ?? c.fromId,
    text: c.text,
    raw: c.raw,
    parentExternalId: c.parentId,
  });
}
