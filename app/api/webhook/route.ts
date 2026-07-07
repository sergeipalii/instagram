import { NextRequest } from "next/server";
import crypto from "crypto";
import { env } from "@/lib/env";
import {
  sendMessage,
  replyToComment,
  privateReplyToComment,
  hideComment,
} from "@/lib/ig";
import { generateReply, decideOnComment, type Escalation } from "@/lib/claude";
import { sendAlert } from "@/lib/alert";
import {
  getOrCreateAccount,
  upsertConversation,
  recordInbound,
  recordOutbound,
  setEventStatus,
} from "@/lib/inbox";
import type { Account } from "@/lib/db/schema";

const ESCALATION_LABEL: Record<Exclude<Escalation, "none">, string> = {
  hot_lead: "🔥 Горячий лид",
  complaint: "⚠️ Жалоба / негатив",
  human_request: "🙋 Просят живого человека",
  complex_commitment: "📝 Смета/сроки/договор — нужен ты",
};

export const runtime = "nodejs";

/** Meta webhook verification handshake. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  if (mode === "subscribe" && token === env.igWebhookVerifyToken()) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Verify X-Hub-Signature-256 so we only process genuine Meta deliveries. */
function verifySignature(raw: string, header: string | null): boolean {
  if (!header) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", env.igAppSecret()).update(raw).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Always 200 fast; do the work, but never let an error fail the delivery ack.
  try {
    const body = JSON.parse(raw);
    if (body.object === "instagram") {
      const account = await getOrCreateAccount(env.igUserId());
      for (const entry of body.entry ?? []) {
        for (const event of entry.messaging ?? []) {
          await handleMessagingEvent(account, event);
        }
        for (const change of entry.changes ?? []) {
          if (change.field === "comments") await handleCommentEvent(account, change.value);
        }
      }
    }
  } catch (err) {
    console.error("webhook processing error", err);
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}

async function handleMessagingEvent(account: Account, event: any): Promise<void> {
  const senderId: string | undefined = event.sender?.id;
  const message = event.message;
  if (!senderId || !message) return; // no ids/payload — nothing to record

  const text: string | undefined = message.text;
  const attachments = message.attachments;
  const mid: string = message.mid ?? `${senderId}:${event.timestamp}`;

  // Record but keep out of the inbox: our own echoes, and content-less pings.
  const fromUs = Boolean(message.is_echo) || senderId === account.igUserId;
  const ignoredReason = fromUs
    ? message.is_echo
      ? "echo"
      : "own_message"
    : !text && !attachments
      ? "no_content"
      : undefined;

  // DM thread keyed by the other party (the recipient when the echo is from us).
  const participantId = fromUs ? (event.recipient?.id ?? senderId) : senderId;
  const conversationId = await upsertConversation({
    accountId: account.id,
    kind: "dm",
    externalId: participantId,
    participantId,
  });

  const saved = await recordInbound({
    conversationId,
    externalId: mid,
    author: senderId,
    text,
    attachments,
    raw: event,
    ignored: Boolean(ignoredReason),
    ignoredReason,
  });
  if (!saved) return; // duplicate delivery
  if (ignoredReason) return; // recorded for observability; not an inbox item

  if (!account.autoMode) {
    await sendAlert(`🟣 Новый DM в инбоксе\n\nОт id: ${senderId}\n${text ?? "[вложение]"}`);
    return;
  }

  // ── auto_mode: reply automatically (legacy behaviour, now opt-in) ──
  if (!text) return;
  const decision = await generateReply(text, [], account.defaultModel ?? undefined);
  if (decision.reply) {
    await sendMessage(senderId, decision.reply);
    await recordOutbound({
      conversationId,
      externalId: `out:${mid}`,
      text: decision.reply,
      modelUsed: account.defaultModel ?? undefined,
    });
  }
  await setEventStatus(saved.id, "auto", {
    escalation: decision.escalate,
    modelUsed: account.defaultModel ?? undefined,
  });
  if (decision.escalate !== "none") {
    await sendAlert(
      `${ESCALATION_LABEL[decision.escalate]} — DM (авто)\n\nОт id: ${senderId}\nСообщение:\n${text}\n\nМой ответ:\n${decision.reply ?? "—"}`,
    );
  }
}

async function handleCommentEvent(account: Account, value: any): Promise<void> {
  const commentId: string | undefined = value?.id;
  const text: string | undefined = value?.text;
  const fromId: string | undefined = value?.from?.id;
  const fromUsername: string | undefined = value?.from?.username;
  const mediaId: string | undefined = value?.media?.id;
  if (!commentId) return; // no id — nothing to record

  // Record but keep out of the inbox: empty, our own comments, and replies
  // (we only action top-level comments). Still leaves a DB trace of delivery.
  const ignoredReason = !text
    ? "no_text"
    : fromId && fromId === account.igUserId
      ? "own_comment"
      : value.parent_id
        ? "reply"
        : undefined;

  const conversationId = await upsertConversation({
    accountId: account.id,
    kind: "comment",
    externalId: mediaId ?? commentId,
    participantId: fromId,
    participantUsername: fromUsername,
  });

  const saved = await recordInbound({
    conversationId,
    externalId: commentId,
    author: fromUsername ?? fromId,
    text,
    raw: value,
    ignored: Boolean(ignoredReason),
    ignoredReason,
  });
  if (!saved) return; // duplicate
  if (ignoredReason || !text) return; // recorded for observability; not an inbox item

  if (!account.autoMode) {
    await sendAlert(`🟣 Новый комментарий в инбоксе\n\nОт: ${fromUsername ?? fromId}\n${text}`);
    return;
  }

  // ── auto_mode: classify + act automatically ──
  const decision = await decideOnComment(text, account.defaultModel ?? undefined);
  if (!decision) return;
  switch (decision.category) {
    case "question_or_lead":
      if (decision.public_reply) await replyToComment(commentId, decision.public_reply);
      if (decision.dm_text) await privateReplyToComment(commentId, decision.dm_text);
      await sendAlert(
        `🔥 Горячий лид — комментарий (авто)\n\nОт: ${fromUsername ?? fromId}\nКомментарий:\n${text}\n\nМой ответ в личку:\n${decision.dm_text ?? "—"}`,
      );
      break;
    case "praise":
      if (decision.public_reply) await replyToComment(commentId, decision.public_reply);
      break;
    case "spam":
    case "toxic":
      await hideComment(commentId);
      break;
    case "prohibited":
      await hideComment(commentId);
      await sendAlert(
        `⚠️ Скрыт запрещённый комментарий (авто)\n\nТекст:\n${text}\n\nАвтор: ${fromUsername ?? fromId}`,
      );
      break;
  }
  const status = ["spam", "toxic", "prohibited"].includes(decision.category) ? "hidden" : "auto";
  await setEventStatus(saved.id, status, {
    category: decision.category,
    modelUsed: account.defaultModel ?? undefined,
  });
}
