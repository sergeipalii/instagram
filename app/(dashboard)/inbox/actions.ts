"use server";

import { revalidatePath } from "next/cache";
import {
  sendMessage,
  replyToComment,
  privateReplyToComment,
  hideComment,
} from "@/lib/ig";
import { generateReply, decideOnComment } from "@/lib/claude";
import {
  getInboxItem,
  listInbox,
  threadHistory,
  recordOutbound,
  setEventStatus,
} from "@/lib/inbox";

/** Send a (human-edited) reply to one inbox item. */
export async function sendReply(
  eventId: string,
  text: string,
  modelUsed?: string,
): Promise<{ ok: boolean; error?: string }> {
  const body = text.trim();
  if (!body) return { ok: false, error: "Пустой ответ" };
  const item = await getInboxItem(eventId);
  if (!item) return { ok: false, error: "Не найдено" };

  try {
    let sentId: string | undefined;
    let parentExternalId: string | undefined;
    if (item.conversation.kind === "dm") {
      const recipient = item.conversation.participantId;
      if (!recipient) return { ok: false, error: "Нет получателя" };
      sentId = await sendMessage(recipient, body);
    } else {
      // Public reply in the comment thread (event.externalId = comment id).
      sentId = await replyToComment(item.event.externalId, body);
      parentExternalId = item.event.externalId;
    }
    // Record under the REAL id so the later poll/webhook re-ingest dedups; fall
    // back to a synthetic id if the API didn't return one.
    await recordOutbound({
      conversationId: item.conversation.id,
      externalId: sentId || `out:${eventId}`,
      text: body,
      modelUsed,
      parentExternalId,
    });
    await setEventStatus(eventId, "answered", { modelUsed });
    revalidatePath("/inbox");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/** Also DM the comment author privately (once per top-level comment). */
export async function sendPrivateReply(
  eventId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const body = text.trim();
  if (!body) return { ok: false, error: "Пустой ответ" };
  const item = await getInboxItem(eventId);
  if (!item || item.conversation.kind !== "comment") return { ok: false, error: "Не комментарий" };
  try {
    await privateReplyToComment(item.event.externalId, body);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/** Hide a comment (moderation) and mark it handled. */
export async function hideItem(eventId: string): Promise<{ ok: boolean; error?: string }> {
  const item = await getInboxItem(eventId);
  if (!item || item.conversation.kind !== "comment") return { ok: false, error: "Не комментарий" };
  try {
    await hideComment(item.event.externalId);
    await setEventStatus(eventId, "hidden");
    revalidatePath("/inbox");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/** Dismiss without replying. */
export async function skipItem(eventId: string): Promise<{ ok: boolean }> {
  await setEventStatus(eventId, "skipped");
  revalidatePath("/inbox");
  return { ok: true };
}

export interface BulkResult {
  answered: number;
  hidden: number;
  skipped: number;
  errors: number;
}

/**
 * Reply to every triaged inbox item automatically. Guardrails: spam/toxic/
 * prohibited comments are hidden (not replied to); spam/offtopic DMs are
 * skipped; sends are best-effort (a failure — e.g. DM outside the 24h window —
 * counts as error and the item stays in the inbox). Caps at 50 items per run.
 */
export async function bulkAutoReply(modelId?: string): Promise<BulkResult> {
  const items = await listInbox({ statuses: ["triaged"], limit: 50 });
  const res: BulkResult = { answered: 0, hidden: 0, skipped: 0, errors: 0 };

  for (const { event, conversation } of items) {
    const text = event.text?.trim();
    if (!text) {
      await setEventStatus(event.id, "skipped");
      res.skipped++;
      continue;
    }
    try {
      if (conversation.kind === "dm") {
        const history = await threadHistory(conversation.id);
        const decision = await generateReply(text, history.slice(0, -1), modelId);
        if (decision.reply && conversation.participantId) {
          const mid = await sendMessage(conversation.participantId, decision.reply);
          await recordOutbound({
            conversationId: conversation.id,
            externalId: mid || `out:${event.id}`,
            text: decision.reply,
            modelUsed: modelId,
          });
          await setEventStatus(event.id, "auto", { escalation: decision.escalate, modelUsed: modelId });
          res.answered++;
        } else {
          await setEventStatus(event.id, "skipped");
          res.skipped++;
        }
      } else {
        const decision = await decideOnComment(text, modelId);
        if (!decision) {
          res.errors++;
          continue;
        }
        if (decision.category === "spam" || decision.category === "toxic" || decision.category === "prohibited") {
          await hideComment(event.externalId);
          await setEventStatus(event.id, "hidden", { category: decision.category, modelUsed: modelId });
          res.hidden++;
        } else if (decision.public_reply) {
          const newId = await replyToComment(event.externalId, decision.public_reply);
          if (decision.dm_text) await privateReplyToComment(event.externalId, decision.dm_text);
          await recordOutbound({
            conversationId: conversation.id,
            externalId: newId || `out:${event.id}`,
            text: decision.public_reply,
            modelUsed: modelId,
            parentExternalId: event.externalId,
          });
          await setEventStatus(event.id, "auto", { category: decision.category, modelUsed: modelId });
          res.answered++;
        } else {
          await setEventStatus(event.id, "skipped", { category: decision.category });
          res.skipped++;
        }
      }
    } catch {
      res.errors++;
    }
  }
  revalidatePath("/inbox");
  return res;
}
