import { NextResponse } from "next/server";
import { syncInbox } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Pull existing DMs + comments into the inbox. Protected by middleware (session). */
export async function POST() {
  try {
    const result = await syncInbox();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
