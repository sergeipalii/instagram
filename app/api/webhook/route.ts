import { NextRequest } from "next/server";
import crypto from "crypto";
import { env } from "@/lib/env";
import { seenBefore } from "@/lib/store";
import {
  sendMessage,
  replyToComment,
  privateReplyToComment,
  hideComment,
} from "@/lib/ig";
import { generateReply, decideOnComment } from "@/lib/claude";
import { sendAlert } from "@/lib/alert";

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
      for (const entry of body.entry ?? []) {
        for (const event of entry.messaging ?? []) {
          await handleMessagingEvent(event);
        }
        for (const change of entry.changes ?? []) {
          if (change.field === "comments") await handleCommentEvent(change.value);
        }
      }
    }
  } catch (err) {
    console.error("webhook processing error", err);
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}

async function handleMessagingEvent(event: any): Promise<void> {
  const senderId: string | undefined = event.sender?.id;
  const message = event.message;
  if (!senderId || !message) return;

  // Skip our own echoes and anything we sent.
  if (message.is_echo) return;
  if (senderId === env.igUserId()) return;

  // Only handle text for now (ignore reactions, attachments-only, etc.).
  const text: string | undefined = message.text;
  if (!text) return;

  // Dedup: Meta can redeliver. mid is the stable message id.
  const mid: string = message.mid ?? `${senderId}:${event.timestamp}`;
  if (await seenBefore(mid)) return;

  const reply = await generateReply(text);
  if (!reply) return; // SKIP (spam/off-topic)

  await sendMessage(senderId, reply);
}

async function handleCommentEvent(value: any): Promise<void> {
  const commentId: string | undefined = value?.id;
  const text: string | undefined = value?.text;
  const fromId: string | undefined = value?.from?.id;
  if (!commentId || !text) return;

  // Loop guards:
  // - skip our own comments/replies (would otherwise trigger ourselves)
  // - skip replies (parent_id present): only act on top-level comments. This
  //   also means our public replies never trigger a cascade.
  if (fromId && fromId === env.igUserId()) return;
  if (value.parent_id) return;

  // Dedup: Meta can redeliver the same change.
  if (await seenBefore(`comment:${commentId}`)) return;

  const decision = await decideOnComment(text);
  if (!decision) return;

  switch (decision.category) {
    case "question_or_lead":
      if (decision.public_reply) await replyToComment(commentId, decision.public_reply);
      if (decision.dm_text) await privateReplyToComment(commentId, decision.dm_text);
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
        `⚠️ Instagram: скрыт запрещённый комментарий\n\nТекст:\n${text}\n\nАвтор id: ${fromId ?? "?"}\nComment id: ${commentId}`,
      );
      break;
    case "offtopic":
    default:
      break;
  }
}
