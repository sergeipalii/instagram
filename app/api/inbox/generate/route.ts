import { NextRequest } from "next/server";
import { getInboxItem, threadHistory } from "@/lib/inbox";
import { streamDraft } from "@/lib/claude";

export const runtime = "nodejs";

/** Stream a reply draft for one inbox item into the UI textarea. */
export async function POST(req: NextRequest) {
  const { eventId, modelId } = await req.json().catch(() => ({}));
  if (!eventId) return new Response("eventId required", { status: 400 });

  const item = await getInboxItem(eventId);
  if (!item) return new Response("not found", { status: 404 });

  let context: string | undefined;
  if (item.conversation.kind === "comment" && item.conversation.mediaCaption) {
    context = `Пост: ${item.conversation.mediaCaption.slice(0, 200)}`;
  } else if (item.conversation.kind === "dm") {
    const history = await threadHistory(item.conversation.id);
    if (history.length > 1) {
      context = history
        .slice(-6, -1)
        .map((h) => `${h.role === "user" ? "Клиент" : "Я"}: ${h.text}`)
        .join("\n");
    }
  }

  const result = streamDraft({
    kind: item.conversation.kind,
    text: item.event.text ?? "",
    context,
    modelId,
  });
  return result.toTextStreamResponse();
}
