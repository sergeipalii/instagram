import { NextRequest, NextResponse } from "next/server";
import { listInbox, type InboxItem } from "@/lib/inbox";
import type { Event } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Inbox feed for the client (SWR polling). Protected by middleware. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind");
  const statusParam = sp.get("status");
  const statuses = (statusParam ? statusParam.split(",") : ["new"]) as Event["status"][];

  const items: InboxItem[] = await listInbox({
    kind: kind === "dm" || kind === "comment" ? kind : undefined,
    statuses,
  });
  return NextResponse.json({ items });
}
