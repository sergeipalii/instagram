import { env } from "./env";
import {
  getMe,
  getConversations,
  getConversationMessages,
  getMediaList,
  getMediaComments,
} from "./ig";
import { getOrCreateAccount } from "./inbox";
import { ingestDm, ingestComment } from "./ingest";

export interface SyncResult {
  dms: number; // new inbound DM rows written
  comments: number; // new inbound comment rows written
  calls: number; // Graph API calls spent
  skipped: string[]; // surfaces we didn't reach (budget/cap) — no silent truncation
  errors: string[];
}

// Rate-limit guardrails: Instagram allows ~200 calls/user/hour. At a 30-min poll
// cadence that's 2 runs/hour, so cap each run well under half the budget.
const MAX_GRAPH_CALLS = 40;
const CONVO_RECENT_MS = 60 * 60 * 1000; // only threads active in the last hour
const MEDIA_RECENT_MS = 30 * 24 * 60 * 60 * 1000; // only media from the last 30 days
const MAX_CONVOS = 20;
const MAX_MEDIA = 15;

/**
 * Poll the Graph API and DUMB-ingest new DMs + comments into the queue (status
 * `received`; the process-events cron classifies later). This is the fallback
 * for anything a webhook missed — idempotent (ingest dedups by external id), so
 * webhook and poll never double-record. Bounded to MAX_GRAPH_CALLS per run and
 * to recently-active threads/media so it can't blow the rate limit.
 *
 * `full: true` — one-off historical backfill: drop the recency windows and raise
 * the caps to pull ALL conversations/media (e.g. to seed old DMs). Not for the
 * recurring cron (would risk the rate limit); trigger manually.
 */
export async function syncInbox(opts?: { full?: boolean }): Promise<SyncResult> {
  const full = opts?.full ?? false;
  const maxCalls = full ? 200 : MAX_GRAPH_CALLS;
  const uid = env.igUserId();
  const result: SyncResult = { dms: 0, comments: 0, calls: 0, skipped: [], errors: [] };
  const now = Date.now();

  const me = await getMe().catch(() => ({ username: undefined }));
  result.calls++;
  const account = await getOrCreateAccount(uid, me.username);

  // ── DMs ──
  try {
    const convos = await getConversations();
    result.calls++;
    const recent = full
      ? convos
      : convos.filter((c) => !c.updated_time || now - Date.parse(c.updated_time) < CONVO_RECENT_MS);
    const maxConvos = full ? recent.length : MAX_CONVOS;
    let taken = 0;
    for (const convo of recent) {
      if (taken >= maxConvos || result.calls >= maxCalls) {
        result.skipped.push(`convos:${recent.length - taken}`);
        break;
      }
      const participant = (convo.participants?.data ?? []).find(
        (p: any) => String(p.id) !== String(uid),
      );
      const messages = await getConversationMessages(convo.id).catch(() => []);
      result.calls++;
      taken++;
      for (const m of messages) {
        const saved = await ingestDm(account, {
          senderId: String(m.from?.id ?? participant?.id ?? convo.id),
          recipientId: participant?.id,
          participantUsername: participant?.username ?? m.from?.username,
          mid: m.id,
          text: m.message,
          raw: m,
        });
        if (saved && saved.direction === "in") result.dms++;
      }
    }
  } catch (e: any) {
    result.errors.push(`dms: ${e?.message ?? e}`);
  }

  // ── Comments ──
  try {
    const media = await getMediaList();
    result.calls++;
    const recent = media.filter(
      (m) =>
        m.comments_count &&
        (full || !m.timestamp || now - Date.parse(m.timestamp) < MEDIA_RECENT_MS),
    );
    const maxMedia = full ? recent.length : MAX_MEDIA;
    let taken = 0;
    for (const md of recent) {
      if (taken >= maxMedia || result.calls >= maxCalls) {
        result.skipped.push(`media:${recent.length - taken}`);
        break;
      }
      const comments = await getMediaComments(md.id).catch(() => []);
      result.calls++;
      taken++;
      for (const c of comments) {
        const saved = await ingestComment(account, {
          commentId: c.id,
          mediaId: md.id,
          fromId: c.from?.id,
          fromUsername: c.from?.username,
          text: c.text,
          parentId: c.parent_id,
          permalink: md.permalink,
          mediaCaption: md.caption,
          raw: c,
        });
        if (saved && saved.direction === "in") result.comments++;
      }
    }
  } catch (e: any) {
    result.errors.push(`comments: ${e?.message ?? e}`);
  }

  return result;
}
