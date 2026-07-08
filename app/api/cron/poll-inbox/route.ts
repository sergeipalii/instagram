import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { syncInbox } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Polling fallback. Vercel Cron hits this (schedule in vercel.json). Pulls recent
 * DMs + comments from the Graph API and dumb-ingests anything a webhook missed
 * (idempotent). Bounded by syncInbox's per-run call budget so it can't blow the
 * rate limit.
 */
export async function GET(req: NextRequest) {
  const secret = env.cronSecret();
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const result = await syncInbox();
    if (result.skipped.length || result.errors.length) {
      console.warn("poll-inbox partial", result);
    }
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("poll-inbox failed", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
