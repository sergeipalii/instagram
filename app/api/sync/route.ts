import { NextRequest, NextResponse } from "next/server";
import { syncInbox } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Manual pull of DMs + comments into the inbox. Protected by middleware
 * (session). `?full=1` drops the recency windows to backfill ALL history (e.g.
 * seed old DMs); without it, the same recency-bounded pull the poll cron does.
 */
export async function POST(req: NextRequest) {
  const full = req.nextUrl.searchParams.get("full") === "1";
  try {
    const result = await syncInbox({ full });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
