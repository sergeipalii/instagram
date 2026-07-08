/**
 * Process-events worker (run by the process-events cron). Walks the queue of
 * `received` inbound events, does the work that used to live inside the webhook —
 * filter (skip empties/replies), then per account mode: semi-auto → triage +
 * Telegram alert; auto → classify, act (reply/hide/DM), set terminal status.
 * Echoes/own messages never reach here (they're recorded as `direction='out'`
 * at ingest and the claim only takes `direction='in'`).
 */
import { inArray } from "drizzle-orm";
import { db } from "./db";
import { conversations, type Account, type Conversation } from "./db/schema";
import { env } from "./env";
import {
  getOrCreateAccount,
  claimEvents,
  setEventStatus,
  recordOutbound,
  skipEvent,
  failEvent,
  type ClaimedEvent,
} from "./inbox";
import { generateReply, decideOnComment, type Escalation } from "./claude";
import {
  sendMessage,
  replyToComment,
  privateReplyToComment,
  hideComment,
} from "./ig";
import { sendAlert } from "./alert";

const MAX_ATTEMPTS = 5;

const ESCALATION_LABEL: Record<Exclude<Escalation, "none">, string> = {
  hot_lead: "🔥 Горячий лид",
  complaint: "⚠️ Жалоба / негатив",
  human_request: "🙋 Просят живого человека",
  complex_commitment: "📝 Смета/сроки/договор — нужен ты",
};

export interface ProcessResult {
  claimed: number;
  triaged: number;
  auto: number;
  hidden: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function processEvents(limit = 25): Promise<ProcessResult> {
  const result: ProcessResult = {
    claimed: 0,
    triaged: 0,
    auto: 0,
    hidden: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const claimed = await claimEvents(limit);
  result.claimed = claimed.length;
  if (!claimed.length) return result;

  const account = await getOrCreateAccount(env.igUserId());
  const convoIds = [...new Set(claimed.map((c) => c.conversationId))];
  const convos = await db
    .select()
    .from(conversations)
    .where(inArray(conversations.id, convoIds));
  const convoById = new Map(convos.map((c) => [c.id, c]));

  for (const ev of claimed) {
    try {
      await processOne(account, convoById.get(ev.conversationId), ev, result);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const retry = ev.attempts < MAX_ATTEMPTS;
      await failEvent(ev.id, msg, retry);
      if (!retry) result.failed++;
      result.errors.push(`${ev.id}: ${msg}`);
    }
  }
  return result;
}

async function processOne(
  account: Account,
  convo: Conversation | undefined,
  ev: ClaimedEvent,
  result: ProcessResult,
): Promise<void> {
  const kind = convo?.kind ?? "dm";
  const text = ev.text ?? undefined;

  // ── Filter (moved out of ingest) ──
  if (!text) {
    await skipEvent(ev.id, "no_content");
    result.skipped++;
    return;
  }
  if (kind === "comment" && ev.raw?.parent_id) {
    await skipEvent(ev.id, "reply"); // we only action top-level comments
    result.skipped++;
    return;
  }

  // ── Semi-auto (default): triage into the inbox + alert the human ──
  if (!account.autoMode) {
    await setEventStatus(ev.id, "triaged");
    await sendAlert(
      kind === "dm"
        ? `🟣 Новый DM в инбоксе\n\nОт id: ${ev.author}\n${text}`
        : `🟣 Новый комментарий в инбоксе\n\nОт: ${ev.author}\n${text}`,
    );
    result.triaged++;
    return;
  }

  // ── Auto mode: classify + act ──
  const model = account.defaultModel ?? undefined;

  if (kind === "dm") {
    const decision = await generateReply(text, [], model);
    if (decision.reply && ev.author) {
      const mid = await sendMessage(ev.author, decision.reply);
      await recordOutbound({
        conversationId: ev.conversationId,
        externalId: mid || `out:${ev.externalId}`,
        text: decision.reply,
        modelUsed: model,
      });
    }
    await setEventStatus(ev.id, "auto", { escalation: decision.escalate, modelUsed: model });
    if (decision.escalate !== "none") {
      await sendAlert(
        `${ESCALATION_LABEL[decision.escalate]} — DM (авто)\n\nОт id: ${ev.author}\nСообщение:\n${text}\n\nМой ответ:\n${decision.reply ?? "—"}`,
      );
    }
    result.auto++;
    return;
  }

  // comment
  const decision = await decideOnComment(text, model);
  if (!decision) {
    await setEventStatus(ev.id, "auto", { modelUsed: model });
    result.auto++;
    return;
  }
  const commentId = ev.externalId;
  // Record a public reply we post, under its real id (dedups the poll re-ingest)
  // and linked to the parent comment so it shows in the thread.
  const recordPublicReply = async (replyText: string) => {
    const newId = await replyToComment(commentId, replyText);
    await recordOutbound({
      conversationId: ev.conversationId,
      externalId: newId || `out:${commentId}`,
      text: replyText,
      modelUsed: model,
      parentExternalId: commentId,
    });
  };
  switch (decision.category) {
    case "question_or_lead":
      if (decision.public_reply) await recordPublicReply(decision.public_reply);
      if (decision.dm_text) await privateReplyToComment(commentId, decision.dm_text);
      await sendAlert(
        `🔥 Горячий лид — комментарий (авто)\n\nОт: ${ev.author}\nКомментарий:\n${text}\n\nМой ответ в личку:\n${decision.dm_text ?? "—"}`,
      );
      break;
    case "praise":
      if (decision.public_reply) await recordPublicReply(decision.public_reply);
      break;
    case "spam":
    case "toxic":
      await hideComment(commentId);
      break;
    case "prohibited":
      await hideComment(commentId);
      await sendAlert(
        `⚠️ Скрыт запрещённый комментарий (авто)\n\nТекст:\n${text}\n\nАвтор: ${ev.author}`,
      );
      break;
  }
  const hidden = ["spam", "toxic", "prohibited"].includes(decision.category);
  await setEventStatus(ev.id, hidden ? "hidden" : "auto", {
    category: decision.category,
    modelUsed: model,
  });
  if (hidden) result.hidden++;
  else result.auto++;
}
