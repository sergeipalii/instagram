import { NextRequest } from "next/server";
import crypto from "crypto";
import { env } from "@/lib/env";
import { getOrCreateAccount, recordDelivery, setDeliveryHandledCount } from "@/lib/inbox";
import { ingestDm, ingestComment } from "@/lib/ingest";
import type { Account } from "@/lib/db/schema";

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

  // Capture EVERY signature-valid delivery verbatim BEFORE any typed handling.
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null; // not JSON — still logged below as _unparseable
  }
  let deliveryId: string | null = null;
  try {
    deliveryId = await recordDelivery({
      object: typeof parsed?.object === "string" ? parsed.object : null,
      raw: parsed ?? { _unparseable: raw },
    });
  } catch (err) {
    console.error("webhook delivery-log error", err);
  }

  // Ingest is DUMB: just persist each item (status `received`, the queue). No
  // filtering, no classification, no replies — the process-events cron does all
  // of that. Nothing here can fail the delivery ack.
  let handled = 0;
  try {
    if (parsed?.object === "instagram") {
      const account = await getOrCreateAccount(env.igUserId());
      for (const entry of parsed.entry ?? []) {
        for (const event of entry.messaging ?? []) {
          await handleMessagingEvent(account, event);
          handled++;
        }
        for (const change of entry.changes ?? []) {
          if (change.field === "comments") {
            await handleCommentEvent(account, change.value);
            handled++;
          }
        }
      }
    }
  } catch (err) {
    console.error("webhook ingest error", err);
  }

  if (deliveryId && handled > 0) {
    try {
      await setDeliveryHandledCount(deliveryId, handled);
    } catch (err) {
      console.error("webhook handled-count error", err);
    }
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}

/** Parse a messaging event and hand it to the dumb ingest. */
async function handleMessagingEvent(account: Account, event: any): Promise<void> {
  const senderId: string | undefined = event.sender?.id;
  const message = event.message;
  if (!senderId || !message) return; // no ids/payload — nothing to record
  const mid: string = message.mid ?? `${senderId}:${event.timestamp}`;
  await ingestDm(account, {
    senderId,
    recipientId: event.recipient?.id,
    mid,
    text: message.text,
    attachments: message.attachments,
    isEcho: Boolean(message.is_echo),
    raw: event,
  });
}

/** Parse a comment change and hand it to the dumb ingest. */
async function handleCommentEvent(account: Account, value: any): Promise<void> {
  const commentId: string | undefined = value?.id;
  if (!commentId) return; // no id — nothing to record
  await ingestComment(account, {
    commentId,
    mediaId: value?.media?.id,
    fromId: value?.from?.id,
    fromUsername: value?.from?.username,
    text: value?.text,
    parentId: value?.parent_id,
    raw: value,
  });
}
