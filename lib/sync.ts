import { env } from "./env";
import {
  getMe,
  getConversations,
  getConversationMessages,
  getMediaList,
  getMediaComments,
} from "./ig";
import {
  getOrCreateAccount,
  upsertConversation,
  recordInbound,
  recordOutbound,
} from "./inbox";

export interface SyncResult {
  dms: number;
  comments: number;
  errors: string[];
}

/**
 * Backfill existing DMs + comments from the Graph API into the inbox. Idempotent
 * (recordInbound dedups by external id), so it's safe to re-run. New inbound
 * items land as `new`; our own past messages are recorded as outbound history.
 */
export async function syncInbox(): Promise<SyncResult> {
  const uid = env.igUserId();
  const me = await getMe().catch(() => ({ username: undefined }));
  const account = await getOrCreateAccount(uid, me.username);
  const result: SyncResult = { dms: 0, comments: 0, errors: [] };

  // ── DMs ──
  try {
    for (const convo of await getConversations()) {
      const others = (convo.participants?.data ?? []).filter(
        (p: any) => String(p.id) !== String(uid),
      );
      const participant = others[0];
      const conversationId = await upsertConversation({
        accountId: account.id,
        kind: "dm",
        externalId: participant?.id ?? convo.id,
        participantId: participant?.id,
        participantUsername: participant?.username,
      });
      const messages = await getConversationMessages(convo.id).catch(() => []);
      for (const m of messages) {
        const fromUs = String(m.from?.id) === String(uid);
        if (fromUs) {
          await recordOutbound({
            conversationId,
            externalId: m.id,
            text: m.message ?? "",
          });
        } else {
          const saved = await recordInbound({
            conversationId,
            externalId: m.id,
            author: m.from?.username ?? m.from?.id,
            text: m.message,
            raw: m,
          });
          if (saved) result.dms++;
        }
      }
    }
  } catch (e: any) {
    result.errors.push(`dms: ${e?.message ?? e}`);
  }

  // ── Comments ──
  try {
    for (const media of await getMediaList()) {
      if (!media.comments_count) continue;
      const comments = await getMediaComments(media.id).catch(() => []);
      for (const c of comments) {
        if (c.parent_id) continue; // top-level only
        if (String(c.from?.id) === String(uid)) continue; // our own
        const conversationId = await upsertConversation({
          accountId: account.id,
          kind: "comment",
          externalId: media.id,
          participantId: c.from?.id,
          participantUsername: c.from?.username,
          permalink: media.permalink,
          mediaCaption: media.caption,
        });
        const saved = await recordInbound({
          conversationId,
          externalId: c.id,
          author: c.from?.username ?? c.from?.id,
          text: c.text,
          raw: c,
        });
        if (saved) result.comments++;
      }
    }
  } catch (e: any) {
    result.errors.push(`comments: ${e?.message ?? e}`);
  }

  return result;
}
